var H = require('./helpers.js');

function error(msg, token) {
	throw new Error(msg + ' in line ' + (token[2].first_line+1) + ' column ' + (token[2].first_column+1));
}

var BR = ['TERMINATOR', 'INDENT', 'OUTDENT'];
var BLOCK_TAGS = [
	'FOR', 'WHILE', 'DO', 'IF', 'ELSE',
	'SWITCH', 'CASE', 'DEFAULT', 'TRY', 'CATCH', 'FINALLY'
];

// undefined (the beginning of the file) returns TRUE here
function startsNewLine(tok) {
	return ! tok || H.has(BR, tok[0]);
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

function readFunctionOneLiner(tokens, pos) {
	var pairs = 0, indents = 0, body = [];

	while (tokens[pos]) {
		switch (tokens[pos][0]) {
		case '(':
		case '[':
		case '{':
			pairs++;
			break;
		case ')':
		case ']':
		case '}':
			if (pairs) {
				pairs--;
			} else {
				return [body, pos];
			}
			break;
		case 'INDENT':
			indents++;
			break;
		case 'OUTDENT':
			indents--;
			if (indents === 0 && !pairs) {
				body.push(tokens[pos]);
				return [body, pos];
			}
			break;
		case 'TERMINATOR':
			if (! indents) {
				return [body, pos];
			}
			break;
		}

		body.push(tokens[pos]);
		pos++;
	}

	// check that last token is not a newline
	if (H.last(body)[0] = 'TERMINATOR') {
		body.pop();
		pos--;
	}

	return [body, pos];
}

function fixFunctionBlocks(tokens) {
	var i = 0,
		res, code, end;

	while (tokens[i]) {
		// one-line functions
		if (tokens[i][0] === '->' && (!tokens[i+1] || tokens[i+1][0] !== 'INDENT')) {
			res = readFunctionOneLiner(tokens, i);
			code = res[0];
			end = res[1];

			tokens.splice(end, 0, ['OUTDENT', '', H.loc(tokens[end - 1])]);
			tokens.splice(i+1, 0, ['INDENT', '', H.loc(tokens[i])]);
			i = end + 1;
		} else {
			i++;
		}
	}

	return tokens;
}

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

function deletePrecedingBR(tokens, i) {
	while ('TERMINATOR' === tokens[i-1][0]) {
		tokens.splice(i-1, 1);
		i--;
	}

	return i;
}

function isWhileForDo(tokens, i, last_block) {
	// will already have added TERMINATOR after OUTDENT,
	// so must account for that here
	return last_block === 'DO' &&
		tokens[i] &&
		tokens[i-1] &&
		tokens[i-2] &&
		'WHILE' === tokens[i][0] &&
		'TERMINATOR' === tokens[i-1][0] &&
		'OUTDENT' === tokens[i-2][0];
}

// remove indent, newlines, and subsequent outdent from expressions
// make all functions take a block
function resolveBlocks(tokens) {
	var
		i = 0,
		pre_blocks = [false], // whether we are waiting for a block (e.g., in a WHILE condition)
		blocks = [], // what type of block we are in
		pair_levels = [0], // while conditions, etc., can be broken over lines if in parens
		indent_level = 0,
		ignore_newlines = [false], // stack that answers that question for indentation levels
		last_block, last_pair_level,
		tag; // current token's tag

	// eliminate leading TERMINATORs
	if (tokens[0][0] === 'TERMINATOR') {
		tokens.splice(0, 1);
	}

	while (i < tokens.length) {
		tag = tokens[i][0];

		// get this condition early
		if (isWhileForDo(tokens, i, last_block)) {
			i = deletePrecedingBR(tokens, i);
			i++;

			continue;
		}

		// don't add new block when IF follows ELSE
		if ('IF' === tokens[i][0] && tokens[i-1] && 'ELSE' === tokens[i-1][0]) {
			i++;

			continue;
		}
		
		if (H.has(BLOCK_TAGS, tag)) {
			pre_blocks.push(true);
			blocks.push(tag);
			pair_levels.push(0); // start counting parens
		}

		switch (tag) {
			case '(':
			case '[':
			case '{':
				pair_levels[pair_levels.length - 1]++;
				pre_blocks.push(false);
				break;

			case ')':
			case ']':
			case '}':
				pair_levels[pair_levels.length - 1]--;
				if (H.last(pre_blocks)) {
					error('Unexpected ' + tag + ' at head of block', tokens[i]);
				}
				pre_blocks.pop();
				break;

			case 'INDENT':
				// if starting a block, do not ignore newlines
				if (pre_blocks.pop()) {
					ignore_newlines.push(false);
					indent_level++;

				// otherwise, start ignoring them and drop this indent
				// make sure this is applied to the *first* adjacent indent,
				// since the inner indent(s) would be block markers
				} else {
					var ignore = 0;
					while (tokens[i - ignore - 1][0] === 'INDENT') ignore++;
					ignore_newlines.splice(ignore_newlines.length - ignore, 0, i);

					// remove indent
					tokens.splice(i, 1);
					i--;
				}
				break;

			case 'OUTDENT':
				var ignore_from = ignore_newlines.pop();

				// if ignoring newlines, remove outdent
				if (false !== ignore_from) {
					tokens.splice(i, 1);

				} else {
					// make sure TERMINATOR follows OUTDENT
					if (tokens[i+1] && 'TERMINATOR' !== tokens[i+1][0] && 'OUTDENT' !== tokens[i+1][0]) {
						tokens.splice(i+1, 0, ['TERMINATOR', '', H.loc(tokens[i])]);
					}

					indent_level--;
					last_block = blocks.pop();
				}
					
				break;

			case 'TERMINATOR':
				if (H.last(pre_blocks)) {
					error('Unexpected ' + tag + ' at head of block', tokens[i]);
				}

				// remove newline if ignoring
				// or if more than one in a row
				// TERMINATORs after OUTDENTs are not redundant unless we are ignoring newlines
				// because they separate one Line from another
				if (
					H.last(ignore_newlines) ||
					!tokens[i-1] ||
					'TERMINATOR' === tokens[i-1][0] ||
					'INDENT' === tokens[i-1][0]
				) {
					tokens.splice(i, 1);
					i--;
				}
				break;

			case '->':
				pre_blocks.push(true);
				break;

			case 'ELSE':
			case 'CASE':
			case 'DEFAULT':
			case 'CATCH':
			case 'FINALLY':
				// remove TERMINATOR before these keywords
				i = deletePrecedingBR(tokens, i);
				break;
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

function endsFactor(tok) {
	return H.has(
		['IDENTIFIER', 'STRING', 'THIS', 'NUMBER', 'BOOL', 'NULL', 'UNDEFINED', 'REGEX', ']',')','}', '`' ],
		tok[0]
	);
}

// "`" also starts a factor, but we leave its left side unmarked; backticks are special
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
				error('Bad function parameter list', tokens[i]);
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

		// Take this opportunity to mark SPACEDOTs
		if ('.' === tag && (!prev || prev.spaced)) {
			tokens.splice(i, 1,
				['SPACEDOT', '.', H.loc(tokens[i])]
			);
		}

		i++;
	}

	return tokens;
}

// eliminate terminators following INDENT or OUTDENT
// but leave a TERMINATOR at the end of the file
function cleanTerminators(tokens) {
	var
		i = 0,
		func_body_indents = [];

	while (i < tokens.length) {
		var prev = tokens[i-1];

		switch (tokens[i][0]) {
		case 'TERMINATOR':
			if (startsNewLine(prev)) {
				tokens.splice(i, 1);
				i--;
			}
			break;

		case 'INDENT':
			// record whether entering a function body
			func_body_indents.push('->' === prev[0]);
			break;
		case 'OUTDENT':
			// always put a TERMINATOR after a function body,
			// since it always ends the line
			var end_of_func = func_body_indents.pop();
			if (end_of_func) {
				if (! tokens[i+1] || 'TERMINATOR' !== tokens[i+1][0]) {
					tokens.splice(i+1, 0, ['TERMINATOR', '', H.loc(tokens[i])]);
				}

				// skip the TERMINATOR that now definitely follows this function
				i++;
			} else if (tokens[i+1] && 'TERMINATOR' === tokens[i+1][0]) {
				tokens.splice(i+1, 1);
			}
			break;
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

// FIXME: lots of dumb repeated code
function finishPound(tokens, pos) {
	var nested = 0;

	while (tokens[pos]) {
		switch (tokens[pos][0]) {
		case '#':
			// OPEN PAREN
			tokens.splice(pos, 1, ['(','', H.loc(tokens[pos])]);
			finishPound(tokens, pos + 1);
			break;

		case '(':
		case '[':
		case '{':
			++nested;
			break;

		case ')':
		case ']':
		case '}':
			if (nested === 0) {
				tokens.splice(pos, 0, [')','',H.loc(tokens[pos])]);
				return pos;
			} else {
				--nested;
			}
			break;

		case 'TERMINATOR':
		case 'OUTDENT':
			tokens.splice(pos, 0, [')','',H.loc(tokens[pos])]);
			return pos;
		}

		++pos;
	}

	// if EOF without closing, close there
	tokens.splice(pos, 0, [')','',H.loc(tokens[pos-1])]);
	pos++;

	return pos;
}

function convertPoundSign(tokens, pos) {
	pos = pos || 0;

	while (tokens[pos]) {
		if (tokens[pos][0] === '#') {
			// OPEN PAREN
			tokens.splice(pos, 1, ['(','', H.loc(tokens[pos])]);

			pos = finishPound(tokens, pos + 1);
		}

		++pos;
	}

	return tokens;
}

function fixIndents(tokens) {
	var
		pos = tokens.length - 1,
		outdents = [],
		outdent, out_pos, indent;

	while(tokens[pos]) {
		if (tokens[pos][0] === 'OUTDENT') {
			outdents.push([tokens[pos][1], pos]);
		} else if (tokens[pos][0] === 'INDENT') {
			indent = tokens[pos][1];
			var i = outdents.length - 1;

			while ((outdent = outdents[i] && outdents[i][0]) && indent.length) {
				if (H.ends_with(indent, outdent)) {
					// subtract outdent from end
					indent = indent.substr(0, indent.length - outdent.length);

					if (indent.length) {
						// add missing indent
						tokens.splice(pos, 0,
							['INDENT', indent + outdent, H.loc(tokens[pos])]
						);

						// update original indent to reflect its effective indentation
						tokens[pos][1] = indent;
					}

					// get rid of used outdent
					outdents.pop();
				} else if (H.ends_with(outdent, indent)) {
					// subtract indent from end
					outdent = outdent.substr(0, outdent.length - indent.length);

					if (outdent.length) {
						out_pos = outdents[i][1];
						// add missing outdent
						tokens.splice(out_pos, 0,
							['OUTDENT', indent + outdent, H.loc(tokens[out_pos])]
						);

						// update original outdent to reflect its effective indentation
						tokens[out_pos][1] = outdent;
					}

					indent = '';
					outdents[i][0] = outdent;
				} else {
					error('Unmatched outdent', tokens[pos]);
				}
			}

			// close unclosed indent before final TERMINATOR
			if (indent.length) {
				tokens.splice(tokens.length - 1, 0,
					['OUTDENT', indent, H.loc(tokens[tokens.length-1])]
				);
			}
		}

		pos--;
	}

	return tokens;
}

function rewrite(tokens) {
	return markFunctionParams(
		convertPoundSign(
			resolveBlocks(
				fixFunctionBlocks(
					cpsArrow(
						fixIndents(
							tokens))))));
}


module.exports = {
	rewriteCpsArrow: cpsArrow,
	resolveBlocks: resolveBlocks,
	markFunctionParams: markFunctionParams,
	convertPoundSign: convertPoundSign,
	fixFunctionBlocks: fixFunctionBlocks,
	fixIndents: fixIndents,
	cleanTerminators: cleanTerminators,
	rewrite: rewrite
};

