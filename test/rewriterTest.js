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

function tags_equal(xs, ys) {
	var len = xs.length;
	if (len !== ys.length) {
		return false;
	} else {
		for (var i = 0; i < len; i++) {
			if (xs[i][0] !== ys[i][0]) {
				return false;
			}
		}

		return true;
	}
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
	'Pairs off indents and outdents': function(b, assert) {
		var text1 =
			'(\\x ->\n' +
			'    x\n' +
			'  ) b'; 
		var raw = getTokens(text1);
		var toks = R.fixIndents(raw);

		assert.equal(toks[4][0], 'INDENT');
		assert.equal(toks[5][0], 'INDENT', 'adds second indent to match outdent');
		assert.equal(toks[6][0], 'IDENTIFIER', 'adds correct number of indents');

		var text2 =
			'\\x ->\n' +
			'  while 1\n' +
			'    print\n' +
			'a';
		raw = getTokens(text2);
		toks = R.fixIndents(raw);

		assert.equal(toks[8][0], 'OUTDENT');
		assert.equal(toks[9][0], 'OUTDENT', 'adds second outdent to match indents');

		var text3 =
			'a\n' +
			'    b\n' +
			'  c\n' +
			'd\n';

		raw = getTokens(text3);
		toks = R.fixIndents(raw);

		assert.equal(toks[1][0], 'INDENT');
		assert.equal(toks[2][0], 'INDENT', 'adds second indent to match outdents');
		assert.equal(toks[4][0], 'OUTDENT');
		assert.equal(toks[6][0], 'OUTDENT');
		assert.equal(9, toks.length, 'Does not add too many indents or outdents');
	},

	'Checks matching pairs': function(b, assert) {
	},

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
		var toks, expected;

		toks = mkTokens(
			'IDENTIFIER = \\ IDENTIFIER FN_LIT_PARAM -> INDENT IDENTIFIER OUTDENT IDENTIFIER TERMINATOR'
		);
		R.resolveBlocks(toks);
		expected = mkTokens(
			'IDENTIFIER = \\ IDENTIFIER FN_LIT_PARAM -> INDENT IDENTIFIER OUTDENT TERMINATOR IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Inserts required TERMINATOR after OUTDENT when newlines matter');

		toks = mkTokens(
			'IDENTIFIER INDENT IDENTIFIER OUTDENT IDENTIFIER'
		);
		R.resolveBlocks(toks);
		expected = mkTokens(
			'IDENTIFIER IDENTIFIER TERMINATOR IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Inserts required TERMINATOR after OUTDENT at top level');

		toks = mkTokens(
			'( \\ -> INDENT IDENTIFIER OUTDENT ) IDENTIFIER'
		);
		R.resolveBlocks(toks);
		expected = mkTokens(
			'( \\ -> INDENT IDENTIFIER OUTDENT ) IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Does not add TERMINATOR before closing container symbols - parens, etc');

	},

	'Treats DO WHILE correctly': function(b, assert) {
		var toks;

		toks = mkTokens(
			'DO INDENT IDENTIFIER OUTDENT WHILE IDENTIFIER TERMINATOR NUMBER'
		);

		try {
			R.resolveBlocks(toks);
		} catch (e) {
			assert.ok(false, 'Knows that the WHILE goes with the preceding DO');
		}
		var expected = mkTokens(
			'DO INDENT IDENTIFIER OUTDENT WHILE IDENTIFIER TERMINATOR NUMBER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Knows that the WHILE goes with the preceding DO');
	},

	'Preserves innermost INDENT and OUTDENT for blocks': function(b, assert) {
		/*
			(\ ->
			    x
			  ) y';
			*/
		var toks = mkTokens(
			'( \\ -> INDENT INDENT IDENTIFIER OUTDENT ) IDENTIFIER OUTDENT TERMINATOR'
		);
		R.resolveBlocks(toks);
		var expected = mkTokens(
			'( \\ -> INDENT IDENTIFIER OUTDENT ) IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Removes INDENT related to expression, not inner block');
	},

	'"#" parenthesizes the rest of the expression': function(b, assert) {
		var toks;

		toks = mkTokens(
			'IDENTIFIER NUMBER # IDENTIFIER MATH NUMBER TERMINATOR IDENTIFIER'
		);
		var expected = mkTokens(
			'IDENTIFIER NUMBER ( IDENTIFIER MATH NUMBER ) TERMINATOR IDENTIFIER'
		);
		R.convertPoundSign(toks);
		assert.ok(tags_equal(toks, expected), 'parens include rest of line');

		toks = mkTokens(
			'IDENTIFIER ( NUMBER # IDENTIFIER MATH NUMBER ) NUMBER'
		);
		expected = mkTokens(
			'IDENTIFIER ( NUMBER ( IDENTIFIER MATH NUMBER ) ) NUMBER'
		);
		R.convertPoundSign(toks);
		assert.ok(tags_equal(toks, expected), 'parens only extend to enclosing paren or container');

		toks = mkTokens(
			'IDENTIFIER NUMBER # IDENTIFIER MATH NUMBER'
		);
		expected = mkTokens(
			'IDENTIFIER NUMBER ( IDENTIFIER MATH NUMBER )'
		);
		R.convertPoundSign(toks);
		assert.ok(tags_equal(toks, expected), 'parens include to EOF if no break or closing container');

	},

	'dot preceded by whitespace becomes SPACEDOT': function(b, assert) {
		var toks = getTokens('foo .bar 10');
		R.markFunctionParams(toks);
		assert.equal(toks[1][0], 'SPACEDOT', 'replaces dot with SPACEDOT');
		assert.equal(toks[2][1], 'bar', 'removes dot');
	},

	'Function literals can be parenthesized': function(b, assert) {
		toks = mkTokens(
			'( \\ -> IDENTIFIER ) IDENTIFIER'
		);
		expected = mkTokens(
			'( \\ -> INDENT IDENTIFIER OUTDENT ) IDENTIFIER TERMINATOR'
		);
		R.rewrite(toks);
		assert.ok(tags_equal(toks, expected), 'OUTDENT placed before closing paren');
	}

};
