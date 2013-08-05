var L = require('../lexer.js');
var R = require('../rewriter.js');
var ID = 'IDENTIFIER', NUM = 'NUMBER', BR = 'TERMINATOR';

function doesntThrow(assert, f, err) {
	try {
		f();
	} catch (e) {
		assert.doesNotThrow(function () {
			throw e;
		}, err, e.toString());
	}
}

function map(xs, f) {
	var ys = {};
	for (var i in xs) { if (xs.hasOwnProperty(i)) {
		ys[i] = f(xs[i]);
	}}
	return ys;
}

function getTokens(text) {
	return (new L.Lexer()).tokenize(text);
}

function getTags(tokens) {
	return map(tokens, function(x) { return x[0]; });
}

function eq(x, y) {
	for (var i in x) { if (x.hasOwnProperty(i)) {
		if (x[i] !== y[i]) return false;
	}}
	for (var j in y) { if (y.hasOwnProperty(j)) {
		if (x[j] !== y[j]) return false;
	}}

	return true;
}

module.exports = {
	'Converts CPS arrow to continuation-passing function call': function(b, assert) {
		var text1 =
'while top\n' +
'  indented\n' +
'  foo <- bar\n' +
'  bar_line1\n' +
'  bar_line2\n' +
'next thing';
		var raw = getTokens(text1);
		var toks = R.rewriteCpsArrow(raw);

		assert.equal('INDENT', toks[2][0], 'while block is indented');
		assert.equal(BR, toks[4][0], 'Does not touch Preceding newline');
		assert.equal('bar', toks[5][1], 'token after arrow is placed first');
		assert.equal('\\', toks[6][0], 'adds function literal as argument');
		assert.equal('foo', toks[7][1], 'adds preceding token as argument to function literal');
		assert.equal('->', toks[8][0]);
		assert.equal('INDENT', toks[9][0], 'indents CPSed function');
		assert.equal(true,
			'OUTDENT' === toks[13][0] && 'OUTDENT' === toks[14][0],
			'outdents at next outdent'
		);
	},

	'Adds markers to literal function parameters': function(b, assert) {
		var text = 'foo \\bar spam -> return 3';
		var toks = R.markFunctionParams(getTokens(text));

		assert.equal('FN_LIT_PARAM', toks[3][0], 'FN_LIT_PARAM added after parameters in function');
		assert.equal('FN_LIT_PARAM', toks[5][0], 'all parameters marked');
	},

	'Puts function bodies in a single block': function(b, assert) {
		var text = 'foo \\bar spam -> return 3';
		var toks = R.resolveBlocks(getTokens(text));

		assert.equal('INDENT', toks[5][0]);
		assert.equal('OUTDENT', toks[8][0]);

		var text2 = 'foo \\bar spam -> j = 3\n  return bar + spam + j';
		var toks2 = R.resolveBlocks(getTokens(text2));

		assert.equal('INDENT', toks2[5][0], 'adds indent after arrow');
		assert.equal('RETURN', toks2[9][0], 'Removes indent of associated block');

		var nl_text = '\n\nsome code';
		var nl_toks = R.resolveBlocks(getTokens(nl_text));
		assert.equal('some', nl_toks[0][1], 'Eliminates initial TERMINATORs');
	}
};
