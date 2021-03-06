var lex = require('../lib/lexer.js');
var $ = require('underscore');
var log = console.log;
var fs = require('fs');

function doesntThrow(assert, f, err) {
	try {
		f();
	} catch (e) {
		assert.doesNotThrow(function () {
			throw e;
		}, err, e.toString());
	}
}

function getTokens(str) {
	var lexer = new lex.Lexer();
	return lexer.tokenize(str);
}

function tags(tokens) {
	return $.map(tokens, function(x) { return x[0]; });
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

function getFile(pathFromTestFilesDir) {
	return fs.readFileSync(__dirname + '/files/' + pathFromTestFilesDir, 'utf-8');
}

var ID = 'IDENTIFIER', NUM = 'NUMBER', BR = 'TERMINATOR', ASGN = 'ASSIGN';

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

	'Requires indent to match previous indent': function(b, assert) {
		var
			good = 'this\n \t is\n \t   indented\n \t correctly',
			bad  = 'this\n \t is\n \t   indented\n  wrong';

		var lexer = new lex.Lexer();

		doesntThrow(assert, function() {
			lexer.tokenize(good);
		}, 'accepts consistent indentation');

		try {
			lexer.tokenize(bad);
			assert.ok(false, 'throws error on inconsistent indentation');
		} catch(e) {
		}
	},

	'Correctly finds indents': function(b, assert) {
		var code =
			'while 3\n' +
			'  if db\n' +
			'    a\n' +
			'\n' +
			'do\n' +
			'  x\n' +
			'while y',

			lexer = new lex.Lexer(),
			tags1 = tags(lexer.tokenize(code));

		assert.equal('INDENT', tags1[9], 'indents at indent after "do" after block statement');
	},

	'Correctly measures outdents': function(b, assert) {
		var code =
			'while 3\n' +
			'\tif db\n' +
			'\t\ta\n',

			lexer = new lex.Lexer(),
      toks = lexer.tokenize(code);

		assert.equal('OUTDENT', toks[7][0]);
		assert.equal('\t\t', toks[7][1], 'Computes correct outdent at end of file');

    // \foo ->
		//   a
		//     b
		// bar
		var code =
			'\\foo ->\n' +
			'\talice\n' +
			'\t\tbob\n' +
      'bar',

			lexer = new lex.Lexer(),
      toks = lexer.tokenize(code);


		assert.equal('OUTDENT', toks[7][0]);
		assert.equal('\t\t', toks[7][1], 'Computes correct outdent in middle of file');
  },

	'TERMINATOR added to last line in document, even if no newline': function(b, assert) {
		var
			text1 = 'x = 4',
			tags1 = tags(getTokens(text1));

		assert.eql([ID, ASGN, NUM, BR], tags1);
	},

	'Outdents final indent': function(b, assert) {
		var text1 =
			'x = a\n' +
			'  3';

		var tags1 = tags(getTokens(text1));
		assert.eql([ID, ASGN, ID, 'INDENT', NUM, 'OUTDENT', BR], tags1);
	},

	'Comments do not affect lexing': function(b, assert) {
		var text1 = getFile('lexer/comments.papua');

		var tags1 = tags(getTokens(text1));
		assert.eql(
			['\\', ID, '->', 'INDENT', ID, 'OUTDENT', ID, BR],
			tags1
		);

		// line comments
		var text2 = getFile('lexer/comments2.papua');
		var tags2 = tags(getTokens(text2));

		assert.eql(
			[ID, ASGN, ID, 'INDENT', ID, BR, ID, 'OUTDENT', BR],
			tags2
		);
	},

	'Block comments can be nested': function(b, assert) {
		var text1 =
			'/* this is\n' +
			'/* a nested comment */\n' +
			'     end outside */';

		var tags1 = tags(getTokens(text1));
		assert.eql([BR], tags1);
	},

	'Unclosed Block comment consumes rest of file': function(b, assert) {
		var text1 =
			'foo bar /*\n' +
			'^ this comment does not close\n' +
			'***';
		var tags1 = tags(getTokens(text1));
		assert.eql([ID, ID, BR], tags1);
	},

	'dot preceded by whitespace becomes SPACEDOT': function(b, assert) {
		var toks = getTokens('foo .bar 10');
		assert.equal('SPACEDOT', toks[1][0], 'replaces dot with SPACEDOT');
		assert.equal('bar', toks[2][1], 'removes dot');
	},

	'Identifier preceded by : becomes STRING': function(b, assert) {
		var toks = getTokens('foo = :bar');
		assert.eql('STRING', toks[2][0]);
		assert.eql('"bar"', toks[2][1], 'acts as though identifier were in double quotes');

		toks = getTokens('[:a, :b]');
		assert.eql('STRING', toks[1][0]);
		assert.eql('"a"', toks[1][1]);
	}
};
