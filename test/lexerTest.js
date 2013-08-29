var lex = require('../lexer.js');

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

function tags(tokens) {
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

var ID = 'IDENTIFIER', NUM = 'NUMBER', BR = 'TERMINATOR';

module.exports = {
	'Tokenizes operators as literal text': function(b, assert) {
		var
			code1 = 'foo <-',
			code2 = 'foo ->',
			lexer = new lex.Lexer(),

			tags1 = tags(lexer.tokenize(code1)),
			tags2 = tags(lexer.tokenize(code2))
			;

		assert.equal(true, eq(tags1, [ID, '<-', BR]), 'Finds CPS arrow');
		assert.equal(true, eq(tags2, [ID, '->', BR]), 'Finds function-definition arrow');
	},

	'TERMINATOR added to last line in document, even if no newline': function(b, assert) {
		var
			line1 = 'x = 4',
			lexer = new lex.Lexer(),
			tags1 = tags(lexer.tokenize(line1))
			;

		assert.equal(true, eq(tags1, [ID, '=', NUM, BR]));
	},

	'Requires indent to match previous indent': function(b, assert) {
		var
			good = 'this\n \t is\n \t   indented\n \t correctly',
			bad  = 'this\n \t is\n \t   indented\n  wrong';

		lexer = new lex.Lexer();

		lexer.tokenize(good);
		lexer.tokenize(bad);
	}

};
