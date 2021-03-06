/*jshint indent: false */
Error.stackTraceLimit = Infinity;

var
	H = require('./helpers.js'),
	$ = require('underscore'),
	I = require('./indents.js'),
	log = console.log,
	set = H.set,
	last = H.last,
	Indent = I.Indent,
	Outdent = I.Outdent,
	EmptyDent = I.EmptyDent,
	dentize = I.dentize;


// GLOBAL state variables :(
var $exprWasIndented = [false];
var $bkLastLineBreak;

function indentExpressions() {
	for (var i = 0, len = $exprWasIndented.length; i < len; i++) {
		$exprWasIndented[i] = true;
	}
}

var cannotStartExpression = function(tag) {
	return $.contains([')',']','}'], tag);
};

function endsFactor(tok) {
	return H.has(
		['IDENTIFIER', 'STRING', 'WORDS', 'THIS', 'NUMBER', 'INTEGER',
			'BOOL', 'NULL', 'UNDEFINED', 'REGEX', ']',')','}'],
		tok[0]
	);
}

function startsFactor(tok) {
	return H.has(
		['\\', 'IDENTIFIER', 'STRING', 'WORDS', 'THIS', 'NUMBER', 'INTEGER',
			'BOOL', 'NULL', 'UNDEFINED', 'REGEX', '[', '(', '{'
		],
		tok[0]
	);
}

var isInvocationParam = function(tokens, i) {
	var prev = tokens[i-1];

	return prev && prev.spaced && endsFactor(prev) && startsFactor(tokens[i]);
};

var
	atArrow = function atArrow(that) {
		return that.tag() === '->';
	},
	atSemicolon = function atSemicolon(that) {
		return that.tag() === ';';
	};

function Blocker(tokens) {
	this.tokens = tokens;
	this.pos = 0;
	this.indent = EmptyDent();
	this.bookmarks = [];
}
Blocker.BLOCK = 1;
Blocker.EXPRESSION = 2;
	
$.extend(Blocker.prototype, {
	tokenAt: function(i) {
		return this.tokens[i];
	},

	token: function() {
		return this.tokenAt(this.pos);
	},

	next: function() {
		this.pos++;
	},

	prev: function() {
		this.pos--;
	},

	has: function() {
		return !!this.token();
	},

	tagAt: function(i) {
		var t = this.tokens[i];
		return t && t[0];
	},

	tag: function() {
		return this.tagAt(this.pos);
	},

	nextTag: function() {
		return this.tagAt(this.pos + 1);
	},

	prevTag: function() {
		return this.tagAt(this.pos - 1);
	},

	text: function() {
		var t = this.tokens[this.pos];
		return t && t[1];
	},

	isLineBreakAt: function(pos) {
		return $.contains(['INDENT', 'OUTDENT', 'TERMINATOR'],
			this.tokens[pos] && this.tokens[pos][0]);
	},

	isLineBreak: function() {
		return this.isLineBreakAt(this.pos);
	},

	hasSpaceBefore: function(pos) {
		return ! this.tokens[pos-1] || this.tokens[pos-1].spaced;
	},

	hasSpaceBeforeHere: function() {
		return this.hasSpaceBefore(this.pos);
	},

	isFreeBracket: function() {

		return '[' === this.tag() && (
			this.hasSpaceBeforeHere() ||
			! endsFactor(this.tokenAt(this.pos-1))
		);
	},

	clipDent: function (haystack, needle, errMsg) {
		if (H.ends_with(haystack, needle)) {
			return H.clipEnd(haystack, needle);
		} else {
			this.error('Mismatched indent');
		}
	},

	bookmark: function() {
		return this.bookmarkAt(this.pos);
	},

	bookmarkAt: function(pos) {
		this.bookmarks.push(pos);
		return this.bookmarks.length - 1;
	},

	addedToken: function(pos) {
		for (var i = 0, len = this.bookmarks.length; i < len; i++) {
			if (this.bookmarks[i] >= pos) {
				this.bookmarks[i]++;
			}
		}

		if (this.pos >= pos) {
			this.next();
		}
	},

	removeToken: function() {
		return this.tokens.splice(this.pos, 1);
	},

	insertToken: function(tok) {
		return this.tokens.splice(this.pos, 0, tok);
	},

	insertTagAndTextAt: function(pos, tag, text) {
		var i, len = this.tokens.length;

		if (pos >= len) {
			i = len - 1;
		} else if (pos < 0) {
			i = 0;
		} else {
			i = pos;
		}

		this.tokens.splice(pos, 0, [tag, text, H.loc(this.tokens[i])]);
		this.addedToken(pos);
	},

	insertTagAndText: function(tag, text) {
		this.insertTagAndTextAt(this.pos, tag, text);
	},

	insertTagAt: function(pos, tag) {
		this.insertTagAndTextAt(pos, tag, '');
	},

	insertTag: function(tag) {
		this.insertTagAt(this.pos, tag);
	},

	insertTagAfter: function(tag) {
		this.insertTagAt(this.pos + 1, tag);
	},

	replaceTag: function(tag) {
		this.tokens[this.pos][0] = tag;
	},

	replaceText: function(text) {
		this.replaceTextAt(this.pos, text);
	},

	replaceTextAt: function(pos, text) {
		this.tokens[pos][1] = text;
	},

	trimTerminators: function() {
		while (this.tagAt(0) === 'TERMINATOR') {
			this.tokens.shift();
		}
	},

	fixBlocks: function() {
		this.trimTerminators();
		this.block(true, false);
		return this;
	},

	fixDo: function() {
		this.mustConsume(['DO'], 'Logic error in fixWhile');
		this.block();
		this.mustConsume(['WHILE'], 'Missing WHILE clause for DO statment');
		// allow comma-separated expressions
		do {
			this.expression(true);
		} while (this.consume([',']));
	},

	fixWhile: function() {
		this.mustConsume(['WHILE'], 'Logic error in fixWhile');
		// allow comma-separated expressions
		do {
			this.expression(true);
		} while (this.consume([',']));
		this.block();
	},

	fixFor: function() {
		this.mustConsume(['FOR'], 'Logic error in fixFor');

		// Permit "for own in x" or "for index in x", though these
		// are pretty bad ideas
		if (
			('OWN' === this.tag() || 'INDEX' === this.tag()) &&
			'IDENTIFIER' === this.nextTag()
		) {
			this.next();
			this.fixForIn();
		} else if (
			'IDENTIFIER' === this.tag() &&
			('IN' === this.nextTag() || ':' === this.nextTag())
		) {
			this.fixForIn();
		} else {

			// initializations
			if (';' === this.tag()) {
				this.next();
			} else {
				// - should be an AssignList
				this.expression();
			}

			// AssignList should consume ';', as it is a standalone expression
			this.prev();
			this.mustConsume([';'], 'Missing ";" in FOR clause');

			// conditions - remember indents
			while (this.has() && ';' !== this.tag()) {
				this.expressionList();
			}
			this.mustConsume([';'], 'Missing ";" in FOR clause');

			// increments
			while (this.has() && 'INDENT' !== this.tag()) {
				if (';' === this.tag()) {
					this.error('Unexpected ;');
				}
				this.expressionList();
			}
			if (!this.has()) this.error('Empty FOR statement');

			this.block();
		}
	},

	fixForIn: function() {
		this.mustConsume(['IDENTIFIER'], 'Expected IDENTIFIER, got ' + this.tag());
		if (':' === this.tag()) {
			this.next();
			this.mustConsume(['IDENTIFIER'], 'Expected IDENTIFIER, got ' + this.tag());
		}

		this.mustConsume(['IN'], 'Expected IN, got ' + this.tag());
		this.exprThenBlock();
	},

	fixIf: function() {
		this.mustConsume(['IF'], 'Logic error in fixIf');
		this.exprThenBlock();

		while (this.consume(['ELSE', 'IF'])) {
			this.exprThenBlock();
		}

		if (this.consume(['ELSE'])) {
			this.block();
		}
	},

	exprThenBlock: function() {
		this.expression(true);
		this.block();
	},

	fixIfCase: function() {
		var
			startDent = this.indent,
			res;
		
		this.mustConsume(['IF','CASE'], 'Logic error in fixIfCase');
		this.expression(true);

		this.mustConsume(['INDENT'], 'Cases must be indented from IF CASE');
		while (this.has() && 'OUTDENT' !== this.tag()) {
			this.expression(false, void 0, atArrow);
			this.mustConsume(['->'], 'IF CASE: Expected "->"');
			res = this.expressionOrBlock(true);

			// add TERMINATOR, if necessary
			if (res === Blocker.EXPRESSION) {
				this.insertTerminator();
			}
		}

		this.outdent(startDent);
	},

	fixSwitch: function() {
		var startDent = this.indent;

		this.mustConsume(['SWITCH'], 'Logic error in fixSwitch');
		this.expression(true);
		this.mustConsume(['INDENT'], 'Cases must be indented from switch');

		while (this.has() && 'OUTDENT' !== this.tag()) {
			if ('CASE' !== this.tag() && 'DEFAULT' !== this.tag()) {
				this.error('Expected CASE or DEFAULT');
			}

			// account for comma-separated cases
			do {
				this.next();
				this.expression(true);
			} while (this.consume([',']));

			this.block();
		}

		this.outdent(startDent);
	},

	fixTry: function() {
		this.mustConsume(['TRY'], 'Logic error in fixIf');
		this.block();

		if (this.consume(['CATCH'])) {
			this.mustConsume(['IDENTIFIER'], 'CATCH: Expected IDENTIFIER');
			this.block();
		}

		if (this.consume(['FINALLY'])) {
			this.block();
		}
	},

	fixParens: function(startDent) {
		this.mustConsume(['('], 'Logic error in fixParens');

		// check for CALL_NULLARY
		if (')' === this.tag()) {
			this.prev();
			this.replaceTag('CALL_NULLARY');
			this.next();
			this.removeToken();
		} else {
			this.expression(false, startDent);
			this.mustConsume([')'], 'Bad expression in parentheses');
		}
	},

	fixHash: function(startDent) {
		this.checkTag('#', 'Logic error in fixHash');
		this.replaceTag('(');
		this.next();
		this.expression(false, startDent);

		if (this.prevTag() === 'TERMINATOR') {
			this.insertTagAt(this.pos - 1, ')');
		} else {
			this.insertTag(')');
		}
	},

	fixBrackets: function(startDent) {
		this.checkTag('[', 'Logic error in fixBrackets');

		// replace spaced [ with FREE_LBRACKET
		if (this.isFreeBracket()) {
			this.replaceTag('FREE_LBRACKET');
		}

		this.next();

		while (this.has() && this.tag() !== ']') {
			this.dropWhitespace();
			this.expression(false, startDent);

			this.dropWhitespace();
			this.consume([',']);
		}

		this.dropWhitespace();
		this.mustConsume([']'], 'Bad expression in brackets');
	},

	// comma-separated list of assignments; starts at first ASSIGN operator
	fixAssignList: function() {
		// for functions defined like "toInt x = parseInt x 10"
		if (this.isFunctionAssign()) {
			this.next();
			this.functionBody();
		} else {
			this.next();
			this.expression();

			while (this.consume([','])) {
				this.expression();
			}
		}
	},

	fixVarList: function() {
		this.mustConsume(['VAR'], 'Logic error in fixVarList');
		this.mustConsume(['IDENTIFIER']);

		while (this.consume([','])) {
			this.mustConsume(['IDENTIFIER']);
		}

		if (! this.isLineBreak()) {
			this.error('Unexpected ' + this.tag() + ', expected end of line');
		}
	},

	fixExport: function() {
		this.mustConsume(['EXPORT'], 'Logic error in fixExport');
		this.mustConsume(['IDENTIFIER']);

		while (this.consume([','])) {
			this.mustConsume(['IDENTIFIER']);
		}

		if (! this.isLineBreak()) {
			this.error('Unexpected ' + this.tag() + ', expected end of line');
		}
	},

	fixObject: function(startDent) {
		this.mustConsume(['{'], 'Logic error in fixObject');
		this.dropWhitespace();

		while (this.has() && this.tag() !== '}') {
			if (! $.contains(['IDENTIFIER', 'NUMBER', 'STRING'], this.tag())) {
				this.error('Expected object property, found ' + this.tag());
			}
			this.next();

			this.dropWhitespace();
			this.mustConsume([':'], 'Expected ":", found ' + this.tag());

			this.dropWhitespace();
			this.expression(false, startDent);
			this.dropWhitespaceAfterExpression();

			this.consume([',']);
			this.dropWhitespace();
		}
				
		this.mustConsume(['}'], 'Expected "}", found ' + this.tag());
	},

	fixFunction: function() {
		var
			begin = this.pos,
			startDent = this.indent;

		// if no \, we have a nullary function
		if ('\\' === this.tag()) {
			this.consume(['\\']);

			// parameters
			while (this.has() && this.tag() !== '->') {
				this.consume(['IDENTIFIER']);
			}
		}

		this.mustConsume(['->'], 'Bad function');
		var type = this.functionBody();

		// put in parens
		if (this.tagAt(begin - 1) !== '(') {
			// account for function name
			if (this.tagAt(begin - 1) === 'IDENTIFIER' && this.tagAt(begin - 2) === '@') {
				this.insertTagAt(begin - 2, '(');
			} else {
				this.insertTagAt(begin, '(');
			}

			// ensure TERMINATOR after closing paren if fully outdented
			if (type === Blocker.EXPRESSION && this.prevTag() === 'TERMINATOR') {
				this.insertTagAt(this.pos - 1, ')');
			} else {
				this.insertTag(')');
				if (type !== Blocker.EXPRESSION && this.indent.equals(startDent) && this.prevTag() !== 'TERMINATOR') {
					this.insertTag('TERMINATOR');
				}
			}
		}
	},

	functionBody: function() {
		var
			begin = this.pos,
			res = this.expressionOrBlock(true);

		if (res === Blocker.EXPRESSION) {
			// unconsume TERMINATOR, since it is needed for containing expresssion
			// expressionOrBlock() will not consume OUTDENT, so ignore that case
			if (this.prevTag() === 'TERMINATOR') {
				this.prev();
			}
		}

		return res;
	},

	canStartBlock: function() {
		return ! $.contains([',', ')',']','}'], this.tag());
	},

	/* add CPS marker to beginning of param list, and
	 * CPSEND after block, to avoid ambiguity
	 */
	fixCps: function() {
		this.checkTag('<-', 'Logic error in fixCps');

		var bkmk = this.bookmark();
		while (this.prevTag() === 'IDENTIFIER') this.prev();
		this.insertTag('CPS');
		this.pos = this.bookmarks[bkmk] + 1; // move past `<-`

		// CPS clause (stuff to right of '<-')
		this.expression();
		this.insertTerminator(); // multiline CPS clauses get borked without this

		// CPS body
		while (this.tag() && 'OUTDENT' !== this.tag()) {
			this.expression();
		}
		this.insertTag('CPSEND');

		// make sure Cps block ends with TERMINATOR
		this.prev();
		this.insertTerminator();
		this.next();
	},

	block: function(isTop) {
		var startDent = this.indent;

		if (! isTop) {
			this.mustConsume(['INDENT'], 'Bad block');

			if (this.indent.text === '') {
				throw new Error('Empty indent level after indent');
			}
		}

		while (this.has()) {
			if (! this.canStartBlock()) {
				this.error();
			} else {
				switch (this.tag()) {

				case 'OUTDENT':
					this.consumeOutdentSplit(startDent);

					// blocks cannot have more than one OUTDENT
					return;

				case 'FOR':
					this.fixFor();
					break;
				case 'WHILE':
					this.fixWhile();
					break;
				case 'DO':
					this.fixDo();
					break;
				case 'TRY':
					this.fixTry();
					break;
				case 'EXPORT':
					this.fixExport();
					break;
				case 'INDENT':
					throw new Error('Logic Error: cannot find INDENT inside block');
				default:
					this.expression();
				}

				// separate block parts with TERMINATOR
				this.insertTerminator();
			}
		}

		// we only get here if we found no OUTDENT, which means we are at the
		// top level
		if (! isTop) {
			throw new Error('Logic error');
		}

	},

	insertTerminator: function() {
		if (this.prevTag() !== 'TERMINATOR' && this.tag() !== 'TERMINATOR') {
			this.insertTag('TERMINATOR');
		}
	},

	expression: function(noIndent, startDent, stopWhen) {
		$exprWasIndented.push(false);

		this.processExpression(noIndent, startDent, stopWhen);

		$exprWasIndented.pop();
	},

	lineBreak: function() {
		$bkLastLineBreak = this.bookmark();
	},

	processExpression: function(noIndent, startDent, stopWhen) {
		var is_first = true;

		if (void 0 === startDent) {
			startDent = this.indent;
		}

		while (this.has()) {
			if (stopWhen && stopWhen(this)) return;

			if (startDent.greaterStartThan(this.indent) || (
				last($exprWasIndented) && startDent.equals(this.indent)
			)) {
				return;
			}

			switch (this.tag()) {
			case ')':
			case ']':
			case '}':
			case ',':
			case void 0:
				return;

			case 'TERMINATOR':
			case ';':
				this.lineBreak();

				if (this.indent.greaterStartThan(startDent)) {
					this.removeToken();
				} else {
					this.next(); // expression includes TERMINATOR
					return;
				}
				break;

			case 'INDENT':
				this.lineBreak();

				if (noIndent) {
					return;
				} else {
					this.addIndent();
					this.removeToken();
				}
				break;

			case 'OUTDENT':
				this.lineBreak();

				var newIndent = this.indent.before(dentize(this.token()));

				// if outdenting past the expression, don't consume the OUTDENT
				// Leave it to the parent element
				if (newIndent.lessStartThan(startDent)) {
					return;
				} else {
					this.addIndent();
					this.removeToken();
				}
				break;

			case 'IF':
				if ('CASE' === this.nextTag()) {
					this.fixIfCase();
				} else {
					this.fixIf();
				}
				break;
			case 'SWITCH':
				this.fixSwitch();
				break;
			case '\\':
			case '->':
				this.fixFunction();
				break;
			case '<-':
				this.fixCps();
				break;
			case '{':
				this.fixObject(startDent);
				break;
			case '[':
				this.fixBrackets(startDent);
				break;
			case '(':
				this.fixParens(startDent);
				break;

			case '#':
				this.fixHash(startDent);
				return;
				break;

			case 'ASSIGN':
				this.fixAssignList();
				return; // AssignList is a standalone expression
				// break;

			case 'VAR':
				this.fixVarList();
				break;

			default:
				this.next();
				break;
			}

			is_first = false;
		}
	},

	expressionOrBlock: function(noIndent) {
		if ('INDENT' === this.tag()) {
			this.block();
			return Blocker.BLOCK;
		} else {
			this.expression(noIndent);
			return Blocker.EXPRESSION;
		}
	},

	expressionList: function() {
		this.expression(true, void 0, atSemicolon);
		this.consume([',']);
	},

	// toInt x = parseInt x 10
	isFunctionAssign: function() {
		return 'ASSIGN' === this.tag() &&
			isInvocationParam(this.tokens, this.pos - 1);
	},

	addIndent: function() {
		var dent = dentize(this.token());
		this.indent = this.indent.before(dent);

		if (dent.isIndent()) {
			indentExpressions();
		}
	},

	checkTag: function(tag, msg) {
		if (tag !== this.tag()) {
			this.error(msg, this.pos);
		}
	},

	// if tags matches the tags of the next set of tokens,
	// move past them and return true
	consume: function(tags) {
		if (! $.isArray(tags)) throw new TypeError('Expected Array in Blocker.consume()');
		var tok, dent = EmptyDent();

		for (var i = 0, len = tags.length; i < len; i++) {
			tok = this.tokens[this.pos+i];
			if (! tok || tok[0]!== tags[i]) {
				return false;
			}

			if (this.isLineBreakAt(this.pos+i)) {
				this.lineBreak();

				if ('INDENT' === tok[0] || 'OUTDENT' === tok[0]) {
					dent = dent.before(dentize(tok));
				}
			}
		}

		this.addIndent(dent);
		this.pos += tags.length;

		return true;
	},

	mustConsume: function(tags, msg) {
		if (! this.consume(tags)) {
			this.error(msg, this.pos);
		}
	},

	outdent: function(startDent, msg) {
		this.checkTag('OUTDENT', 'Expected OUTDENT');
		this.lineBreak();
		var newDent = this.indent.before(dentize(this.token()));

		if (startDent.greaterEndThan(newDent)) {
			this.consumeOutdentSplit(startDent);
		} else {
			this.addIndent();
			this.next();
		}
	},

	consumeOutdentSplit: function(minIndent) {
		var newIndent = this.indent.before(dentize(this.token()));

		// if outdenting past the expression, don't consume the OUTDENT
		// Leave it to the parent element
		if (newIndent.lessStartThan(minIndent)) {
			this.splitOutdentEnd(minIndent);
		}

		this.addIndent();
		this.next();
		this.lineBreak();
	},

	dropWhitespace: function() {
		if (
			this.consume(['INDENT']) ||
			this.consume(['TERMINATOR']) ||
			this.consume(['OUTDENT'])
		) {
			this.lineBreak();
			this.prev();
			this.removeToken(this.pos);

			return true;
		}
	},

	dropWhitespaceAfterExpression: function() {
		this.prev();
		if (! this.dropWhitespace()) {
			this.pos++;
		}
	},

	isOutdented: function() {
		// if we've run out of tokens, we're outdented
		return ! this.has() || 'OUTDENT' === this.tag();
	},

	splitOutdentEnd: function(splittingIndent) {
		if (this.tag() !== 'OUTDENT') throw Error('Logic error');

		var
			big_outdent = dentize(this.token()),
			outdent1 = H.clipStart(this.indent.text, splittingIndent.text),
			outdent2 = H.clipEnd(big_outdent.text, outdent1);

		this.replaceText(outdent2);
		this.insertTagAndText('OUTDENT', outdent1);
		this.prev(); // don't consume second OUTDENT
	},

	error: function(msg, pos) {
		msg = msg || 'Unexpected ' + this.tag();
		pos = void 0 === pos ?
			this.pos :
			(pos >= this.tokens.length ? this.tokens.length - 1 : pos);

		H.error(msg, this.tokens[pos]);
	}
});

module.exports = {
	Blocker: Blocker,
	isInvocationParam: isInvocationParam,
	resolveBlocks: function(tokens) {
		return (new Blocker(tokens)).fixBlocks().tokens;
	}
};

