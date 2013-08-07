var $ = require('underscore');

var to_list = function(xs) {
	return xs.join(', ');
}

var objs_to_list = function(xs) {
	var strs = [];
	for (var i = 0, len = xs.length; i < len; i++) {
		strs.push(xs[i].toString());
	}

	return to_list(strs);
}

var in_parens = function(xs) {
	return '(' + to_list(xs) + ')';
}

function LOC() {}

function Arr(xs) {
	this.xs = xs;
}
$.extend(Arr.prototype, {
	toString: function() {
		return '[' + to_list(this.xs) + ']';
	}
});


function Block(nodes) {
	this.nodes = nodes;
}

Block.wrap = function(nodes) {
	if (nodes.length === 1 && nodes[0] instanceof Block) {
		return nodes[0];
	}
	return new Block(nodes);
};

$.extend(Block.prototype, {
	push: function(nodes) {
		this.nodes.push(nodes);
		return this;
	},
	toString: function() {
		var str = '';
		for (var i = 0, len = this.nodes.length; i < len; i++) {
			str += this.nodes[i].toString() + '\n';
		}

		return str;
	}
});

function Literal(value) {
	this.value = value;
}
$.extend(Literal.prototype, {
	toString: function() {
		return ' "' + this.value + '"';
	}
});

function Undefined() { }
Undefined.prototype.isAssignable = false;
Undefined.prototype.isComplex = false;

function Null() { }
Null.prototype.isAssignable = false;
Null.prototype.isComplex = false;

function Bool(val) {
	this.val = val;
}

function Operation(op, a, b) {
	this.op = op;
	this.a = a;
	this.b = b;
}
$.extend(Operation.prototype, {
	toString: function() {
		return this.a.toString() + ' ' + this.op.toString() + ' ' + this.b.toString();
	}
});

function FuncCall(name, args) {
	this.name = name;
	this.args = args;
}
$.extend(FuncCall.prototype, {
	addArg: function(arg) {
		this.args.push(arg);

		return this;
	},
	toString: function() {
		return this.name + in_parens(this.args);
	}
});


function Assign(assignee, op, value) {
	this.assignee = assignee;
	this.value = value;
	this.op = op;
}

$.extend(Assign.prototype, {
	toString: function() {
		var str = this.assignee.toString() + this.op;
		if (this.value) str += this.value.toString();

		return str;
	}
});

function Obj(props) {
	this.props = props;
}
$.extend(Obj.prototype, {
	toString: function() {
		var strs = [];
		for (var i = 0, len = this.props.length; i < len; i++) {
			strs.push(this.props[i][0].toString() + ': ' + this.props[i][1].toString());
		}

		return '{ ' + to_list(strs) + '}';
	}
});

function Return(expr) {
	if (expr && !expr.unwrap().isUndefined) {
		this.expression = expr;
	}
}
$.extend(Return.prototype, {
	children: ['expression'],
	isStatement: true,
	toString: function() {
		return 'return ' + this.expression.toString();
	}
});

function Code(params, block) {
	this.params = params;
	this.block = block;
}
$.extend(Code.prototype, {
	toString: function() {
		return 'function' + in_parens(this.params) + ' {' + this.block.toString() + '}';
	}
});

function Value(base, props, tag) {
	if (!props && base instanceof Value) {
		return base;
	}
	this.base = base;
	this.properties = props || [];
	if (tag) {
		this[tag] = true;
	}
	return this;
}

$.extend(Value.prototype, {
	children: ['base', 'properties'],
	add: function(props) {
		this.properties = this.properties.concat(props);
		return this;
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
		return '.' + this.member;
	}
});

function Index(i) {
	this.i = i;
}
$.extend(Index.prototype, {
	toString: function() {
		return '[' + this.i + ']';
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
		var str = 'try ' + this.block.toString();
		if (this.caught) {
			str += 'catch(' + this.caught.toString() + ')' + this.catchBlock.toString();
		}
		if (this.finallyBlock) {
			str += 'finally ' + this.finallyBlock.toString();
		}

		return str;
	}
});


function Throw(expr) {
	this.expr = expr;
}

$.extend(Throw.prototype, {
	toString: function() {
		return 'throw ' + this.expr.toString();
	}
});

function While(cond, block) {
	this.cond = cond;
	this.block = block;
}

$.extend(While.prototype, {
	toString: function() {
		return 'while (' + this.cond.toString() + ') ' + this.block.toString();
	}
});

function For(loop) {
	this.loop = loop;
}
$.extend(For.prototype, {
	setBlock: function(block) {
		this.block = block;
		return this;
	},

	toString: function() {
		var blk = this.block.toString(), str;

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

function Switch(expr, cases, deflt) {
	this.expr = expr;
	this.cases = cases;
	this.deflt = deflt;
}

$.extend(Switch.prototype, {
	toString: function() {
		var str = 'switch (' + this.expr + ') {\n';
		for (var i = 0, len = this.cases.length; i < len; i++) {
			str += 'case ' + objs_to_list(this.cases[i][0]) + ':' +
				this.cases[i][1].toString() + 'break;'
		}

		return str + '}';
	}
});

function If(cond, block) {
	this.condition = cond;
	this.block = block;
	this.elses = [];
}
$.extend(If.prototype, {
	addElse: function(if_or_block) {
		this.elses.push(if_or_block);
		return this;
	},
	toString: function() {
		var str = 'if (' + this.condition.toString() + ')' + this.block.toString();
		for (var i = 0, len = this.elses; i < len; i++) {
			str += 'else ' + this.elses[i].toString();
		}

		return str;
	}
});

module.exports = {
	LOC: LOC,
	Obj: Obj,
	Block: Block,
	Assign: Assign,
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
	Null: Null,
	Undefined: Undefined,
	Value: Value,
	Bool: Bool,
	Return: Return,
	FuncCall: FuncCall
};
