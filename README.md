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

| JavaScript                   | PapuaScript                  |
|------------------------------|------------------------------|
|`foo(bar, spam)`              |`foo bar spam`                |
|`var foo = bar`               |`foo = bar`                   |
|`a === b`                     |`a == b`                      |
|`a == b`                      |no equivalent                 |
|`a = b = c`                   |`a = c, b = c`                |
|`while (row = getRow()) {`    |`while row = getRow(); row`   |
|`a ? b : c`                   |`?? a : b : c`                |


JavaScript:

```javascript
var add = function(x, y) {
   return x + y;
};
```

PapuaScript:

`\x y -> x + y`

JavaScript:

```
for (var i = 0; i < 5; i++) {
   blah(i);
}
```

PapuaScript:
```
for i = 0; i < 5; i++
   blah i
```

# Syntactic sugars

| Sugared                  | Unsugared                    |
|--------------------------|------------------------------|
|`foo # bar spam`          |`foo (bar spam)`              |
|`foo bar .spam eggs`      |`(foo bar).spam eggs`         |
|``beta `alpha` gamma``    |`alpha beta gamma`            |
|`toInt x = parseInt x 10` |`toInt = \x -> parseInt x 10` |

Sugared:
```
makeBreakfast = \eggs ->
   spam <- foo bar
   spam eggs
```

Unsugared:
```
makeBreakfast = \eggs ->
   foo bar \spam ->
      spam eggs
```

Sugared:
```
bigBreakfast =
   spam <- foo bar
   spam 12
```

Unugared:
```
bigBreakfast =
   foo bar \spam ->
       spam 12
```

Sugared:
```
bigMeal =
   time <- timeOfDay
   meal = mealAt time
   food <- foodFor meal
   make food
```

Unugared:
```
bigMeal =
   timeOfDay \time ->
      meal = mealAt time
      foodFor meal \food ->
         make food
```


# TODO: explain syntax

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

