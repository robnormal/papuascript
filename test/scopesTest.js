var H = require('../lib/helpers.js');
var N = require('../lib/nodes.js');
var papua = require('../lib/papua-lib.js');

module.exports = {
	'Variables defined in Code do not show up in outer scope': function(b, assert) {
		var
			x_equals_3 = new N.Assign(new N.Identifier('x'), '=', new N.Literal('3')),
			func = new N.Code([], new N.Block([x_equals_3])),
			b = new N.Block([func]);

		// Code uses vars_defined(this.block)
		assert.eql(['x'], func.block.varsDefined());
		assert.eql([], b.varsDefined());
	},

	'Function parameter attributes must be assigned with :=': function(b, assert) {
		var 
			good = '\\a ->\n  a.x := 3',
			bad =  '\\a ->\n  a.x = 3';

		try {
			papua.compile(good);
		} catch (e) {
			assert.ok(false, ':= should be used to assign to function parameter attributes');
		}

		try {
			papua.compile(bad);
			assert.ok(false, 'assigning function parameter attribute with "=" should raise error');
		} catch (e) {
			if (e.name === 'AssertionError') {
				throw e;
			} else {
				assert.ok(true, 'Assigning function parameter attribute with "=" should raise error');
			}
		}
	}
};

