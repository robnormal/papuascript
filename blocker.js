var H = require('./helpers.js');
var $ = require('underscore');

var set = H.set; // used often

function showTags(toks) {
	for (var i = 0; i < toks.length; i++) {
		console.log(i, ':', toks[i][0] === 'IDENTIFIER' ? toks[i][1] : toks[i][0]);
	}
}

/**
 * Helper functions used in Blocker.expression()
 */
var
	doFixIf = function(that, st) {
		if ('CASE' === that.nextTag()) {
			return that.fixIfCase();
		} else {
			return that.fixIf();
		}
	},

	doFixSwitch = function(that, st) {
	},

	doFixFunction = function(that, st) {
	};


function Blocker(tokens) {
	this.tokens = tokens;
	this.pos = 0;
	this.indent = 0;
}
	
$.extend(Blocker.prototype, {
	token: function() {
		return this.tokens[this.pos];
	},
	has: function() {
		return this.token();
	},
	tag: function() {
		var t = this.tokens[this.pos];
		return t && t[0];
	},
	nextTag: function() {
		return this.tokens[this.pos + 1];
	},
	text: function() {
		var t = this.tokens[this.pos];
		return t && t[1];
	},
	removeToken: function() {
		this.tokens.splice(this.pos, 1);
		return this.pos--;
	},
	replaceTag: function(tag) {
		this.tokens[this.pos][0] = tag;
	},


	balanceBlocks: function() {
		/**
		 * NOTE: a function may take a block _or_ an expression, but not both
		 * Thus, we need not deal with "zero-length" indents; inline functions
		 * simplify have no indent, and no other block keywords can also be inline
		 */

		var i = 0, indents = [],
			last_in, tag, text, new_dents;

		while (this.tokens[i]) {
			tag = this.tokens[i][0];
			text = this.tokens[i][1];

			switch (tag) {
			case 'INDENT':
				indents.push({ pos: i, text: text });
				break;
			case 'OUTDENT':
				last_in = H.last(indents);

				if (! last_in) {
					throw new Error('Logic error: found more outdents than indents');
				}

				if (last_in.text !== text) {
					if (H.ends_with(last_in.text, text)) {
						new_dents = this.splitIndentEnd(last_in.pos, last_in.text, text);
						this.tokens.splice(last_in.pos, 1, new_dents[0], new_dents[1]);

					// outdent consumes several indents
					} else if (H.ends_with(text, last_in.text)) {
						new_dents = this.splitOutdentEnd(i, text, last_in.text);
						this.tokens.splice(i, 1, new_dents[0], new_dents[1]);
					} else {
						this.error('Indent mismatch', this.tokens[i]);
					}
				}

				// every outdent eliminates exactly 1 indent
				indents.pop();

				break;
			}

			i++;
		}

		return this;
	},

	fixBlocks: function() {
		this.balanceBlocks();

		this.block(
			{ pos: 0, indent: 0 },
			true
		);

		return this;
	},

	fixDo: function() {
		this.checkTag('DO', 'Logic error in fixWhile');

		this.pos++;
		this.block();

		this.checkTag('WHILE', 'Bad do statement');
		this.expression();

		return this;
	},

	fixWhile: function() {
		this.checkTag('WHILE', 'Logic error in fixWhile');

		this.pos++;
		this.expression(true);

		return this.block();
	},

	fixFor: function() {
		this.checkTag('FOR', 'Logic error in fixFor');

		this.pos++;

		// initializations
		while (';' !== this.tag()) {
			this.expressionList();
		}

		// conditions - remember indents
		while (';' !== this.tag()) {
			this.expressionList();
		}

		// increments
		while ('INDENT' !== this.tag()) {
			this.expressionList();
		}

		return this.block();
	},

	fixIf: function() {
		this.checkTag('IF', 'Logic error in fixIf');
		this.pos++;

		this.exprThenBlock();

		while ('ELSE' === this.tag() && 'IF' === this.nextTag()) {
			this.pos += 2;
			this.exprThenBlock();
		}

		if ('ELSE' === this.tag()) {
			this.pos++;
			this.block();
		}

		return this;
	},

	exprThenBlock: function() {
		this.expression(true);
		this.block();

		return this;
	},

	fixIfCase: function() {
		this.checkTag('IF', 'Logic error in fixIfCase');
		this.pos++;
		this.checkTag('CASE', 'Logic error in fixIfCase');

		this.exprThenBlock();

		// cases _must_ be indented from switch
		this.checkTag('INDENT', 'Bad switch');

		while ('OUTDENT' !== this.tag()) {
			this.expression();
			this.checkTag('->', 'Bad if-case case');

			this.pos++;
			this.expressionOrBlock();
		}

		this.checkTag('OUTDENT', 'Bad if-case block');
		return this;
	},

	fixSwitch: function() {
		this.checkTag('SWITCH', 'Logic error in fixSwitch');
		this.pos++;

		// thing being switched
		this.expression(true);

		// cases _must_ be indented from switch
		this.checkTag('INDENT', 'Bad switch');

		while ('OUTDENT' !== this.tag()) {
			// account for comma-separated cases
			do {
				this.checkTag('CASE', 'Bad switch');
				this.pos++;
				this.expression(true);
			} while (',' === this.tag());

			this.indent = 0;
			this.block();
		}

		this.checkTag('OUTDENT', 'Bad case block');

		return this;
	},

	fixTry: function() {
		this.checkTag('TRY', 'Logic error in fixIf');
		this.pos++;

		this.block();

		if ('CATCH' === this.tag()) {
			this.pos++;
			this.checkTag('IDENTIFIER', 'Bad catch identifier');
			this.pos++;
			this.block();
		}

		if ('FINALLY' === this.tag()) {
			this.pos++;
			this.block();
		}

		return this;
	},

	fixParens: function() {
		this.checkTag('(', 'Logic error in fixParens');

		this.pos++;
		this.expression();

		this.checkTag(')', 'Bad expression in parentheses');
		this.pos++;

		return this;
	},

	fixArray: function() {
		this.checkTag('[', 'Logic error in fixArray');
		this.pos++;

		while (this.tag() !== ']') {
			this.expression();
			this.pos++;
		}
		this.pos++; // skip ]

		return this;
	},

	fixObject: function() {
		this.checkTag('{', 'Logic error in fixObject');
		this.pos++;

		while (this.has() && this.tag() !== '}') {
			this.checkTag('IDENTIFIER', 'Bad object');
			this.pos++;

			this.checkTag(':', 'Bad object');
			this.pos++;

			this.expression();
			if (',' === this.tag()) {
				this.pos++;
			} else {
				this.checkTag('}', 'Bad object');
			}
		}
		this.pos++; // skip }

		return this;
	},

	fixFunction: function() {
		this.checkTag('\\', 'Logic error in fixFunction');
		this.pos++;

		// parameters
		while (this.has() && this.tag() !== '->') {
			if ('IDENTIFIER' === this.tag()) {
				this.pos++;
			} else {
				this.checkTag('->', 'Bad function');
			}
		}

		this.pos++; // move past '->'

		return this.expressionOrBlock();
	},

	block: function(isTop) {
		var startDent = this.indent;

		if (! isTop) {
			this.checkTag('INDENT', 'Bad block');
			this.indent++;
			this.pos++;
		}

		while (this.has()) {
			switch (this.tag()) {
			case 'OUTDENT':
				this.pos++;
				this.indent--;
				if (startDent >= this.indent) {
					return this;
				}
				break;

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
			}
		}

		// we only get here if we found no OUTDENT, which means we are at the
		// top level
		if (isTop) {
			return this;
		} else {
			throw new Error('Logic error');
		}

	},

	expression: function(noIndent) {
		var startDent = this.indent;

		while (1) {
			switch (this.tag()) {
			case ')':
			case ']':
			case '}':
			case ',':
			case '->': // end of if-case condition
			case void 0:
				return this;

			case 'TERMINATOR':
				if (this.indent > startDent) {
					this.removeToken();
				} else {
					this.pos++; // expression includes TERMINATOR
					return this;
				}
				break;

			case 'INDENT':
				this.indent++;
				this.removeToken();
				break;

			case 'OUTDENT':
				if (startDent >= this.indent) { // expression does not include OUTDENT
					return this;
				} else { // expression includes OUTDENT
					this.indent--;

					if (startDent === this.indent) { // OUTDENT ends the expression
						if ($.contains(['TERMINATOR', 'OUTDENT'], this.nextTag())) {
							this.removeToken();
						} else {
							this.replaceTag('TERMINATOR');
						}
						this.pos++;

						return this;
					} else {
						this.removeToken();
					}
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
				this.fixObject();
				break;
			case '[':
				this.fixArray();
				break;
			case '(':
				this.fixParens();
				break;
			default:
				this.pos++;
				break;
			}

		}
	},

	expressionOrBlock: function() {
		if ('INDENT' === this.tag()) {
			return this.block();
		} else {
			return this.expression();
		}
	},

	expressionList: function() {
		this.expression();
		if (',' === this.tag()) {
			this.pos++;
		}

		return this;
	},

	checkTag: function(tag, msg) {
		if (tag !== this.tag()) {
			this.error(msg, this.token());
		}
	},

	isOutdented: function() {
		// if we've run out of tokens, we're outdented
		return ! this.has() || 'OUTDENT' === this.tag();
	},

	splitIndentEnd: function(pos, indent, tail) {
		var
			tok = this.tokens[pos],
			clipped = H.clipEnd(indent, tail);

		return [
			set(tok, 1, clipped),
			set(tok, 1, tail)
		];
	},

	splitOutdentEnd: function(pos, indent, tail) {
		var
			tok = this.tokens[pos],
			clipped = H.clipEnd(indent, tail);

		return [
			set(tok, 1, tail),
			set(tok, 1, clipped)
		];
	},

	error: function(msg, pos) {
		H.throwSyntaxError(msg, this.tokens[pos] && this.tokens[pos][2]);
	}
});

module.exports = {
	Blocker: Blocker,
	resolveBlocks: function(tokens) {
		return (new Blocker(tokens).fixBlocks()).tokens;
	}
};

