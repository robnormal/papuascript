function LOC() {}

function Block(nodes) {
	this.nodes = nodes;
}
Block.prototype.push = function(nodes) {
	this.nodes.push(nodes);
	return this;
}

Block.wrap = function(nodes) {
	if (nodes.length === 1 && nodes[0] instanceof Block) {
		return nodes[0];
	}
	return new Block(nodes);
};

function Assign(assignee, value, op) {
	this.assignee = assignee;
	this.value = value;
	this.op = op;
}
function Operation() { this.args = arguments; }

function Code(params, body) {
	this.params = params;
	this.body = body;
}

function Obj()       { this.args = arguments; }
function Access()    { this.args = arguments; }
function Index()     { this.args = arguments; }
function Arr()       { this.args = arguments; }
function Try()       { this.args = arguments; }
function Throw()     { this.args = arguments; }
function Switch()    { this.args = arguments; }


function While(cond, block) {
	this.cond = cond;
	this.block = block;
}

function For(loop) {
	this.loop = loop;
}
For.prototype.setBlock = function(block) {
	this.block = block;
	return this;
}

function If(cond, block) {
	this.condition = cond;
	this.block = block;
}
If.prototype.addElse = function(block) {
	this.elseBlock = block;
	return this;
}

function FuncCall(name, args) {
	this.name = name;
	this.args = args;
}
FuncCall.prototype.addArg = function(arg) {
	this.args.push(arg);

	return this;
}

function Literal(value) {
	this.value = value;
}
Literal.prototype.toString = function() {
	return ' "' + this.value + '"';
};

function Undefined() { }
Undefined.prototype.isAssignable = false;
Undefined.prototype.isComplex = false;

function Null() { }
Null.prototype.isAssignable = false;
Null.prototype.isComplex = false;

function Bool(val) {
	this.val = val;
}

function Return(expr) {
	if (expr && !expr.unwrap().isUndefined) {
		this.expression = expr;
	}
}
Return.prototype.children = ['expression'];
Return.prototype.isStatement = true;

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

Value.prototype.children = ['base', 'properties'];
Value.prototype.add = function(props) {
	this.properties = this.properties.concat(props);
	return this;
};

Value.prototype.hasProperties = function() {
	return !!this.properties.length;
};

Value.prototype.isArray = function() {
	return !this.properties.length && this.base instanceof Arr;
};

Value.prototype.isComplex = function() {
	return this.hasProperties() || this.base.isComplex();
};

Value.prototype.isAssignable = function() {
	return this.hasProperties() || this.base.isAssignable();
};

Value.prototype.isAtomic = function() {
	var node, _i, _len, _ref2;
	_ref2 = this.properties.concat(this.base);
	for (_i = 0, _len = _ref2.length; _i < _len; _i++) {
		node = _ref2[_i];
	}
	return true;
};

Value.prototype.isStatement = function(o) {
	return !this.properties.length && this.base.isStatement(o);
};

Value.prototype.assigns = function(name) {
	return !this.properties.length && this.base.assigns(name);
};

Value.prototype.jumps = function(o) {
	return !this.properties.length && this.base.jumps(o);
};

Value.prototype.isObject = function(onlyGenerated) {
	if (this.properties.length) {
		return false;
	}
	return (this.base instanceof Obj) && (!onlyGenerated || this.base.generated);
};

Value.prototype.unwrap = function() {
	if (this.properties.length) {
		return this;
	} else {
		return this.base;
	}
};

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
