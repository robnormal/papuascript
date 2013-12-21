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

	/*
	'function.papua': function(b, assert) {
		var o = papua.test('function.papua');

		assert.eql(3, o.a);
		assert.eql(1, o.b);
		assert.eql(6, o.c);
		assert.eql(7, o.d);
		assert.eql(0, o.e);
		assert.eql(5, o.f);
	},
 */

	'for.papua': function(b, assert) {
		var o = papua.test('for.papua');

		assert.eql(9, o.a);
		assert.eql(2, o.d);
		assert.eql(3, o.e);
		assert.eql(9, o.f);

		assert.eql(5, o.b.y);
		assert.eql(3, o.b.z);

		assert.eql(void 0, o.c.y);
		assert.eql(3, o.c.z);
	},

	'cps.papua': function(b, assert) {
		var o = papua.test('cps.papua');
		assert.eql('Hi, me! How ya doin?', o.a);
		assert.eql('Never mind', o.b);
	},

	/*
	'object.papua': function(b, assert) {
		var o = papua.test('object.papua');

		assert.ok(o.a instanceof Function);
		assert.eql(5, o.a());
		assert.eql(2, o.b);
		assert.eql(3, o.c);
		assert.eql('zero', o.d[0]);
		assert.eql('one', o.d[1]);
	},
 */

	'ternary.papua': function(b, assert) {
		var o = papua.test('ternary.papua');
		assert.eql('foo', o.x);
		assert.eql('bar', o.y);
	},

	'with.papua': function(b, assert) {
		var o = papua.test('with.papua');
		assert.eql(1, o.a);
		assert.eql(2, o.b);
	},

	'hash.papua': function(b, assert) {
		var o = papua.test('hash.papua');
		assert.eql(8, o.x);
		assert.eql(8, o.y);
	},

	'if.papua': function(b, assert) {
		var o = papua.test('if.papua');
		assert.eql(1, o.x);
		assert.eql(2, o.y);
	},

	'index.papua': function(b, assert) {
		var o = papua.test('index.papua');
		assert.eql(7, o.a);
	},

	'unary.papua': function(b, assert) {
		var o = papua.test('unary.papua');
		assert.eql(true, o.x);
	},

	'spacedot.papua': function(b, assert) {
		var o = papua.test('spacedot.papua');
		assert.eql(2, o.x);
	},

	'call.papua': function(b, assert) {
		var o = papua.test('call.papua');
		assert.eql(true, o.t);
	},

	'try.papua': function(b, assert) {
		var o = papua.test('try.papua');
		assert.eql(4, o.x);
	},
};
