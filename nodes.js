var $ = require('underscore');
var H = require('./helpers');
var Block, AssignList, Try, While, For, If, Switch, Assign, Undefined, Return,
	Code, Access;
var vars_defined, concat, to_list, in_parens, repeat, var_string, can_define_vars, can_update_vars;

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

var_string = function(node) {
	var vars = vars_defined(node);

	return vars.length ? 'var ' + vars.join(',') + ';\n' : '';
};

can_define_vars = function(node) {
	// Code cannot define vars for enclosing scope
	return node instanceof AssignList ||
		node instanceof Var ||
		node instanceof Block ||
		node instanceof If ||
		node instanceof For ||
		node instanceof While ||
		node instanceof Switch ||
		node instanceof Try;
}

can_update_vars = function(node) {
	// Code cannot define vars for enclosing scope
	return node instanceof AssignList ||
		node instanceof Block ||
		node instanceof If ||
		node instanceof For ||
		node instanceof While ||
		node instanceof Switch ||
		node instanceof Try;
}

vars_defined = function(node, in_scope) {
	if (! node.vars_defined) {
		if (node instanceof Assign && node.op === '=') {
			var v;
			if (node.assignee.properties) {
				v = node.assignee.base.toString();
			} else {
				v = node.assignee.toString();
			}

			if (v === 'this') {
				node.vars_defined = [];
			} else {
				node.vars_defined = [v];
			}
		} else if (node instanceof Var) {
			node.vars_defined = $.map(node.names, function(n) { return n.value; });
		} else if (node instanceof Array) {
			var defined = [];

			for (var i = 0, len = node.length; i < len; i++) {
				defined = defined.concat(vars_defined(node[i]));
			}

			node.vars_defined = $.uniq(defined);
		} else if (can_define_vars(node) && node.children) {
			node.vars_defined = vars_defined(node.children());
		} else {
			node.vars_defined = [];
		}
	}

	return node.vars_defined;
}

var check_updated_vars = function(node, in_scope, outer_scope) {
	if (null === in_scope) {
		in_scope = vars_defined(node);
	}

	if (node instanceof Assign) {
		var v = node.assignee.toString();

		if (node.op === ':=') {
			if (H.has(outer_scope, v)) {
				node.vars_updated = [v];
			} else {
				H.throwSyntaxError('Updated variable undefined: ' + v);
			}
		} else if (! H.has(in_scope, v)) {
			H.throwSyntaxError('Modifying undefined variable: ' + v);
		} else if ('=' === node.op && H.has(outer_scope, v)) {
			console.log('Warning: variable ' + v + ' shadowing variable of same name. ' +
				'Use := to update variables in the containing scope.');

			node.vars_updated = [];
		}
	} else if (node instanceof Array) {
		node.vars_updated = [];

		for (var i = 0, len = node.length; i < len; i++) {
			node.vars_updated = node.vars_updated.concat(
				check_updated_vars(node[i], in_scope, outer_scope)
			);
		}
	} else if (can_update_vars(node) && node.children) {
		node.vars_updated = check_updated_vars(node.children(), in_scope, outer_scope);
	// check scope in functions
	} else if (node instanceof Code) {
		// add current scope variables
		check_updated_vars(node.block, null, outer_scope.concat(in_scope));
	} else {
		node.vars_updated = [];
	}

	return node.vars_updated;
}

function LOC() {}

function Arr(xs) {
	this.xs = xs;
}
$.extend(Arr.prototype, {
	is_expression: true,
	children: function() {
		return [];
	},
	toString: function() {
		return '[' + to_list(this.xs) + ']';
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

	toString: function() {
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

	/**
	 * @param existing array List of variables in the outside scope
	 */
	resolveVars: function(existing) {
		var defined = vars_defined(this);
		return defined;
	},

	returnify: function() {
		var last = H.last(this.nodes);

		if (last.is_expression) {
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

		if (last.is_expression) {
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

	checkScope: function(in_scope) {
		return check_updated_vars(this, null, in_scope);
	}

});

function Literal(value) {
	this.value = value;
}
$.extend(Literal.prototype, {
	is_expression: true,
	toString: function() {
		return this.value;
	},

	children: function() {
		return [];
	}
});

function Identifier(value) {
	this.value = value;
}
$.extend(Identifier.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() {
		return this.value;
	},
	children: function() {
		return [];
	}
});

Undefined = function() { }
$.extend(Undefined.prototype, {
	is_expression: true,
	toString: function() { return 'undefined'; },
	children: function() {
		return [];
	}
});

function Null() { }
$.extend(Null.prototype, {
	is_expression: true,
	toString: function() { return 'null'; },
	children: function() {
		return [];
	}
});

function Bool(val) {
	this.val = val;
}
$.extend(Bool.prototype, {
	is_expression: true,
	toString: function() {
		return this.val ? 'true' : 'false';
	},
	children: function() {
		return [];
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
	}
});

// a FuncCall can have properties, as in getDB(name, passwd).address
function FuncCall(factors, props) {
	this.factors = factors;
	this.properties = props || [];
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
		var str = this.factors[0].toString() + in_parens(this.factors.slice(1));

		for (var i in this.properties) if (this.properties.hasOwnProperty(i)) {
			str += this.properties[i].toString();
		}

		return str;
	},
	children: function() {
		return this.factors;
	},
	addProperty: function(prop) {
		this.properties.push(prop);
		return this;
	}
});
FuncCall.fromChain = function(call_or_factor, chain) {
	var
		base = call_or_factor,
		accessor, link;

	console.log(chain.length);
	for (var i in chain) if (chain.hasOwnProperty(i)) {
		link = chain[i];

		if (link instanceof FuncCall) {
			link.factors[0] = base.addProperty(new Access(link.factors[0]));
			base = link;
		} else {
			base = base.addProperty(new Access(link));
		}
	}

	return base;
}


function Assign(assignee, op, value) {
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
		var str = this.assignee.toString() + ' ' + this.op;
		if (this.value) str += ' ' + this.value.toString();

		return str;
	},
	children: function() {
		return [];
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
	}
});


function Obj(props) {
	this.props = props;
}
$.extend(Obj.prototype, {
	is_expression: true,
	toString: function() {
		var strs = [];
		for (var i = 0, len = this.props.length; i < len; i++) {
			strs.push(this.props[i][0].toString() + ': ' + this.props[i][1].toString());
		}

		return '{ ' + to_list(strs) + '}';
	},
	children: function() {
		return this.props;
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
		return [this.block, this.caught, this.catchBlock, this.finallyBlock];
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
	}
});

function While(cond, block) {
	this.cond = cond;
	this.block = block;
}

$.extend(While.prototype, {
	toString: function() {
		return 'while (' + this.cond.toString() + ') {' + this.block.toString() + '}';
	},
	children: function() {
		return [this.cond, this.block];
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
	}
});

Switch = function(expr, cases, deflt) {
	this.expr = expr;
	this.cases = cases;
	this.deflt = deflt;
}

$.extend(Switch.prototype, {
	toString: function() {
		var str = 'switch (' + this.expr + ') {\n';

		// FIXME: this is a hack; 'break' is not a valid identifier
		for (var i = 0, len = this.cases.length; i < len; i++) {
			this.cases[i][1].push(new Identifier('break'));
		}

		for (var i = 0, len = this.cases.length; i < len; i++) {
			str += 'case ' + to_list(this.cases[i][0]) + ':' +
				this.cases[i][1].toString();
		}

		return str + '}';
	},
	children: function() {
		return [this.expr, this.cases, this.deflt];
	},
	returnify: function() {
		for (var i = 0, len = this.cases.length; i < len; i++) {
			this.cases[i][1].returnify();
		}
		if (this.deflt) {
			this.deflt.returnify();
		}

		return this;
	},
	assignify: function(assignee, op) {
		for (var i = 0, len = this.cases.length; i < len; i++) {
			this.cases[i][1].assignify(assignee, op);
		}
		if (this.deflt) {
			this.deflt.assignify(assignee, op);
		}

		return this;
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

	setTerm: function(term) {
		this.term = term;
		return this;
	},
	toString: function() {
		return this.op + ' ' + this.term.toString();
	},
	children: function() {
		return this.term;
	}

});

var Var = function(names) {
	this.names = names;
}

$.extend(Var.prototype, {
	is_expression: false,

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
	Var: Var
};
