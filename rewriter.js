/*jshint white: false */
var H = require('./helpers.js');
var B = require('./block_resolver.js');

function map(xs, f) {
	var ys, i, len;

	if (void 0 !== xs.length) {
		ys = [];
		for (i = 0, len = xs.length; i < len; i++) {
			ys[i] = f(xs[i]);
		}
	} else {
		ys = {};
		for (i in xs) { if (xs.hasOwnProperty(i)) {
			ys[i] = f(xs[i]);
		}}
	}
	return ys;
}

function getTags(tokens) {
	return map(tokens, function(x) { return x[0]; });
}


function error(msg, token) {
	throw new Error(msg + ' in line ' + (token[2].first_line+1) + ' column ' + (token[2].first_column+1));
}

var BR = ['TERMINATOR', 'INDENT', 'OUTDENT'];

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

var addNewlineIfNecessary = function(tokens, i) {
	if (tokens[i] &&
		'TERMINATOR' !== tokens[i][0] &&
		')' !== tokens[i][0] &&
		']' !== tokens[i][0] &&
		'}' !== tokens[i][0] &&
		'OUTDENT' !== tokens[i][0]
	) {
		tokens.splice(i, 0, ['TERMINATOR', '', H.loc(tokens[i-1])]);

		return true;
	} else {
		return false;
	}
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
	if (H.last(body)[0] === 'TERMINATOR') {
		body.pop();
		pos--;
	}

	return [body, pos];
}

function fixFunctionBlocks(tokens) {
	var i = 0,
		j, end;

	while (tokens[i]) {
		// one-line functions
		if (tokens[i][0] === '->' && (!tokens[i+1] || tokens[i+1][0] !== 'INDENT')) {
			tokens.splice(i+1, 0, ['INDENT', '', H.loc(tokens[i])]);
			i++;

			j = i+1;

			while (tokens[j] &&
				tokens[j][0] !== 'TERMINATOR' &&
				tokens[j][0] !== 'INDENT'
			) j++;

			if (!tokens[j] || tokens[j][0] === 'TERMINATOR') {
				tokens.splice(j, 0, ['OUTDENT', '', H.loc(tokens[j-1])]);
			} else {
			}
			// In case of INDENT, do nothing.
			// The corresponding OUTDENT already exists.
		}
		
		i++;
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
						// update original indent to reflect its effective indentation
						tokens[pos][1] = outdent;

						// add missing indent
						tokens.splice(pos, 0,
							['INDENT', indent, H.loc(tokens[pos])]
						);
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

				i--;
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

function deletePrecedingBR(tokens, i) {
	while ('TERMINATOR' === tokens[i-1][0]) {
		tokens.splice(i-1, 1);
		i--;
	}

	return i;
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

function rewrite(tokens) {
	return markFunctionParams(
		B.resolveBlocks(
			convertPoundSign(
				cpsArrow(
					tokens))));
}


module.exports = {
	rewriteCpsArrow: cpsArrow,
	resolveBlocks: B.resolveBlocks,
	markFunctionParams: markFunctionParams,
	convertPoundSign: convertPoundSign,
	rewrite: rewrite
};

