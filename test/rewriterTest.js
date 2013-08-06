var L = require('../lexer.js');
var R = require('../rewriter.js');
var H = require('../helpers.js');
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

var nowhere = H.here(0,0);
function mkTokens(str) {
	var toks = [], tags = str.split(/\s/);
	for (var i = 0, len = tags.length; i < len; i++) {
		toks.push([tags[i], '', nowhere]);
	}

	return toks;
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

	'Adds WS between function call arguments': function(b, assert) {
		var text = 'foo.bar spam potatoes';
		var toks = R.markFunctionParams(getTokens(text));

		assert.equal('WS', toks[3][0], 'WS added after function name');
		assert.equal('WS', toks[5][0], 'WS added after arguments');
		assert.equal('TERMINATOR', toks[7][0], 'no WS after last argument');

		var text = 'map \\ f xs ->\n  f xs';
		var toks = R.markFunctionParams(getTokens(text));

		assert.equal('WS', toks[1][0], 'WS added before argument that is a function literal');
		assert.equal('WS', toks[10][0], 'WS added to arguments within function literal');
	},

	'Adds markers to literal function parameters': function(b, assert) {
		var text = 'foo \\bar spam -> return 3';
		var toks = R.markFunctionParams(getTokens(text));

		assert.equal('FN_LIT_PARAM', toks[4][0], 'FN_LIT_PARAM added after parameters in function');
		assert.equal('FN_LIT_PARAM', toks[6][0], 'all parameters marked');
	},

	'Puts function bodies in a single block': function(b, assert) {
		var text = 'foo \\bar spam -> return 3';
		var toks = R.fixFunctionBlocks(getTokens(text));

		assert.equal('INDENT', toks[5][0]);
		assert.equal('OUTDENT', toks[8][0]);

		var text2 = 'foo \\bar spam -> j = 3\n  return bar + spam + j';
		var raw = getTokens(text2);
		var toks2 = R.fixFunctionBlocks(raw);

		assert.equal('INDENT', toks2[5][0], 'adds indent after arrow');
		assert.equal('RETURN', toks2[10][0], 'Removes indent of associated block');
	},

	'Removes non-semantic TERMINATORs': function(b, assert) {
		var nl_text = '\n\nsome code';
		var nl_toks = R.resolveBlocks(getTokens(nl_text));
		assert.equal('some', nl_toks[0][1], 'Eliminates initial TERMINATORs');

		nl_text = 'a = \\b ->\n  c';
		nl_toks = R.resolveBlocks(getTokens(nl_text));

		assert.equal('INDENT', nl_toks[5][0], 'leaves function blocks intact');
	},

	'Removes redundant TERMINATORs': function(b, assert) {
		var toks = mkTokens(
			'IF IDENTIFIER INDENT TERMINATOR STRING OUTDENT TERMINATOR NUMBER TERMINATOR TERMINATOR STRING'
		);
		R.cleanTerminators(toks);

		assert.equal(toks[3][0], 'STRING', 'Removes TERMINATOR after INDENT');
		assert.equal(toks[4][0], 'OUTDENT', 'Leaves OUTDENT intact');
		assert.equal(toks[5][0], 'NUMBER', 'Removes TERMINATOR after OUTDENT');
		assert.equal(toks[7][0], 'STRING', 'Removes TERMINATOR after TERMINATOR');
		assert.equal(toks[8][0], 'TERMINATOR', 'Ensures that document ends with a single TERMINATOR');

		var toks = mkTokens(
			'\\ IDENTIFIER -> INDENT STRING OUTDENT NUMBER'
		);
		R.cleanTerminators(toks);

		assert.equal(toks[6][0], 'TERMINATOR',
			'adds TERMINATOR after function body, since that always ends the line');
	}
};
