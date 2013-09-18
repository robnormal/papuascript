/*jshint white: false */
var H = require('./helpers.js');
var B = require('./blocker.js');
var I = require('./indents.js');

function error(msg, token) {
	throw new Error(msg + ' in line ' + (token[2].first_line+1) + ' column ' + (token[2].first_column+1));
}

function appendTag(tokens, i, tag) {
	tokens.splice(i + 1, 0,
		[tag, '', H.loc(tokens[i])]
	);
}

function insertTag(tokens, i, tag) {
	var locPos = tokens[i] ? i : (tokens[i-1] ? i-1 : i+1);

	tokens.splice(i, 0,
		[tag, '', H.loc(tokens[locPos])]
	);
}

function endsFactor(tok) {
	return H.has(
		['IDENTIFIER', 'STRING', 'THIS', 'NUMBER', 'INTEGER', 'BOOL', 'NULL', 'UNDEFINED', 'REGEX', ']',')','}', '`' ],
		tok[0]
	);
}

// "`" also starts a factor, but we leave its left side unmarked; backticks are special
function startsFactor(tok) {
	return H.has(
		['\\', 'IDENTIFIER', 'STRING', 'THIS', 'NUMBER', 'INTEGER', 'BOOL', 'NULL', 'UNDEFINED', 'REGEX', '[','(','{' ],
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
				insertTag(tokens, i + 1, 'FN_LIT_PARAM');

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
			insertTag(tokens, i, 'WS');
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

// Another grammar-cheat.
function parenthesizeFunctions(tokens) {
	var
		i = 0,
		indents = 0,
		func_indents = [];

	// arrays and objects can be
	while (tokens[i]) {
		switch (tokens[i][0]) {
		case '\\':
			// don't parenthesize if done already
			if (!tokens[i-1] || tokens[i-1][0] !== '(') {
				insertTag(tokens, i, '(');
				i++;
			}

			func_indents.push(indents);
			break;

		case 'INDENT':
			indents++;
			break;
		case 'OUTDENT':
			indents--;
			// paren can only come at the end of the function, not after it
			if (func_indents.length && H.last(func_indents) === indents) {
				if (!tokens[i+1] || tokens[i+1][0] !== ')') {
					insertTag(tokens, i+1, ')');
					i++;
				}
				if (! tokens[i+1] || ! H.isWhitespaceToken(tokens[i+1][0])) {
					insertTag(tokens, i+1, 'TERMINATOR');
				}

				func_indents.pop();
			}
			break;
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
				insertTag(tokens, pos, ')');
				return pos;
			} else {
				--nested;
			}
			break;

		case 'TERMINATOR':
		case 'OUTDENT':
			insertTag(tokens, pos, ')');
			return pos;
		}

		++pos;
	}

	// if EOF without closing, close there
	insertTag(tokens, pos, ')');
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
						tokens)));
}


module.exports = {
	resolveBlocks: B.fixBlocks,
	markFunctionParams: markFunctionParams,
	convertPoundSign: convertPoundSign,
	parenthesizeFunctions: parenthesizeFunctions,
	rewrite: rewrite
};

