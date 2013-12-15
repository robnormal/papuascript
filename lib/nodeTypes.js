/*jshint indent: false */
var
	util = require('util'),
	$ = require('underscore'),
	H = require('./helpers'),
	L = require('./lines.js'),

	Identifier, Literal, Index, Arr, FuncCall, Parenthetical, Cps,
	AssignList, Try, While, For, If, Switch, Assign, Undefined, Return,
	Block, PNode, Code, Access, Var, Case, Break, Value, Import, Script,
	Ternary, Negation;

var log = console.log;

var showTree = function(n, level, name) {
	var str, i, len, x;

	if (n === void 0) {
		str = 'undefined';
	} else if (n === null) {
		str = 'null';
	} else {
		str = n.constructor ? n.constructor.name : n;
	}

	if (name) {
		str = name + ': ' + str;
	}

	str = level + str + '\n';

	if ($.isArray(n)) {
		for (i = 0, len = n.length; i < len; i++) {
			str += showTree(n[i], level + '  ');
		}
	} else if (n instanceof PNode) {
		for (x in n) if (n.hasOwnProperty(x)) {
			str += showTree(n[x], level + '  ', x);
		}
	}

	return str;
};

var insertVar;
(function() {
	var inserted = {};

	insertVar = function insertVar(name) {
		if (! inserted[name]) inserted[name] = 0;
		inserted[name]++;

		return new Identifier(name + inserted[name]);
	};
})();

PNode = function() {}
$.extend(PNode.prototype, {
	is_expression: false,
	canDefineVars: true,

	getLineno: function() {
		var children = this.children();

		if (children.length) {
			return children[0].getLineno();
		} else {
			throw new Error('getLineno() not defined for empty ' + this.constructor.name);
		}
	},

	toString: function() {
		return H.trim(this.lines().toString());
	},

	/* must put these here instead of nodeOutputs.js, so they can be inherited
	 * in this file */
	children: function() { return []; },

	lines: function() {
		return new L.Lines([]);
	},
});


Script = function Script(body, exports) {
	this.body = body;
	this.exports = exports;
};
util.inherits(Script, PNode);

Block = function Block(nodes) {
	var last = H.last(nodes);

	this.nodes = nodes;
	this.cps = (last instanceof Cps) && last;
}
util.inherits(Block, PNode);

Block.wrap = function(nodes) {
	if (nodes.length === 1 && nodes[0] instanceof Block) {
		return nodes[0];
	}
	return new Block(nodes);
};
Block.indent = -1;

$.extend(Block.prototype, {
	push: function(node) {
		if (! (node instanceof PNode)) {
			throw new Error('"' + node + '"');
		}

		if (this.cps) {
			this.cps.push(node);
		} else {
			this.nodes.push(node);

			if (node instanceof Cps) {
				this.cps = node;
			}
		}

		return this;
	},

	unshift: function(nodes) {
		this.nodes.unshift(nodes);
		return this;
	},

	merge: function(blk) {
		for (var i = 0, len = blk.nodes.length; i < len; i++) {
			this.push(blk.nodes[i]);
		}

		return this;
	},

	isEmpty: function() {
		return 0 === this.nodes.length;
	},

	returnify: function() {
		var last = H.last(this.nodes);

		if (last) {
			if (last.is_expression) {
				if (last.returnify) {
					last.returnify();
				} else {
					this.nodes.pop();
					this.nodes.push(new Return(last));
				}
			// recurse if block within a block
			} else if (last instanceof Block) {
				last.returnify();
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
	}
});


/* NOTE: inherits from Block */
IBlock = function(nodes) {
	this.nodes = nodes;
}
util.inherits(IBlock, Block);


function Assign(assignee, op, value) {
	if (!assignee || !op) throw new Error('new Assign() requires at least 2 arguments');

	this.assignee = assignee instanceof Value ?
		assignee :
		new Value(assignee);

	this.op = op instanceof Identifier ?
		op.value :
		op;

	this.value = value;
}
util.inherits(Assign, PNode);

Assign.create = function(assignee, op, value) {
	if (value instanceof Cps) {
		value = value.toFuncCall();
	}

	if (assignee instanceof Arr) {
		var
			_structured = insertVar('_structured'),
			assigns = [ Assign.create(_structured, op, value) ];

		for (var i = 0, len = assignee.xs.length; i < len; i++) {
			assigns.push(
				Assign.create(
					assignee.xs[i],
					op,
					new Value(_structured).add(new Index(new Literal(i)))
				)
			);
		}

		return new AssignList(assigns);

	} else if (assignee instanceof FuncCall) {
		var func = assignee.factors.shift();
		return new Assign(func, op, new Parenthetical(new Code(assignee.factors, value, func)));
	} else if (value.assignify) {
		return value.assignify(assignee, op);
	} else {
		return new Assign(assignee, op, value);
	}
};

Assign.createUnary = function(assignee, op) {
	return new Assign(assignee, op, null);
};

Assign.baseNamesFor = function(assignee) {
	if ($.isArray(assignee)) {
		L.list_bind(assignee, Assign.baseNamesFor);
	} else if (assignee.properties) {
		return [ assignee.base.toString() ];
	} else {
		return [ assignee.toString() ];
	}
};

$.extend(Assign.prototype, {
	// get name of the variable being assigned to or modified,
	// ignoring object property references and array indices
	baseName: function() {
		return Assign.baseNamesFor(this.assignee);
	},

	getLineno: function() {
		return this.assignee.getLineno();
	}
});

Return = function Return(expr) {
	this.expression = expr;
};
util.inherits(Return, PNode);

Code = function Code(params, block, name) {
	this.params = params;
	this.block = block;
	this.name = name;

	this.block.returnify();
}
util.inherits(Code, PNode);

Code.fromFuncAssignment = function(func_call, body) {
	var
		name = func_call.factors[0],
		params = func_call.factors.slice(1),
		block;

	// check that params are all Ids
	for (var i = 0, len = params.length; i < len; i++) {
		if (! (params[i] instanceof Identifier)) {
			throw new Error('Bad parameter in function definition');
		}
	}

	if (body instanceof Block) {
		block = body;
	} else {
		block = new Block([body]);
	}

	return new Code(params, block, name);
};

$.extend(Code.prototype, {
	is_expression: true,
	canDefineVars: false,

	setName: function(name) {
		this.name = name;
		return this;
	}
});


function Arr(xs, yylineno) {
	this.xs = xs;
	this.line = yylineno;
}
util.inherits(Arr, PNode);

$.extend(Arr.prototype, {
	is_expression: true
});

function Literal(value, yylineno) {
	this.value = value;
	this.line = yylineno;
}
util.inherits(Literal, PNode);
$.extend(Literal.prototype, {
	is_expression: true,
	getLineno: function() {
		return this.line;
	}
});

function Identifier(value, yylineno) {
	if (value instanceof Identifier) throw new Error();
	this.value = value;
	this.line = yylineno;
}
util.inherits(Identifier, PNode);

$.extend(Identifier.prototype, {
	is_expression: true,
	getLineno: function() {
		return this.line;
	}
});

Undefined = function Undefined(line) {
	this.line = line;
}
util.inherits(Undefined, PNode);

$.extend(Undefined.prototype, {
	is_expression: true,
	getLineno: function() {
		return this.line;
	}
});

function Null(line) {
	this.line = line;
}
util.inherits(Null, PNode);

$.extend(Null.prototype, {
	is_expression: true,
	getLineno: function() {
		return this.line;
	}
});

function Bool(val, line) {
	this.val = val;
	this.line = line;
}
util.inherits(Bool, PNode);

$.extend(Bool.prototype, {
	is_expression: true,
	getLineno: function() {
		return this.line;
	}
});

function Operation(op, a, b) {
	this.op = op;
	this.a = a;
	this.b = b;
}
util.inherits(Operation, PNode);

Operation.create = function(op, a, b) {
	var params = [],
		aVar, bVar, aInFunc, bInFunc;

	if ('@' === a) {
		aVar = insertVar('a');
		params.push(aVar);
		aInFunc = aVar;
	} else {
		aInFunc = a;
	}

	if ('@' === b) {
		bVar = insertVar('b');
		params.push(bVar);
		bInFunc = bVar;
	} else {
		bInFunc = b;
	}

	if (params.length) {
		return new Code(params, new Block([Operation.create(op, aInFunc, bInFunc)]));
	// this happens with infixed functions: xs `map` f
	} else if (op instanceof FuncCall) {
		return op.appendFactor(a).appendFactor(b);
	} else {
		return new Operation(op, a, b);
	}
};

$.extend(Operation.prototype, {
	is_expression: true
});

function FuncCall(factors) {
	this.factors = factors;
}
util.inherits(FuncCall, PNode);

FuncCall.create = function(factors) {
	var fs = [], params = [],
		a, i, len;

	for (i = 0, len = factors.length; i < len; i++) {
		if ('@' === factors[i]) {
			a = insertVar('a');
			params.push(a);
			fs.push(a);
		} else {
			fs.push(factors[i]);
		}
	}

	if (void 0 === a) {
		return new FuncCall(fs);
	} else {
		return new Code(params, new Block([new FuncCall(fs)]));
	}
};

$.extend(FuncCall.prototype, {
	is_expression: true,
	prependFactor: function(arg) {
		this.factors.unshift(arg);

		return this;
	},
	appendFactor: function(arg) {
		this.factors.push(arg);

		return this;
	}
});

FuncCall.addFactor = function(call_or_factor, factor) {
	if (call_or_factor instanceof FuncCall) {
		return call_or_factor.appendFactor(factor);
	} else {
		return new FuncCall([ call_or_factor, factor ]);
	}
};

function AssignList(assigns) {
	this.assigns = assigns;
}
util.inherits(AssignList, PNode);

$.extend(AssignList.prototype, {
	add: function(assign) {
		this.assigns.push(assign);
		return this;
	}
});


function Obj(props, lineno) {
	this.props = props;
	this.lineno = lineno;
}
util.inherits(Obj, PNode);
$.extend(Obj.prototype, {
	is_expression: true
});

function Value(base, props) {
	if (!props && base instanceof Value) {
		return base;
	}
	this.base = base;
	this.properties = props || [];

	return this;
}
util.inherits(Value, PNode);

$.extend(Value.prototype, {
	is_expression: true,

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
	},

	getLineno: function() {
		return this.base.getLineno();
	}
});

function Access(member) {
	this.member = member;
}
util.inherits(Access, PNode);

function Index(expr) {
	this.expr = expr;
}
util.inherits(Index, PNode);

function Try(block, caught, catchBlock, finallyBlock) {
	this.block = block;
	this.caught = caught;
	this.catchBlock = catchBlock;
	this.finallyBlock = finallyBlock;
}
util.inherits(Try, PNode);

function Throw(expr) {
	this.expr = expr;
}
util.inherits(Throw, PNode);

function While(cond, block, is_do, assignList) {
	this.cond = cond;
	this.block = block;
	this.is_do = is_do;
	this.assignList = assignList;
}
util.inherits(While, PNode);

function For(loop) {
	this.loop = loop;

	if (this.loop.id) {
		if (this.loop.id[1]) {
			this.loop.id2 = this.loop.id[1];
		}
		this.loop.id = this.loop.id[0];
	}

	var id, len, length, less, plusplus;

	this._obj = insertVar('_obj');

	if (this.loop.index) {
		len      = insertVar('_len');
		length   = new Access(new Identifier('length'));
		less     = new Identifier('<');
		plusplus = new Identifier('++');

		this.loop.init = new AssignList([
			Assign.create(this.loop.id, '=', new Literal(0)),
			Assign.create(len, '=', new Value(this._obj).add(length))
		]);

		this.loop.check = new Operation(less, this.loop.id, len);
		this.loop.step = Assign.createUnary(this.loop.id, plusplus);
	}

	if (this.loop.id2) {
		this._assign = Assign.create(this.loop.id2, '=',
			new Value(this._obj).add(new Index(this.loop.id))
		);
	}
}
util.inherits(For, PNode);

$.extend(For.prototype, {
	setBlock: function(block) {
		if (this._assign) {
			block.unshift(this._assign);
		}
		if (this.loop.own) {
			var objHasOwn = new Value(this._obj).add(
				new Access(new Identifier('hasOwnProperty'))
			);
			this.block = new Block([new If(
				new FuncCall([objHasOwn, this.loop.id]),
				block
			)]);
		} else {
			this.block = block;
		}

		return this;
	}
});

Switch = function Switch(expr, cases, deflt) {
	this.expr = expr;
	this.cases = cases;
	this.deflt = deflt;
}
util.inherits(Switch, PNode);

$.extend(Switch.prototype, {
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
util.inherits(Case, PNode);

$.extend(Case.prototype, {
	returnify: function() {
		this.blk.returnify();
		return this;
	},
	assignify: function(assignee, op) {
		this.blk.assignify(assignee, op);
		return this;
	}
});

Break = function Break(yylineno) {
	this.line = yylineno;
};
util.inherits(Break, PNode);

function If(cond, block) {
	this.condition = cond;
	this.block = block;
	this.elses = [];
}
util.inherits(If, PNode);

If.fromList = function(ifs) {
	var ifObj = ifs.shift();
	for (var i = 0, len = ifs.length; i < len; i++) {
		ifObj.addElse(ifs[i]);
	}

	return ifObj;
};

$.extend(If.prototype, {
	is_expression: true,
	addElse: function(if_or_block) {
		this.elses.push(if_or_block);
		return this;
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

function Unary(op, term, is_prefix) {
	this.op = op;
	this.term = term;
	this.is_prefix = is_prefix;
}
util.inherits(Unary, PNode);

Unary.fromList = function(preOps, postOps, term) {
	return $.reduce(
		postOps,
		function(memo, op) {
			return new Unary(op, memo, false);
		},
		$.reduce(preOps, function(memo, op) {
			return new Unary(op, memo, true);
		}, term)
	);
};

$.extend(Unary.prototype, {
	is_expression: true,

	setTerm: function(term) {
		this.term = term;
		return this;
	}
});

Var = function Var(names, lineno) {
	this.names = names;
	this.lineno = lineno;
}
util.inherits(Var, PNode);

$.extend(Var.prototype, {
	add: function(name) {
		this.names.push(name);

		return this;
	}
});

Import = function Import(obj, members, owner) {
	this.obj = obj;
	this.members = members;
	this.owner = owner;
};
util.inherits(Import, PNode);

Parenthetical = function Parenthetical(expr) {
	this.expr = expr;
};
util.inherits(Parenthetical, PNode);

$.extend(Parenthetical.prototype, {
	is_expression: true
});

Ternary = function Ternary(cond, a, b) {
	this.cond = cond;
	this.a = a;
	this.b = b;
};
util.inherits(Ternary, PNode);

$.extend(Ternary.prototype, {
	is_expression: true
});

Negation = function Negation(term) {
	this.term = term;
};
util.inherits(Negation, PNode);

$.extend(Negation.prototype, {
	is_expression: true
});

Cps = function Cps(metaFunc, params, block) {
	this.meta = metaFunc;
	this.params = params;
	this.block = block;

	var fnCall;
	this.toFuncCall = function() {
		if (! fnCall) {
			if (this.block.isEmpty()) {
				throw new Error('Empty CPS on line ' + this.meta.getLineno());
			}

			var callStub;

			if (this.meta instanceof FuncCall) {
				callStub = this.meta;
			} else {
				callStub = new FuncCall([this.meta]);
			}

			fnCall = callStub.appendFactor(
				new Code(this.params, this.block)
			);
		}

		return fnCall;
	}
};
util.inherits(Negation, PNode);

$.extend(Cps.prototype, {
	is_expression: true,

	push: function(node) {
		this.block.push(node);

		return this;
	}
});

var words = function(str, lineno) {
	var ws = str
		.replace(/^\s+|\s+$/g, '')
		.replace('\\', '\\\\')
		.replace("'", "\\'")
		.split(/\s+/);

	return new Arr(
		$.map(ws, function(w) {
			return new Literal("'" + w + "'", lineno);
		}),
		lineno
	);
};

module.exports = {
	Obj: Obj,
	PNode: PNode,
	Script: Script,
	Block: Block,
	IBlock: IBlock,
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
	Break: Break,
	Import: Import,
	Parenthetical: Parenthetical,
	Ternary: Ternary,
	Negation: Negation,
	Cps: Cps,
	words: words,
	showTree: showTree
};

require('./nodeOutputs.js');
require('./scopes.js');

