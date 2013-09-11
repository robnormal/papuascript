function Maybe(x, is_just) {
	this.x = x;
	this.is_just = is_just;
}
Maybe.prototype.isJust = function() {
	return this.is_just;
}
Maybe.prototype.isNothing = function() {
	return ! this.is_just;
}
Maybe.prototype.fromJust = function() {
	if (this.is_just) {
		return this.x;
	} else {
		throw new Error('Cannot call fromJust on Maybe::nothing');
	}
}
Maybe.prototype.map = function(f) {
	if (this.is_just) {
		return Maybe.just(f(this.fromJust()));
	} else {
		return Maybe.nothing;
	}
}

Maybe.nothing = new Maybe(null, false);

Maybe.just = function(x) {
	return new Maybe(x, true);
};

function has(xs, x) {
	return xs.indexOf(x) !== -1;
}

function last(xs) {
	return xs[xs.length-1];
}

function count(string, substr) {
	if (!substr.length) return 1 / 0;

	var num = 0, pos = 0;
	while ((pos = 1 + string.indexOf(substr, pos))) num++;

	return num;
}

function begins_with(haystack, needle) {
	return haystack.substr(0, needle.length) === needle;
}

function ends_with(haystack, needle) {
	return haystack.substr(-needle.length) === needle;
}

function str_after_str(haystack, needle) {
	if (needle && ends_with(haystack, needle)) {
		return Maybe.just(haystack.substr(-needle.length));
	} else {
		return Maybe.nothing;
	}
}

function stringMinus(haystack, needle) {
	var len = needle.length;

	if (haystack.substr(haystack.length - len) === needle) {
		return Maybe.just(haystack.substr(0, haystack.length - len));
	} else {
		return Maybe.nothing;
	}
}

function find_init(xs, str) {
	for (var i = 0, len = xs.length; i < len; i++) {
		if (str.substr(0, xs[i].length) === xs[i]) {
			return xs[i];
		}
	}

	return false;
}

function indentGreaterThan(a, b) {
	return a !== b && begins_with(a, b);
}

function indentLessThan(a, b) {
	return a !== b && indentGreaterThan(b, a);
}

function indentCmp(a, b) {
	if (a === b) {
		return { equal: true };
	} else if (indentGreaterThan(a, b)) {
		return { greater: true };
	} else if (indentLessThan(a, b)) {
		return { less: true };
	} else {
		return { error: true };
	}
}

// remove b from the _end_ of a
function indentMinus(a, b) {
	if (a === b) {
		res = { equal: true, diff: '' };
	} else if (ends_with(a, b)) {
		res = { greater: true, diff: stringMinus(a, b).fromJust() };
	} else if (ends_with(b, a)) {
		res = indentMinus(b,a);
		res.greater = false;
		res.less = true;
	} else {
		res = { error: 'Indent-outdent mismatch' };
	}
		
	return res;
}

function clone(a) {
	var b = {};
	for (var x in a) if (a.hasOwnProperty(x)) {
		b[x] = a[x];
	}

	return b;
}

function here(line, col) {
	return {first_line: line, first_column: col, last_line: line, last_column: col};
}

function loc(token) {
	return here(token[2].first_line, token[2].first_column);
}

function throwSyntaxError(message, location) {
	var error = new SyntaxError(message);

	if (location) {
		if (! location.last_line) {
			location.last_line = location.first_line;
		}
		if (! location.last_column) {
			location.last_column = location.first_column;
		}

		error.location = location;
	}

	throw error;
}

function error(msg, token) {
	throw new Error(msg + ' in line ' + (token[2].first_line+1) + ' column ' + (token[2].first_column+1));
}

var buildLocationData = function(first, last) {
	if (!last) {
		return first;
	} else {
		return {
			first_line: first.first_line,
			first_column: first.first_column,
			last_line: last.last_line,
			last_column: last.last_column
		};
	}
};

var addLocationDataFn = function(first, last) {
	return function(obj) {
		if (((typeof obj) === 'object') && obj.updateLocationDataIfMissing) {
			obj.updateLocationDataIfMissing(buildLocationData(first, last));
		}
		return obj;
	};
};

var locationDataToString = function(obj) {
	var locationData;
	if (("2" in obj) && ("first_line" in obj[2])) {
		locationData = obj[2];
	} else if ("first_line" in obj) {
		locationData = obj;
	}

	if (locationData) {
		return ("" + (locationData.first_line + 1) + ":" + (locationData.first_column + 1) + "-") +
			("" + (locationData.last_line + 1) + ":" + (locationData.last_column + 1));
	} else {
		return "No location data";
	}
};

module.exports = {
	has: has,
	last: last,
	count: count,
	find_init: find_init,
	begins_with: begins_with,
	ends_with: ends_with,
	str_after_str: str_after_str,
	stringMinus: stringMinus,
	indentGreaterThan: indentGreaterThan,
	indentLessThan: indentLessThan,
	indentCmp: indentCmp,
	indentMinus: indentMinus,
	clone: clone,
	here: here,
	loc: loc,
	throwSyntaxError: throwSyntaxError,
	error: error,
	Maybe: Maybe,
	just: Maybe.just,
	nothing: Maybe.nothing
};

