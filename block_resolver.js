var H = require('./helpers.js');
var last = H.last; // I use this too often to write it out all the time

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

function Line(pos, level, indented, has_block) {
	this.pos = pos;
	this.level = level;
	this.indented = indented;
	this.has_block = has_block;
}

function Resolver(tokens) {
	trimNewlines(tokens, 0);

	this.tokens = tokens;
	this.pos = 0;
	this.level = '';
	this.awaiting_block = false;
	this.is_do = false;
	this.blocks = [];

	this.pairs = 0;
	this.indents = 0;

	this.indents_at_level = { '': 0 };

	this.lines = [new Line(this.pos, this.level, false, false)];
}

Resolver.prototype.indent = function() {
	var line = last(this.lines);


	if (this.awaiting_block) {
		line.has_block = true;
		this.awaiting_block = false;
		this.level = line.level + this.tokens[this.pos][1];

		// only update this if our INDENT was not added
		// i.e., if it actually changes the indentation
		if (this.level !== line.level) {
			this.indents_at_level[this.level] = this.indents;
		}

		if (this.tokens[this.pos][1]) {
			var new_line = new Line(this.pos, this.level, false, false);
			this.lines.push(new_line);
		}

		this.blocks.push(H.last(this.lines));
		this.indents++;
		this.pos++;
	} else {
		line.indented = true;
		// erase indent
		this.removeToken(this.pos);
		this.pos--;
	}
};

Resolver.prototype.outdent = function() {
	var line = last(this.lines);
	var m_indent = H.clipString(this.level, this.tokens[this.pos][1]);
	var ln;

	if (m_indent.isNothing()) {
		H.error('Mismatched indent', this.tokens[this.pos]);
	} else {
		this.level = m_indent.fromJust();

		console.log(this.lines, [line.level, this.level]);

		if (line.indented && line.level === this.level) {
			line.indented = false; // we've undone the indentation now

			// replace OUTDENT with TERMINATOR, and try again
			if (this.nextTagIs('TERMINATOR')) {
				this.removeToken(this.pos);
			} else {
				this.replaceTag(this.pos, 'TERMINATOR');
			}
				
			this.pos--;
		} else {
			this.blocks.pop();
			this.lines.pop();
			this.indents--;

			ln = last(this.lines);

			// close innermost unclosed indent
			// outer ones will be closed at the next outdent (which we are inserting now)
			if (this.indents > this.indents_at_level[this.level]) {
				this.insertTag(this.pos + 1, 'OUTDENT');
			}

			if (ln.level === this.level) {
				// if line is indented but not outdented, fix that
				if (ln.indented) {
					this.insertTag(this.pos + 1, 'OUTDENT');
				} else {
					this.nextLine();
				}
			}
		}
	}

};

Resolver.prototype.functionBlock = function() {
	this.awaiting_block = true;

	// take care of inline functions
	if (! this.nextTagIs('INDENT')) {
		this.insertTag(this.pos + 1, 'INDENT');
	}
};

// called before beginning line - i.e., at the TERMINATOR or OUTDENT
// prior to the line, but after accounting for the new indent level
Resolver.prototype.nextLine = function() {
	this.lines.push(
		new Line(this.pos + 1, this.level, false, false)
	);
};

Resolver.prototype.terminator = function() {
	if (last(this.lines).indented) {
		// erase newline
		this.removeToken(this.pos);
		this.pos--;
	} else {
		this.lines.pop();
		this.nextLine();
	}
};

Resolver.prototype.closingUnindentedFunction = function() {
	var innermost = last(this.unindented_funcs);
	return last(this.lines) === innermost.line &&
		// innermost.pairs === this.pairs &&
		innermost.indents === this.indents;
}

Resolver.prototype.fixBlocks = function() {
	var block_line, m_indent, tag, tmp;

	while (this.tokens[this.pos]) {
		// this.debug_tokens(i, line.level, awaiting_block);
		tag = this.tokens[this.pos][0];

		// check for block keyword
		// but don't treat DO statement's WHILE as a block word
		if (H.has(BLOCK_TAGS, tag) && !('WHILE' === tag && this.is_do)) {
			this.is_do = tag === 'DO';
			this.awaiting_block = true;
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

			case '->':
				this.functionBlock();
				break;

			case '(': case '[': case '{':
				this.pairs++;
				break;

			case ')': case ']': case '}':
				this.pairs--;
				break;
		}

		this.pos++;
	}
}

Resolver.prototype.nextTagIs = function(tag) {
	return this.tokens[this.pos + 1] &&
		tag === this.tokens[this.pos + 1][0];
}

Resolver.prototype.removeToken = function(pos) {
	return this.tokens.splice(pos, 1);
}

Resolver.prototype.insertTag = function(pos, tag) {
	var tok = [tag, '', H.loc(this.tokens[pos - 1])];
	this.tokens.splice(pos, 0, tok);
	return tok;
}

Resolver.prototype.replaceTag = function(pos, tag) {
	this.tokens[pos][0] = tag;
	return this.tokens[pos];
}

Resolver.prototype.debug_tokens = function(i, indent_level, awaiting_block) {
	var line = last(this.lines);

	for (var j = 0; j < this.tokens.length; j++) {
		var tok = [this.tokens[j][0], this.tokens[j][1]];
		if (j === i) {
			console.log('>', tok);
		} else {
			console.log(tok);
		}
	}
	console.log([indent_level, awaiting_block]);
	console.log([this.lines]);
	console.log();
}


function resolveBlocks(tokens) {
	var r = new Resolver(tokens);

	r.fixBlocks();

	if (last(tokens)[0] !== 'TERMINATOR') {
		r.insertTag(tokens.length, 'TERMINATOR');
	}

	return r.tokens;
}


module.exports = {
	resolveBlocks: resolveBlocks
};

