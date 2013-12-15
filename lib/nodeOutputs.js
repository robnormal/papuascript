/*jshint indent: false */
var
	util = require('util'),
	$ = require('underscore'),
	H = require('./helpers'),
	L = require('./lines.js'),
	N = require('./nodeTypes.js'),

	Lines       = L.Lines,
	LineString  = L.LineString,
	line        = L.line,
	indent      = L.indent,
	
	extendPrototypes;

extendPrototypes = function(constrToMembers) {
	for (var constr in constrToMembers) if (constrToMembers.hasOwnProperty(constr)) {
		$.extend(N[constr].prototype, constrToMembers[constr]);
	}
};


extendPrototypes({
	Script: {
		children: function() {
			return [this.body];
		},
		lines: function() {
			return this.body.lines();
		}
	},

	Block: {
		children: function() {
			return this.nodes;
		},
		lines: function() {
			N.Block.indent++;

			var ls = new Lines([]);

			if (N.Block.indent > 0) {
				ls.push( indent(1) );
			}

			for (var i = 0, len = this.nodes.length; i < len; i++) {
				var node_ls = this.nodes[i].lines();

				if (!node_ls.isEmpty()) {
					ls.append(node_ls)
						.suffix(this.nodes[i].needsSemicolon ? ';' : '');
				}
			}

			if (N.Block.indent > 0) {
				ls.push( indent(-1) );
			} else {
				// FIXME: this is here because it can't be at the top; we need content
				// with a line number first
				ls.prefix(L.var_string(this));
			}

			N.Block.indent--;

			return ls;
		}
	},

	IBlock: {
		lines: function() {
			return N.Block.prototype.lines.apply(this).prefix('{').suffix('}');
		}
	},

	Assign: {
		needsSemicolon: true,
		lines: function() {
			if ($.isArray(this.assignee)) {
				throw new Error('not implemented');
			} else {
				var ls = this.assignee.lines()
					.suffix(' ' + (this.op === ':=' ? '=' : this.op));

				if (this.value) {
					ls.suffix(' ')
						.append(this.value.lines());
				}

				return ls;
			}
		}
	},

	Return: {
		needsSemicolon: true,
		children: function() {
			return [this.expression];
		},
		lines: function() {
			return this.expression.lines().prefix('return ');
		}
	},

	Code: {
		needsSemicolon: true,
		children: function() {
			return [this.params, this.block];
		},

		lines: function() {
			var blk = this.block.lines()
				.prefix(L.var_string(this.block));

			if (this.params && this.params.length) {
				return Lines.join(Lines.mapNodes(this.params), ',')
					.prefix('function ' + (this.name ? this.name : '') + '(')
					.suffix(') { ')
					.append(blk)
					.suffix('}');
			} else {
				return blk
					.prefix('function () {')
					.suffix('}');
			}
		}
	},

	Arr: {
		children: function() {
			return this.xs;
		},

		lines: function() {
			if (this.xs.length === 0) {
				return new Lines([new LineString('[]', this.line, false)]);
			} else {
				return Lines.join(Lines.mapNodes(this.xs), ',')
				.prefix('[')
				.suffix(']');
			}
		}
	},

	Literal: {
		needsSemicolon: true,
		lines: function() {
			return new Lines([line(this.value, this.line)]);
		}
	},

	Identifier: {
		needsSemicolon: true,
		lines: function() {
			return new Lines([line(this.value, this.line)]);
		}
	},

	Undefined: {
		needsSemicolon: true,
		lines: function() {
			return new Lines([line('void 0', this.line)]);
		}
	},

	Null: {
		needsSemicolon: true,
		lines: function() {
			return new Lines([line('null', this.line)]);
		}
	},

	Bool: {
		needsSemicolon: true,
		toString: function() {
			return this.val ? 'true' : 'false';
		},
		lines: function() {
			return new Lines([line(this.toString(), this.line)]);
		}
	},

	Operation: {
		needsSemicolon: true,
		children: function() {
			return [this.a, this.b];
		},
		lines: function() {
			var opStr;

			switch (this.op) {
				case '==':
					opStr = '===';
				break;

				case '!=':
					opStr = '!==';
				break;

				default:
					opStr = this.op;
				break;
			}

			return this.a.lines()
				.suffix(' ' + opStr + ' ')
				.append(this.b.lines());
		}
	},

	FuncCall: {
		needsSemicolon: true,
		children: function() {
			return this.factors;
		},
		lines: function() {
			var
			args = this.factors.slice(1),
			ls = this.factors[0].lines().suffix('(');

			if (args && args.length) {
				ls.append(Lines.join(Lines.mapNodes(args), ','));
			}

			return ls.suffix(')');
		}
	},

	AssignList: {
		needsSemicolon: true,
		children: function() {
			return this.assigns;
		},
		lines: function() {
			return Lines.join(Lines.mapNodes(this.assigns), ',');
		}
	},

	Obj: {
		needsSemicolon: true,
		children: function() {
			return this.props;
		},

		lines: function() {
			var
			liness = [],
			ls;

			if (! this.props.length) {
				return new Lines([line('{}', this.lineno)]);
			} else {
				for (var i = 0, len = this.props.length; i < len; i++) {
					liness.push(
						this.props[i][0].lines()
							.suffix(': ')
							.append(this.props[i][1].lines())
					);
				}

				return Lines.join(liness, ', ')
					.prefix('{')
					.suffix('}');
			}
		}
	},

	Value: {
		needsSemicolon: true,
		children: function() {
			return [this.base, this.properties];
		},

		lines: function() {
			return this.base.lines()
				.append(Lines.bindNodes(this.properties));
		}
	},

	Access: {
		children: function() {
			return [this.member];
		},

		lines: function() {
			return this.member.lines().prefix('.');
		}
	},

	Index: {
		children: function() {
			return [this.expr];
		},

		lines: function() {
			return this.expr.lines().prefix('[').suffix(']');
		}
	},

	Try: {
		children: function() {
			var ns = [this.block];
			
			if (this.caught) {
				ns.push(this.caught);
				ns.push(this.catchBlock);
			}
			if (this.finallyBlock) {
				ns.push(this.finallyBlock);
			}

			return ns;
		},
		lines: function() {
			var ls = this.block.lines().prefix('try {').suffix('}');
			if (this.caught) {
				ls.suffix(' catch(')
					.append(this.caught.lines())
					.suffix(') {')
					.append(this.catchBlock.lines())
					.suffix('}');
			}
			if (this.finallyBlock) {
				ls.suffix(' finally {')
					.append(this.finallyBlock.lines())
					.suffix('}');
			}

			return ls;
		}
	},

	Throw: {
		children: function() {
			return [this.expr];
		},
		lines: function() {
			return this.expr.lines().prefix('throw ');
		}
	},

	While: {
		children: function() {
			return [this.cond, this.block];
		},
		lines: function() {
			var ls;

			if (this.is_do) {
				ls = this.block.lines();
				ls.prefix('do {')
					.suffix('} while (')
					.append(this.cond.lines())
					.suffix(')');
			} else {
				ls = this.cond.lines();
				if (this.assignList) {
					ls.prefix(',').prepend(this.assignList.lines());
				}
				ls.prefix('while (')
					.suffix(') {')
					.append(this.block.lines())
					.suffix('}');
			}

			return ls;
		}
	},

	For: {
		children: function() {
			var children = [];
			for (var x in this.loop) if (this.loop.hasOwnProperty(x)) {
				// only keep parsed objects, not flags
				if (this.loop[x] && this.loop[x].children) {
					children.push(this.loop[x]);
				}
			}
			children.push(this.block);

			return children;
		},

		lines: function() {
			var
				blk = this.block.lines(),
				ls;

			if (this.loop['in']) {
				ls = this.loop.obj.lines()
					.prefix('for (' + this.loop.id + ' in (' + this._obj + '=')
					.suffix('))')
					.append(blk);
			} else {
				// work backwards
				blk.suffix('}')
					.prefix(') {');

				if (this.loop.step) {
					blk.prepend(this.loop.step.lines());
				}

				blk.prefix(';');

				if (this.loop.check) {
					blk.prepend(this.loop.check.lines());
				}

				blk.prefix(';');

				if (this.loop.init) {
					blk.prepend(this.loop.init.lines());
				}

				if (this.loop.obj) {
					blk.prefix(',');
					blk.prepend(this.loop.obj.lines());
					blk.prefix(this._obj + '=');
				}

				blk.prefix('for (')

				ls = blk;
			}

			return ls;
		}
	},

	Switch: {
		lines: function() {
			var ls = this.expr.lines()
				.prefix('switch (')
				.suffix(') {\n')
				.append(Lines.bindNodes(this.cases));

			if (this.deflt) {
				ls.suffix('default:')
					.append(this.deflt.lines())
			}

			ls.suffix('}');

			return ls;
		},
		children: function() {
			var ns = [this.expr, this.cases];
			if (this.deflt) ns.push(this.deflt);

			return ns;
		}
	},

	Case: {
		lines: function() {
			return Lines.join(Lines.mapNodes(this.vals), ',')
				.prefix('case ')
				.suffix(':')
				.append(this.blk.lines())
				.suffix('break;')
				;
		},
		children: function() {
			return this.vals.concat([this.blk]);
		}
	},

	Break: {
		needsSemicolon: true,
		lines: function() {
			return line('break', this.line);
		}
	},

	If: {
		lines: function() {
			var ls = this.condition.lines()
				.prefix('if (')
				.suffix(') {' )
				.append(this.block.lines())
				.suffix('}');

			if (this.elses && this.elses.length) {
				if (this.elses.length > 1) {
					ls.suffix(' else ').append(
						Lines.join(Lines.mapNodes(this.elses.slice(0, -1)), ' else ')
					);
				}
				if (H.last(this.elses) instanceof N.If) {
					ls.suffix(' else ')
						.append(H.last(this.elses).lines());
				} else {
					ls.suffix(' else {')
						.append(H.last(this.elses).lines())
						.suffix('}');
				}
			}

			return ls;
		},
		children: function() {
			return [this.condition, this.block, this.elses];
		}
	},

	Unary: {
		needsSemicolon: true,
		children: function() {
			return this.term;
		},
		lines: function() {
			var ls = this.term.lines();

			if (this.is_prefix) {
				return ls.prefix(this.op + ' ');
			} else {
				return ls.suffix(this.op);
			}
		}

	},

	Var: {
		children: function() {
			return [];
		},
		lines: function() {
			return new Lines([new LineString('', this.lineno, false)]);
		}
	},

	Import: {
		children: function() {
			return [this.obj];
		},
		lines: function() {
			var ls = this.obj.lines();

			ls.prefix('(function() { var owner = ');
			ls.suffix(';');

			for (var i = 0, len = this.members.length; i < len; i++) {
				ls.suffix(this.members[i][0] + ' = owner.' + this.members[i][1] + ';');
			}

			if (this.owner) {
				ls.suffix(this.owner + ' = owner;');
			}

			return ls.suffix('})();');
		}
	},

	Parenthetical: {
		needsSemicolon: true,
		children: function() {
			return [this.expr];
		},
		lines: function() {
			return this.expr.lines()
				.prefix('(')
				.suffix(')');
		}
	},

	Ternary: {
		needsSemicolon: true,
		children: function() {
			return [this.cond, this.a, this.b];
		},
		lines: function() {
			return this.cond.lines()
				.prefix('(')
				.suffix('?')
				.append(this.a.lines())
				.suffix(':')
				.append(this.b.lines())
				.suffix(')');
		}
	},

	Negation: {
		needsSemicolon: true,
		children: function() {
			return [this.term];
		},
		lines: function() {
			return this.term.lines()
				.prefix('-');
		}
	},

	Cps: {
		needsSemicolon: true,
		children: function() {
			return this.toFuncCall().children();
		},
		lines: function() {
			return this.toFuncCall().lines();
		}
	}
});

