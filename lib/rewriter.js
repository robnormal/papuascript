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
		if (B.isInvocationParam(tokens, i)) {
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

function rewrite(tokens) {
	return markFunctionParams(
			B.resolveBlocks(
				tokens));
}


module.exports = {
	markFunctionParams: markFunctionParams,
	rewrite: rewrite
};

