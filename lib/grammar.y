%{
var N = require('./nodes.js');
%}

%token AS
%token ASSIGN
%token BOOL
%token CASE
%token CATCH
%token COMPARE
%token COMPOUND_ASSIGN
%token CPS
%token DEBUGGER
%token DEFAULT
%token ELSE
%token FINALLY
%token FN_NAME
%token FOR
%token IN
%token INSTANCEOF
%token IDENTIFIER
%token IF
%token INDENT
%token INDEX
%token INTEGER
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
%token STRING
%token SWITCH
%token TERMINATOR
%token THROW
%token TRY
%token UNDEFINED
%token WS
%token WITH

%token WORDS
%token SPACEDOT
%token CALL_NULLARY
%token FREE_LBRACKET

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
%left      "WS"
%left      "SPACEDOT"

/* standard binary ops */
%left      "MATH"
%left      "+" "-"
%left      "SHIFT"
%left      "RELATION"
%left      "INSTANCEOF" "IN" 
%left      "COMPARE"
%left      "LOGIC"

%left      ","

%nonassoc  "INDENT" "OUTDENT"
%right     "#"

%start Root

%%


/* The **Root** is the top-level node in the syntax tree. Since we parse bottom-up
	 all parsing must end here. */
Root
	: /* empty */
		{ $$ = new N.Script(null, null); }
	| Block
		{ return new N.Script($1, null); }
	| Export Eol Body
		{ return new N.Script($3, $1); }
	;

Export
	: EXPORT Identifier
		{ $$ = [$2]; }
	| Export COMMA Identifier
		{ $$ = $1.concat([$3]); }
	;

Id
	: IDENTIFIER
		{ $$ = new N.Identifier(yytext, yylineno); }
	;

DOT: '.';
LPAREN: '(';
RPAREN: ')';
LBRACE: '{';
RBRACE: '}';
LBRACKET: '[';
RBRACKET: ']';
HASH: '#';
BSLASH: '\\';
ARROW: '->';
CPSARROW: '<-';
TERSTART: '??';
COLON: ':';
SEMICOLON: ';';
COMMA: ',';
AT: '@'; /* partial function */
BACKTICK: '`';

EOL
	: TERMINATOR
	| SEMICOLON
	;

BINARY
	: '+'
	| '-'
	| MATH
	| SHIFT
	| COMPARE
	| LOGIC
	| RELATION
	| INSTANCEOF
	| IN
	;

Tmnl
	: Id
	| REGEX
		{ $$ = new N.Literal(yytext, yylineno); }
	| DEBUGGER
		{ $$ = new N.Literal(yytext, yylineno); }
	| UNDEFINED
		{ $$ = new N.Undefined(yylineno); }
	| NULL
		{ $$ = new N.Null(yylineno); }
	| BOOL
		{ $$ = new N.Bool($1, yylineno); }
	| AlphaNumeric
	;


/* Alphanumerics are separated from the other **Tmnl** matchers because
they can also serve as keys in object literals. */
AlphaNumeric
	: NUMBER
		{ $$ = new N.Literal(yytext, yylineno); }
	| INTEGER
		{ $$ = new N.Literal(yytext, yylineno); }
	| STRING
		{ $$ = new N.Literal(yytext, yylineno); }
	;

Atom
	: Tmnl
	| Paren
	| Array
	| Object
	| AT
	;

Parenable
	: Binaried
	| Ternary
	;

Paren
	: LPAREN Parenable RPAREN
		{ $$ = new N.Parenthetical($2); }
	| ParenedFunc
	;

Array
	: FREE_LBRACKET RBRACKET
		{ $$ = new N.Arr([], yylineno); }
	| FREE_LBRACKET Commaed RBRACKET
		{ $$ = new N.Arr($2, yylineno); }
	| WORDS
		{ $$ = N.words($1, yylineno); }
	;

Commaed
	: Parenable
		{ $$ = [$1]; }
	| Parenable COMMA Commaed
		{ $$ = $3.concat($1); }
	;

Index
	: DOT Id
		{ $$ = new N.Access($2); }
	| DOT NUM
		{ $$ = new N.Index(new N.Literal($2, yylineno)); }
	| LBRACKET Parenable RBRACKET
		{ $$ = new N.Index($2); }
	;

Indexed
	: Atom
	| Indexed Index
		{ $$ = new N.Value($1).add($2); }
	;

LUnaried
	: Indexed
	;

Unaried /* callable things */
	: LUnaried
	;

NullaryCalled
	: Indexed
	| Indexed CALL_NULLARY
		{ $$ = new N.FuncCall([$1]); }
	;

Called
	: NullaryCalled
	| NullaryCalled Called
		{ $$ = N.FuncCall.addFactor($2, $1); }
	;

SDotted
	: Called
	| Called SPACEDOT SDotted
		{ $$ = N.Index.spaceDot($1, $3); }
	;

Infixed
	: BACKTICK Unaried BACKTICK  /* reverse invocation, i.e., 2 `plus` 2 */
		{ $$ = new N.FuncCall([$2]); }
	;

/* HASH is the only binary op that can come after another, so... */
UnhashedBinary
	: BINARY
	| Infixed
	;

Binary
	: UnhashedBinary
	| HASH
	| UnhashedBinary HASH
		{ $$ = new N.Operation.withHash([$1]); }
	;

Binaried
	: SDotted
	| SDotted Binary Binaried
		{ $$ = N.Operation.create($2, $1, $3); }
	;

Valued
	: Binaried
	| Ternary
	| If
	| Switch
	| Try
	;

Lineable
	: Binaried
	| Ternary
	| Var
	| AssignList
	| Return
	| Import
	;

Line
	: EOL
	| Lineable EOL
	| If
	| IfCase
	| Switch
	| While
	| For
	| Try
	;

Block
	: Line
		{ $$ = new N.Block([$1]); }
	| Line Block
		{ $$ = $2.addLine($1); }
	;

IBlock
	: INDENT Block OUTDENT
		{ $$ = $2; }
	;

LBlock
	: IBlock
	| Line
	;

Params
	: /* empty */
		{ $$ = []; }
	| Id Params
		{ $$ = $2.concat([$1]); }
	;

FuncBody
	: ARROW LBlock
		{ $$ = $2; }
	;

Func
	: FuncBody
		{ $$ = new N.Code([], $1); }
	| BSLASH Params FuncBody
		{ $$ = new N.Code($2, $3); }
	;

NamedFunc
	: Func
	| FN_NAME Func
		{ $$ = $2.setName($1); }
	;

ParenedFunc
	: LPAREN NamedFunc RPAREN
		{ $$ = $2; }
	;

Cps
	: Params CPSARROW Line Block
		{ $$ = new N.Block([ N.Cps($3, new N.Code($1, $4)) ]); }
	;

Ternary
	: TERSTART Binaried COLON Binaried COLON Binaried
		{ $$ = new N.Ternary($2, $4, $6); }
	;

ObjProp
	: Id
	| AlphaNumeric
	;

/* definition of a property in an object literal */
ObjectPropDef
	: ObjProp COLON Parenable
		{ $$ = [$1, $3]; }
	;

ObjectPropList
	: ObjectPropDef
		{ $$ = [$1]; }
	| ObjectPropDef COMMA ObjectPropList
		{ $$ = $1.concat([$3]); }
	;

Object
	: LBRACE ObjectPropList RBRACE
		{ $$ = new N.Obj($2); }
	| LBRACE RBRACE
		{ $$ = new N.Obj([], yylineno); }
	;

Assign
	: ASSIGN
	| COMPOUND_ASSIGN
	;

/* Assignment of a variable, property, or index to a value.
/* increment and decrement are forms of assignment */
LineAssignment
	: UNARY_ASSIGN Indexed
		{ $$ = N.Assign.createUnary($2, $1); }
	| Indexed UNARY_ASSIGN
		{ $$ = N.Assign.createUnary($1, $2); }
	| Indexed Assign Binaried
		{ $$ = N.Assign.create($1, $2, $3); }
	;

/* don't allow block BlockAssignment in AssignList, except at end */
BlockAssignment
	: Indexed ASSIGN IBlock
		{ $$ = N.Assign.create($1, $2, $3); }
	;

Assignment
	: LineAssignment
	| BlockAssignment
	;

/* Comma-separated assignments */
AssignList
	: Assignment
		{ $$ = new N.AssignList([$1]); }
	| LineAssignment COMMA AssignList
		{ $$ = $1.add($3); }
	;

Var
	: VAR Id
		{ $$ = new N.Var([$2], yylineno); }
	| Var COMMA Id
		{ $$ = $1.add($3, yylineno); }
	;

/* A return statement from a function body. */
Return
	: RETURN Valued
		{ $$ = new N.Return($2); }
	| RETURN
		{ $$ = new N.Return(); }
	;

CondBlock
	: Valued IBlock
		{ $$ = [1, 2]; }
	;

/* The most basic form of *if* is a condition and an action. The following
/* if-related rules are broken up along these lines in order to avoid
/* ambiguity. */
IfElseIf
	: IF CondBlock
		{ $$ = new N.If($2[0], $2[1]); }
	| IfBlock ELSE IF CondBlock
		{ $$ = $1.addElse(new N.If($4[0], $4[1])); }
	;

/* The full complement of *if* expressions, including postfix one-liner
/* *if* and *unless*. */
If
	: IfElseIf
	| IfElseIf ELSE IBlock
		{ $$ = $1.addElse($3); }
	;

SingleIfCase
	: Valued ARROW LBlock
		{ $$ = new N.If($1, $3); }
	;

DefaultIfCase
	: DEFAULT ARROW LBlock
		{ $$ = $3; }
	;

IfCases
	: SingleIfCase
		{ $$ = [$1]; }
	| SingleIfCase IfCases
		{ $1.push($2); $$ = $1; }
	;

DefaultedIfCases
	: IfCases
	| IfCases DefaultIfCase
		{ $1.push($2); $$ = $1; }
	;

/* The full complement of *if* expressions, including postfix one-liner
/* *if* and *unless*. */
IfCase
	: IF CASE INDENT DefaultedIfCases OUTDENT
		{ $$ = N.If.fromList($4); }
	;

Valueds
	: Valued
		{ $$ = [$1]; }
	| Valued COMMA Valueds
		{ $3.push($1); $$ = $3; }
	;

/* An individual **Case** clause, with action. */
Case
	: CASE Valueds IBlock
		{ $$ = new N.Case($2, $3); }
	;

/* An individual **Case** clause, with action. */
DefaultCase
	: DEFAULT IBlock
		{ $$ = $2; }
	;

Cases
	: Case
		{ $$ = [$1]; }
	| Case Cases
		{ $$ = $1.concat([$2]); }
	;

Defaulted
	: Cases
	| Cases DefaultCase
		{ $$ = $1.concat([$2]); }
	;

Switch
	: SWITCH Valued INDENT Defaulted OUTDENT
		{ $$ = new N.Switch($2, $4, $6); }
	;

CondForWhile
	: Valued
		{ $$ = [$1, null]; }
	| AssignList SEMICOLON Valued
		{ $$ = [$1, $3]; }
	;

WhileCond
	: WHILE CondForWhile
		{ $$ = $2; }
	;

While
	: WhileCond IBlock
		{ $$ = new N.While($1[0], $2, false, $1[1]); }
	| DO IBlock WhileCond EOL
		{ $$ = new N.While($3[0], $2, true, $3[1]); }
	;

/* Throw an exception object. */
Throw
	: THROW Valued
		{ $$ = new N.Throw($2); }
	;

/* A catch clause names its error and runs a block of code. */
Catch
	: CATCH Id IBlock
		{ $$ = [$2, $3]; }
	;

Finally
	: FINALLY IBlock
		{ $$ = $2; }
	;

Finallied
	: Catch
		{ $$ = [ $1[0], $1[1], null ]; }
	| Finally
		{ $$ = [ null, null, $1 ]; }
	| Catch Finally
		{ $$ = [ $1[0], $1[1], $2 ]; }
	;

/* The variants of *try/catch/finally* exception handling blocks. */
Try
	: TRY IBlock Finallied
		{ $$ = new N.Try($2, $3[0], $3[1], $3[2]); }
	;

IdIn
	: Id IN
		{ $$ = [$1] }
	| Id COLON Id IN
		{ $$ = [$1, $3] }
	;

InIterator
	: IdIn
		{ $$ = { in: true, id: $2 }; }
	| OWN IdIn
		{ $$ = { in: true, own: true, id: $2 }; }
	| INDEX IdIn
		{ $$ = { index: true, id: $2 }; }
	;

ForAssign
	: SEMICOLON
		{ $$ = null; }
	| AssignList SEMICOLON
	;

ForValued
	: SEMICOLON
		{ $$ = null; }
	| Valued SEMICOLON
	;

ForHead
	: FOR InIterator Valued
		{ $2.obj = $3; $$ = new N.For($2); }
	| FOR ForAssign ForValued
		{ $$ = new N.For({ init: $2, check: $3 }); }
	| FOR ForAssign ForValued AssignList
		{ $$ = new N.For({ init: $2, check: $3, step: $4}); }
	;

/* Array, object, and range comprehensions, at the most generic level.
/* Comprehensions can either be normal, with a block of expressions to execute
/* or postfix, with a single expression. */
For
	: ForHead IBlock
		{ $$ = $1.setBlock($2); }
	;

With
	: WITH Paren
		{ $$ = new N.Import($2, [], null); }
	| WITH Paren AS Id
		{ $$ = new N.Import($2, [], $4); }
	;

WithThese
	: With Array 
		{ $1.members = $2; $$ = $1; }
	;

Import
	: With
	| WithThese
	;

