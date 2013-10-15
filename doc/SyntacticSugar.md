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
|`%{doe ray me}`           |`['doe', 'ray', 'me']`        |
+--------------------------+------------------------------+
|`:name`                   |`'name'`                      |
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

