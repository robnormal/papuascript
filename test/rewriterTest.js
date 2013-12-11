var
	L = require('../lib/lexer.js'),
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

		B.resolveBlocks(toks);
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
		B.resolveBlocks(toks);
		var expected = mkTokens(
			'( \\ -> INDENT IDENTIFIER TERMINATOR OUTDENT ) WS IDENTIFIER TERMINATOR'
		);
		assert.ok(tags_equal(toks, expected), 'indents block, but not expression');

		var toks = getTokens('x = \\ -> b');
		B.resolveBlocks(toks);
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

	'Blocks get TERMINATORs after them when they are lines in a block': function(b, assert) {
		var toks = getTokens(
			'while x\n' +
			'  print\n' +
			'x'
		);

		B.resolveBlocks(toks);
		assert.equal('TERMINATOR', toks[6][0]);

		var toks = getTokens(
			'if x\n' +
			'  print\n' +
			'x'
		);

		B.resolveBlocks(toks);
		assert.equal('TERMINATOR', toks[6][0]);
	},

	'Commas don\'t cause infinite loop': function(b, assert) {
		var o = papua.test('rewriter/commas.papua');

		assert.equal(1, o.x);
	},

	'Semicolons at the end of a line are ignored': function(b, assert) {
		var o = papua.test('rewriter/semicolon.papua');

		assert.equal(3, o.x);
	}

};
