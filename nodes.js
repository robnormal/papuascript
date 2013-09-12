var $ = require('underscore');
var N = require('nodam');
var H = require('./helpers');

var LCOUNT = /\n/g

var Block, AssignList, Try, While, For, If, Switch, Assign, Undefined, Return,
	Code, Access, Var, Case, Break;
var Lines, concat, to_list, in_parens, repeat, list_bind;
var vars_defined, check_updated_vars, var_string, can_define_vars, can_update_vars;

// global line number. Only used when calling toString()
var lineno = null;

concat = function(xs) {
	var str = '';
	for (var i = 0, len = xs.length; i < len; i++) {
		str += xs[i].toString();
	}

	return str;
};

to_list = function(xs) {
	var strs = [];
	for (var i = 0, len = xs.length; i < len; i++) {
		strs.push(xs[i].toString());
	}

	return strs.join(', ');
};

in_parens = function(xs) {
	return '(' + to_list(xs) + ')';
};

repeat = function(str, n) {
	var res = '';
	for(var i = 0; i < n; i++) {
		res += str;
	}

	return res;
};

// maps f (which returns an array) over the list xs, then concatenates the results
list_bind = function(xs, f) {
	var res = [];
	for (var i = 0, len = xs.length; i < len; i++) {
		res = res.concat(f(xs[i]));
	}

	return res;
}

function reduceLines(nodes) {
	return $.reduce(nodes, function(memo, n) {
		var info = n.lines();

		// bring node up to beginning of next
		while (memo.end < info.start) {
			memo.add('');
		}

		return memo.concat(info.lines);
	}, { start: 0, lines: []});
}

var LineString, line, indent;
(function() {
	LineString = function LineString(str, line, indent) {
		this.indent = indent;

		if (false === indent) {
			this.str = str;
			this.line = line;
		}
	};

	line = function(str, line) {
		return new LineString(str, line, false);
	};

	indent = function(n) {
		return new LineString(null, null, n);
	};

	LineString.prototype.isIndent = function() {
		return false !== this.indent;
	};

})();

Lines = function(l_strs) {
	this.lines = l_strs;
}

$.extend(Lines.prototype, {
	firstNonIndent: function() {
		var i = 0;
		while (this.lines[i] && this.lines[i].isIndent()) {
			i++;
		}

		return this.lines[i] ? i : false;
	},

	lastNonIndent: function() {
		var i = this.lines.length - 1;
		while (this.lines[i] && this.lines[i].isIndent()) {
			i--;
		}

		return this.lines[i] ? i : false;
	},


	prefix: function(str) {
		if (typeof str !== 'string') throw new Error('argument to Lines::suffix must be a string');

		var i = this.firstLine();

		if (false === i) {
			throw new Error('Cannot prefix list of indents or empty list');
		} else {
			this.lines.unshift(line(str, i));
			return this;
		}
	},

	suffix: function(str) {
		if (typeof str !== 'string') throw new Error('argument to Lines::suffix must be a string');

		var i = this.lastLine();

		if (false === i) {
			throw new Error('Cannot prefix list of indents or empty list');
		} else {
			this.lines.push(line(str, i));
			return this;
		}
	},

	push: function(lstr) {
		if (!(lstr instanceof LineString)) throw new Error();
		this.lines.push(lstr);
		return this;
	},
	unshift: function(lstr) {
		if (!(lstr instanceof LineString)) throw new Error();
		this.lines.unshift(lstr);
		return this;
	},

	append: function(ls) {
		if (!(ls instanceof Lines)) throw new Error('Expected Lines, got ' + ls);
		this.lines = this.lines.concat(ls.lines);
		return this;
	},

	firstLine: function() {
		var i = this.firstNonIndent();

		return false === i ?
			false :
			this.lines[i].line;
	},

	lastLine: function() {
		var i = this.lastNonIndent();

		return false === i ?
			false :
			this.lines[i].line;
	},

	toString: function() {
		var
			res = '',
			indent = 0,
			line = 0,
			lstr, i, len;

		for (i in this.lines) if (this.lines.hasOwnProperty(i)) {
			lstr = this.lines[i];

			if (lstr.isIndent()) {
				indent += lstr.indent;

			// add empty lines to bring us up to current line
			} else {
				if (line < lstr.line) {
					while (line < lstr.line) {
						res += '\n';
						line++;
					}

					res += repeat('  ', indent);
				}

				res += lstr.str;
			}
		}

		return res;
	}
});

Lines.join = function(liness, text) {
	var
		lines = liness[0],
		i = 1, // skip first Lines object
		len = liness.length;

	for (; i < len; i++) {
		lines.suffix(text);
		lines.append(liness[i]);
	}

	return lines;
}

Lines.merge = function(liness) {
	return Lines.join(liness, '');
};

Lines.mapNodes = function(xs) {
	return $.map(xs, function(x) {
		return x.lines();
	});
};

Lines.bindNodes = function(xs) {
	return new Lines(list_bind(xs, function(x) {
		return x.lines().lines;
	}));
};

var_string = function(node) {
	var vars = vars_defined(node);

	return vars.length ?
		'var ' + vars.join(',') + ';' :
		'';
};

can_define_vars = function(node) {
	return !(node instanceof Code);
}

can_update_vars = function(node) {
	return true;
}

vars_defined = function(node, in_scope) {
	var defined;

	if (! node.vars_defined) {
		if (node instanceof Assign && node.op === '=') {
			defined = [node.baseName()];
		} else if (node instanceof Var) {
			defined = $.map(node.names, function(n) { return n.value; });
		} else if (node instanceof Array) {
			defined = $.uniq(list_bind(node, function(n) {
				return vars_defined(n);
			}));
		} else if (can_define_vars(node) && node.children) {
			defined = vars_defined(node.children());
		} else {
			defined = [];
		}

		// remove "this" from list; it is the only variable that cannot be defined
		node.vars_defined = $.without(defined, 'this');
	}

	return node.vars_defined;
}

check_updated_vars = function(node, inner_scope, outer_scope) {
	if (! node) return [];

	var updated;

	if (! node.vars_updated) {
		if (null === inner_scope) {
			inner_scope = vars_defined(node);
		}

		if (node instanceof Assign) {
			var
				v = node.baseName(),
				outer = H.has(outer_scope, v),
				inner = H.has(inner_scope, v),
				updating = node.op === ':=',
				defining = node.op === '='
				;

			if (outer) {
				if (defining) {
					console.log('Warning: variable ' + v + ' shadowing variable in outer scope. ' +
						'Use := to update variables in the outer scope.');

					updated = [];
				} else if (! updating) {
					H.throwSyntaxError('Illegal "' + v + ' ' + node.op + '": Use ":=" to update variables in outer scope');
				} else {
					updated = [v];
				}
			} else if (updating) {
				H.throwSyntaxError('Cannot update variable that is not in outer scope: ' + v);
			} else if (! defining && ! inner) {
				H.throwSyntaxError('Undefined variable: ' + v);
			} else {
				updated = [];
			}

			// Code may contain assignments
			check_updated_vars(node.value, inner_scope, outer_scope);

		} else if (node instanceof Array) {

			updated = list_bind(node, function(n) {
				return check_updated_vars(n, inner_scope, outer_scope);
			});

		// check scope in functions
		} else if (node instanceof Code) {
			// add current scope variables
			check_updated_vars(node.block, null, outer_scope.concat(inner_scope));

			// the Code node is responsible for checking itself;
			// wrt the closing scope, it can be ignored
			updated = [];
		} else if (can_update_vars(node) && node.children) {
			updated = check_updated_vars(node.children(), inner_scope, outer_scope);
		} else {
			updated = [];
		}

		node.vars_updated = $.uniq(updated);
	}

	return node.vars_updated;
}

function LOC() {}

function Arr(xs, yylineno) {
	this.xs = xs;
	this.line = yylineno;
}
$.extend(Arr.prototype, {
	is_expression: true,
	children: function() {
		return [];
	},
	toString: function() {
		return '[' + to_list(this.xs) + ']';
	},

	lines: function() {
		return Lines.join(Lines.mapNodes(this.xs), ',')
			.prefix('[')
			.suffix(']');
	}
});


Block = function(nodes) {
	this.nodes = nodes;
}

Block.wrap = function(nodes) {
	if (nodes.length === 1 && nodes[0] instanceof Block) {
		return nodes[0];
	}
	return new Block(nodes);
};
Block.indent = -1;

$.extend(Block.prototype, {
	push: function(nodes) {
		this.nodes.push(nodes);
		return this;
	},

	children: function() {
		return this.nodes;
	},

	toString: function(line) {
		Block.indent++;
		var brace_indent = repeat('  ', Block.indent - 1);
		var line_indent = Block.indent > 0 ? (brace_indent + '  ') : '';

		var str = '';
		if (Block.indent === 0) {
			str = var_string(this);
		}

		for (var i = 0, len = this.nodes.length; i < len; i++) {
			str += line_indent +
				this.nodes[i].toString() + (this.nodes[i].needsSemicolon ? ';' : '') +
				'\n';
		}

		str = '\n' + str;

		Block.indent--;
		return str;
	},

	lines: function() {
		Block.indent++;

		var ls = new Lines([]);

		if (Block.indent > 0) {
			ls.push( indent(1) );
		}

		for (var i = 0, len = this.nodes.length; i < len; i++) {
			ls.append(this.nodes[i].lines())
				.suffix(this.nodes[i].needsSemicolon ? ';' : '');
		}

		if (Block.indent > 0) {
			ls.push( indent(-1) );
		} else {
			// FIXME: this is here because it can't be at the top; we need content
			// with a line number first
			ls.prefix(var_string(this));
		}

		Block.indent--;

		return ls;
	},

	/**
	 * @param existing array List of variables in the outside scope
	 */
	resolveVars: function(existing) {
		var defined = vars_defined(this);
		return defined;
	},

	returnify: function() {
		var last = H.last(this.nodes);

		if (last && last.is_expression) {
			if (last.returnify) {
				last.returnify();
			} else {
				this.nodes.pop();
				this.nodes.push(new Return(last));
			}
		}

		return this;
	},

	assignify: function(assignee, op) {
		var last = H.last(this.nodes);

		if (last && last.is_expression) {
			if (last.assignify) {
				last.assignify(assignee, op);
			} else {
				this.nodes.pop();
				this.nodes.push(new Assign(assignee, op, last));
			}
		} else {
			// if no expression, then assign undefined
			this.nodes.push(new Assign(assignee, op, new Undefined()));
		}

		return this;
	},

	checkScope: function(top_scope) {
		return check_updated_vars(this, null, top_scope);
	}

});

function Literal(value, yylineno) {
	this.value = value;
	this.line = yylineno;
}
$.extend(Literal.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() {
		return this.value;
	},

	children: function() {
		return [];
	},
	lines: function() {
		return new Lines([line(this.value, this.line)]);
	}
});

function Identifier(value, yylineno) {
	this.value = value;
	this.line = yylineno;
}
$.extend(Identifier.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() {
		return this.value;
	},
	children: function() {
		return [];
	},
	lines: function() {
		return new Lines([line(this.value, this.line)]);
	}
});

Undefined = function(line) {
	this.line = line;
}
$.extend(Undefined.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() {
		return 'void 0';
	},
	children: function() {
		return [];
	},
	lines: function() {
		return new Lines([line(this.value, this.line)]);
	}
});

function Null(line) {
	this.line = line;
}
$.extend(Null.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() { return 'null'; },
	children: function() {
		return [];
	},
	lines: function() {
		return new Lines([line(this.value, this.line)]);
	}
});

function Bool(val, line) {
	this.val = val;
	this.line = line;
}
$.extend(Bool.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() {
		return this.val ? 'true' : 'false';
	},
	children: function() {
		return [];
	},
	lines: function() {
		return new Lines([line(this.value, this.line)]);
	}

});

function Operation(op, a, b) {
	this.op = op;
	this.a = a;
	this.b = b;
}
$.extend(Operation.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() {
		return this.a.toString() + ' ' + this.op.toString() + ' ' + this.b.toString();
	},
	children: function() {
		return [this.a, this.b];
	},
	lines: function() {
		return this.a.lines()
			.suffix(this.op.toString())
			.append(this.b.lines());
	}

});

function FuncCall(factors) {
	this.factors = factors;
}
$.extend(FuncCall.prototype, {
	is_expression: true,
	needsSemicolon: true,
	prependFactor: function(arg) {
		this.factors.unshift(arg);

		return this;
	},
	appendFactor: function(arg) {
		this.factors.push(arg);

		return this;
	},
	toString: function() {
		return this.factors[0].toString() + in_parens(this.factors.slice(1));
	},
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

});
FuncCall.fromChain = function(call_or_factor, chain) {
	var
		base = call_or_factor,
		accessor, link;

	for (var i in chain) if (chain.hasOwnProperty(i)) {
		link = chain[i];

		if (link instanceof FuncCall) {
			base = new Value(base, [new Access(link.factors[0])]);
			// replace incorrect callable at beginning of link with correct one
			link.factors[0] = base;
			base = new FuncCall(link.factors);
		} else {
			base = base.addProperty(new Access(link));
		}
	}

	return base;
}


function Assign(assignee, op, value) {
	if (!assignee || !op) throw new Error('new Assign() requires 3 arguments');
	this.assignee = assignee;
	this.op = op;
	this.value = value;
}
Assign.create = function(assignee, op, value) {
	if (value && value.assignify) {
		return value.assignify(assignee, op);
	} else {
		return new Assign(assignee, op, value);
	}
}

$.extend(Assign.prototype, {
	needsSemicolon: true,
	toString: function() {
		return this.assignee.toString() + ' ' + (
				this.op === ':=' ? '=' : this.op
			) + (
				this.value ? ' ' + this.value.toString() : ''
			);
	},
	children: function() {
		return [];
	},
	// get name of the variable being assigned to or modified,
	// ignoring object property references and array indices
	baseName: function() {
		if (this.assignee.properties) {
			return this.assignee.base.toString();
		} else {
			return this.assignee.toString();
		}
	},

	lines: function() {
		var ls = this.assignee.lines()
			.suffix(' ' + (this.op === ':=' ? '=' : this.op));

		if (this.value) {
			ls.suffix(' ')
				.append(this.value.lines());
		}

		return ls;
	}
});

function AssignList(assigns) {
	this.assigns = assigns;
}

$.extend(AssignList.prototype, {
	needsSemicolon: true,
	children: function() {
		return this.assigns;
	},
	add: function(assign) {
		this.assigns.push(assign);
		return this;
	},

	toString: function() {
		return to_list(this.assigns);
	},

	lines: function() {
		return Lines.join(Lines.mapNodes(this.assigns), ',');
	}
});


function Obj(props) {
	this.props = props;
}
$.extend(Obj.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() {
		var strs = [];
		for (var i = 0, len = this.props.length; i < len; i++) {
			strs.push(this.props[i][0].toString() + ': ' + this.props[i][1].toString());
		}

		return '{ ' + to_list(strs) + '}';
	},
	children: function() {
		return this.props;
	},

	lines: function() {
		var liness = [];

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
});

Return = function(expr) {
	this.expression = expr;
};
$.extend(Return.prototype, {
	needsSemicolon: true,
	children: function() {
		return [this.expression];
	},

	toString: function() {
		return 'return ' + this.expression.toString();
	},
	lines: function() {
		return this.expression.lines().prefix('return ');
	}
});

Code = function(params, block) {
	this.params = params;
	this.block = block;
	this.block.returnify();

	vars_defined(block);
}

$.extend(Code.prototype, {
	is_expression: true,
	needsSemicolon: true,
	children: function() {
		return [this.params, this.block];
	},

	toString: function() {
		return 'function' + in_parens(this.params) + ' { ' + var_string(this.block) +
			this.block.toString() + '}';
	},

	lines: function() {
		return Lines.join(Lines.mapNodes(this.params), ',')
			.prefix('function (')
			.suffix(') { ')
			.suffix(var_string(this.block))
			.append(this.block.lines())
			.suffix('}');
	}

});

function Value(base, props) {
	if (!props && base instanceof Value) {
		return base;
	}
	this.base = base;
	this.properties = props || [];

	return this;
}

$.extend(Value.prototype, {
	is_expression: true,
	needsSemicolon: true,
	children: function() {
		return [this.base, this.properties];
	},

	add: function(props) {
		this.properties = this.properties.concat(props);
		return this;
	},

	toString: function() {
		return this.base + concat(this.properties);
	},

	lines: function() {
		return this.base.lines()
			.append(Lines.bindNodes(this.properties));
	},

	hasProperties: function() {
		return !!this.properties.length;
	},

	isArray: function() {
		return !this.properties.length && this.base instanceof Arr;
	},

	isComplex: function() {
		return this.hasProperties() || this.base.isComplex();
	},

	isAssignable: function() {
		return this.hasProperties() || this.base.isAssignable();
	},

	isAtomic: function() {
		var node, _i, _len, _ref2;
		_ref2 = this.properties.concat(this.base);
		for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
			node = _ref2[_i];
		}
		return true;
	},

	isStatement: function(o) {
		return !this.properties.length && this.base.isStatement(o);
	},

	assigns: function(name) {
		return !this.properties.length && this.base.assigns(name);
	},

	jumps: function(o) {
		return !this.properties.length && this.base.jumps(o);
	},

	isObject: function(onlyGenerated) {
		if (this.properties.length) {
			return false;
		}
		return (this.base instanceof Obj) && (!onlyGenerated || this.base.generated);
	},

	unwrap: function() {
		if (this.properties.length) {
			return this;
		} else {
			return this.base;
		}
	}
});


Access = function(member) {
	this.member = member;
}

$.extend(Access.prototype, {
	toString: function() {
		return '.' + this.member.toString();
	},
	children: function() {
		return [this.member];
	},

	lines: function() {
		return new Lines([line(this.toString(), this.member.line)]);
	}

});

function Index(expr) {
	this.expr = expr;
}
$.extend(Index.prototype, {
	toString: function() {
		return '[' + this.expr.toString() + ']';
	},
	children: function() {
		return [this.expr];
	},

	lines: function() {
		return this.expr.lines().prefix('[').suffix(']');
	}
});

function Try(block, caught, catchBlock, finallyBlock) {
	this.block = block;
	this.caught = caught;
	this.catchBlock = catchBlock;
	this.finallyBlock = finallyBlock;
}

$.extend(Try.prototype, {
	toString: function() {
		var str = 'try {' + this.block.toString() + '}';
		if (this.caught) {
			str += ' catch(' + this.caught.toString() + ') {' + this.catchBlock.toString() + '}';
		}
		if (this.finallyBlock) {
			str += ' finally {' + this.finallyBlock.toString() + '}';
		}

		return str;
	},
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
});


function Throw(expr) {
	this.expr = expr;
}

$.extend(Throw.prototype, {
	toString: function() {
		return 'throw ' + this.expr.toString();
	},
	children: function() {
		return [];
	},
	lines: function() {
		return this.expr.lines().prefix('throw ');
	}
});

function While(cond, block, is_do) {
	this.cond = cond;
	this.block = block;
	this.is_do = is_do;
}

$.extend(While.prototype, {
	toString: function() {
		return 'while (' + this.cond.toString() + ') {' + this.block.toString() + '}';
	},
	children: function() {
		return [this.cond, this.block];
	},
	lines: function() {
		var ls = this.block.lines();

		if (this.is_do) {
			ls.prefix('do {')
				.suffix('} while (')
				.append(this.cond.lines())
				.suffix(')');
		} else {
			ls.prefix('while (')
				.append(this.cond.lines())
				.suffix('}');
		}

		return ls;
	}
});

function For(loop, block) {
	this.loop = loop;
	this.block = block;
}
$.extend(For.prototype, {
	setBlock: function(block) {
		this.block = block;
		return this;
	},
	children: function() {
		var children = [];
		for (var x in this.loop) if (this.loop.hasOwnProperty(x)) {
			children.push(this.loop[x]);
		}
		children.push(this.block);

		return children;
	},

	toString: function() {
		var
			blk = ' {' + this.block.toString(true) + '}',
			str;

		if (this.loop.in) {
			str = 'var _obj; for (' + this.loop.id + ' in (_obj=' + this.loop.obj.toString() + '))';

			if (this.loop.own) {
				str += '{ if (_obj.hasOwnProperty(' + this.loop.id + '))' +
					blk + '}';
			} else {
				str += blk;
			}
		} else {
			str = 'for (' +
				this.loop.init.toString() + '; ' +
				this.loop.check.toString() + '; ' +
				this.loop.step.toString() + ')' + blk;
		}

		return str;
	},

	lines: function() {
		var
			blk = this.block.lines(),
			ls;

		if (this.loop.in) {
			ls = this.loop.obj.lines()
				.prefix('var _obj; for (' + this.loop.id + ' in (_obj=')
				.suffix('))');

			if (this.loop.own) {
				ls.suffix('{ if (_obj.hasOwnProperty(' + this.loop.id + ')) {')
					.append(blk)
					.suffix('}');
			} else {
				ls.append(blk)
			}
		} else {
			ls = this.loop.init.lines()
				.prefix('for (')
				.suffix('; ')
				.append(this.loop.check.lines())
				.suffix('; ')
				.append(this.loop.step.lines())
				.suffix(') {')
				.append(blk)
				.suffix('}');
		}

		return ls;
	}
});

Switch = function Switch(expr, cases, deflt) {
	this.expr = expr;
	this.cases = cases;
	this.deflt = deflt;
}

$.extend(Switch.prototype, {
	toString: function() {
		var str = 'switch (' + this.expr + ') {\n';

		for (var i = 0, len = this.cases.length; i < len; i++) {
			str += 'case ' + to_list(this.cases[i][0]) + ':' +
				this.cases[i][1].toString();
		}

		return str + '}';
	},
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
	},
	returnify: function() {
		for (var i = 0, len = this.cases.length; i < len; i++) {
			this.cases[i].returnify();
		}
		if (this.deflt) {
			this.deflt.returnify();
		}

		return this;
	},
	assignify: function(assignee, op) {
		for (var i = 0, len = this.cases.length; i < len; i++) {
			this.cases[i].assignify(assignee, op);
		}
		if (this.deflt) {
			this.deflt.assignify(assignee, op);
		}

		return this;
	}

});

Case = function Case(vals, blk) {
	this.vals = vals;
	this.blk = blk;
}
$.extend(Case.prototype, {
	returnify: function() {
		this.blk.returnify();
		return this;
	},
	assignify: function(assignee, op) {
		this.blk.assignify(assignee, op);
		return this;
	},
	lines: function() {
		return Lines.join(Lines.mapNodes(this.vals), ',')
			.prefix('case ')
			.suffix(':')
			.append(this.blk.lines())
			.suffix('break;')
			;
	}
});

Break = function Break(yylineno) {
	this.line = yylineno;
};
$.extend(Break.prototype, {
	is_expression: false,
	needsSemicolon: true,
	toString: function() { return 'break;\n' },
	lines: function() {
		return line('break', this.line);
	}
});

function If(cond, block) {
	this.condition = cond;
	this.block = block;
	this.elses = [];
}
$.extend(If.prototype, {
	is_expression: true,
	addElse: function(if_or_block) {
		this.elses.push(if_or_block);
		return this;
	},
	toString: function() {
		var str = 'if (' + this.condition.toString() + ') {' + this.block.toString() + '}';
		var else_text;
		for (var i = 0, len = this.elses.length; i < len; i++) {
			else_text = this.elses[i].toString();

			// don't put a brace between else and if
			if (this.elses[i] instanceof If) {
				else_text = ' else ' + else_text;
			} else {
				else_text = ' else {' + else_text + '}';
			}

			str += else_text
		}

		return str;
	},
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
			if (H.last(this.elses) instanceof If) {
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
	},
	returnify: function() {
		this.block.returnify();
		for (var i = 0, len = this.elses.length; i < len; i++) {
			this.elses[i].returnify();
		}

		return this;
	},
	assignify: function(assignee, op) {
		this.block.assignify(assignee, op);
		for (var i = 0, len = this.elses.length; i < len; i++) {
			this.elses[i].assignify(assignee, op);
		}

		return this;
	}
});


function Unary(op, term) {
	this.op = op;
	this.term = term;
}
$.extend(Unary.prototype, {
	is_expression: true,
	needsSemicolon: true,

	setTerm: function(term) {
		this.term = term;
		return this;
	},
	toString: function() {
		return this.op + ' ' + this.term.toString();
	},
	children: function() {
		return this.term;
	},
	lines: function() {
		return this.term.lines().prefix(this.op + ' ');
	}

});

Var = function Var(names) {
	this.names = names;
}

$.extend(Var.prototype, {
	is_expression: false,
	needsSemicolon: true,

	add: function(name) {
		this.names.push(name);
		return this;
	},
	// no output
	toString: function() {
		return '';
	},
	children: function() {
		return this.term;
	},
	lines: function() {
		return new Lines([]);
	}
});


module.exports = {
	LOC: LOC,
	Obj: Obj,
	Block: Block,
	Assign: Assign,
	AssignList: AssignList,
	Operation: Operation,
	Code: Code,
	Access: Access,
	Index: Index,
	Arr: Arr,
	Try: Try,
	Throw: Throw,
	While: While,
	Switch: Switch,
	If: If,
	For: For,
	Literal: Literal,
	Identifier: Identifier,
	Null: Null,
	Undefined: Undefined,
	Value: Value,
	Bool: Bool,
	Return: Return,
	FuncCall: FuncCall,
	Unary: Unary,
	Var: Var,
	Case: Case,

	// for testing
	vars_defined: vars_defined
};
