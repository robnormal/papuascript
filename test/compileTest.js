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
		var o = papua.test('function.papua');

		assert.eql(3, o.a);
		assert.eql(1, o.b);
		assert.eql(6, o.c);
		assert.eql(0, o.e);
		assert.eql(5, o.f);
		assert.eql(Function, o.g[0].constructor);
		assert.eql(3, o.h);
	},

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

	'while.papua': function(b, assert) {
		var o = papua.test('while.papua');

		assert.eql(10, o.a, 'While loop continues until condition is false');
		assert.eql(1, o.b, 'While loop stops when condition after statement is false');
		assert.eql(void 0, o.c, 'While loop never runs when initial condition is false');
	},

	'cps.papua': function(b, assert) {
		var o = papua.test('cps.papua');
		assert.eql('Hi, me! How ya doin?', o.a);
		assert.eql('Never mind', o.b);
		assert.eql(5, o.c);
	},

	'object.papua': function(b, assert) {
		var o = papua.test('object.papua');

		assert.ok(o.a instanceof Function);
		assert.eql(5, o.a());
		assert.eql(2, o.b);
		assert.eql(3, o.c);
		assert.eql('zero', o.d[0]);
		assert.eql('one', o.d[1]);
	},

	'ternary.papua': function(b, assert) {
		var o = papua.test('ternary.papua');
		assert.eql('foo', o.x);
		assert.eql('bar', o.y);
	},

	'with.papua': function(b, assert) {
		var o = papua.test('with.papua');
		assert.eql(1, o.a);
		assert.eql(2, o.b);
		assert.eql(6, o.c);
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

	'ifcase.papua': function(b, assert) {
		var o = papua.test('ifcase.papua');
		assert.eql(2, o.x);
		assert.eql(1, o.y);
	},

	'switch.papua': function(b, assert) {
		var o = papua.test('switch.papua');
		assert.eql('box', o.b);
		assert.eql(1, o.c);
		assert.eql(3, o.d);
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


	'at.papua': function(b, assert) {
		var o = papua.test('at.papua');
		assert.eql(8, o.a);
		assert.eql(5, o.b);
		assert.eql('tea and krumpets or coffee', o.c);
	},

	'Called function literal should be parenthesized': function(b, assert) {
		var
			code_in  = '(-> 3)()',
			code_out = papua.compile(code_in);

		assert.eql('(', code_out[0], 'Function literals that are immediately called should be put in parentheses');
	}
};
