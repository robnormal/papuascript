/*jshint regexp: false, white: false, boss: true */
var H = require('./helpers.js');
var R = require('./rewriter.js');
var log  = console.log;

function Lexer() {}

var JS_KEYWORDS, PAPUA_KEYWORDS, RESERVED, STRICT_PROSCRIBED, JS_FORBIDDEN,
		IDENTIFIER, NUMBER  , WHITESPACE, COMMENT   , MULTI_DENT, SIMPLESTR , JSTOKEN   ,
		OPERATORS, UNARY   , LOGIC   , SHIFT   , COMPARE , MATH    , RELATION, BOOL,
		MULTILINER      , TRAILING_SPACES , COMPOUND_ASSIGN, SINGLESTR, DOUBLESTR, REGEX,
		UNARY_ASSIGN, PAPUA_OPS, INTEGER, TO_EOL
		;

// Keywords that CoffeeScript shares in common with JavaScript.
JS_KEYWORDS = [
  'true', 'false', 'null', 'var',
	'let', 'new', 'delete', 'typeof', 'in', 'instanceof',
  'return', 'throw', 'break', 'continue', 'debugger',
  'if', 'else', 'switch', 'case', 'default', 'for', 'while',
	'do', 'try', 'catch', 'finally'
];

PAPUA_KEYWORDS = ['with'];

// The list of keywords that are reserved by JavaScript, but not used, or are
// used by CoffeeScript internally. We throw an error when these are encountered,
// to avoid having a JavaScript error at runtime.
RESERVED = [
  'function', 'void', 'const', 'enum',
  'export', 'native', 'import',
  'implements', 'interface', 'package', 'private', 'protected',
  'public', 'static', 'yield', 'class', 'extends', 'super'
];

STRICT_PROSCRIBED = ['arguments', 'eval'];

// The superset of both JavaScript keywords and reserved words, none of which may
// be used as identifiers or properties.
JS_FORBIDDEN = JS_KEYWORDS.concat(RESERVED).concat(STRICT_PROSCRIBED).concat(PAPUA_KEYWORDS);

// The character code of the nasty Microsoft madness otherwise known as the BOM.
var BOM = 65279;

IDENTIFIER = /^([$A-Za-z_\x7f-\uffff][$\w\x7f-\uffff]*)/;
INTEGER  = /^\d+/;
NUMBER  = /^0b[01]+|^0o[0-7]+|^0x[\da-f]+|^\d*\.?\d+(?:e[+-]?\d+)?/i;
WHITESPACE = /^[^\n\S]+/;
COMMENT    = /^\s*(?:\/\*|\/\/)/;
MULTI_DENT = /^(?:\n([^\n\S]*))+/;
SINGLESTR  = /^'[^\\']*(?:\\.[^\\']*)*'/;
DOUBLESTR  = /^"[^\\"]*(?:\\.[^\\"]*)*"/;
JSTOKEN    = /^`[^\\`]*(?:\\.[^\\`]*)*`/;
TO_EOL     = /[^\n]*/

MULTILINER      = /\n/g;
TRAILING_SPACES = /\s+$/;


// combined operation-assignment tokens.
COMPOUND_ASSIGN = [
  '-=', '+=', '/=', '*=', '%=', '<<=', '>>=', '>>>=', '&=', '^=', '|='
];
ASSIGN  = [':=', '=']
LOGIC   = ['&&', '||', '&', '|', '^'];
SHIFT   = ['<<', '>>>', '>>'];
PAPUA_OPS = ['->', '<-', '??'];
COMPARE = ['==', '!=', '<=', '>=', '<', '>'];
MATH    = ['*', '/', '%'];
UNARY_ASSIGN = ['++', '--'];

// NOTE: order matters here; we must check '>=' before '>', for example
OPERATORS  = COMPOUND_ASSIGN.concat(LOGIC).concat(SHIFT)
	.concat(PAPUA_OPS).concat(COMPARE).concat(MATH)
	.concat(UNARY_ASSIGN).concat(ASSIGN);

UNARY   = ['!', '~', 'NEW', 'TYPEOF', 'DELETE'];

RELATION = ['IN', 'INSTANCEOF'];
BOOL = ['TRUE', 'FALSE'];

var addWhitespaceTokens = function(a, b) {
	var tag_a = a[0], tag_b = b[0], txt_a = a[1], txt_b = b[1];

	// extra TERMINATORs have no effect on indentation, so drop them
	if (tag_a === 'TERMINATOR') {
		return [b];
	} else if (tag_b === 'TERMINATOR') {
		return [a];
	} else if (tag_a === 'INDENT') {
		if (tag_b === 'INDENT') {
			return [
				['INDENT', txt_a + txt_b, a[2]]
			];
		// a is INDENT, b is OUTDENT
		} else if (txt_a === txt_b) {
			return [];
		} else if (H.ends_with(txt_a, txt_b)) {
			return [
				['INDENT', H.stringMinus(txt_a, txt_b), a[2]]
			];
		} else if (H.ends_with(txt_b, txt_a)) {
			return [
				['OUTDENT', H.stringMinus(txt_b, txt_a), a[2]]
			];
		} else {
			H.throwSyntaxError('Mismatched indent', b[2]);
		}
	} else {
		if (tag_b === 'OUTDENT') {
			return [
				['OUTDENT', txt_b + txt_a, b[2]]
			];
		// a is OUTDENT, b is INDENT
		} else if (txt_a === txt_b) {
			return [];
		} else if (H.begins_with(txt_a, txt_b)) {
			return [
				['OUTDENT', txt_a.substr(txt_b.length), a[2]]
			];
		} else if (H.begins_with(txt_b, txt_a)) {
			return [
				['INDENT', txt_b.substr(txt_a.length), b[2]]
			];
		} else {
			H.throwSyntaxError('Mismatched indent', b[2]);
		}
	}
}

/**
 * The presence of comments may give rise to consecutive INDENTs, OUTDENTs,
 * and TERMINATORs. We merge them here, since comments should not effect
 * lexing.
 */
var mergeIndentation = function(tokens) {
	// must compare i to _current_ length of tokens
	for (var i = 0; i < tokens.length; i++) {
		if (tokens[i+1] &&
			H.isWhitespaceToken(tokens[i]) &&
			H.isWhitespaceToken(tokens[i+1])
		) {
			var newspace = addWhitespaceTokens(tokens[i], tokens[i+1]);
			Array.prototype.splice.apply(tokens, [i, 2].concat(newspace));
			i -= newspace.length;
		}
	}

	return tokens;
};

Lexer.prototype = {
	setInput: function(s) {
		this.text = s;
		this.fixed_tokens = R.rewrite(this.tokenize(this.text));
		this.lex_index = 0;
		this.lex_len = this.fixed_tokens.length;
	},

	lex: function() {
		if (this.lex_index < this.lex_len) {
			this._tok     = this.fixed_tokens[this.lex_index];

			this.yylineno = this._tok[2].first_line;
			this._pos     = this._tok[2].first_column;
			this.match    = this._tok[1];
			this.yytext   = this.match;

			this.lex_index++;

			return this._tok[0];
		}
	},

	place: function() {
		return this.lex_index;
	},

	position: function() {
		return this._pos;
	},

	tokenize: function(s) {
		this.level  = '';              // Current indent level
		this.tokens   = [];            // Stream of parsed tokens in the form `['TYPE', value, location data]`.
		
		this.chunkLine = 0;            // The start line for the current @chunk.
		this.chunkColumn = 0;          // The start column of the current @chunk.
		var code = this.clean(s);          // The stripped, cleaned original source code.

		var i = 0, len = code.length,
				chunk, consumed, tag;


		while (!!(this.chunk = code.substr(i))) {
			consumed =
				this.identifier() ||
				this.comment() ||
				this.whitespace() ||
				this.line() ||
				this.string() ||
				this.number() ||
				this.integer() ||
				this.regex() ||
				this.literal();

			// Update position
			var line_col = this.getLineAndColumnFromChunk(consumed);
			this.chunkLine = line_col[0];
			this.chunkColumn = line_col[1];

			i += consumed;
		}

		mergeIndentation(this.tokens);
		this.endFile(this.tokens);

    return this.tokens;
	},

	clean: function(code) {
		// remove byte order marker if present
		if (code.charCodeAt(0) === BOM) {
			code = code.slice(1);
		}

		// remove |r character and whitespace at end of code
    return code.replace(/\r/g, '').replace(TRAILING_SPACES, '');
	},

	identifier: function() {
		var match, poppedToken;

		if (! (match = IDENTIFIER.exec(this.chunk))) return 0;

		var input = match[0];
		var id = match[1];

    // Preserve length of id for location data
    var idLength = id.length;

		/* special strings */
		var isFor = 'FOR' === this.prevTag();

    if (isFor && 'own' === id) {
			this.token('OWN', id);
			return id.length;

		} else if (isFor && 'index' === id) {
			this.token('INDEX', id);
			return id.length;

		} else if ('with' === id) {
      this.token('WITH', id);
			this.importing = true;
			return id.length;

		// "as" is only special in an import statement
		} else if ('as' === id && this.importing) {
      this.token('AS', id);
			this.importing = false;
			return id.length;

		} else if ('undefined' === id) {
      this.token('UNDEFINED', id);
			return id.length;
		}

    var tag = 'IDENTIFIER';

    if (H.has(JS_KEYWORDS, id) || H.has(PAPUA_KEYWORDS, id)) {
      tag = id.toUpperCase();
			if (H.has(UNARY, tag)) {
        tag = 'UNARY';
			}
		}

		if (H.has(RESERVED, id)) {
			this.error('reserved word "' + id + '"');
		}

		switch (id) {
			case '!':
				tag = 'UNARY';
				break;

			case '==':
			case '!=':
				tag = 'COMPARE';
				break;

			case '&&':
			case '||':
				tag = 'LOGIC';
				break;

			case 'true':
			case 'false':
				tag = 'BOOL';
				break;

			case 'break':
			case 'continue':
				tag = 'STATEMENT';
				break;
		}

    var tagToken = this.token(tag, id, 0, idLength);
    if (poppedToken) {
			tagToken[2].first_line = poppedToken[2].first_line;
      tagToken[2].first_column = poppedToken[2].first_column;
		}

    return input.length;
	},

  integer: function() {
		var match = INTEGER.exec(this.chunk);
		if (!match) return 0;

    var integer = match[0];
    this.token('INTEGER', integer, 0, integer.length);
    return integer.length;
	},

	// RR - pretty sure this is OK
  // Matches numbers, including decimals, hex, and exponential notation.
  // Be careful not to interfere with ranges-in-progress.
  number: function() {
		var
			match = NUMBER.exec(this.chunk),
			number, prev, lexedLength, octalLiteral, binaryLiteral;

		if (!match) return 0;

    number = match[0];

    if (/^0[BOX]/.test(number)) {
      this.error('radix prefix ' + number + ' must be lowercase');
		} else if (/E/.test(number) && ! /^0x/.test(number)) {
      this.error("exponential notation '#{number}' must be indicated with a lowercase 'e'");
		} else if (/^0\d*[89]/.test(number)) {
      this.error("decimal literal '#{number}' must not be prefixed with '0'");
		} else if (/^0\d+/.test(number)) {
      this.error("octal literal '#{number}' must be prefixed with '0o'");
		} else if (0 === number.indexOf('.') && (prev = this.prevToken()) &&
				! prev.spaced
		) {
			// catch array indexing via '.'
			this.token('.', '.', 0, 1);
			this.token('INTEGER', number.slice(1), 0, number.length - 1);

			return number.length;
		}

		lexedLength = number.length;
		octalLiteral = /^0o([0-7]+)/.exec(number);
		binaryLiteral = /^0b([01]+)/.exec(number);

		if (octalLiteral) {
			number = '0x' + parseInt(octalLiteral[1], 8).toString(16);
		}
		if (binaryLiteral) {
			number = '0x' + parseInt(binaryLiteral[1], 2).toString(16);
		}

		this.token('NUMBER', number, 0, lexedLength);
		return lexedLength;
	},

  // Matches strings, including multi-line strings. Ensures that quotation marks
  // are balanced within the string's contents, and within nested interpolations.
  string: function() {
    switch (this.chunk.charAt(0)) {
		case "'":
		case '"':
			var rgx = this.chunk[0] === "'" ? SINGLESTR : DOUBLESTR;

			var match = rgx.exec(this.chunk);
			if (! match) return 0;

			var string = match[0];

			// replace newlines with literal |n
			this.token('STRING', string.replace(MULTILINER, '\\n'), 0, string.length);
			break;
		case '%':
			if (this.chunk.charAt(1) === '{') {
				var
					i = 2,
					len = this.chunk.length,
					backslashes = 0;

				while (i < len) {
					var chr = this.chunk.charAt(i);

					if (chr === '}' && 0 === backslashes % 2) {
						this.token('WORDS', this.chunk.substr(2, i-2), 0, i - 4);
						return i + 1;
					} else if (chr === '\\') {
						backslashes++;
					} else {
						backslashes = 0;
					}

					i++;
				}
			}

			// didn't find it
			return 0;
			break;

		default:
      return 0;
		}

		var octalEsc = /^(?:\\.|[^\\])*\\(?:0[0-7]|[1-7])/.test(string);
    if (octalEsc) {
      this.error('octal escape sequences ' + string + ' are not allowed');
		}

    return string.length;
	},

	// RR - vetted
	comment: function() {
		var
			match = this.chunk.match(COMMENT),
			nested = 0,
			matched_chars, matchEnd, firstPair, i, len;

		if (!match) return 0;

		matched_chars = match[0].length;
		matchEnd = match[0].slice(matched_chars - 2);

		if (matchEnd === '/*') {
			for (i = matched_chars, len = this.chunk.length; i < len; i++) {
				firstPair = this.chunk.substr(i, 2);

				if ('/*' === firstPair) {
					nested++;
				} else if ('*/' === firstPair) {
					if (! nested) {
						i += 2; // consume "*/"
						break;
					} else {
						nested--;
					}
				}
			}

			// if comment is unclosed, consume the rest of the file
			return i;
		} else {
			return this.chunk.match(TO_EOL)[0].length;
		}
	},

	regex: function() {
		var match, i, chr, backslashes,
			len = this.chunk.length;

		if ('/' !== this.chunk.charAt(0) || ! this.chunk.charAt(1) || this.chunk.charAt(1).match(/[\s\/*]/)) {
			return 0;
		}

		i = 1;
		backslashes = 0;
		while (i < len) {
			chr = this.chunk.charAt(i);
			if (chr === '\n') {
				break;
			} else if (chr === '\\') {
				backslashes++;
			} else {
				if (chr === '/' && 0 === backslashes % 2) {
					break;
				} else {
					backslashes = 0;
				}
			}

			i++;
		}

		if (i >= len) {
			this.error('Incomplete regex');
		} else {
			do {
				i++;
			} while (i < len&& this.chunk.substr(i).match(/^[gmi]/));

			this.token('REGEX', this.chunk.substr(0, i), 0, i);

			return i;
		}
	},

  // Matches newlines, indents, and outdents, and determines which is which.
  // If we can detect that the current line is continued onto the the next line,
  // then the newline is suppressed:
  //
  //     elements
  //       .each( ... )
  //       .map( ... )
  //
  // Keeps track of the level of indentation, because a single outdent token
  // can close multiple indents, so we need to know how far in we happen to be.
	line: function() {
		var diff, indent, match, size,
			prev = H.last(this.tokens),
			base_indent = this.level;

		if (!(match = MULTI_DENT.exec(this.chunk))) {
			return 0;
		}

		// mark token before newline as spaced
		if (prev) prev.spaced = true;

		indent = match[1];

		if (indent === base_indent) {
			this.newlineToken(0);
			return match[0].length;

		// indent
		} else if (H.begins_with(indent, base_indent)) {
			diff = indent.substr(base_indent.length);
			this.token('INDENT', diff, indent.length - diff.length, diff.length);
			this.level += diff;

		// outdent
		} else if (H.begins_with(base_indent, indent)) {
			diff = base_indent.substr(indent.length);
			this.outdent(diff.length, true);

		} else {
			this.error('mismatched indent');
		}

		return match[0].length;
	},


  // Record an outdent token or multiple tokens, if we happen to be moving back
  // inwards past several recorded indents.
	outdent: function(moveOut, noNewlines) {
    var size = this.level.length - moveOut;

    this.token('OUTDENT', this.level.substr(size), 0, size);
    this.level = this.level.substr(0, size);

		if (!(this.prevTag() === 'TERMINATOR' || noNewlines)) {
			this.newlineToken(0);
		}
		return this;
	},

  // Matches and discards whitespace.
	whitespace: function() {
		var match = WHITESPACE.exec(this.chunk);
		if (!match) return 0;

		// mark last token as having space
		H.last(this.tokens).spaced = true;

		return match[0].length;
	},

  // Generate a newline token. Consecutive newlines get merged together.
	newlineToken: function(offset) {
		if (this.prevTag() !== 'TERMINATOR') {
			this.token('TERMINATOR', '\n', offset, 0);
		}
		return this;
	},

	currentIndent: function() {
		return this.level;
	},

	endFile: function() {
		var indent = this.currentIndent();

		// match final indent
		if (indent.length) {
			this.token('OUTDENT', indent, 0, this.tokens.length);
			this.level = '';
		}

		// always ensure a newline is at the end
		this.newlineToken(this.tokens.length);
	},

  // We treat all other single characters as a token. E.g.: `( ) , . !`
  // Multi-character operators are also literal tokens, so that Jison can assign
  // the proper order of operations. There are some symbols that we tag specially
  // here. `;` and newlines are both treated as a `TERMINATOR`, we distinguish
  // parentheses that indicate a method call from regular parentheses, and so on.
	literal: function() {
		var match, prev, tag, value;

		if ((match = H.find_init(OPERATORS, this.chunk))) {
			value = match;
		} else {
			value = this.chunk.charAt(0);
		}

		tag = value;
		prev = H.last(this.tokens);

		/*
		if (value === '=' && prev) {
			if (!prev[1].reserved && H.has(JS_FORBIDDEN, prev[1])) {
				this.error("reserved word \"" + this.prevValue() + "\" can't be assigned");
			}

			if (prev[1] === '||' || prev[1] === '&&') {
				prev[0] = 'COMPOUND_ASSIGN';
				prev[1] += '=';
				return value.length;
			}
		}
	 */

		if (H.has(MATH, value)) {
			tag = 'MATH';
		} else if (H.has(COMPARE, value)) {
			tag = 'COMPARE';
		} else if (H.has(COMPOUND_ASSIGN, value)) {
			tag = 'COMPOUND_ASSIGN';
		} else if (H.has(UNARY_ASSIGN, value)) {
			tag = 'UNARY_ASSIGN';
		} else if (H.has(UNARY, value)) {
			tag = 'UNARY';
		} else if (H.has(SHIFT, value)) {
			tag = 'SHIFT';
		} else if (H.has(LOGIC, value)) {
			tag = 'LOGIC';
		} else if (H.has(ASSIGN, value)) {
			tag = 'ASSIGN';
		}

		this.token(tag, value);

		return value.length;
	},

	// RR - vetted
	getLineAndColumnFromChunk: function(offset) {
		var column, lineCount, lines, string;

		if (offset === 0) return [this.chunkLine, this.chunkColumn];

		string = offset >= this.chunk.length ?
			this.chunk :
			this.chunk.slice(0, +(offset - 1) + 1 || 9e9);

		lineCount = H.count(string, '\n');

		if (lineCount > 0) {
			lines = string.split('\n');
			column = H.last(lines).length;
		} else {
			column = this.chunkColumn + string.length;
		}

		return [this.chunkLine + lineCount, column];
	},

	// RR - vetted
	makeToken: function(tag, value, offsetInChunk, length) {
		var line_col_first, line_col_last, locationData, lastCharacter;

		if (! offsetInChunk) offsetInChunk = 0;
		if (! length) length = value.length;

		lastCharacter = Math.max(0, length - 1);
		line_col_first = this.getLineAndColumnFromChunk(offsetInChunk);
		line_col_last  = this.getLineAndColumnFromChunk(offsetInChunk + lastCharacter);

		locationData = {
			first_line: line_col_first[0],
			first_column: line_col_first[1],
			last_line: line_col_last[0],
			last_column: line_col_last[1]
		};

		return [tag, value, locationData];
	},

	// RR - vetted
	token: function(tag, value, offsetInChunk, length) {
		var token = this.makeToken(tag, value, offsetInChunk, length);
		this.tokens.push(token);
		return token;
	},

	// RR - vetted
  // get tag of most recent token
	prevTag: function() {
		var tok = H.last(this.tokens);

		return tok && tok[0];
	},

	// RR - vetted
  // get value of most recent token tag
	prevValue: function() {
		var tok = H.last(this.tokens);

		return tok && tok[1];
	},

	prevToken: function() {
		return H.last(this.tokens);
	},

	// RR - vetted
	error: function(message) {
		return H.throwSyntaxError(message, {
			first_line: this.chunkLine,
			first_column: this.chunkColumn
		});
	}
};

module.exports = {
	Lexer: Lexer
};

