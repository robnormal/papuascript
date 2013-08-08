var $ = require('underscore');
var H = require('./helpers');
var Block, AssignList, Try, While, For, If, Switch, Assign;

var concat = function(xs) {
	var str = '';
	for (var i = 0, len = xs.length; i < len; i++) {
		str += xs[i].toString();
	}

	return str;
};

var to_list = function(xs) {
	var strs = [];
	for (var i = 0, len = xs.length; i < len; i++) {
		strs.push(xs[i].toString());
	}

	return strs.join(', ');
};

var in_parens = function(xs) {
	return '(' + to_list(xs) + ')';
};

var repeat = function(str, n) {
	var res = '';
	for(var i = 0; i < n; i++) {
		res += str;
	}

	return res;
};

var can_define_vars = function(node) {
	// Code cannot define vars for enclosing scope
	return node instanceof AssignList ||
		node instanceof Block ||
		node instanceof If ||
		node instanceof For ||
		node instanceof While ||
		node instanceof Switch ||
		node instanceof Try;
}

var vars_defined = function(node) {
	// := does not define a new variable
	if (node instanceof Assign &&
		node.op !== ':=' &&
		(! node.assignee.properties || 0 === node.assignee.properties.length)
	) {
		return [node.assignee.toString()];
	} else if (node instanceof Array) {
		var defined = [];

		for (var i = 0, len = node.length; i < len; i++) {
			defined = defined.concat(vars_defined(node[i]));
		}

		return $.uniq(defined);
	} else if (can_define_vars(node) && node.children) {
		return vars_defined(node.children());
	} else {
		return [];
	}
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

	toString: function(braces) {
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

		if (braces) {
			str = brace_indent + ' {\n' + str + '\n' + brace_indent + '}';
		} else {
			str = '\n' + str;
		}

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

function Undefined() { }
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
	}

});


function Assign(assignee, op, value) {
	this.assignee = assignee;
	this.value = value;
	this.op = op;
}

$.extend(Assign.prototype, {
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

function Return(expr) {
	this.expression = expr;
}
$.extend(Return.prototype, {
	needsSemicolon: true,
	children: function() {
		return [this.expression];
	},

	toString: function() {
		return 'return ' + this.expression.toString();
	}
});

var var_string = function(node) {
	var vars = vars_defined(node);

	return vars.length ? 'var ' + vars.join(',') + ';\n' : '';
};

function Code(params, block) {
	this.params = params;
	this.block = block;
	this.block.returnify();
}

$.extend(Code.prototype, {
	is_expression: true,
	needsSemicolon: true,
	children: function() {
		return [this.params, this.block];
	},

	toString: function() {
		return 'function' + in_parens(this.params) + ' { ' + var_string(this) +
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


function Access(member) {
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
		return 'while (' + this.cond.toString() + ') ' + this.block.toString(true);
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
			blk = this.block.toString(true),
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

	// FIXME: this is a hack; 'break' is not a valid identifier
	if (this.cases) {
		for (var i = 0, len = this.cases.length; i < len; i++) {
			this.cases[i][1].push(new Identifier('break'));
		}
	}
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
	children: function() {
		return [this.expr, this.cases, this.deflt];
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
			if (else_text instanceof If) {
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
	FuncCall: FuncCall
};
