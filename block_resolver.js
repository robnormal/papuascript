var H = require('./helpers.js');
var $ = require('underscore');

// I use these too often to write them out all the time
var
	last = H.last,
	indentGreaterThan = H.indentGreaterThan,
	indentLessThan = H.indentLessThan,
	indentMinus = H.indentMinus,
	stringMinus = H.stringMinus,
	Nothing = H.nothing,
	Just = H.just;

var BLOCK_TAGS = [
	'FOR', 'WHILE', 'DO', 'IF', 'ELSE',
	'SWITCH', 'CASE', 'DEFAULT', 'TRY', 'CATCH', 'FINALLY'
];

// eliminate leading TERMINATORs
function trimNewlines(tokens, i) {
	var trimmed = 0;

	while (tokens[i] && tokens[i][0] === 'TERMINATOR') {
		tokens.splice(i, 1);
		trimmed++;
	}

	return trimmed;
}

var canBeginLine = (function() {
	var cant_start_line = [
		'TERMINATOR',
		'INDENT',
		'OUTDENT',
		')',
		']',
		'}',
		'ELSE',
		'CATCH',
		'FINALLY',
		'CASE',
		'DEFAULT'
	];

	return function canBeginLine(tag) {
		return -1 === cant_start_line.indexOf(tag);
	};
})();

// removes zero-length markers ('|') from block level
function realLevel(level) {
	return level && level.replace(/\|/g,'');
}

var Line, Block, isLine, isIndentedLine, isBlock, getDent;

(function() {
	function Indentable(type, level, pairs, owner) {
		this.type = type;
		this.level = level;
		this._rlevel = realLevel(level);
		this.pairs = pairs;
		this.owner = owner;

		this.indent = '';
		this._rindent = '';
	}

	$.extend(Indentable.prototype, {
		// things are unindented only by _real_ indents
		isUnindented: function(state) {
			var st_rlevel = state.rlevel();

			return st_rlevel === this._rlevel ||
				indentLessThan(st_rlevel, this._rlevel) ||
				this.indent && indentLessThan(st_rlevel, this.indent);
		},

		pairsAreClosed: function(state) {
			return state.pairs < this.pairs;
		},

		setIndent: function(indent) {
			this.indent = indent;
			this._rindent = realLevel(this.indent);
		},

		addIndent: function(indent) {
			this.setIndent(this.indent + (
				'' === indent ? '|' : indent
			));
		}
	});

	Line = function(level, pairs, owner) {
		return new Indentable('Line', level, pairs, owner);
	};

	Block = function(level, pairs, owner) {
		return new Indentable('Block', level, pairs, owner);
	};

})();

isLine = function(indentable) {
	return indentable && indentable.type === 'Line';
}

isIndentedLine = function(indentable) {
	// only a real indent indents a line
	return isLine(indentable) && indentable._rindent;
}

isBlock = function(indentable) {
	return indentable && indentable.type === 'Block';
}

getDent = function(indent) {
	return indent ? indent : '|';
}

function Resolver(tokens) {
	trimNewlines(tokens, 0);

	this.tokens = tokens;
	this.pos = 0;

	this.level = '';
	this.pairs = 0;
	this.indentables = [];

	this.awaiting_line = true; // awaiting first line
	this.is_do = false;
}
Resolver.KEEP_OUTDENT = 0;
Resolver.DROP_OUTDENT = 1;

$.extend(Resolver.prototype, {
	rlevel: function() {
		return realLevel(this.level);
	},

	token: function() {
		return this.tokens[this.pos];
	},

	tag: function() {
		var tok = this.token();
		return tok && tok[0];
	},

	nextTag: function(tag) {
		return this.tokens[this.pos + 1] && this.tokens[this.pos + 1][0];
	},

	nextTagIs: function(tag) {
		return tag === this.nextTag();
	},

	appendTag: function(tag) {
		var tok = this.insertTag(this.pos + 1, tag);
		this.pos++;
		return tok;
	},

	insertTag: function(pos, tag) {
		return this.insertTagWithText(pos, tag, '');
	},

	insertTagWithText: function(pos, tag, text) {
		var tok = [tag, text, H.loc(this.tokens[pos - 1])];
		this.tokens.splice(pos, 0, tok);
		return tok;
	},

	replaceTag: function(pos, tag) {
		this.tokens[pos][0] = tag;
		return this.tokens[pos];
	},

	removeToken: function(pos) {
		return this.tokens.splice(pos, 1);
	},

	dropToken: function() {
		var tok = this.removeToken(this.pos);
		this.pos--;
		return tok;
	},

	needsBlock: function() {
		return isBlock(this.dentable) && ! this.dentable.indent;
	},

	push: function(indentable) {
		this.indentables.push(indentable);
		this.dentable = last(this.indentables);

		return this.dentable;
	},

	pop: function() {
		var popped = [this.indentables.pop()];
		this.dentable = last(this.indentables);

		// Block always finishes a line, that is an explicit rule
		if (isBlock(popped) && isLine(popped.owner)) {
			popped.push(this.pop());
		}

		return popped;
	},

	// opening paren starts a Line or Block
	incrementPairs: function() {
		this.pairs++;
		this.awaiting_line = true;
	},

	// closing paren ends a Line
	decrementPairs: function() {
		this.pairs--;
		var outdents_needed = this.closePairs();

		this.insertOutdents(outdents_needed);

		// There might have been an INDENT inside the parens
		if (this.dentable && indentGreaterThan(this.level, this.dentable.level)) {
			this.dentable.indent = this.level;
		}
	},

	block: function() {
		var b;

		// if Block starts within a Line, (but is not parenthesized) then
		// the Block ends at the end of the line
		if (isLine(this.dentable) && this.dentable.pairs === this.pairs) {
			b = Block(this.level, this.pairs, this.dentable);
		} else {
			b = Block(this.level, this.pairs, null);
		}

		this.push(b);
		this.awaiting_line = false; // won't need a new line until INDENT
	},

	line: function() {
		var ln = Line(this.level, this.pairs);

		if (! isLine(this.dentable)) {

			return Just(this.push(ln));

		// if inside new parens, add Line
		} else if (! this.dentable || this.pairs > this.dentable.pairs) {

			return Just(this.push(ln));

		} else if (isIndentedLine(this.dentable)) {
			var new_indent = this.level;

			var cmp = H.indentCmp(new_indent, this.dentable.level);

			// if the newline is outdented from the _base_ of the current line,
			// then something is wrong - there should have been an OUTDENT
			if (cmp.less) {
				throw new Error('Bad line indent. Missing OUTDENT?');
			} else if (cmp.equal) {
				this.pop();

				return Just(this.push(Line(this.level, this.pairs)));
			} // else, continue below
		} else {
			// update current line's indent
			this.dentable.indent = this.level;
			return Nothing;
		}
	},

	terminator: function() {
		if (isIndentedLine(this.dentable)) {
			// erase newline
			this.removeToken(this.pos);
			this.pos--;
		} else {
			this.pop();
			this.awaiting_line = true;
		}
	},

	indent: function() {
		if (! this.dentable) {
			throw new Error('Cannot indent from nothing');
		} else {
			// FIXME: handle indented block conditions
			var dent = getDent(this.token()[1]);

			if (! this.needsBlock()) {
				this.dropToken();
			}

			this.level = this.level + dent;
			this.dentable.addIndent(dent);
			this.awaiting_line = true;
		}
	},

	outdent: function() {
		var
			dent = getDent(this.token()[1]),
			diff = stringMinus(this.level, dent),
			outdents_needed, i, len;

		if (diff.isNothing()) {
			this.error('Mismatched indent');
		} else {
			this.level = diff.fromJust();
			outdents_needed = this.closeIndents();

			if (! outdents_needed.length) {
				if (this.nextTagIs('TERMINATOR')) {
					this.dropToken();
				} else {
					this.replaceTag(this.pos, 'TERMINATOR');
				}
				this.pos--;
			} else {
				outdents_needed.shift(); // we already have the first outdent
				this.insertOutdents(outdents_needed);

				if (canBeginLine(this.nextTag())) {
					this.appendTag('TERMINATOR');
				}
			}
		}

		this.awaiting_line = true;
	},

	popWhile: function(cond) {
		var outdents_needed = [],
			popped, m_dent;

		while (cond(this)) {
			popped = this.pop();

			for (var i = 0, len = popped.length; i < len; i++) {
				if (isBlock(popped[i])) {
					outdents_needed.push(popped[i].indent);
				}
			}
		}

		return outdents_needed;
	},

	closeIndents: function() {
		return this.popWhile(function(that) {
			return that.dentable && that.dentable.isUnindented(that);
		});
	},

	closePairs: function() {
		return this.popWhile(function(that) {
			return that.dentable && that.dentable.pairsAreClosed(that);
		});
	},

	fixBlocks: function() {
		var tag, dent;

		while (this.token()) {
			// this.debug_tokens(i, line.level, awaiting_block);
			tag = this.tag();

			// check for block keyword
			// but don't treat DO statement's WHILE as a block word
			if ('WHILE' === tag && this.is_do) {
				this.is_do = false;
			} else if (H.has(BLOCK_TAGS, tag)) {
				this.is_do = tag === 'DO';
				this.block();
			} else switch(tag) {

				case 'TERMINATOR':
					this.terminator();
					break;

				case 'INDENT':
					this.indent();
					break;

				case 'OUTDENT':
					this.outdent();
					break;

				case '\\':
					this.block();
					break;

				case '->':
					// take care of inline functions
					if (! this.nextTagIs('INDENT')) {
						this.appendTag('INDENT');
					}
					break;

				case '(': case '[': case '{':
					this.incrementPairs();
					break;

				case ')': case ']': case '}':
					this.decrementPairs();
					break;
			}

			if (this.awaiting_line && canBeginLine(tag)) {
				this.line();
				this.awaiting_line = false;
			}

			this.pos++;
		}
	},

	insertOutdents: function(dents) {
		var dent, i;

		for (i = dents.length - 1; i >= 0; i--) {
			if (dents[i - 1]) {
				dent = indentMinus(dents[i], dents[i-1]).fromJust();
			} else {
				dent = dents[i];
			}

			this.insertTagWithText(this.pos, 'OUTDENT', dent);
			this.pos++;
		}
	},

	error: function(msg) {
		H.error(msg, this.token());
	}
});

function resolveBlocks(tokens) {
	var r = new Resolver(tokens);

	r.fixBlocks();

	if (last(tokens)[0] !== 'TERMINATOR') {
		r.insertTag(tokens.length, 'TERMINATOR');
	}

	return r.tokens;
}


module.exports = {
	Resolver: Resolver,
	resolveBlocks: resolveBlocks,

	// FIXME: These are exported for testing purposes
	// Should use an intermediary for exporting to tests,
	// and an outer file for exporting API
	Line: Line,
	Block: Block
};

