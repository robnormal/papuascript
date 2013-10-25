var
	L = require('../lib/lexer.js'),
	R = require('../lib/rewriter.js'),
	B = require('../lib/blocker.js'),
	H = require('../lib/helpers.js'),
	papua = require('../lib/papua-lib.js'),
	$ = require('underscore'),
	ID = 'IDENTIFIER', NUM = 'NUMBER', BR = 'TERMINATOR', EQ = 'ASSIGN',
	log = console.log;

function doesntThrow(assert, f, err) {
	try {
		f();
	} catch (e) {
		assert.doesNotThrow(function () {
			throw e;
		}, err, e.toString());
	}
}

function getTokens(text) {
	return (new L.Lexer()).tokenize(text);
}

function getTags(tokens) {
	return $.map(tokens, function(x) { return x[0]; });
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
	'Converts CPS arrow to continuation-passing function call': function(b, assert) {
		/*
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
	 */
	},

	'CPS arrow integrates with blocks properly': function(b, assert) {
		/*
		var text1 =
			'bar <- foo\n' +
			'while a\n' +
			'  bar';

		var raw = getTokens(text1);
		var toks = R.rewriteCpsArrow(raw);
		assert.equal('bar', toks[8][1]);
		assert.equal('OUTDENT', toks[9][0]);
		assert.equal('OUTDENT', toks[10][0]);
		assert.equal('TERMINATOR', toks[11][0]);
	 */
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

	'Encloses functions in parentheses': function(b, assert) {
		var nl_text = 'a = \\b ->\n  c';
		var nl_toks = B.resolveBlocks(getTokens(nl_text));
		assert.equal('(', nl_toks[2][0]);
		assert.equal(')', nl_toks[10][0]);
	},

	'Removes non-semantic TERMINATORs': function(b, assert) {
		var nl_text = '\n\nsome code';
		var nl_toks = B.resolveBlocks(getTokens(nl_text));
		assert.equal('some', nl_toks[0][1], 'Eliminates initial TERMINATORs');

		nl_text = 'a = \\b ->\n  c';
		nl_toks = B.resolveBlocks(getTokens(nl_text));

		assert.equal('INDENT', nl_toks[6][0], 'leaves function blocks intact');
	},

	'Removes redundant TERMINATORs': function(b, assert) {
		var toks, expected;

		toks = getTokens(
			'x = \\a ->\n' +
			'  b\n' +
			'c'
		);

		B.resolveBlocks(toks);
		expected = mkTokens(
			'IDENTIFIER ASSIGN ( \\ IDENTIFIER -> INDENT IDENTIFIER TERMINATOR OUTDENT ) TERMINATOR IDENTIFIER TERMINATOR'
		);

		assert.eql(getTags(toks), getTags(expected), 'Inserts required TERMINATOR after OUTDENT when newlines matter');

		toks = mkTokens(
			'IDENTIFIER INDENT IDENTIFIER OUTDENT IDENTIFIER'
		);
		B.resolveBlocks(toks);
		expected = mkTokens(
			'IDENTIFIER IDENTIFIER TERMINATOR IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Inserts required TERMINATOR after OUTDENT at top level');
	},

	'Treats function literals in indented expressions correctly': function(b, assert) {
		var toks = getTokens(
			'a\n' +
			'  \\foods -> foods'
		);

		R.rewrite(toks);
		var exp = 'IDENTIFIER WS ( \\ IDENTIFIER FN_LIT_PARAM -> INDENT IDENTIFIER TERMINATOR';
		var expected = getTags(mkTokens(exp));

		assert.eql(
			getTags(toks).slice(0, expected.length),
			expected
		);
	},

	'Treats DO WHILE correctly': function(b, assert) {
		var toks;

		toks = getTokens(
			'do\n' +
			'    x\n' +
			'while y\n' +
			'4'
		);

		try {
			B.resolveBlocks(toks);
		} catch (e) {
			assert.ok(false, 'Knows that the WHILE goes with the preceding DO');
		}
		var expected = mkTokens(
			'DO INDENT IDENTIFIER TERMINATOR OUTDENT WHILE IDENTIFIER TERMINATOR NUMBER TERMINATOR'
		);
		assert.eql(getTags(expected), getTags(toks));
	},

	'Preserves innermost INDENT and OUTDENT for blocks': function(b, assert) {
		var toks = getTokens(
			'(\\ ->\n' +
			'    x\n' +
			'  ) y'
		);
		R.rewrite(toks);
		var expected = mkTokens(
			'( \\ -> INDENT IDENTIFIER TERMINATOR OUTDENT ) WS IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'indents block, but not expression');

		var toks = getTokens('x = \\ -> b');
		R.rewrite(toks);
		var expected = mkTokens(
			'IDENTIFIER ASSIGN ( \\ -> INDENT IDENTIFIER TERMINATOR OUTDENT ) TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Adds OUTDENT to end of inline function');
	},

	'Handles function indents properly': function(b, assert) {
		var toks = getTokens(
			'\\foo ->\n' +
			'  if a\n' +
			'    bar');

		try {
			B.resolveBlocks(toks);
		} catch(e) {
			assert.ok(false);
		}
	},

	'INDENT, OUTDENT, and TERMINATOR are removed from inside lines': function(b, assert) {
		var toks = getTokens('x = \n\ta\n\tb');
		B.resolveBlocks(toks);
		var expected = mkTokens(
			'IDENTIFIER ASSIGN IDENTIFIER IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'INDENT, OUTDENT, and TERMINATOR are removed from inside lines');

		var toks = getTokens('x = \n\t[ a\n\t, b] c');
		B.resolveBlocks(toks);
		var expected = mkTokens(
			'IDENTIFIER ASSIGN [ IDENTIFIER , IDENTIFIER ] IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Treats TERMINATORs inside parens correctly');
	},

	'Newlines are OK in object literals (this matters in case we use {} for anything else)': function(b, assert) {
		// x = { a: b
		//     , c: d }
		var toks = getTokens('x = \n\t{ a: b\n\t, c: d }');
		B.resolveBlocks(toks);
		var expected = mkTokens(
			'IDENTIFIER ASSIGN { IDENTIFIER : IDENTIFIER , IDENTIFIER : IDENTIFIER } TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'Treats object literals as part of a line');
	},

	'"#" parenthesizes the rest of the expression': function(b, assert) {
		/*
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
	 */
	},

	'# and <- work when used together': function(b, assert) {
		/*
		var toks1 = getTokens('foo <- bar # eggs spam\nfoo');
		var toks2 = getTokens('foo <- bar (eggs spam)\nfoo');

		var rewrite = $.compose(
			R.parenthesizeFunctions, R.markFunctionParams, R.rewriteCpsArrow, B.resolveBlocks, R.convertPoundSign
		);

		var partial = $.compose(
			R.markFunctionParams, R.rewriteCpsArrow, R.convertPoundSign
		);

		partial(toks1);
		partial(toks2);

		assert.eql(getTags(toks2), getTags(toks1));
		*/
	},

	'dot preceded by whitespace becomes SPACEDOT': function(b, assert) {
		var toks = getTokens('foo .bar 10');
		R.markFunctionParams(toks);
		assert.equal(toks[1][0], 'SPACEDOT', 'replaces dot with SPACEDOT');
		assert.equal(toks[2][1], 'bar', 'removes dot');
	},

	'Blocks get TERMINATORs after them when they are lines in a block': function(b, assert) {
		var toks = getTokens(
			'while x\n' +
			'  print\n' +
			'x'
		);

		R.rewrite(toks);
		assert.equal('TERMINATOR', toks[6][0]);

		var toks = getTokens(
			'if x\n' +
			'  print\n' +
			'x'
		);

		R.rewrite(toks);
		assert.equal('TERMINATOR', toks[6][0]);
	},

	'Commas don\'t cause infinite loop': function(b, assert) {
		var o = papua.test('rewriter/commas.papua');
	},

	'Function literals can be parenthesized': function(b, assert) {
		/*
		var toks = mkTokens(
			'( \\ -> IDENTIFIER ) IDENTIFIER'
		);
		var expected = mkTokens(
			'( \\ -> INDENT IDENTIFIER OUTDENT ) IDENTIFIER TERMINATOR'
		);
		R.rewrite(toks);
		assert.ok(tags_equal(toks, expected), 'OUTDENT placed before closing paren');
		*/
	}

};
