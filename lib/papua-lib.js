var
	L = require('./lexer.js'),
	P = require('./grammar.js'),

	parser = P.parser;

parser.lexer = new L.Lexer();
parser.yy.parseError = function(msg, info) {
  throw new SyntaxError(msg + ' at column ' + (this.lexer.position() + 1));
};

var papua, fileToJs;

function showTags(toks) {
	var text;

	for (var i = 0; i < toks.length; i++) {
		switch(toks[i][0]) {
		case 'IDENTIFIER':
			text = toks[i][1];
			break;
		case 'INDENT':
		case 'OUTDENT':
			text = toks[i][0] + ' - "' + toks[i][1] + '"';
			break;
		default:
			text = toks[i][0];
		}

		console.log(i, ':', text);
	}
}


fileToJs = function(file) {
	var text = require('fs').readFileSync(file, 'utf-8')

	return papua.compile(text);
};

papua = {
	compile: function(papuascript) {
		var res = parser.parse(papuascript);
		res.checkScope();

		return res.lines().toString();
	},

	compileFile: function(source, destination) {
		var js_text = fileToJs(source);

		require('fs').writeFileSync(destination, js_text);

		return js_text;
	},

	// eval file as a function and return result
	test: function(file) {
		var output, f;
		eval('f = ' + fileToJs(file) + '; output = f();');

		return output;
	}
};

module.exports = papua;
