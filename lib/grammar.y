%{
var N = require('./nodes.js');
%}

%token BOOL
%token CASE
%token CATCH
%token COMPARE
%token COMPOUND_ASSIGN
%token CPS
%token CPSSTOP
%token DEBUGGER
%token DEFAULT
%token ELSE
%token FINALLY
%token FN_DEF_PARAM
%token FOR
%token IN
%token INSTANCEOF
%token IDENTIFIER
%token IF
%token INDENT
%token INDEX_END
%token INDEX_START
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
%token STATEMENT
%token STRING
%token SWITCH
%token TERMINATOR
%token THROW
%token TRY
%token UNDEFINED
%token FN_LIT_PARAM
%token WS
%token SPACEDOT
%token WITH
%token WORDS

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
%nonassoc  "UNARY_ASSIGN"
%right     "UNARY" 
%left      "MATH"
%left      "+" "-"
%left      "SHIFT"
%left      "RELATION"
%left      "INSTANCEOF" "IN" 
%left      "COMPARE"
%left      "LOGIC"
%left      "SPACEDOT"
%nonassoc  "INDENT" "OUTDENT"
%right     "=" "?" ":" "COMPOUND_ASSIGN" "RETURN" "THROW"
%right     "CASE"
%right     "IF" "ELSE" "FOR" "WHILE"
%right     "#"

%start Root

%%

/* The **Root** is the top-level node in the syntax tree. Since we parse bottom-up
	 all parsing must end here. */
Root
	: /* empty */
		{ $$ = new N.Block([]); }
	| LineList
		{ return $1; }
	| Block Eol
		{ return $1; }
	;

Import
	: With 
	| With WS ImportArray 
		{ $1.members = $3; $$ = $1; }
	;

ImportItem
	: Identifier
		{ $$ = [$1, $1]; }
	| Identifier ASSIGN Identifier
		{ $$ = [$1, $3]; }
	;

ImportArray
	: '[' ImportList ']'
		{ $$ = $2; }
	;

ImportList
	: ImportItem
		{ $$ = [$1]; }
	| ImportList ',' ImportItem
		{ $$ = $1.concat([$3]); }
	;

With
	: WITH Parenthetical
		{ $$ = new N.Import($2, [], null); }
	| WITH Parenthetical AS Identifier
		{ $$ = new N.Import($2, [], $4); }
	;

BlockLike
	: Expression Eol
		{ $$ = new N.Block([$1]); }
	| Block
	| Line Block
		{ $$ = new N.Block([$1, $2]); }
	;

Eol
	: TERMINATOR
	| ';'
	;

/* Any list of statements and expressions, separated by line breaks */
LineList
	: Line
		{ $$ = N.Block.wrap([$1]); }
	| LineList Eol Line
		{ $1.push($3); $$ = $1; }
	| LineList Eol
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
		{ $$ = new N.Literal($1, yylineno); }
	| While
	| For
	| AssignList
	| Throw
	| Var
	| Import

	/* RR - try blocks could be expressions, but for now, we'll say not */
	| Try
	;

Expression
	: OpOrTerm
	| '-' Term
		{ $$ = new N.Negation($2); }
	/* | Code   -- unnecessary, since Code is always contained in parens */
	| Ternary
	| Cps
	;

OpOrTerm
	: Term
	| Op
	;

/* Allow Ternary after Op, but not before one */
Op
	: OpNoTernary
	| Term Binary Ternary
		{ $$ = N.Operation.create($2, $1, $3); }
	| OpNoTernary Binary Ternary
		{ $$ = N.Operation.create($2, $1, $3); }
	;

OpNoTernary
	: Term Binary Term
		{ $$ = N.Operation.create($2, $1, $3); }
	| OpNoTernary Binary Term
		{ $$ = N.Operation.create($2, $1, $3); }
	;

Ternary
	: "??" OpOrTerm ':' OpOrTerm ':' OpOrTerm
		{ $$ = new N.Ternary($2, $4, $6); }
	;

Term
	: Factor
	| '@'
	| Invocation
	| If
	| IfCase
	| Switch
	| Assignable Chain
		{ $$ = N.FuncCall.fromChain($1, $2); }
	| Invocation Chain
		{ $$ = N.FuncCall.fromChain($1, $2); }
	;

Link
	: SPACEDOT Identifier
		{ $$ = [$2, [], false]; }
	| SPACEDOT Identifier '(' ')'
		{ $$ = [$2, [], true]; }
	| Link WS Factor
		{ $1[1].push($3); $$ = $1; }
	;

Chain
	: Link
		{ $$ = [$1]; }
	| Chain Link
		{ $1.push($2); $$ = $1; }
	;

Unary
	: UNARY
		{ $$ = yytext; }
	;

Accessible 
	: Literal
	| Callable
	| Object
	| Array
	;

Callable
	: Assignable
	| Parenthetical
	| Callable '(' ')'
		{ $$ = new N.FuncCall([$1]); }
	;

/* Variables and properties that can be assigned to. */
Assignable
	: Identifier
	| Accessible Accessor
		{ $$ = new N.Value($1).add($2); }
	;

Factor
	: FactorSansSuffix
	| FactorSansSuffix UnaryList
		{ $$ = N.Unary.fromList([], $2, $1); }
	;

FactorSansSuffix
	: Accessible
	| UnaryList Accessible
		{ $$ = N.Unary.fromList($1, [], $2); }
	;

UnaryList
	: Unary
		{ $$ = [$1]; }
	| UnaryList Unary
		{ $$ = $1.concat([$2]); }
	;

FactorOrSlot
	: Factor
	| '@'
	;

FactorList
	: WS FactorOrSlot
		{ $$ = [$2]; }
	| FactorList WS FactorOrSlot
		{ $$ = $1.concat([$3]); }
	;

Invocation
	/* FactorOrSlot FactorList breaks. I don't know why. */
	: Factor FactorList
		{ $$ = N.FuncCall.create([$1].concat($2)); }
	| '@' FactorList
		{ $$ = N.FuncCall.create([$1].concat($2)); }
	| ReverseInvocation
		{ $$ = N.FuncCall.create($1); }
	| ReverseInvocation FactorList
		{ $$ = N.FuncCall.create($1.concat($2)); }
	;

ReverseInvocation
	: '@' '`' Assignable '`'  /* reverse invocation, i.e., 2 `plus` 2 */
		{ $$ = [$3, $1]; }
	| Factor '`' Assignable '`'  /* reverse invocation, i.e., 2 `plus` 2 */
		{ $$ = [$3, $1]; }
	;

/* An indented block of expressions. Note that the [Rewriter](rewriter.html)
will convert some postfix forms into blocks for us, by adjusting the
token stream. */
Block
	: INDENT OUTDENT
		{ $$ = new N.Block([]); }
	| INDENT LineList OUTDENT
		{ $$ = $2; }
	;

/* Alphanumerics are separated from the other **Literal** matchers because
they can also serve as keys in object literals. */
AlphaNumeric
	: NUMBER
		{ $$ = new N.Literal(yytext, yylineno); }
	| INTEGER
		{ $$ = new N.Literal(yytext, yylineno); }
	| STRING
		{ $$ = new N.Literal(yytext, yylineno); }
	;

/* All of our immediate values. Generally these can be passed straight
/* through and printed to JavaScript. */
Literal
	: AlphaNumeric
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
	;

/* Assignment of a variable, property, or index to a value.
/* increment and decrement are forms of assignment */
Assignment
	: Assignable ASSIGN Expression
		{ $$ = N.Assign.create($1, $2, $3); }
	| Invocation ASSIGN BlockLike
		{ $$ = N.Assign.create($1, $2, $3); }
	| Array ASSIGN Expression
		{ $$ = N.Assign.create($1, $2, $3); } 
	| UNARY_ASSIGN Assignable
		{ $$ = N.Assign.createUnary($2, $1); }
	| Assignable UNARY_ASSIGN
		{ $$ = N.Assign.createUnary($1, $2); }
	| Assignable COMPOUND_ASSIGN Expression
		{ $$ = N.Assign.create($1, $2, $3); }
	;

Identifier
	: IDENTIFIER
		{ $$ = new N.Identifier(yytext, yylineno); }
	;

Var
	: VAR Identifier
		{ $$ = new N.Var([$2], yylineno); }
	| Var ',' Identifier
		{ $$ = $1.add($3, yylineno); }
	;

/* Comma-separated assignments */
AssignList
	: Assignment
		{ $$ = new N.AssignList([$1]); }
	| AssignList ',' Assignment
		{ $$ = $1.add($3); }
	;

Object
	: '{' ObjectPropList '}'
		{ $$ = new N.Obj($2); }
	| '{' '}'
		{ $$ = new N.Obj([], yylineno); }
	;

ObjectPropList
	: ObjectPropDef
		{ $$ = [$1]; }
	| ObjectPropList ',' ObjectPropDef
		{ $$ = $1.concat([$3]); }
	| ObjectPropList Eol ',' ObjectPropDef
		{ $$ = $1.concat([$4]); }
	;

/* definition of a property in an object literal */
ObjectPropDef
	: ObjProp ':' Expression
		{ $$ = [$1, $3]; }
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
	: FnLitParams "->" BlockLike
		{ $$ = new N.Code($1, $3); }
	| "->" BlockLike
		{ $$ = new N.Code([], $2); }
	| '@' Identifier WS FnLitParams "->" BlockLike
		{ $$ = new N.Code($4, $6, $2); }
	;

Cps
	: CpsParams "<-" Expression Eol LineList CPSSTOP
		{ $$ = new N.Block([ N.Cps($3, new N.Code($1, $5)) ]); }
	;

CpsParams
	: CPS Identifier FN_LIT_PARAM
		{ $$ = [$2]; }
	| CpsParams Identifier FN_LIT_PARAM
		{ $1.push($2); $$ = $1; }
	;

FnLitParams
	: '\'
		{ $$ = []; }
	| FnLitParams Identifier FN_LIT_PARAM
		{ $$ = $1.concat($2); }
	;

/* Indexing into an object or array using bracket notation. */
Accessor
	: '.' Identifier
		{ $$ = new N.Access($2); }
	| '[' Expression ']'
		{ $$ = new N.Index($2); }
	| '.' INTEGER
		{ $$ = new N.Index(new N.Literal($2, yylineno)); }
	;

/* The array literal. */
Array
	: '[' ']'
		{ $$ = new N.Arr([], yylineno); }
	| '[' Arguments ']'
		{ $$ = new N.Arr($2, yylineno); }
	| WORDS
		{ $$ = N.words($1, yylineno); }
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
		{ $$ = new N.While($2, $3, false, null); }
	| "WHILE" AssignList ';' Expression Block
		{ $$ = new N.While($4, $5, false, $2); }
	| "DO" Block "WHILE" Expression 
		{ $$ = new N.While($4, $2, true, null); }
	| "DO" Block "WHILE" AssignList ';' Expression 
		{ $$ = new N.While($6, $2, true, $4); }
	;

/* Array, object, and range comprehensions, at the most generic level.
/* Comprehensions can either be normal, with a block of expressions to execute
/* or postfix, with a single expression. */
For
	: ForHead Block
		{ $$ = $1.setBlock($2); }
	;

IdIn
	: Identifier IN
		{ $$ = [$1] }
	| Identifier ':' Identifier IN
		{ $$ = [$1, $3] }
	;

ForAssign
	: ';'
		{ $$ = null; }
	| AssignList ';'
	;

ForExpression
	: ';'
		{ $$ = null; }
	| Expression ';'
	;


ForHead
	: FOR IdIn Expression
		{ $$ = new N.For({ in: true, id: $2, obj: $3}); }

	| FOR OWN IdIn Expression
		{ $$ = new N.For({ in: true, own: true, id: $3, obj: $4}); }

	| FOR INDEX IdIn Expression
		{ $$ = new N.For({ index: true, id: $3, obj: $4 }); }

	| FOR ForAssign ForExpression AssignList
		{ $$ = new N.For({ init: $2, check: $3, step: $4}); }
	| FOR ForAssign ForExpression
		{ $$ = new N.For({ init: $2, check: $3 }); }
	;

Switch
	: SWITCH Expression INDENT Cases OUTDENT
		{ $$ = new N.Switch($2, $4, null); }
	| SWITCH Expression INDENT Cases DEFAULT Block OUTDENT
		{ $$ = new N.Switch($2, $4, $6); }
	;

Cases
	: Case
		{ $$ = [$1]; }
	| Cases Case
		{ $$ = $1.concat([$2]); }
	;

/* An individual **Case** clause, with action. */
Case
	: CASE ExpressionList Block
		{ $$ = new N.Case($2, $3); }
	;

ExpressionList
	: Expression
		{ $$ = [$1]; }
	| ExpressionList ',' Expression
		{ $$ = $1.concat($3); }
	;

Binary
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


/* Parenthetical expressions. Note that the **Parenthetical** is a **Value**
/* not an **Expression**, so if you need to use an expression in a place
/* where only values are accepted, wrapping it in parentheses will always do
/* the trick. */
Parenthetical
	: '(' Expression ')'
		{ $$ = new N.Parenthetical($2); }
	| '(' Code ')'
		{ $$ = new N.Parenthetical($2); }
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

/* The full complement of *if* expressions, including postfix one-liner
/* *if* and *unless*. */
IfCase
	: IF CASE INDENT IfCaseList OUTDENT
		{ $$ = N.If.fromList($4); }
	/* | IfCase IfCaseCase
		{ $$ = $1.addElse($2); }
*/
	;

IfCaseList
	: IfCaseSingle
		{ $$ = [$1]; }
	| IfCaseList IfCaseSingle
		{ $1.push($2); $$ = $1; }
	;

IfCaseSingle
	: Expression '->' BlockLike
		{ $$ = new N.If($1, $3); }
	| DEFAULT '->' BlockLike
		{ $$ = $3; }
	;

