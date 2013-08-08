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

function find_init(xs, str) {
	for (var i = 0, len = xs.length; i < len; i++) {
		if (str.substr(0, xs[i].length) === xs[i]) {
			return xs[i];
		}
	}

	return false;
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
		if (((typeof obj) === 'object') && obj['updateLocationDataIfMissing']) {
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
	here: here,
	loc: loc,
	throwSyntaxError: throwSyntaxError
};

