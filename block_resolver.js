var H = require('./helpers.js');

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

function UnindentedFunc(level, indents, pairs) {
	this.level = level;
	this.indents = indents;
	this.pairs = pairs;
}

function Resolver(tokens) {
	trimNewlines(tokens, 0);

	this.tokens = tokens;
	this.pos = 0;
	this.level = '';
	this.awaiting_block = false;
	this.is_do = false;
	this.pairs = 0;
	this.indents = 0;

	this.lines = [{ pos: this.pos, level: this.level, indented: false }];
	this.unindented_funcs = [];
}

Resolver.prototype.indent = function() {
	var line = H.last(this.lines);

	line.indented = true;

	if (this.awaiting_block) {
		this.awaiting_block = false;
		this.level = line.level + this.tokens[this.pos][1];
		this.indents++;
		this.pos++;

		this.lines.push({ pos: this.pos, indented: false, level: this.level });
	} else {
		// erase indent
		this.removeToken(this.pos);
		this.pos--;
	}
};

Resolver.prototype.outdent = function() {
	var line = H.last(this.lines);

	var m_indent = H.clipString(this.level, this.tokens[this.pos][1]);

	if (m_indent.isNothing()) {
		H.error('Mismatched indent', this.tokens[this.pos]);
	} else {
		this.level = m_indent.fromJust();

		if (line.indented && line.level === this.level) {
			line.indented = false; // we've undone the indentation now

			// replace OUTDENT with TERMINATOR, and try again
			if ('TERMINATOR' === this.tokens[this.pos + 1][0]) {
				this.removeToken(this.pos);
			} else {
				this.replaceTag(this.pos, 'TERMINATOR');
			}
				
			this.pos--;
		} else {
			this.indents--;
			if (this.closingUnindentedFunction()) {
				this.unindented_funcs.pop();
			}

			this.lines.pop();

			if (line.level === this.level) {
				this.nextLine();
			}
		}
	}

};

Resolver.prototype.functionBlock = function() {
	this.awaiting_block = true;

	// take care of inline functions
	if ('INDENT' !== this.tokens[this.pos + 1][0] ) {
		this.unindented_funcs.push(
			new UnindentedFunc(this.level, this.indents, this.pairs)
		);
		this.insertTag(this.pos + 1, 'INDENT');
	}
};

// called before beginning line - i.e., at the TERMINATOR or OUTDENT
// prior to the line, but after accounting for the new indent level
Resolver.prototype.nextLine = function() {
	this.lines.push(
		{ pos: this.pos + 1, indented: false, level: this.level }
	);
};

Resolver.prototype.terminator = function() {
	if (H.last(this.lines).indented) {
		// erase newline
		this.removeToken(this.pos);
		this.pos--;
	} else {
		this.lines.pop();
		this.nextLine();
	}
};

Resolver.prototype.closingUnindentedFunction = function() {
	var innermost = H.last(this.unindented_funcs);
	return innermost.pairs === this.pairs &&
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
	var line = H.last(this.lines);

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

	if (H.last(tokens)[0] !== 'TERMINATOR') {
		r.insertTag(tokens.length, 'TERMINATOR');
	}

	return r.tokens;
}


module.exports = {
	resolveBlocks: resolveBlocks
};

