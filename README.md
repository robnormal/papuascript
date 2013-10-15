# A JavaScript-y Javascript Alternative

I wanted a better syntax for JavaScript, but alternatives like
coffee-script are basically separate languages. That's not what
I wanted, so I made PapuaScript. PapuaScript retains all the
basic elements of JavaScript, with a few simple additions to aid
in function-oriented programming.

PapuaScript takes / steals many ideas from Haskell. It looks like
Haskell. A lot.

# Features
* Line-for-line translation to JavaScript, for easy debugging.
* No new reserved words.
* Greatly reduces the need for punctuation without introducing
  ambiguity.
* Concise function definition.
* Simple significant whitespace rules.
* The `:=` operator is used for assigning values to variables
  defined in an outer scope, helping you keep track of side
  effects.
* Nested functions can be made more readable using `<-`. This
  allows you to make code written in continuation-passing style
  look more like standard imperative code. This is similar to the
  "do" syntax in Haskell.
* Assignments have no return value. This is not a bug, it's
  a feature. Seriously.

# Some translations
+------------------------------+------------------------------+
| JavaScript                   | PapuaScript                  |
+==============================+==============================+
|`foo(bar, spam)`              |`foo bar spam`                |
+------------------------------+------------------------------+
|`foo(bar(spam))`              |`foo (bar spam)`              |
+------------------------------+------------------------------+
|`a(b) + c`                    |`a b + c`                     |
+------------------------------+------------------------------+
|`a(b + c)`                    |`a (b + c)`                   |
+------------------------------+------------------------------+
|`var foo = bar`               |`foo = bar`                   |
+------------------------------+------------------------------+
|`a === b`                     |`a == b`                      |
+------------------------------+------------------------------+
|`a == b`                      |no equivalent                 |
+------------------------------+------------------------------+
|`a = b = c`                   |`a = c, b = c`                |
+------------------------------+------------------------------+
|```                           |                              |
|function(x, y) {              |`\x y -> x + y`               |
|   return x + y;              |                              |
|}                             |                              |
|```                           |                              |
+------------------------------+------------------------------+
|`a ? b : c`                   |`?? a : b : c`                |
+------------------------------+------------------------------+
|```                           |```                           |
|for (var i = 0; i < 5; i++) { |for i = 0; i < 5; i++         |
|   blah(i);                   |   blah I                     |
|}                             |                              |
|```                           |```                           |
+------------------------------+------------------------------+
|```                           |```                           |
|while (row = getRow()) {      |while row = getRow(); row     |
|```                           |```                           |
+------------------------------+------------------------------+


# Syntactic Sugars

+--------------------------+------------------------------+
| Sugared                  | Unsugared                    |
+==========================+==============================+
|`foo # bar spam`          |`foo (bar spam)`              |
+--------------------------+------------------------------+
|`foo bar .spam eggs`      |`(foo bar).spam eggs`         |
+--------------------------+------------------------------+
|``beta `alpha` gamma``    |`alpha beta gamma`            |
+--------------------------+------------------------------+
|`toInt x = parseInt x 10` |`toInt = \x -> parseInt x 10` |
+--------------------------+------------------------------+
|```                       |```                           |
|makeBreakfast = \eggs ->  |makeBreakfast = \eggs ->      |
|   spam <- foo bar        |   foo bar \spam ->           |
|   spam eggs              |      spam eggs               |
|```                       |```                           |
+--------------------------+------------------------------+
|```                       |```                           |
|bigBreakfast =            |bigBreakfast =                |
|   spam <- foo bar        |   foo bar \spam ->           |
|   spam 12                |      spam 12                 |
|```                       |```                           |
+--------------------------+------------------------------+
|```                       |```                           |
|bigMeal =                 |bigMeal =                     |
|   time <- timeOfDay      |   timeOfDay \time ->         |
|   meal = mealAt time     |      meal = mealAt time      |
|   food <- foodFor meal   |      foodFor meal \food ->   |
|   make food              |         make food            |
|```                       |```                           |
+--------------------------+------------------------------+
|`(foo @ bar @)`           |`\a b -> foo a bar b`         |
+--------------------------+------------------------------+
|`(@ + 3)`                 |`\a -> a + 3`                 |
+--------------------------+------------------------------+

: Pure, line-for-line rewrites.

+--------------------------+------------------------------+
| Sugared                  | Unsugared                    |
+==========================+==============================+
|`with (foo bar) [a, b]`   |`_obj = foo bar, a = _obj.a, b = _obj.b`|
+--------------------------+------------------------------+
|`for own k in y`          |```                           |
|                          |for k in y                    |
|                          |   if y.hasOwnProperty k      |
|                          |```                           |
+--------------------------+------------------------------+
|`for k:x in y`            |```                           |
|                          |for k in y                    |
|                          |   x = y[k]                   |
|                          |```                           |
+--------------------------+------------------------------+
|`for k in foo bar`        |```                           |
|                          |_var = foo bar                |
|                          |for k in _var                 |
|                          |```                           |
+--------------------------+------------------------------+
|`for index i in y`        |`for i = 0, _len = y.length; i < _len; i++` |
+--------------------------+------------------------------+

: These "sugars" are more like macros. Variables created are
guaranteed not to collide with existing variables.


# TODO: Explanation of language
## Whitespace

## Function calls
### order of precedence

## The dot

## Assignments are not expressions

## if, switch, and try are expressions

## Function literals
### Declaration
### Return values

## Variable scope and :=

## The CPS arrow

## The pound sign

## Switch cases

