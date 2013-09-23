/*jshint indent: false */
var
	util = require('util'),
	$ = require('underscore'),
	H = require('./helpers'),
	L = require('./lines.js'),

	LCOUNT = /\n/g,

	Lines       = L.Lines,
	LineString  = L.LineString,
	line        = L.line,
	indent      = L.indent,
	repeat      = L.repeat,
	list_bind   = L.list_bind,
	sprint      = L.sprint,
	collect     = L.collect,
	reduceLines = L.reduceLines,

	AssignList, Try, While, For, If, Switch, Assign, Undefined, Return,
	Block, PNode, Code, Access, Var, Case, Break, Value, Import;

var log = console.log;

function PNode() {}
$.extend(PNode.prototype, {
	needsSemicolon: false,
	is_expression: false,
	canDefineVars: true,

	children: function() {
		return [];
	},

	lines: function() {
		return new Lines([]);
	},

});


Block = function Block(nodes) {
	this.nodes = nodes;
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
	push: function(nodes) {
		this.nodes.push(nodes);
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

	children: function() {
		return this.nodes;
	},

	lines: function() {
		Block.indent++;

		var ls = new Lines([]);

		if (Block.indent > 0) {
			ls.push( indent(1) );
		}

		for (var i = 0, len = this.nodes.length; i < len; i++) {
			var node_ls = this.nodes[i].lines();

			if (!node_ls.isEmpty()) {
				ls.append(node_ls)
					.suffix(this.nodes[i].needsSemicolon ? ';' : '');
			}
		}

		if (Block.indent > 0) {
			ls.push( indent(-1) );
		} else {
			// FIXME: this is here because it can't be at the top; we need content
			// with a line number first
			ls.prefix(L.var_string(this));
		}

		Block.indent--;

		return ls;
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
	}
});


function Assign(assignee, op, value) {
	if (!assignee || !op) throw new Error('new Assign() requires at least 2 arguments');

	this.assignee = assignee;
	this.op = op instanceof Identifier
		? op.value
		: op;
	this.value = value;
}
util.inherits(Assign, PNode);

Assign.create = function(assignee, op, value) {
	if (value && value.assignify) {
		return value.assignify(assignee, op);
	} else {
		return new Assign(assignee, op, value);
	}
};

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
		} else if (this.assignee.value) {
			return this.assignee.value;
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
	},

	getLineno: function() {
		return this.assignee.getLineno();
	}
});

Return = function Return(expr) {
	this.expression = expr;
};
util.inherits(Return, PNode);
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

Code = function Code(params, block, name) {
	this.params = params;
	this.block = block;
	this.name = name;

	this.block.returnify();
}
util.inherits(Code, PNode);

$.extend(Code.prototype, {
	is_expression: true,
	needsSemicolon: true,
	canDefineVars: false,
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
});


function LOC() {}

function Arr(xs, yylineno) {
	this.xs = xs;
	this.line = yylineno;
}
util.inherits(Arr, PNode);

$.extend(Arr.prototype, {
	is_expression: true,
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
});

function Literal(value, yylineno) {
	this.value = value;
	this.line = yylineno;
}
util.inherits(Literal, PNode);
$.extend(Literal.prototype, {
	is_expression: true,
	needsSemicolon: true,
	toString: function() {
		return this.value;
	},

	lines: function() {
		return new Lines([line(this.value, this.line)]);
	},
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
	needsSemicolon: true,
	toString: function() {
		return this.value;
	},
	lines: function() {
		return new Lines([line(this.value, this.line)]);
	},
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
	needsSemicolon: true,
	toString: function() {
		return 'void 0';
	},
	lines: function() {
		return new Lines([line('void 0', this.line)]);
	},
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
	needsSemicolon: true,
	toString: function() { return 'null'; },
	children: function() {
		return [];
	},
	lines: function() {
		return new Lines([line(this.value, this.line)]);
	},
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
	needsSemicolon: true,
	toString: function() {
		return this.val ? 'true' : 'false';
	},
	lines: function() {
		return new Lines([line(this.value, this.line)]);
	},
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
});

function FuncCall(factors) {
	this.factors = factors;
}
util.inherits(FuncCall, PNode);

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
		accessor, ident, factors;

	for (var i in chain) if (chain.hasOwnProperty(i)) {
		ident = chain[i][0];
		factors = chain[i][1];

		base = new Value(base, [ new Access(ident) ]);

		if (factors.length) {
			// base is currently the function we want to call, so:
			base = new FuncCall([base].concat(factors));
		}
	}

	return base;
}

function AssignList(assigns) {
	this.assigns = assigns;
}

util.inherits(AssignList, PNode);

$.extend(AssignList.prototype, {
	needsSemicolon: true,
	children: function() {
		return this.assigns;
	},
	add: function(assign) {
		this.assigns.push(assign);
		return this;
	},

	lines: function() {
		return Lines.join(Lines.mapNodes(this.assigns), ',');
	}
});


function Obj(props, lineno) {
	this.props = props;
	this.lineno = lineno;
}
util.inherits(Obj, PNode);
$.extend(Obj.prototype, {
	is_expression: true,
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
	needsSemicolon: true,
	children: function() {
		return [this.base, this.properties];
	},

	add: function(props) {
		this.properties = this.properties.concat(props);
		return this;
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
	},

	getLineno: function() {
		return this.base.getLineno();
	}
});


function Access(member) {
	if (member === '') {
		throw new Error();
	}
	this.member = member;
}
util.inherits(Access, PNode);

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
util.inherits(Index, PNode);
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

util.inherits(Try, PNode);

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

util.inherits(Throw, PNode);
$.extend(Throw.prototype, {
	toString: function() {
		return 'throw ' + this.expr.toString();
	},
	children: function() {
		return [this.expr];
	},
	lines: function() {
		return this.expr.lines().prefix('throw ');
	},
});

function While(cond, block, is_do) {
	this.cond = cond;
	this.block = block;
	this.is_do = is_do;
}

util.inherits(While, PNode);
$.extend(While.prototype, {
	toString: function() {
		return 'while (' + this.cond.toString() + ') {' + this.block.toString() + '}';
	},
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
			ls.prefix('while (')
				.suffix(') {')
				.append(this.block.lines())
				.suffix('}');
		}

		return ls;
	}
});

function For(loop) {
	this.loop = loop;

	if (this.loop.id) {
		if (this.loop.id[1]) {
			this.loop.id2 = this.loop.id[1];
		}
		this.loop.id = this.loop.id[0];
	}

	var id, len, length, less, plusplus;

	this._obj = new Identifier('_obj');

	if (this.loop.index) {
		len      = new Identifier('_len');
		length   = new Access(new Identifier('length'));
		less     = new Identifier('<');
		plusplus = new Identifier('++');

		this.loop.init = new AssignList([
			Assign.create(this.loop.id, '=', new Literal(0)),
			Assign.create(len, '=', new Value(this._obj).add(length))
		]);

		this.loop.check = new Operation(less, this.loop.id, len);
		this.loop.step = Assign.create(this.loop.id, plusplus);
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
			var objHasOwn = new Value(this._obj).add(new Access('hasOwnProperty'));
			this.block = new Block([new If(
				new FuncCall([objHasOwn, this.loop.id]),
				block
			)]);
		} else {
			this.block = block;
		}

		return this;
	},
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
				.prefix('for (' + this.loop.id + ' in (_obj=')
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
				blk.prefix(',');
				blk.prepend(this.loop.obj.lines());
				blk.prefix('_obj=');
			}

			blk.prefix('for (')

			ls = blk;
		}

		return ls;
	}
});

Switch = function Switch(expr, cases, deflt) {
	this.expr = expr;
	this.cases = cases;
	this.deflt = deflt;
}

util.inherits(Switch, PNode);

$.extend(Switch.prototype, {
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

util.inherits(Case, PNode);

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
	},
	children: function() {
		return this.vals.concat([this.blk]);
	}
});

Break = function Break(yylineno) {
	this.line = yylineno;
};
util.inherits(Break, PNode);
$.extend(Break.prototype, {
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

util.inherits(Unary, PNode);

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

Var = function Var(names, lineno) {
	this.names = names;
	this.lineno = lineno;
}

util.inherits(Var, PNode);

$.extend(Var.prototype, {
	add: function(name) {
		this.names.push(name);

		return this;
	},
	children: function() {
		return [];
	},
	lines: function() {
		return new Lines([new LineString('', this.lineno, false)]);
	}
});

Import = function Import(obj, members, owner) {
	this.obj = obj;
	this.members = members;
	this.owner = owner;
};

util.inherits(Import, PNode);

$.extend(Import.prototype, {
	children: function() {
		return [this.obj];
	},
	lines: function() {
		var ls = this.obj.lines();

		ls.prefix('(function() { var owner = ');
		ls.suffix(';');

		for (var i = 0, len = this.members.xs.length; i < len; i++) {
			ls.suffix(this.members.xs[i] + ' = owner.' + this.members.xs[i] + ';');
		}

		if (this.owner) {
			ls.suffix(this.owner + ' = owner;');
		}

		return ls.suffix('})();');
	}
});

var Parenthetical = function Parenthetical(expr) {
	this.expr = expr;
};

util.inherits(Parenthetical, PNode);

$.extend(Parenthetical.prototype, {
	is_expression: true,
	needsSemicolon: true,

	children: function() {
		return [this.expr];
	},
	lines: function() {
		return this.expr.lines()
			.prefix('(')
			.suffix(')');
	}
});

var Ternary = function Ternary(cond, a, b) {
	this.cond = cond;
	this.a = a;
	this.b = b;
};

util.inherits(Ternary, PNode);

$.extend(Ternary.prototype, {
	is_expression: true,
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
});

var Negation = function Negation(term) {
	this.term = term;
};

util.inherits(Negation, PNode);

$.extend(Negation.prototype, {
	is_expression: true,
	needsSemicolon: true,

	children: function() {
		return [this.term];
	},
	lines: function() {
		return this.term.lines()
			.prefix('-');
	}
});


var Cps = function Cps(expr, args, code) {
	var fnCall;

	if (expr instanceof FuncCall) {
		fnCall = expr;
	} else {
		fnCall = new FuncCall([expr]);
	}

	$.each(args, function(arg) {
		fnCall.appendFactor(arg);
	});

	fnCall.appendFactor(code);

	return fnCall;
};

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
	LOC: LOC,
	Obj: Obj,
	PNode: PNode,
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
	Import: Import,
	Parenthetical: Parenthetical,
	Ternary: Ternary,
	Negation: Negation,
	Cps: Cps,
	words: words
};

require('./scopes.js');

