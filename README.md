# A JavaScript-y Javascript Alternative

I wanted a better syntax for JavaScript, but alternatives like
coffee-script are basically separate languages. That's not what
I wanted, so I made PapuaScript. PapuaScript retains all the
basic elements of JavaScript, with a few differences intended to
help keep track of side effects, and generally make
function-oriented programming a little easier.

PapuaScript takes / steals many ideas from Haskell. It looks like
Haskell. A lot.

# Features

* Line-for-line translation to JavaScript, for easy debugging.
* Two-way translatable - every JavaScript program has
  a PapuaScript translation.
* No new reserved words (per above)
* Greatly reduces the need for punctuation without introducing
  ambiguity.
* Very concise function definition.
* Significant whitespace, with simple rules.
* TODO: Allows significant whitespace to be suspended, a la
  Haskell's `{}` syntax
* The `:=` operator is used for assigning values to variables
  defined in an outer scope, helping you keep track of side
  effects.
* Statements whose purpose is side effects - assignments and
  loops, for instance - have no return value.
* Nested functions can be made more readable using `<-`. This
  allows you to make code written in continuation-passing style
  look more like standard imperative code. This is similar to the
  "do" syntax in Haskell.
* Assignments have no return value. This is not a bug, it's
  a feature. Seriously.

# Some translations

+------------------------------+-----------------------------+
| JavaScript                   | PapuaScript                 |
+==============================+=============================+
|`foo(bar, spam)`              |`foo bar spam`               |
+------------------------------+-----------------------------+
|`foo()`                       |same                         |
+------------------------------+-----------------------------+
|`var foo = bar`               |`foo = bar`                  |
+------------------------------+-----------------------------+
|`a === b`                     |`a == b`                     |
+------------------------------+-----------------------------+
|`a == b`                      |no equivalent                |
+------------------------------+-----------------------------+
|`a = b = c`                   |`a = c, b = c`               |
+------------------------------+-----------------------------+
|`while (row = getRow()) {`    |`while row = getRow(); row`  |
+------------------------------+-----------------------------+
|`a ? b : c`                   |`?? a : b : c`               |
+------------------------------+-----------------------------+
|`void 0`                      |`undefined`                  |
+------------------------------+-----------------------------+
|`a[2]`                        |`a.2` or `a[2]`              |
+------------------------------+-----------------------------+
|`// comment`                  |same                         |
+------------------------------+-----------------------------+
|`/* comment */`               |same (but can be nested)     |
+------------------------------+-----------------------------+
|`var x, y`                    |same - sets scope w/o        |
|                              |assigning a value            |
+------------------------------+-----------------------------+
|```javascript                 |`\x y -> x + y`              |
|var add = function(x, y) {    |                             |
|   return x + y;              |                             |
|};                            |                             |
|```                           |                             |
+------------------------------+-----------------------------+
|```javascript                 |```                          |
|for (var i = 0; i < 5; i++) { |for i = 0; i < 5; i++        |
|   blah(i);                   |   blah i                    |
|}                             |```                          |
|```                           |                             |
+------------------------------+-----------------------------+

# Syntactic sugars

See doc/SyntacticSugar.md

# TODO: explain syntax

## Whitespace

An _indented block_ begins with a line that is more indented than
the line above it; the indented block ends with (but does not
include) the first line _less indented than the block_.

```
if x
    y = x     // begin indented block A
    if x > z
        foo   // indented block B

    z = y.bar // end indented block A

spam()
```

The line above an indented block is the **parent line**. The
indented block is interpreted as either a continuation of the
parent line or as a proper **block** belonging to the parent
line, according to the following rules:

* An indented block is a **block** if:
    a. Its parent line ends in `->`
    b. Its parent line begins with a block-forming keyword. These
       keywords are:
        - if
        - else
        - for
        - while
        - do
        - switch
        - case
        - default
        - try
        - catch
        - finally
* Otherwise, the block is a continuation of the parent line.

```
while foo == bar
    // this is a block
    doStuff()   
    doOtherStuff()
    bar = newBar()

dinner = corned
    beef +
    cabbage  // this is a single statement
```

## Function calls
### Precedence

Function calls have higher precedence then operators.

| PapuaScript             | JavaScript                 |
|-------------------------|----------------------------|
|`a b c + foo bar * spam` |`a(b, c) + foo(bar) * spam` |
|`a b (foo + bar) c`      |`a(b, foo + bar, c)`        |

## The dot

## Assignments are not expressions

`a = b = c` will generate a syntax error.

## if, switch, and try are expressions

These constructs do return a value.

## Function literals
### Declaration
### Return values

## Variable scope and :=

`a = 4` assigns 4 to a local variable `a`. It is equivalent to
the JavaScript `var a = 4`. To alter the value of a variable from
an outer scope, you must use `b := 4`. Note that function
arguments and `this` refer to variables outside the current
scope.

## The CPS arrow

## The pound sign

## Switch cases

Cases do not fall through, so there is no need to use the `break`
statement there. To associate multiple cases with a single block,
separate them with commas: `case 1, case 2`

