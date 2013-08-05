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

function throwSyntaxError(message, location) {
	if (! location.last_line) {
		location.last_line = location.first_line;
	}
	if (! location.last_column) {
		location.last_column = location.first_column;
	}

	var error = new SyntaxError(message);
	error.location = location;

	throw error;
}

module.exports = {
	has: has,
	last: last,
	count: count,
	find_init: find_init,
	throwSyntaxError: throwSyntaxError
};

