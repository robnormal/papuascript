// Error.stackTraceLimit = Infinity;

var L = require('../lib/lexer.js');
var P = require('../lib/grammar.js');
var R = require('../lib/rewriter.js');
var B = require('../lib/blocker.js');
var H = require('../lib/helpers.js');
var N = require('../lib/nodeTypes.js');
var $ = require('underscore');
var log = console.log;

var parser = P.parser;
parser.lexer = new L.Lexer();
parser.yy.parseError = function(msg, info) {
  throw new SyntaxError(msg + ' at column ' + (this.lexer.position() + 1));
	// log(msg);
	/*
  var str = 'Parse error on line ' + (info.line + 1) +
		': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
	log(arguments);
                    errStr = 'Parse error on line ' + (yylineno + 1) + ': Unexpected ' + (symbol == EOF ? 'end of input' : '\'' + (this.terminals_[symbol] || symbol) + '\'');
	log(parser.lexer.showPosition());
                this.parseError(errStr, {
                    text: this.lexer.match,
                    token: this.terminals_[symbol] || symbol,
                    line: this.lexer.yylineno,
                    loc: yyloc,
                    expected: expected
                });
							 */
};

function getTags(tokens) {
	return $.map(tokens, function(x) { return x[0]; });
}

var text = require('fs').readFileSync(process.argv[2], 'utf-8');

function test_lex(text) {
	H.showTags(
		parser.lexer.tokenize(text));
}

function test_rewrite(text) {
	var toks = parser.lexer.tokenize(text);

	H.showTags(
		R.rewrite(toks)
	);
}

function test_parse(text) {
	var res = parser.parse(text);

	// console.log(N.showTree(res, ''));

	res.checkScope();

	console.log(res.lines().toString());
}

test_lex(text);
test_rewrite(text);
test_parse(text);

/*
var tok;
while (tok = parser.lexer.lex()) console.log(tok);
*/


