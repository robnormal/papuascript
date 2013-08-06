%{
var N = require('./nodes.js');
%}

%token BOOL
%token CASE
%token CATCH
%token COMPARE
%token COMPOUND_ASSIGN
%token DEBUGGER
%token DEFAULT
%token ELSE
%token FINALLY
%token FN_DEF_PARAM
%token FOR
%token FORIN
%token IDENTIFIER
%token IF
%token INDENT
%token INDEX_END
%token INDEX_START
%token LOGIC
%token MATH
%token NULL
%token NUMBER
%token OUTDENT
%token OWN
%token REGEX
%token RELATION
%token RETURN
%token SHIFT
%token STATEMENT
%token STRING
%token SWITCH
%token TERMINATOR
%token THIS
%token THROW
%token TRY
%token UNDEFINED
%token FN_LIT_PARAM
%token WS


/* Precedence
/* ----------

/* Operators at the top of this list have higher precedence than the ones lower
/* down. Following these rules is what makes `2 + 3 * 4` parse as:
/*
/*     2 + (3 * 4)
/*
/* And not:
/*
/*     (2 + 3) * 4 */
%left      "."
%nonassoc  "++" "--"
%right     "UNARY"
%left      "MATH"
%left      "+" "-"
%left      "SHIFT"
%left      "RELATION"
%left      "COMPARE"
%left      "LOGIC"
%nonassoc  "INDENT" "OUTDENT"
%right     "=" ":" "COMPOUND_ASSIGN" "RETURN" "THROW"
%right     "FORIN" "CASE"
%right     "IF" "ELSE" "FOR" "WHILE"

%start Root

%%


/* The **Root** is the top-level node in the syntax tree. Since we parse bottom-up
   all parsing must end here. */
Root
	: /* empty */
		{ $$ = new N.Block(); }
  | Body
		{ return $1; }
  | Block TERMINATOR
		{ return $1; }
	;

/* Any list of statements and expressions, separated by line breaks */
Body
  : Line
    { $$ = N.Block.wrap([$1]); }
	| Body TERMINATOR Line
    { $$ = $1.push($3); }
	| Body TERMINATOR
	;

/* Block and statements, which make up a line in a body. */
Line
	: Expression
	| Statement
	;

/* Pure statements which cannot be expressions. */
Statement
	: Return
	| STATEMENT
    { $$ = new N.Literal($1); }
	| While
	| For
	| AssignList
	| Throw

	/* RR - try blocks could be expressions, but for now, we'll say not */
	| Try
	;

Expression
	: Term
	| Op
	| Code
	;

Op
	: Term Binary Term
    { $$ = new N.Operation($2, $1, $3); }
	| Op Binary Term
    { $$ = new N.Operation($2, $1, $3); }
	;

Term
	: Atom
	| Invocation
	| If
	| Switch
	;

Atom 
	: Literal
	| Assignable
	| Object
	| Array
	| Parenthetical
	;

Invocation
	: Atom '(' ')'
		{ $$ = new N.FuncCall($1); }
	| ArityInvocation
	;

ArityInvocation
	: Atom WS Atom
		{ $$ = new N.FuncCall($1, [$2]); }
	| Atom WS Code
		{ $$ = new N.FuncCall($1, [$2]); }
	| Atom WS ArityInvocation
		{ $$ = $3.addArg($1); }
	;

/* An indented block of expressions. Note that the [Rewriter](rewriter.html)
will convert some postfix forms into blocks for us, by adjusting the
token stream. */
Block
	: INDENT OUTDENT
  	{ $$ = new N.Block(); }
	| INDENT Body OUTDENT
  	{ $$ = $2; }
	;

/* Alphanumerics are separated from the other **Literal** matchers because
they can also serve as keys in object literals. */
AlphaNumeric
	: NUMBER
    { $$ = new N.Literal($1); }
	| STRING
    { $$ = new N.Literal($1); }
	;

/* All of our immediate values. Generally these can be passed straight
/* through and printed to JavaScript. */
Literal
	: AlphaNumeric
    { $$ = new N.Literal($1); }
	| REGEX
    { $$ = new N.Literal($1); }
	| DEBUGGER
    { $$ = new N.Literal($1); }
	| UNDEFINED
    { $$ = new N.Undefined(); }
	| NULL
    { $$ = new N.Null(); }
	| BOOL
    { $$ = new N.Bool($1); }
	;

/* Assignment of a variable, property, or index to a value.
/* increment and decrement are forms of assignment */
Assignment
	: Assignable '=' Expression
    { $$ = new N.Assign($1, $3, $2); }
	| "--" Assignable
    { $$ = new N.Assign($2, null, '--'); }
	| "++" Assignable
    { $$ = new N.Assign($2, null, '++'); }
	| Assignable "--"
    { $$ = new N.Assign($2, null, '--'); }
	| Assignable "++"
    { $$ = new N.Assign($2, null, '++'); }
	| Assignable COMPOUND_ASSIGN Expression
    { $$ = new N.Assign($1, $3, $2); }
	;

Identifier
	: IDENTIFIER
    { $$ = new N.Literal($1); }
	;

/* Comma-separated assignments */
AssignList
	: Assignment
		{ $$ = [$1]; }
	| AssignList ',' Assignment
		{ $$ = $1.concat($2); }
	;

Object
	: '{' ObjectPropList '}'
		{ $$ = new N.Obj($2); }
	;

ObjectPropList
	: 
	| ObjectPropDef
		{ $$ = [$1]; }
	| ObjectPropList ',' ObjectPropDef
		{ $$ = $1.concat($2); }
	;

/* definition of a property in an object literal */
ObjectPropDef
	: ObjProp ':' Expression
    { $$ = new N.Assign(new N.Value($1), $3, 'object'); }
	;

ObjProp
	: Identifier
	| AlphaNumeric
	;

/* A return statement from a function body. */
Return
	: RETURN Expression
    { $$ = new N.Return($2); }
	| RETURN
    { $$ = new N.Return(); }
	;

/* The **Code** node is the function literal. It's defined by an indented block
/* of **Block** preceded by a function arrow, with an optional parameter
/* list. */
Code
	: '\' FnLitParams "->" Block
		{ $$ = new N.Code($2, $4); }
	;

FnLitParams
	: Identifier FN_LIT_PARAM
		{ $$ = [$1]; }
	| FnLitParams Identifier FN_LIT_PARAM
		{ $$ = $1.concat($2); }
	;

/* Variables and properties that can be assigned to. */
Assignable
	: Identifier
	| Atom Accessor
		{ $$ = new N.Value($1).add($2); }
	| ThisProperty
	;

/* The general group of accessors into an object, by property
/* or by array index */
Accessor
	: '.' Identifier
    { $$ = new N.Access($2); }
	| Index
	;

/* Indexing into an object or array using bracket notation. */
Index
	: INDEX_START Expression INDEX_END
		{ $$ = new N.Index($2); }
	;

/* A reference to a property on *this*. */
ThisProperty
	: '@' Identifier
	;

/* The array literal. */
Array
	: '[' ']'
    { $$ = new N.Arr([]); }
	| '[' Arguments ']'
    { $$ = new N.Arr($2); }
	;

Arguments
	: Expression
		{ $$ = [$1]; }
  | Arguments ',' Expression
		{ $$ = $1.concat($3); }
	;

/* The variants of *try/catch/finally* exception handling blocks. */
Try
	: TRY Block
    { $$ = new N.Try($2); }
	| TRY Block Catch
    { $$ = new N.Try($2, $3[0], $3[1]); }
	| TRY Block FINALLY Block
    { $$ = new N.Try($2, null, null, $4); }
	| TRY Block Catch FINALLY Block
    { $$ = new N.Try($2, $3[0], $3[1], $5); }
	;

/* A catch clause names its error and runs a block of code. */
Catch
	: CATCH Identifier Block
    { $$ = [$2, $3]; }
	| CATCH Block
    { $$ = [null, $2]; }
	;

/* Throw an exception object. */
Throw
	: THROW Expression
		{ $$ = new N.Throw($2); }
	;

While
	: "WHILE" Expression Block
		{ $$ = new N.While($2, $3); }
	| "DO" Block "WHILE" Expression 
		{ $$ = new N.While($3, $2, true); }
	;

/* Array, object, and range comprehensions, at the most generic level.
/* Comprehensions can either be normal, with a block of expressions to execute
/* or postfix, with a single expression. */
For
	: ForBody Block
    { $$ = new N.For($1, $2); }
	;

ForBody
	: FOR Identifier FORIN Block
		{ $$ = { in: true, id: $2, block: $4} }
	| FOR OWN Identifier FORIN Block
		{ $$ = { in: true, own: true, id: $2, block: $4} }
	| FOR AssignList ';' Expression ';' AssignList Block
		{ $$ = { init: $2, check: $4, step: $6, block: $7} }
	;

Switch
	: SWITCH Expression INDENT Cases OUTDENT
    { $$ = new N.Switch($2, $4, null); }
	| SWITCH Expression INDENT Cases DEFAULT Expression ':' Block OUTDENT
    { $$ = new N.Switch($2, $4, [$6, $8]); }
	;

Cases
	: Case
		{ $$ = [$1]; }
	| Cases Case
		{ $$ = $1.concat($2); }
	;

/* An individual **Case** clause, with action. */
Case
	: CASE ExpressionList ':' Block
		{ $$ = $1.concat($2); }
	;

ExpressionList
	: Expression
		{ $$ = [$1]; }
	| ExpressionList ',' Expression
		{ $$ = $1.concat($2); }
	;

Binary
	: '+'
	| '-'
	| MATH
	| SHIFT
	| COMPARE
	| LOGIC
	| RELATION
	;

/* Parenthetical expressions. Note that the **Parenthetical** is a **Value**
/* not an **Expression**, so if you need to use an expression in a place
/* where only values are accepted, wrapping it in parentheses will always do
/* the trick. */
Parenthetical
	: '(' Body ')'
		{ $$ = $2; }
	| '(' INDENT Body OUTDENT ')'
		{ $$ = $3; }
	;

/* The most basic form of *if* is a condition and an action. The following
/* if-related rules are broken up along these lines in order to avoid
/* ambiguity. */
IfBlock
	: IF Expression Block
		{ $$ = new N.If($2, $3); }
	| IfBlock ELSE IF Expression Block
		{ $$ = $1.addElse(new N.If($4, $5)); }
	;

/* The full complement of *if* expressions, including postfix one-liner
/* *if* and *unless*. */
If
	: IfBlock
	| IfBlock ELSE Block
    { $$ = $1.addElse($3); }
	;

