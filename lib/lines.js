/*jshint indent: false */
var
	util = require('util'),
	$ = require('underscore'),
	H = require('./helpers'),
	Lines, LineString, line, indent, var_string;

(function() {
	LineString = function LineString(str, line, indent) {
		this.indent = indent;

		if (false === indent) {
			this.str = str;
			this.line = line;
		}
	};

	line = function(str, line) {
		return new LineString(str, line, false);
	};

	indent = function(n) {
		return new LineString(null, null, n);
	};

	LineString.prototype.isIndent = function() {
		return false !== this.indent;
	};

})();

Lines = function Lines(l_strs) {
	this.lines = l_strs;
}

$.extend(Lines.prototype, {
	isEmpty: function() {
		return ! this.lines.length;
	},
	firstNonIndent: function() {
		var i = 0;
		while (this.lines[i] && this.lines[i].isIndent()) {
			i++;
		}

		return this.lines[i] ? i : false;
	},

	lastNonIndent: function() {
		var i = this.lines.length - 1;
		while (this.lines[i] && this.lines[i].isIndent()) {
			i--;
		}

		return this.lines[i] ? i : false;
	},

	prefix: function(str) {
		if (typeof str !== 'string') throw new Error('argument to Lines::suffix must be a string');

		var i = this.firstLine();

		if (false === i) {
			throw new Error('Cannot prefix list of indents or empty list');
		} else {
			this.lines.unshift(line(str, i));
			return this;
		}
	},

	suffix: function(str) {
		if (typeof str !== 'string') throw new Error('argument to Lines::suffix must be a string');

		var i = this.lastLine();

		if (false === i) {
			throw new Error('Cannot prefix list of indents or empty list');
		} else {
			this.lines.push(line(str, i));
			return this;
		}
	},

	push: function(lstr) {
		if (!(lstr instanceof LineString)) throw new Error();
		this.lines.push(lstr);
		return this;
	},
	unshift: function(lstr) {
		if (!(lstr instanceof LineString)) throw new Error();
		this.lines.unshift(lstr);
		return this;
	},

	append: function(ls) {
		if (!(ls instanceof Lines)) throw new Error('Expected Lines, got ' + ls);
		this.lines = this.lines.concat(ls.lines);
		return this;
	},

	prepend: function(ls) {
		if (!(ls instanceof Lines)) throw new Error('Expected Lines, got ' + ls);
		this.lines = ls.lines.concat(this.lines);
		return this;
	},

	firstLine: function() {
		var i = this.firstNonIndent();

		return false === i ?
			false :
			this.lines[i].line;
	},

	lastLine: function() {
		var i = this.lastNonIndent();

		return false === i ?
			false :
			this.lines[i].line;
	},

	toString: function() {
		var
			res = '',
			indent = 0,
			line = 0,
			lstr, i, len;

		for (i in this.lines) if (this.lines.hasOwnProperty(i)) {
			lstr = this.lines[i];

			if (lstr.isIndent()) {
				indent += lstr.indent;

			// add empty lines to bring us up to current line
			} else {
				if (line < lstr.line) {
					while (line < lstr.line) {
						res = res.replace(/[ \t]*$/, '\n');
						line++;
					}
					res += H.repeat('  ', indent);
				}
				res += lstr.str;
			}
		}

		return res;
	}
});

Lines.join = function(liness, text) {
	var
		lines = liness[0],
		i = 1, // skip first Lines object
		len = liness.length;

	for (; i < len; i++) {
		lines.suffix(text);
		lines.append(liness[i]);
	}

	return lines;
}

Lines.merge = function(liness) {
	return Lines.join(liness, '');
};

Lines.mapNodes = function(xs) {
	return $.map(xs, function(x) {
		return x.lines();
	});
};

Lines.bindNodes = function(xs) {
	return new Lines(H.list_bind(xs, function(x) {
		return x.lines().lines;
	}));
};

var_string = function(node) {
	var vars = node.varsDefined();

	return vars.length ?
		'var ' + vars.join(',') + ';' :
		'';
};

module.exports = {
	Lines: Lines,
	LineString: LineString,
	line: line,
	indent: indent,
	var_string: var_string
};

