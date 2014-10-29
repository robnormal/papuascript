var
	L = require('./lexer.js'),
	P = require('./grammar.js'),

	parser = P.parser;

parser.lexer = new L.Lexer();
parser.yy.parseError = function(msg, info) {
  throw new SyntaxError(msg + ' at column ' + (this.lexer.position() + 1));
};

var papua = {
	compile: function(papuascript) {
		var res = parser.parse(papuascript);
		res.checkScope();

		return res.lines().toString();
	},

	fileToJs: function(file) {
		var text = require('fs').readFileSync(file, 'utf-8')

		return papua.compile(text);
	},

	compileFile: function(source, destination) {
		var js_text = papua.fileToJs(source);

		require('fs').writeFileSync(destination, js_text);

		return js_text;
	},

	// eval file as a function and return result
	testFile: function(file) {
		var output, f;
		eval('f = ' + papua.fileToJs(file) + '; output = f();');

		return output;
	},

	test: function(pathFromTestFilesDir) {
		return papua.testFile(papua.test.pathToFile(pathFromTestFilesDir));
	}
};

papua.test.pathToFile = function(name) {
	return __dirname + '/../test/files/' + name;
}

module.exports = papua;
