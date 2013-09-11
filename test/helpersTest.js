var H = require('../helpers.js');
var ID = 'IDENTIFIER', NUM = 'NUMBER', BR = 'TERMINATOR';

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

function eq(x, y) {
	for (var i in x) { if (x.hasOwnProperty(i)) {
		if (x[i] !== y[i]) return false;
	}}
	for (var j in y) { if (y.hasOwnProperty(j)) {
		if (x[j] !== y[j]) return false;
	}}

	return true;
}


module.exports = {
	'ends_with': function(b, assert) {
		assert.ok(H.ends_with('abc', 'bc'));
	},
	'stringMinus': function(b, assert) {
		var m_diff = H.stringMinus('abc', 'bc');

		assert.ok(m_diff.isJust());
		assert.equal('a', m_diff.fromJust());
	}
}
