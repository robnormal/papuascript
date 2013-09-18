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
			text = toks[i][0] + ' - ' + [toks[i][1]] ;
			break;
		default:
			text = toks[i][0];
		}

		console.log(i, ':', text);
	}
}

// GLOBAL state variables :(
var $exprWasIndented = [false];
var $blockCps = [];


function indentExpressions() {
	for (var i = 0, len = $exprWasIndented.length; i < len; i++) {
		$exprWasIndented[i] = true;
	}
}

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

	clipDent: function (haystack, needle, errMsg) {
		if (H.ends_with(haystack, needle)) {
			return H.clipEnd(haystack, needle);
		} else {
			this.error('Mismatched indent');
		}
	},

	bookmark: function(pos) {
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
			this.pos++;
		}
	},

	removeToken: function() {
		this.tokens.splice(this.pos, 1);
	},

	insertTagAt: function(pos, tag) {
		this.insertTagAndText(pos, tag, '');
	},

	insertTagAndText: function(pos, tag, text) {
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

	insertTag: function(tag) {
		this.insertTagAt(this.pos, tag);
	},

	insertTagAfter: function(tag) {
		this.insertTagAt(this.pos + 1, tag);
	},

	replaceTag: function(tag) {
		this.tokens[this.pos][0] = tag;
	},

	trimTerminators: function() {
		while (this.tagAt(0) === 'TERMINATOR') {
			this.tokens.shift();
		}
	},

	fixBlocks: function() {
		// try {
			this.trimTerminators();
			this.block(true, false);
			return this;
		// } catch (e) {
			// this.error(e.message);
		// }
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
		if (!this.has) this.error('Empty FOR statement');

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
		while ('OUTDENT' !== this.tag()) {
			this.expression();
			this.mustConsume(['->'], 'IF CASE: Expected "->"');
			res = this.expressionOrBlock();

			// add TERMINATOR, if necessary
			if (res === Blocker.EXPRESSION && this.prevTag() !== 'TERMINATOR') {
				this.insertTag('TERMINATOR');
			}
		}

		this.mustOutdent(startDent, 'IF CASE block');
	},

	fixSwitch: function() {
		var startDent = this.indent;

		this.mustConsume(['SWITCH'], 'Logic error in fixSwitch');
		this.expression(true);
		this.mustConsume(['INDENT'], 'Cases must be indented from switch');

		while ('OUTDENT' !== this.tag()) {
			// account for comma-separated cases
			do {
				this.mustConsume(['CASE'], 'Expected CASE');
				this.expression(true);
			} while (this.consume([',']));

			this.block();
		}

		this.mustOutdent(startDent, 'SWITCH block');
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

		while (this.tag() !== ']') {
			this.dropWhitespace();
			this.expression(false, startDent);

			this.dropWhitespace();
			this.consume([',']);
		}

		this.dropWhitespace();
		this.mustConsume([']'], 'Bad Array');
	},

	fixObject: function(startDent) {
		this.mustConsume(['{'], 'Logic error in fixObject');

		while (this.has() && this.tag() !== '}') {
			this.dropWhitespace();
			this.mustConsume(['IDENTIFIER'], 'Expected IDENTIFIER, found ' + this.tag());

			this.dropWhitespace();
			this.mustConsume([':'], 'Expected ":", found ' + this.tag());

			this.dropWhitespace();
			this.expression(false, startDent);

			this.dropWhitespace();
			this.consume([',']);
		}
				
		this.dropWhitespace();
		this.mustConsume(['}'], 'Expected "}", found ' + this.tag());
	},

	fixFunction: function() {
		var begin = this.pos;

		this.mustConsume(['\\'], 'Logic error in fixFunction');

		// parameters
		while (this.has() && this.tag() !== '->') {
			this.consume(['IDENTIFIER']);
		}

		this.mustConsume(['->'], 'Bad function');
		this.functionBody();

		// put in parens
		if (this.tagAt(begin - 1) !== '(') {
			this.insertTagAt(begin, '(');
			this.insertTag(')'); // before final OUTDENT
		}
	},

	// Turn function body into a block if it is an expression
	functionBody: function() {
		var
			begin = this.pos,
			res = this.expressionOrBlock();

		if (res === Blocker.EXPRESSION) {
			this.insertTagAt(begin, 'INDENT');
			this.insertTagAt(this.pos - 1, 'TERMINATOR'); // expression won't have one yet
			this.insertTagAt(this.pos - 1, 'OUTDENT');
			// does not affect $maxDents, since these aren't real INDENT or OUTDENT

			// we consumed a TERMINATOR at the end of the expression, but we need that now
			this.pos--;
		}
			
	},

	block: function(isTop) {
		$blockCps.push([]);
		this.processBlock(isTop);

		var
			cps = $blockCps.pop(),
			end = this.bookmark(this.pos),
			that = this;


		$.each(cps, function(mark) {
			that.fixCps(that.bookmarks[mark], that.bookmarks[end]);
		});
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
				this.fixWhile();
				break;
			case 'TRY':
				this.fixTry();
				break;
			case 'INDENT':
				throw new Error('Logic Error: cannot find INDENT inside block');
			default:
				this.expression();

				// make sure expressions are separated by newlines
				if (this.prevTag() !== 'TERMINATOR' && this.tag() !== 'TERMINATOR') {
					this.insertTag('TERMINATOR');
				}
			}
		}

		// we only get here if we found no OUTDENT, which means we are at the
		// top level
		if (! isTop) {
			throw new Error('Logic error');
		}

	},

	expression: function(noIndent, startDent) {
		$exprWasIndented.push(false);
		this.processExpression(noIndent, startDent);
		$exprWasIndented.pop();
	},

	processExpression: function(noIndent, startDent) {
		if (void 0 === startDent) {
			startDent = this.indent;
		}

		while (this.has()) {
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
			case '->': // end of if-case condition
			case void 0:
				return;

			case 'TERMINATOR':
				if (this.indent.greaterStartThan(startDent)) {
					this.removeToken();
				} else {
					this.next(); // expression includes TERMINATOR
					return;
				}
				break;

			case 'INDENT':
				if (noIndent) {
					return;
				} else {
					this.addIndent();
					this.removeToken();
				}
				break;

			case 'OUTDENT':
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
				last($blockCps).push(this.bookmark(this.pos));
				this.next();
				break;
			default:
				this.next();
				break;
			}

		}
	},

	expressionOrBlock: function() {
		if ('INDENT' === this.tag()) {
			this.block();
			return Blocker.BLOCK;
		} else {
			this.expression(true);
			return Blocker.EXPRESSION;
		}
	},

	expressionList: function() {
		this.expression();
		this.consume([',']);
	},

	fixCps: function(arrow, end) {
		this.insertTagAt(end - 1, 'CPSSTOP');

		// find first thing before arrow that isn't an identifier
		var i = arrow - 1;
		while (this.tokens[i] && this.tokens[i][0] === 'IDENTIFIER') {
			this.insertTagAt(i + 1, 'FN_LIT_PARAM');
			i--;
		}

		this.insertTagAt(i + 1, 'CPS');
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
		var tok, dent = EmptyDent();

		for (var i = 0, len = tags.length; i < len; i++) {
			tok = this.tokens[this.pos+i];
			if (! tok || tok[0]!== tags[i]) {
				return false;
			}

			if ('INDENT' === tok[0] || 'OUTDENT' === tok[0]) {
				dent = dent.before(dentize(tok));
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

	mustOutdent: function(startDent, msg) {
		this.checkTag('OUTDENT', 'Expected OUTDENT');
		var newDent = this.indent.before(dentize(this.token()));

		log(startDent, newDent);
		if (newDent.equals(startDent)) {
			this.addIndent();
			this.next();
		} else if (startDent.greaterEndThan(newDent)) {
			// split OUTDENT in 2
			this.consumeOutdentSplit(startDent);
		} else {
			this.error('Mismatched indent');
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
	},

	dropWhitespace: function() {
		if (
			this.consume(['INDENT']) ||
			this.consume(['TERMINATOR']) ||
			this.consume(['OUTDENT'])
		) {
			this.pos--;
			this.removeToken(this.pos);
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

		this.tokens[this.pos][1] = outdent2;
		this.tokens.splice(this.pos, 0, ['OUTDENT', outdent1, H.loc(this.token())]);
	},

	markFunctionParams: function() {
		var
			i = 0,
			param_list = false; // whether we are waiting for a block (e.g., in a WHILE condition)

		// arrays and objects can be
		while (this.has()) {
		/*
			var tag = this.tag();
			var prev = this.prevTag();

			if (param_list) {
				if ('->' === tag) {
					param_list = false;
				} else if ('IDENTIFIER' === tag) {
					this.insertTagAt(i+1, 'FN_LIT_PARAM');
					this.next(); // pass the FN_LIT_PARAM token
				} else {
					this.error('Bad function parameter list');
				}
			} else if ('\\' === tag) {
				param_list = true;
			} else if ('<-' === tag) {
				i += markCpsParams(tokens, i);
			}

			// mark function calls
			if (prev && prev.spaced && endsFactor(prev) && startsFactor(tokens[i])) {
				tokens.splice(i, 0,
					['WS', '', H.loc(tokens[i])]
				);
				i++;
			}

			// Take this opportunity to mark SPACEDOTs
			if ('.' === tag && (!prev || prev.spaced)) {
				tokens.splice(i, 1,
					['SPACEDOT', '.', H.loc(tokens[i])]
				);
			}

			*/
			i++;
		}
	
		return this.tokens;
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

