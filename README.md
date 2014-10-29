# A Function-oriented Dialect of JavaScript

I wanted a better syntax for JavaScript, but alternatives like
coffee-script are basically separate languages. That's not what
I wanted, so I made Papuascript. Papuascript retains all the
basic elements of JavaScript, with a few differences intended to
help keep track of side effects, and generally make
function-oriented programming a little easier.

Papuascript takes many syntactic ideas from Haskell.

# Features

* Line-for-line translation to JavaScript, for easy debugging.
* Two-way translatable - every JavaScript program has
  a Papuascript translation.
* No new reserved words (per above)
* Greatly reduces the need for punctuation without introducing
  ambiguity.
* Very concise function definition.
* Significant whitespace, with simple rules.
* The `:=` operator is used for assigning values to variables
  defined in an outer scope, helping you keep track of side
  effects.
* Assignments have no return value. This is not a bug, it's
  a feature. Seriously.
* Nested functions can be made more readable using `<-`. This
  allows you to make code written in continuation-passing style
  look more like standard imperative code. This is similar to the
  "do" syntax in Haskell.
* TODO: Allow significant whitespace to be suspended, a la
  Haskell's `{}` syntax

# Some translations

 JavaScript                   | Papuascript
------------------------------|-----------------------------
`var a = 5`                   |`a = 5`
`a = 5`                       |`a := 5` (only for variables in outer scope)
`foo(bar, spam)`              |`foo bar spam`
`foo()`                       |same
`var foo = bar`               |`foo = bar`
`a === b`                     |`a == b`
`a == b`                      |no equivalent
`a = b = c`                   |`a = c, b = c`
`while (row = getRow()) {`    |`while row = getRow(); row`
`a ? b : c`                   |`?? a : b : c`
`void 0`                      |`undefined`
`a[2]`                        |`a.2` or `a[2]`
`// comment`                  |same
`/* comment */`               |same (but can be nested)
`var x, y`                    |same - use to set scope w/o assigning a value

Javascript:
```javascript
var add = function(x, y) {
   return x + y;
};
```

Papuascript:
```
add = \x y -> x + y
```

Javascript:
```javascript
for (var i = 0; i < 5; i++) {
   blah(i);
}
```

Papuascript:
```
for i = 0; i < 5; i++
   blah i
```

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

`f a b c` becomes `f(a,b,c)` in Javascript. To call a function
with no arguments, use `f()`.

### Precedence

Function calls have higher precedence then operators.

| Papuascript             | JavaScript                 |
|-------------------------|----------------------------|
|`a b c + foo bar * spam` |`a(b, c) + foo(bar) * spam` |
|`a b (foo + bar) c`      |`a(b, foo + bar, c)`        |

## Space-dot

A dot `.` preceded immediately by a space has lower
left-precedence than a function call. Thus,
`foo bar .spam eggs` is equivalent to `(foo bar).spam eggs`.
This is to allow for method-chaining without parentheses.

## Assignments are not expressions

Papuascript attempts to separate statements used for their
side-effects from statements that return a value. Assignments
have effects, so `x = y` does not return a value in Papuascript.
Something like `a = b = c` will generate a syntax error. The same
is true for other assignment operators, such as `+=`, `++`, and
`:=`. Likewise, `for`, `while`, `export`, and `import` have no
return value.

## if, switch, and try are expressions

These constructs _do_ return a value. In each case, the value
returned will be the value of the last statement executed.

The following will assign the value `1` to the variable `x`:

```
counter = 3
x =
    if counter < 0
        -1
    else if counter > 0
        1
    else
        0
```

## Function literals

`\x -> x * x` becomes `function(x) { return x * x; }` in
JavaScript.

### Return values

The return value of a function is the value of the last statement
evaluated in it. If that statement is one that returns no value,
such as an assignment, a for-loop, or a while-loop, it returns
`undefined`.

## Variable scope and :=

`a = 4` assigns 4 to a local variable `a`. It is equivalent to
the JavaScript `var a = 4`. To alter the value of a variable from
an outer scope, you must use `b := 4`. Note that function
arguments and `this` refer to variables outside the current
scope.

## The CPS arrow

In JavaScript, there are often times when a function literal is
passed as the last argument to another function. This is
especially common when attaching an event listener, or any time
one is using a function that employs
[continuation-passing style](). To make this easier, and to
assist the coder who wants to employ a more function-oriented
approach, Papuascript takes a cue from Haskell. The following two
pieces of code are equivalent:

```
updateOnClick = \domElement ->
    domElement.addEventListener 'click' \e ->
        if checkEventIsOK e
            domElement.update()

updateOnClick theBigButton
```

is equivalent to

```
updateOnClick = \domElement ->
    e <- domElement.addEventListener 'click'
    if checkEventIsOK e
        domElement.update()

updateOnClick theBigButton
```

Note that the function body extends to the bottom of the block,
so no statements can be put after the call to
`domElement.addEventListener`. Thus, this syntax is mainly useful
in cases where continuation passing is being used heavily.

## The pound sign

`#` encloses the rest of the line in parentheses.

## Switch cases

Cases do not fall through, so there is no need to use the `break`
statement there. To associate multiple cases with a single block,
separate them with commas: `case 1, case 2`

