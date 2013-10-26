var H = require('../lib/helpers.js');
var N = require('../lib/nodes.js');

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

module.exports = {
	'Variables defined in Code do not show up in outer scope': function(b, assert) {
		var
			x_equals_3 = new N.Assign(new N.Identifier('x'), '=', new N.Literal('3')),
			func = new N.Code([], new N.Block([x_equals_3])),
			b = new N.Block([func]);

		// Code uses vars_defined(this.block)
		assert.eql(['x'], func.block.varsDefined());
		assert.eql([], b.varsDefined());
	}
};
