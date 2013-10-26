/*jshint indent: false */
var
	util = require('util'),
	$ = require('underscore'),
	H = require('./helpers'),
	L = require('./lines.js'),
	N = require('./nodeTypes.js'),
	PNode = N.PNode,
	Block = N.Block,
	Assign = N.Assign,
	Code = N.Code,
	For = N.For,
	While = N.While,

	sprint = H.sprint,
	collect = L.collect;

var log = console.log;

function concatRecursive(xs, ys) {
	return [
		$.uniq(xs[0].concat(ys[0])),
		$.uniq(xs[1].concat(ys[1]))
	];
}

PNode.varsReferencedScope = function(xs, in_loop, reffed_lower) {
	var cumulative, res;

	if (xs instanceof Array) {
		cumulative = [ [], reffed_lower ]; // initial value

		$.each(xs, function(x) {
			if (x instanceof PNode) {
				res = x.varsReferenced(in_loop, cumulative[1]);
			} else if (x instanceof Array) {
				res = PNode.varsReferencedScope(x, in_loop, cumulative[1]);
			} else {
				res = [[],[]];
			}

			if (res[0].length || res[1].length) {
				cumulative = concatRecursive(cumulative, res);
			}
		});

		return $.uniq(cumulative);
	} else if (xs instanceof PNode) {
		return xs.varsReferenced(in_loop, reffed_lower);
	}
};

$.extend(PNode.prototype, {
	varsDefinedRaw: function() {
		if (this.canDefineVars) {
			return collect('varsDefinedRaw', [], this.children());
		} else {
			return [];
		}
	},

	varsDefined: function() {
		return $.without($.uniq(this.varsDefinedRaw()), 'this');
	},

	checkUpdatedChildren: function(scope, outer_scope, inner_scope) {
		outer_scope = (outer_scope || []).concat(this.caughtVars());

		$.each(this.children(), function(n) {
			if (n instanceof Code) {
				var params = $.map(n.params, function(p) { return p.value; });

				// arguments to the function are outer variables, as is everything
				// currently in scope
				n.block.checkUpdated(
					null,
					/* variables currently in scope and function parameters
					 * are all external variables */
					outer_scope.concat(scope).concat(params),
					null
				);
			} else if (n instanceof PNode) {
				L.invoke('checkUpdated', [scope, outer_scope, inner_scope], n);
			}
		});
	},

	checkUpdatedRaw: function(scope, outer_scope, inner_scope) {
		this.checkUpdatedChildren(scope, outer_scope, inner_scope);
	},

	checkUpdated: function(scope, outer_scope, inner_scope) {
		scope = (scope || []).concat(this.varsDefined());

		this.checkUpdatedRaw(scope, outer_scope, inner_scope)
	},

	/* Returns [vars referenced in your (caller's) scope, vars referenced in a lower scope] */
	varsReferenced: function(in_loop, reffed_lower) {
		return PNode.varsReferencedScope(this.children(), in_loop, reffed_lower);
	},

	caughtVars: function() {
		vs = [];

		$.each(this.children(), function(n) {
			if (! n instanceof Code) {
				vs = vs.concat(n.caughtVars());
			}
		});

		return vs;
	}
});



$.extend(Block.prototype, {
	/**
	 * @param existing array List of variables in the outside scope
	 */
	resolveVars: function(existing) {
		return this.varsDefined();
	},

	checkScope: function() {
		this.checkUpdated(null, null, null);
		this.varsReferenced(false, []);
	},

	varsReferenced: function(in_loop, reffed_lower) {
		return PNode.varsReferencedScope(this.children(), in_loop, reffed_lower);
	}
});



// Assign
(function() {
	var
		msg_shadow = 'Warning: variable "{0}" shadowing variable in outer' +
			' scope on line {1}. Use := to update variables in the outer scope',
		msg_not_exist = 'Variable "{0}" not local to scope: Use := to update variables in the outer scope.',
		msg_inner = 'Illegal "{0} {1}". Use "=:" to update variables in enclosed scopes.',
		msg_outer = 'Illegal "{0} {1}": {0} present in outer scope',
		msg_no_outer = 'Illegal "{0} {1}": {0} not present in outer scope',
		msg_no_inner = 'Illegal "{0} {1}": {0} not present in any enclosed scope',
		msg_cant_define_this = 'Use := to modify special variable "this"; it is never local',

		opErr = function(node, v, msg) {
			var line = node.assignee.line || 
				(node.assignee.base && node.assignee.base.line);

			H.errorAt( sprint( msg, [v, node.op]), {
				first_line: line
			});
		};

	$.extend(Assign.prototype, {
		varsDefinedRaw: function() {
			if (this.value && this.value.varsDefinedRaw) {
				var vs = this.value.varsDefinedRaw();

				if (this.op === '=' && !(this.assignee.properties && this.assignee.properties.length)) {
					vs = vs.concat(this.baseName());
				}

				return vs;
			} else {
				return [];
			}
		},

		varsReferenced: function(in_loop, lower) {
			var new_here = [], new_lower = [],
				varNames, varName, is_inner_op, res;

			varNames = this.baseName();

			for (var i = 0, len = varNames.length; i < len; i++) {
				varName = varNames[i];

				is_inner_op = '=:' === this.op;

				/*
				if (! is_inner_op && $.contains(lower, varName)) {
					console.warn('Warning: Modifying enclosed variable ' +
						varName + ' on line ' + this.assignee.getLineno());
				}
			 */

				if (':=' === this.op) {
					new_here.push(varName);
				}

				if (this.value instanceof PNode) {
					res = this.value.varsReferenced(in_loop, lower);
				} else {
					res = [[],[]];
				}

				new_here = $.uniq(new_here.concat(res[0]));
				new_lower = $.uniq(new_lower.concat(res[1]));
			}

			return [new_here, new_lower];
		},


		checkUpdatedRaw: function(scope, outer_scope, inner_scope) {
			var
				vs     = this.baseName(),
				lineno = this.assignee.base.line + 1,
				loc    = { first_line: lineno },

				updating       = ':=' === this.op,
				updating_inner = '=:' === this.op,
				defining       = !updating && !updating_inner,

				in_outer, in_current, in_inner, v, at_top, is_this;

			if (outer_scope === null) {
				at_top = true;
				outer_scope = [];
			}

			for (var i = 0, len = vs.length; i < len; i++) {
				v = vs[i];

				in_outer   = $.contains(outer_scope, v);
				in_current = $.contains(scope, v);
				in_inner   = inner_scope && $.contains(inner_scope, v);

				if (v === 'this') {
					if (defining) {
						opErr(this, v, msg_cant_define_this);
					}
				} else if (! (in_outer || in_current || defining) && ! at_top) {
					H.errorAt('Undefined variable: ' + v, loc);

				} else if (!(defining || updating || updating_inner)) {
					H.errorAt('Unrecognized assignment operator: ' + this.op, loc);

				} else if (defining) {
					if (! in_current) {
						opErr(this, v, msg_not_exist);
					} else if (in_inner) {
						opErr(this, v, msg_inner);
					} else if (in_outer) {
						console.warn( sprint( msg_shadow, [v, lineno]));
					}

				} else if (updating) {
					if (! in_outer && ! at_top) {
						opErr(this, v, msg_no_outer);
					} else if (in_inner) {
						opErr(this, v, msg_inner);
					}

				} else if (updating_inner) {
					if (! in_inner) {
						opErr(this, v, msg_no_inner);
					} else if (in_outer) {
						opErr(this, v, msg_outer);
					}
				}
			}

			// Code may contain assignments
			L.invoke('checkUpdated', [scope, outer_scope, inner_scope], this.value);
		}
	});

})();


$.extend(Code.prototype, {
	varsReferenced: function(in_loop, elsewhere) {
		if (in_loop) {
			console.warn('Warning: creating function in loop');
		}

		var
			res = this.block.varsReferenced(false, elsewhere),
			args = L.pluck(this.params, 'value'),
			defs = this.block.varsDefined(),
			local = args.concat(defs);

		// all references are inner-scope wrt the caller
		return [ [], $.uniq($.difference(res[0].concat(res[1]), local)) ];
	}
});


$.extend(N.Identifier.prototype, {
	// this may be wrong...
	varsReferenced: function() {
		return [[this.value], []];
	}
});

$.extend(N.Obj.prototype, {
	varsReferenced: function(in_loop, lower) {
		return PNode.varsReferencedScope(
			L.pluck(this.props, 1), in_loop, lower
		);
	}
});

$.extend(N.Value.prototype, {
	varsReferenced: function(in_loop, lower) {
		return PNode.varsReferencedScope(this.base, in_loop, lower);
	}
});

$.extend(N.Access.prototype, {
	varsReferenced: function(in_loop, lower) {
		return [[], []];
	}
});

$.extend(N.For.prototype, {
	varsDefinedRaw: function() {
		var vs = this.block.varsDefinedRaw();
		if (this.loop.id) {
			vs.push(this.loop.id.value);
			if (this.loop.id2) {
				vs.push(this.loop.id2.value);
			}
		}
		if (this.loop.obj) {
			vs.push(this._obj.value);
		}
		if (this.loop.init) {
			vs = vs.concat(this.loop.init.varsDefined());
		}

		return vs
	},

	varsReferenced: function(in_loop, lower) {
		var parts = [], res;

		if (this.loop.obj) parts.push(this.loop.obj);
		if (this.loop.init) parts.push(this.loop.init);
		if (this.loop.check) parts.push(this.loop.check);
		if (this.loop.step) parts.push(this.loop.step);

		res = PNode.varsReferencedScope(parts, in_loop, lower);

		return concatRecursive(
			res,
			this.block.varsReferenced(true, res[1])
		);
	}
});

$.extend(N.While.prototype, {
	varsReferenced: function(in_loop, lower) {
		var res = PNode.varsReferencedScope(this.cond, in_loop, lower);

		return concatRecursive(
			res,
			this.block.varsReferenced(true, res[1])
		);
	}
});

$.extend(N.Try.prototype, {
	varsDefinedRaw: function() {
		return this.block.varsDefinedRaw()
			.concat(this.catchBlock ? this.catchBlock.varsDefinedRaw() : [])
			.concat(this.finallyBlock ? this.finallyBlock.varsDefinedRaw() : []);
	},

	varsReferenced: function(in_loop, lower) {
		var res = this.block.varsReferenced(in_loop, lower);
		if (this.catchBlock) {
			res = concatRecursive(res,
				this.catchBlock.varsReferenced(in_loop, lower));
		}
		if (this.finallyBlock) {
			res = concatRecursive(res,
				this.finallyBlock.varsReferenced(in_loop, lower));
		}

		return res;
	},

	caughtVars: function() {
		return this.caught ? [this.caught.value] : [];
	}
});


$.extend(N.Var.prototype, {
	varsDefinedRaw: function() {
		return L.pluck(this.names, 'value');
	},

	varsReferenced: function() {
		return [[], []];
	}
});

$.extend(N.Import.prototype, {
	varsDefinedRaw: function() {
		var vs = this.members;
		if (this.owner) {
			vs.push(this.owner);
		}

		return vs;
	}
});

