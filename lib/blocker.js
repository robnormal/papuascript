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


function showTags(toks) {
	var text;

	for (var i = 0; i < toks.length; i++) {
		switch(toks[i][0]) {
		case 'IDENTIFIER':
			text = toks[i][1];
			break;
		case 'INDENT':
		case 'OUTDENT':
			text = toks[i][0] + ' - "' + [toks[i][1]] + '"' ;
			break;
		default:
			text = toks[i][0];
		}

		console.log(i, ':', text);
	}
	console.log();
}

// GLOBAL state variables :(
var $exprWasIndented = [false];
var $bkCps = [];
var $bkLastLineBreak;

function indentExpressions() {
	for (var i = 0, len = $exprWasIndented.length; i < len; i++) {
		$exprWasIndented[i] = true;
	}
}

var cannotStartExpression = function(tag) {
	return $.contains([')',']','}'], tag);
};

var
	atArrow = function atArrow(that) {
		return that.tag() === '->';
	},
	atComma = function atComma(that) {
		return that.tag() === ',';
	},
	atCommaOrSemicolon = function atComma(that) {
		return that.tag() === ',' || that.tag() === ';';
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
		this.expression();
	},

	fixWhile: function() {
		this.mustConsume(['WHILE'], 'Logic error in fixWhile');
		this.expression(true);
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
			while (this.has() && ';' !== this.tag()) {
				this.expressionList();
			}
			this.mustConsume([';'], 'Missing ";" in FOR clause');

			// conditions - remember indents
			while (this.has() && ';' !== this.tag()) {
				this.expressionList();
			}
			this.mustConsume([';'], 'Missing ";" in FOR clause');

			// increments
			while (this.has() && 'INDENT' !== this.tag()) {
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
		this.expression(true);
		this.block();
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
			if (res === Blocker.EXPRESSION && this.prevTag() !== 'TERMINATOR') {
				this.insertTag('TERMINATOR');
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
			// account for comma-separated cases
			do {
				if ('CASE' !== this.tag() && 'DEFAULT' !== this.tag()) {
					this.error('Expected CASE or DEFAULT');
				} else {
					this.next();
					this.expression(true);
				}
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
		this.expression(false, startDent);
		this.mustConsume([')'], 'Bad expression in parentheses');
	},

	fixArray: function(startDent) {
		this.mustConsume(['['], 'Logic error in fixArray');

		while (this.has() && this.tag() !== ']') {
			this.dropWhitespace();
			this.expression(false, startDent, atComma);

			this.dropWhitespace();
			this.consume([',']);
		}

		this.dropWhitespace();
		this.mustConsume([']'], 'Bad Array');
	},

	fixObject: function(startDent) {
		this.mustConsume(['{'], 'Logic error in fixObject');
		this.dropWhitespace();

		while (this.has() && this.tag() !== '}') {
			this.mustConsume(['IDENTIFIER'], 'Expected IDENTIFIER, found ' + this.tag());

			this.dropWhitespace();
			this.mustConsume([':'], 'Expected ":", found ' + this.tag());

			this.dropWhitespace();
			this.expression(false, startDent, atComma);
			this.dropWhitespaceAfterExpression();

			this.consume([',']);
			this.dropWhitespace();
		}
				
		this.mustConsume(['}'], 'Expected "}", found ' + this.tag());
	},

	fixFunction: function() {
		var begin = this.pos;

		// if no \, we have a nullary function
		if ('\\' === this.tag()) {
			this.consume(['\\']);

			// parameters
			while (this.has() && this.tag() !== '->') {
				this.consume(['IDENTIFIER']);
				// this.insertTag('FN_LIT_PARAM');
			}
		}

		this.mustConsume(['->'], 'Bad function');
		this.functionBody();

		// put in parens
		if (this.tagAt(begin - 1) !== '(') {
			// account for function name
			if (this.tagAt(begin - 1) === 'IDENTIFIER' && this.tagAt(begin - 2) === '@') {
				this.insertTagAt(begin - 2, '(');
			} else {
				this.insertTagAt(begin, '(');
			}
			this.insertTag(')'); // before final OUTDENT
		}
	},

	// Turn function body into a block if it is an expression
	functionBody: function() {
		var
			begin = this.pos,
			res = this.expressionOrBlock(false);

		if (res === Blocker.EXPRESSION) {
			// unconsume TERMINATOR, since it is needed for containing expresssion
			// expressionOrBlock() will not consume OUTDENT, so ignore that case
			if (this.prevTag() === 'TERMINATOR') {
				this.pos--;
			}

			this.insertTagAt(begin, 'INDENT');
			this.insertTagAt(this.pos, 'TERMINATOR'); // expression may not have one yet
			this.insertTagAt(this.pos, 'OUTDENT');
		}
			
	},

	block: function(isTop) {
		this.processBlock(isTop);

	},

	canStartBlock: function() {
		return ! $.contains([')',']','}'], this.tag());
	},

	processBlock: function(isTop) {
		var startDent = this.indent;

		if (! isTop) {
			this.mustConsume(['INDENT'], 'Bad block');

			if (this.indent.text === '') {
				throw new Error('Empty indent level after indent');
			}
		}

		while (this.has()) {
			if (! this.canStartBlock()) {
				this.error('Unexpected ' + this.tag());
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
			case '{':
				this.fixObject(startDent);
				break;
			case '[':
				this.fixArray(startDent);
				break;
			case '(':
				this.fixParens(startDent);
				break;
			case '<-':
				this.fixCps();
				/*
				// determine whether this applies to the end of the (apparent) expression,
				// or the end of the block
				last($bkCps).push($bkLastLineBreak);

				this.next();
			 */
				break;
			case '#':
				this.replaceTag('(');
				this.next();
				this.expression();
				if ('TERMINATOR' === this.prevTag()) {
					this.pos--;
				}
				this.insertTag(')');
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
		this.expression(true, void 0, atCommaOrSemicolon);
		this.consume([',']);
	},

	fixCps: function(lineBreak, end) {
		// position of first identifier
		// linebreak may have been deleted, or not
		var begin = this.bookmarks[$bkLastLineBreak];

		if (begin === void 0) {
			begin = 0;
		}

		if (this.isLineBreakAt(begin)) {
			begin++;
		}

		// consume block, without requiring surrounding INDENT/OUTDENT
		this.pos++;
		this.block(true);

		// replace erroneous OUTDENT with CPSSTOP
		this.pos--;
		this.replaceTag('CPSSTOP');

		var bkEnd = this.bookmark();

		// mark beginning of CPS
		this.pos = begin;

		this.insertTag('CPS');
		while (this.has() && this.consume(['IDENTIFIER'])) {
			this.insertTag('FN_LIT_PARAM');
		}

		this.pos = this.bookmarks[bkEnd];

		/*

		// come back at the end
		var bkCurrent = this.bookmark();

		// do this first so we don't have to bookmark end
		this.insertTagAt(end, 'CPSSTOP');

		// move to first IDENTIFIER after linebreak
		// linebreak may have been deleted
		this.pos = lineBreak;
		if (this.isLineBreakAt(lineBreak)) {
			this.pos++;
		}

		this.insertTag('CPS');
		while (this.has() && this.consume(['IDENTIFIER'])) {
			this.insertTag('FN_LIT_PARAM');
		}

		this.pos = this.bookmarks[bkCurrent];
	 */
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
			this.pos--;
			this.removeToken(this.pos);

			return true;
		}
	},

	dropWhitespaceAfterExpression: function() {
		this.pos--;
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
		this.pos--; // don't consume second OUTDENT
	},

	error: function(msg, pos) {
		H.error(msg, this.tokens[pos] || last(this.tokens));
	}
});

module.exports = {
	Blocker: Blocker,
	resolveBlocks: function(tokens) {
		return (new Blocker(tokens)).fixBlocks().tokens;
	}
};

