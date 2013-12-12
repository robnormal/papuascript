var papua = require('../lib/papua-lib.js');
var $ = require('underscore');
var log = console.log;

function doesntThrow(assert, f, err) {
	try {
		f();
	} catch (e) {
		assert.doesNotThrow(function () {
			throw e;
		}, err, e.toString());
	}
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
	'assign.papua': function(b, assert) {
		var o = papua.test('assign.papua');

		assert.eql(1, o.i);
		assert.eql(4, o.j);
	},

	'function.papua': function(b, assert) {
		o = papua.test('function.papua');

		assert.eql(3, o.a);
		assert.eql(1, o.b);
		assert.eql(6, o.c);
		assert.eql(7, o.d);
	},

	'for.papua': function(b, assert) {
		o = papua.test('for.papua');

		assert.eql(9, o.a);
		assert.eql('x', o.b);
		assert.eql(1, o.c);
		assert.eql(2, o.d);
		assert.eql(3, o.e);
		assert.eql(9, o.f);
	},

	'Objects': function(b, assert) {
		var o = papua.test('object.papua');

		assert.ok(o.a instanceof Function);
		assert.eql(5, o.a());
		assert.eql(2, o.b);
		assert.eql(3, o.c);
	},

	'Infix functions': function(b, assert) {
		var o = papua.test('infix.papua');
		assert.eql(12, o.a);
	}
};
