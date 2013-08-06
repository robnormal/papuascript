/*jshint indent: false */
var H = require('./helpers.js');

function error(msg, token) {
	throw new Error(msg + ' in line ' + (token[2].first_line+1) + ' column ' + (token[2].first_column+1));
}

// matches the first indent AFTER i
function closingOutdent(tokens, i) {
	var
		indents = 0,
		len = tokens.length;

	while (i < len) {
		if (tokens[i][0] === 'INDENT') {
			indents++;
		} else if (tokens[i][0] === 'OUTDENT') {
			indents--;

			if (indents === 0) {
				return i;
			}
		}

		i++;
	}

	// didn't find a match
	return false;
}

function outdentNextOutdent(tokens, i) {
	var
		indents = 0,
		out = false,
		out_tok,
		len = tokens.length;

	out = closingOutdent(tokens, i);
	out_tok = tokens[out];

	// if we get to EOF, add an outdent at the end
	// use the last token for location info
	if (false === out) {
		out = len;
		out_tok = tokens[len - 1];
	}

	tokens.splice(out, 0,
		['OUTDENT', '', H.loc(out_tok)]
	);

	return tokens;
}

function cpsArrow(tokens) {
	var
		i = 0,
		line_start = true, // whether any nonwhitespace has been encountered on this line
		identifier = false, // current identifier, if any
		tag; // current token's tag

	while (i < tokens.length) {
		tag = tokens[i][0];

		// ident at start of line is a possible CPS
		if (line_start && tag === 'IDENTIFIER') {

			identifier = i;
			i++;

		// if in an ident. list, check to see if something happens
		// otherwise, move on to next token
		} else if (tag === '<-') {
			// if previous was an ident, we have a CPS arrow
			if (false === identifier) {
				error('Unexpected CPS arrow', tokens[i]);
			} else {
				// go back to identifier
				i = identifier;
				var ident_token = tokens[identifier];

				// remove identifier and arrow
				tokens.splice(i, 2);

				// read tokens to end of line
				while (i < tokens.length && tokens[i][0] !== 'TERMINATOR') i++;

				// fix last token info
				var last_on_line = tokens[i-1];
				delete last_on_line.newLine;
				last_on_line[2].spaced = true;

				// add function literal with identifier as argument
				var line = tokens[i][2].last_line;
				var column = tokens[i][2].last_column;

				// do one whole insertion, so include TERMINATOR and add INDENT after
				// replace newline with whole thing
				tokens.splice(i, 1,
					['\\', '', H.here(line, column)],
					ident_token,
					{0: '->', 1:'', 2: H.here(line, column), newLine: true},
					['INDENT', '', H.here(line + 1, 0)]
				);

				tokens = outdentNextOutdent(tokens, i);

				// move past new OUTDENT
				i++;
			}
		} else {
			identifier = false;
			i++;
		}

		if (tag === 'TERMINATOR' || tag === 'INDENT' || tag === 'OUTDENT') {
			line_start = true;
		} else {
			line_start = false;
		}
	}

	return tokens;
}

var BLOCK_TAGS = ['FOR', 'WHILE', 'DO', 'IF', 'ELSE', 'SWITCH', 'TRY', 'CATCH'];

function fixFunctionOneLiner(tokens, arrow_pos, break_pos) {
	var extra_chars = 0;

	// if function has stuff on the line after the arrow, move it into a block
	if ('->' !== tokens[break_pos - 1][0]) {
		// add an indent before the content
		tokens.splice(arrow_pos + 1, 0,
			['INDENT', '', H.loc(tokens[arrow_pos + 1])]
		);

		// line break position has advanced by one due to the splice
		break_pos++;
		extra_chars++;

		// add OUTDENT
		tokens.splice(break_pos, 0,
			['OUTDENT', '', H.loc(tokens[break_pos])]
		);

		// line break position has advanced by one due to the splice
		break_pos++;
		extra_chars++;
	}

	return extra_chars;
}


// remove indent, newlines, and subsequent outdent from expressions
// make all functions take a block
function resolveBlocks(tokens) {
	var
		i = 0,
		pre_block = false, // whether we are waiting for a block (e.g., in a WHILE condition)
		paren_level, // while conditions, etc., can be broken over lines if in parens
		ignore_newlines = [], // stack that answers that question for indentation levels
		fn_first_line = false, // whether we are on the first line of a literal function
		tag; // current token's tag

	// eliminate leading TERMINATORs
	if (tokens[0][0] === 'TERMINATOR') {
		tokens.splice(0, 1);
	}

	while (i < tokens.length) {
		tag = tokens[i][0];

		if (H.has(BLOCK_TAGS, tag)) {
			pre_block = true;
			paren_level = 0; // start counting parens
		}

		switch (tag) {
			case '(':
				if (pre_block) paren_level++;
				break;

			case ')':
				if (pre_block) paren_level--;
				break;

			case 'INDENT':
				if (pre_block && 0 === paren_level) {
					ignore_newlines.push(false);
					pre_block = false;
				} else if (false !== fn_first_line) {
					ignore_newlines.push(false);

					// if some of the function content is on the first line,
					// move it into the block
					if ('->' !== tokens[i-1][0]) {
						// remove indent from block
						var indent = tokens.splice(i, 1)[0];

						// and add it after the arrow
						tokens.splice(fn_first_line + 1, 0, indent);
					}

					fn_first_line = false;
				} else {
					ignore_newlines.push(i);
					// remove indent
					tokens.splice(i, 1);
				}
				break;

			case 'OUTDENT':
				if (false !== fn_first_line) {
					var extra_chars = fixFunctionOneLiner(tokens, fn_first_line, i);
					i += extra_chars;
					fn_first_line = false;
				}

				var ignore_from = ignore_newlines.pop();

				if (false !== ignore_from) {
					// remove outdent
					tokens.splice(i, 1);
				}
					
				break;

			case 'TERMINATOR':
				// if we get this then there is no indent, so forget about getting a block
				pre_block = false;

				if (false !== fn_first_line) {
					var extra_chars = fixFunctionOneLiner(tokens, fn_first_line, i);
					i += extra_chars;

					fn_first_line = false;
				} else if (H.last(ignore_newlines)) {
					tokens.splice(i, 1);
				}
				break;

			case '->':
				fn_first_line = i;
				break;
		}

		i++;
	}

	return tokens;
}

function endsFactor(tok) {
	return H.has(
		['IDENTIFIER', 'STRING', 'THIS', 'NUMBER', 'BOOL', 'NULL', 'UNDEFINED', 'REGEX', ']',')','}' ],
		tok[0]
	);
}

function startsFactor(tok) {
	return H.has(
		['\\', 'IDENTIFIER', 'STRING', 'THIS', 'NUMBER', 'BOOL', 'NULL', 'UNDEFINED', 'REGEX', '[','(','{' ],
		tok[0]
	);
}


// FIXME: This solves a problem I had writing the grammar.
// It could probably be solved in the grammar, since it's
// not an ambiguity, but I don't want to do it right now
//
// Mark parameters to function literals and to function definitions
function markFunctionParams(tokens) {
	var
		i = 0,
		param_list = false; // whether we are waiting for a block (e.g., in a WHILE condition)

	// arrays and objects can be 
	while (i < tokens.length) {
		var tag = tokens[i][0];
		var prev = tokens[i-1];

		if (param_list) {
			if ('->' === tag) {
				param_list = false;
			} else if (tag === 'IDENTIFIER') {
				tokens.splice(i + 1, 0,
					['FN_LIT_PARAM', '', H.here(tokens[i].first_line, tokens[i].first_column)]
				);

				// pass the FN_LIT_PARAM token
				i++;
			} else {
				H.throwSyntaxError('Bad function parameter list');
			}
		} else if ('\\' === tag) {
			param_list = true;
		}

		// mark function calls
		if (prev && prev.spaced && endsFactor(prev) && startsFactor(tokens[i])) {
			tokens.splice(i, 0,
				['WS', '', H.loc(tokens[i])]
			);
			i++;
		}

		i++;
	}

	return tokens;
}


var BR = ['TERMINATOR', 'INDENT', 'OUTDENT'];

// undefined (the beginning of the file) returns TRUE here
function startsNewLine(tok) {
	return ! tok || H.has(BR, tok[0]);
}

// eliminate terminators following INDENT or OUTDENT
// but leave a TERMINATOR at the end of the file
function cleanTerminators(tokens) {
	var i = 0;
	while (i < tokens.length) {
		var prev = tokens[i-1];
		if ('TERMINATOR' === tokens[i][0] && startsNewLine(prev)) {
			tokens.splice(i, 1);
			continue;
		}
		i++;
	}

	// ensure one last TERMINATOR
	var last_tok = tokens[i-1];
	if (last_tok[0] !== 'TERMINATOR') {
		tokens.splice(i, 0, ['TERMINATOR', '', H.loc(last_tok)]);
	}

	return tokens;
}

function rewrite(tokens) {
	return markFunctionParams(cleanTerminators(resolveBlocks(cpsArrow(tokens))));
}


module.exports = {
	rewriteCpsArrow: cpsArrow,
	resolveBlocks: resolveBlocks,
	markFunctionParams: markFunctionParams,
	cleanTerminators: cleanTerminators,
	rewrite: rewrite
};

