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

	sprint = L.sprint,
	collect = L.collect;

var log = console.log;

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
		$.each(this.children(), function(n) {
			if (n instanceof Code) {
				n.checkUpdatedRaw(null, outer_scope.concat(scope), null);
			} else if (n instanceof PNode) {
				L.invoke('checkUpdatedRaw', [scope, outer_scope, inner_scope], n);
			}
		});
	},

	checkUpdatedRaw: function(scope, outer_scope, inner_scope) {
		this.checkUpdatedChildren(scope, outer_scope, inner_scope);
	},

	checkUpdated: function(scope, outer_scope, inner_scope) {
		if (! scope) {
			scope = this.varsDefined();
		}

		this.checkUpdatedRaw(scope, outer_scope, inner_scope)
	},

	varsReferenced: function(in_loop) {
		return collect('varsReferenced', this.children(), [in_loop]);
	},

	// produce warnings about closure variables modified after
	// closure creation
	checkReferenced: function(in_loop) {
		var
			reffed = [],
			reffedFromEnclosed = [],
			varName, codeReffed, nested_in_loop, is_inner_op;

		$.each(this.children(), function(n) {
			if (n instanceof Assign) {
				varName = n.assignee.baseName();
				is_inner_op = $.contains(['=', ':='], n.op);

				if (! is_inner_op && $.contains(reffedFromEnclosed, varName)) {
					console.warn('Warning: Modifying enclosed variable ' + varName + ' on line FIXME');
				}

				if (':=' === n.op) {
					reffed.push(varName);
				}
			} else if (n instanceof Code) {
				if (in_loop) {
					console.warn('Warning: Function created in loop on line FIXME');
				}

				codeReffed = n.varsReferenced(in_loop);

				reffed = reffed.concat(codeReffed);
				reffedFromEnclosed = reffedFromEnclosed.concat(codeReffed);
			} else if (n.varsReferenced) {
				nested_in_loop = in_loop || n instanceof For || n instanceof While;
				reffed = reffed.concat(n.varsReferenced(nested_in_loop));
			}
		});

		return reffed;
	}
});



$.extend(Block.prototype, {
	/**
	 * @param existing array List of variables in the outside scope
	 */
	resolveVars: function(existing) {
		return this.varsDefined();
	},

	checkScope: function(top_scope) {
		this.checkUpdated(null, top_scope, null);
		this.checkReferenced(false);
	}
});



// Assign
(function() {
	var
		msg_shadow = 'Warning: variable "{0}" shadowing variable in outer' +
			' scope on line {1}. Use := to update variables in the outer scope.',
		msg_inner = 'Illegal "{0} {1}". Use "=:" to update variables in enclosed scopes.',
		msg_outer = 'Illegal "{0} {1}": {0} present in outer scope',
		msg_no_outer = 'Illegal "{0} {1}": {0} not present in outer scope',
		msg_no_inner = 'Illegal "{0} {1}": {0} not present in any enclosed scope',

		opErr = function(node, msg) {
			H.errorAt( sprint( msg, [node.baseName(), node.op]), {
				first_line: node.assignee.value.line
			});
		};

	$.extend(Assign.prototype, {
		varsDefinedRaw: function() {
			if (this.value && this.value.varsDefinedRaw) {
				var vs = this.value.varsDefinedRaw();

				if (this.op === '=') {
					vs.push(this.baseName());
				}

				return vs;
			} else {
				return [];
			}
		},

		varsReferenced: function() {
			var vars = this.value.varsReferenced();

			if (':=' === this.op) {
				vars.push(this.assignee.baseName());
			}

			return vars;
		},

		checkUpdatedRaw: function(scope, outer_scope, inner_scope) {
			var
				v      = this.baseName(),
				lineno = this.assignee.line,
				loc    = { first_line: lineno },

				updating       = ':=' === this.op,
				updating_inner = '=:' === this.op,
				defining       = !updating && !updating_inner,

				in_outer   = $.contains(outer_scope, v),
				in_current = $.contains(scope, v),
				in_inner   = inner_scope && $.contains(inner_scope, v);

			if (!(in_outer || in_current || defining)) {
				H.errorAt('Undefined variable: ' + v, loc);

			} else if (!(defining || updating || updating_inner)) {
				H.errorAt('Unrecognized assignment operator: ' + this.op, loc);

			} else if (defining) {
				if (in_inner) {
					opErr(msg_inner);
				} else if (in_outer) {
					console.warn( sprint( msg_shadow, [v, lineno]));
				}

			} else if (updating) {
				if (! in_outer) {
					opErr(msg_no_outer);
				} else if (in_inner) {
					opErr(msg_inner);
				}

			} else if (updating_inner) {
				if (! in_inner) {
					opErr(msg_no_inner);
				} else if (in_outer) {
					opErr(msg_outer);
				}
			}

			// Code may contain assignments
			L.invoke('checkUpdatedRaw', [scope, outer_scope, inner_scope], this.value);
		}
	});

})();


$.extend(Code.prototype, {
	varsReferenced: function() {
		var refs = PNode.prototype.varsReferenced.apply(this);

		return $.difference(refs, this.varsDefined());
	}
});


$.extend(N.Identifier.prototype, {
	// this may be wrong...
	varsReferenced: function() {
		return [this.value];
	}
});

$.extend(N.Obj.prototype, {
	varsReferenced: function() {
		L.list_bind(this.props, function(prop) {
			return prop[1].varsReferenced();
		});
	}
});

$.extend(N.Value.prototype, {
	varsReferenced: function() {
		return this.base.varsReferenced();
	}
});

$.extend(N.Access.prototype, {
	varsReferenced: function() {
		return [];
	}
});

$.extend(N.Try.prototype, {
	varsDefinedRaw: function() {
		return this.block.varsDefinedRaw()
			.concat(this.catchBlock ? this.catchBlock.varsDefinedRaw() : [])
			.concat(this.finallyBlock ? this.finallyBlock.varsDefinedRaw() : []);
	},

	varsReferenced: function() {
		return this.block.varsReferenced()
			.concat(this.catchBlock ? this.catchBlock.varsReferenced() : [])
			.concat(this.finallyBlock ? this.finallyBlock.varsReferenced() : []);
	}
});


$.extend(N.Var.prototype, {
	varsDefinedRaw: function() {
		return $.map(this.names, function(n) {
			return n.value;
		});
	},

	varsReferenced: function() {
		return [];
	}
});

$.extend(N.Import.prototype, {
	varsDefinedRaw: function() {
		var vs = this.members.xs;
		if (this.owner) {
			vs.push(this.owner);
		}

		return vs;
	}
});

