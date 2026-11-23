# Adaptive Programming Lab syllabus

Four courses, 104 lessons. Each lesson teaches one concept. A lesson may only use what earlier lessons of
the same course have taught (plus its own new idea). Lesson ids and unit ids are fixed: saved progress
depends on them.

"Build" lessons introduce nothing new. They build one small program step by step from what the unit
taught, and end with a `write` item that puts the whole program together.

## Python (`content/python/`)

### Unit 1, First steps: `u1-first-steps.js` (`py-u1`)
| id | title | scope |
|---|---|---|
| `py-print` | Say hello with print() | `print()`, text in quotes, lines run top to bottom |
| `py-variables` | Remember things with variables | `=`, using a name, giving a new value, case-sensitive names |
| `py-numbers` | Numbers and math | `+ - * /`, integers and floats, `//`, `%`, `**`, order of operations |
| `py-strings` | Working with text | joining with `+`, `str()` and `int()`, f-strings, `len()` |

### Unit 2, Decisions: `u2-decisions.js` (`py-u2`)
| id | title | concept | scope |
|---|---|---|---|
| `py-booleans` | True or False | comparing values (True and False) | `==`, `!=`, `<`, `>`, `<=`, `>=`; the values `True` and `False`; `=` stores, `==` compares; comparing strings with `==` |
| `py-if` | Make a choice with if | choosing with if and else | `if` with a colon and an indented block (4 spaces); code after the block always runs; `else` |
| `py-elif` | More choices with elif | choosing between many options with elif | `elif` chains; only the first true branch runs; order matters; final `else` |
| `py-logic` | and, or, not | combining conditions with and, or, not | `and`, `or`, `not`; using them inside `if` |

### Unit 3, Loops: `u3-loops.js` (`py-u3`)
| id | title | concept | scope |
|---|---|---|---|
| `py-while` | Repeat with while | repeating with while loops | `while` condition; a counter that changes; `+=`; the loop stops when the condition is False; what makes a loop never end (explain, never run one) |
| `py-for-range` | Count with for and range() | counting with for and range() | `for i in range(n)` starts at 0 and stops before n; `range(a, b)`; `range(a, b, step)` |
| `py-loop-patterns` | Loop patterns: totals and counts | adding up and counting in a loop | start a total at 0 and add in the loop; count with an `if` inside a loop |
| `py-fizzbuzz` | Build: FizzBuzz | combining loops and decisions | Build lesson: `for`, `if / elif / else`, `%`. Print numbers 1 to 15 with Fizz, Buzz, FizzBuzz |

### Unit 4, Lists and dictionaries: `u4-collections.js` (`py-u4`)
| id | title | concept | scope |
|---|---|---|---|
| `py-lists` | Keep values in a list | storing values in a list | create a list; index from 0; `[-1]` for the last item; `len()`; change an item |
| `py-list-methods` | Change a list | adding and removing list items | `append()`, `insert()`, `pop()`, `remove()`, `in` |
| `py-for-lists` | Loop over a list | looping over a list | `for item in items`; total, count and largest patterns; build a new list with `append()` |
| `py-dicts` | Dictionaries | looking up values in a dictionary | key and value pairs; read by key; add and update; `in`; `len()`; loop with `.items()` |

### Unit 5, Functions: `u5-functions.js` (`py-u5`)
| id | title | concept | scope |
|---|---|---|---|
| `py-functions` | Write your own function | defining and calling functions | `def`, calling, parameters and arguments; define before you call |
| `py-return` | Give back a result with return | returning values from functions | `return` versus `print`; use the result in other code; a function ends at `return`; `None` when nothing is returned |
| `py-scope` | Where variables live | local and global variables | variables made inside a function are local; parameters are local; reading a global; a local name does not change a global with the same name |
| `py-quiz-scorer` | Build: a quiz scorer | combining functions, lists and loops | Build lesson: functions that take a list, loop over it and return a result |

### Unit 6, Text and errors: `u6-text-and-errors.js` (`py-u6`)
| id | title | concept |
|---|---|---|
| `py-string-methods` | Text tools: string methods | changing and checking text with string methods |
| `py-slicing` | Take a slice | taking parts of strings and lists with slices |
| `py-errors` | When things go wrong: try and except | handling errors with try and except |
| `py-word-counter` | Build: a word counter | combining text methods, loops and dictionaries |

### Unit 7, Data toolkit: `u7-data-toolkit.js` (`py-u7`)
| id | title | concept |
|---|---|---|
| `py-tuples-sets` | Tuples and sets | using tuples and sets |
| `py-nested-data` | Data inside data | reading nested lists and dictionaries |
| `py-comprehensions` | Build a list in one line | building lists with list comprehensions |
| `py-grade-book` | Build: a grade book | combining nested data, functions and comprehensions |

### Unit 8, Think like a programmer: `u8-thinking-like-a-programmer.js` (`py-u8`)
| id | title | concept |
|---|---|---|
| `py-search` | Find it: searching a list | searching a list with a loop |
| `py-sorting` | Put it in order: sorting | putting items in order with sorting |
| `py-recursion` | A function that calls itself | recursion, a function that calls itself |
| `py-debugging` | Build: a bug hunter | finding and fixing bugs |

## JavaScript (`content/javascript/`)

### Unit 1, First steps: `u1-first-steps.js` (`js-u1`)
| id | title | concept | scope |
|---|---|---|---|
| `js-log` | Say hello with console.log() | showing text with console.log() | `console.log()`, strings in quotes, semicolons, lines run top to bottom |
| `js-variables` | Remember things with let and const | storing values with let and const | `let`, giving a new value, `const` cannot be given a new value, case-sensitive names |
| `js-numbers` | Numbers and math | doing math with numbers | `+ - * /`, `%`, `**`, order of operations, division gives decimals (`7 / 2` is `3.5`) |
| `js-strings` | Working with text | joining and formatting text | joining with `+`, template literals with `${}`, `.length`, `Number()` and `String()`, `"5" + 1` gives `"51"` |

### Unit 2, Decisions: `u2-decisions.js` (`js-u2`)
| id | title | concept | scope |
|---|---|---|---|
| `js-booleans` | true or false | comparing values (true and false) | `===`, `!==`, `<`, `>`, `<=`, `>=`; `true` and `false`; `=` stores, `===` compares; why `===` and not `==` |
| `js-if` | Make a choice with if | choosing with if and else | `if (condition) { }`, `else { }`, code after the block always runs |
| `js-else-if` | More choices with else if | choosing between many options with else if | `else if` chains; only the first true branch runs; order matters |
| `js-logic` | &&, || and ! | combining conditions with &&, || and ! | `&&`, `||`, `!`; using them inside `if` |

### Unit 3, Loops: `u3-loops.js` (`js-u3`)
| id | title | concept | scope |
|---|---|---|---|
| `js-while` | Repeat with while | repeating with while loops | `while (condition) { }`; a counter that changes; `+=` and `++`; what makes a loop never end (explain, never run one) |
| `js-for` | Count with for loops | counting with for loops | `for (let i = 0; i < n; i++) { }`: start, condition, step; counting up, down and in steps |
| `js-loop-patterns` | Loop patterns: totals and counts | adding up and counting in a loop | start a total at 0 and add in the loop; count with an `if` inside a loop |
| `js-times-table` | Build: a times table | combining loops and decisions | Build lesson: `for`, template literals, `if`. Print a times table and mark some rows |

### Unit 4, Arrays and objects: `u4-collections.js` (`js-u4`)
| id | title | concept | scope |
|---|---|---|---|
| `js-arrays` | Keep values in an array | storing values in an array | create an array; index from 0; `.length`; last item with `[items.length - 1]`; change an item |
| `js-array-methods` | Change an array | adding and removing array items | `push()`, `pop()`, `unshift()`, `shift()`, `includes()`, `indexOf()` |
| `js-for-of` | Loop over an array | looping over an array | `for (const item of items)`; total, count and largest patterns |
| `js-objects` | Objects | storing named values in an object | properties; read with a dot; add and update; square brackets with a string key; an array of objects |

### Unit 5, Functions: `u5-functions.js` (`js-u5`)
| id | title | concept | scope |
|---|---|---|---|
| `js-functions` | Write your own function | defining and calling functions | `function name(params) { }`, calling, parameters and arguments |
| `js-return` | Give back a result with return | returning values from functions | `return` versus `console.log`; use the result; a function ends at `return`; `undefined` when nothing is returned |
| `js-arrow` | Arrow functions | writing arrow functions | `const add = (a, b) => a + b;`; a body in braces needs `return`; same calls as before |
| `js-cart` | Build: a shopping cart | combining functions, arrays and objects | Build lesson: functions that loop over an array of objects and return a result |

### Unit 6, Smarter collections: `u6-arrays-and-objects.js` (`js-u6`)
| id | title | concept |
|---|---|---|
| `js-function-values` | Pass a function to a function | passing a function as a value |
| `js-map-filter` | Transform and pick with map and filter | making new arrays with map and filter |
| `js-reduce-find` | Find, check and add up | finding items and adding up with find, some, every and reduce |
| `js-shopping-report` | Build: a shopping report | combining arrays of objects with map, filter and reduce |

### Unit 7, Modern JavaScript: `u7-modern-js.js` (`js-u7`)
| id | title | concept |
|---|---|---|
| `js-destructuring-spread` | Unpack and copy with destructuring and spread | unpacking values with destructuring and copying with spread |
| `js-errors` | When things go wrong: try and catch | handling errors with try, catch and throw |
| `js-json` | Save data as text with JSON | turning data into text and back with JSON |
| `js-todo-app` | Build: a to-do list | combining functions, array methods and objects |

## SQL (`content/sql/`)

All lessons query the camp shop database in `content/sql/db.js`.

### Unit 1, Asking questions: `u1-asking.js` (`sql-u1`)
| id | title | concept | scope |
|---|---|---|---|
| `sql-select` | Ask for data with SELECT | choosing columns with SELECT | tables, rows and columns; `SELECT columns FROM table;`; `SELECT *` |
| `sql-where` | Filter rows with WHERE | filtering rows with WHERE | `=`, `<>`, `<`, `>`, `<=`, `>=`; text in single quotes; numbers without quotes |
| `sql-and-or` | Combine filters | combining conditions with AND, OR, IN and BETWEEN | `AND`, `OR`, `NOT`, `IN (...)`, `BETWEEN a AND b` (both ends included) |
| `sql-order-limit` | Sort and limit results | sorting with ORDER BY and LIMIT | `ORDER BY` with `ASC` and `DESC`; sort by two columns; `LIMIT n`; top-N queries |

### Unit 2, Finding patterns: `u2-patterns.js` (`sql-u2`)
| id | title | concept | scope |
|---|---|---|---|
| `sql-distinct-like` | Unique values and text search | finding unique values and matching text | `DISTINCT`; `LIKE` with `%` and `_` |
| `sql-null` | Missing values with NULL | finding missing values with NULL | `NULL` means no value; `IS NULL`, `IS NOT NULL`; why `= NULL` finds nothing |
| `sql-expressions` | Calculate new columns | calculating columns and naming them with AS | math in SELECT (`price * 2`); `AS` aliases; `ROUND()`; integer division (`7 / 2` is `3`) |
| `sql-shop-report` | Build: a shop report | combining filters, sorting and calculated columns | Build lesson: one query grown clause by clause |

### Unit 3, Summaries: `u3-summaries.js` (`sql-u3`)
| id | title | concept | scope |
|---|---|---|---|
| `sql-aggregates` | Count and add up | summarising rows with COUNT, SUM, AVG, MIN and MAX | `COUNT(*)`, `COUNT(column)` skips NULL, `SUM`, `AVG` with `ROUND`, `MIN`, `MAX`; with `WHERE` |
| `sql-group-by` | Group rows with GROUP BY | grouping rows with GROUP BY | one result row per group; group column plus aggregates; `ORDER BY` an aggregate |
| `sql-having` | Filter groups with HAVING | filtering groups with HAVING | `HAVING` filters groups after grouping; `WHERE` filters rows before; both in one query |
| `sql-best-sellers` | Build: best sellers | combining grouping, filtering and sorting | Build lesson on the `orders` table: totals per product id, filtered and sorted |

### Unit 4, Joining and changing data: `u4-joins-changes.js` (`sql-u4`)
| id | title | concept | scope |
|---|---|---|---|
| `sql-join` | Connect tables with JOIN | joining two tables with JOIN | why data is split into tables; `JOIN ... ON`; `table.column`; short table aliases |
| `sql-left-join` | Keep every row with LEFT JOIN | keeping unmatched rows with LEFT JOIN | `LEFT JOIN` keeps rows with no match and fills `NULL`; find rows with no match using `IS NULL` |
| `sql-change-data` | Add, change and remove rows | changing data with INSERT, UPDATE and DELETE | `INSERT INTO ... VALUES`; `UPDATE ... SET ... WHERE`; `DELETE FROM ... WHERE`; the danger of forgetting `WHERE` |
| `sql-create-table` | Make your own table | creating a table with CREATE TABLE | `CREATE TABLE`, column types `INTEGER`, `REAL`, `TEXT`, `PRIMARY KEY`, `NOT NULL`; then insert and query |

### Unit 5, Deeper queries: `u5-deeper-queries.js` (`sql-u5`)
| id | title | concept |
|---|---|---|
| `sql-case` | Label rows with CASE | labeling rows with CASE |
| `sql-subqueries` | A question inside a question | using a subquery in WHERE |
| `sql-distinct-union` | Stack lists with UNION | stacking two result lists with UNION |
| `sql-camp-report` | Build: the camp report | combining joins, grouping, CASE and a subquery |

### Unit 6, Designing data: `u6-designing-data.js` (`sql-u6`)
| id | title | concept |
|---|---|---|
| `sql-alter-table` | Add a column with ALTER TABLE | adding a column with ALTER TABLE |
| `sql-constraints-keys` | Keys and rules that protect data | protecting data with keys and rules |
| `sql-views-aliases` | Save a query as a VIEW | saving a query as a view and using table aliases |
| `sql-shop-analysis` | Build: a shop analysis | combining a view, joins, grouping and CASE |

## HTML & CSS (`content/web/`)

### Unit 1, HTML basics: `u1-html.js` (`web-u1`)
| id | title | concept | scope |
|---|---|---|---|
| `web-tags` | Tags and elements | building a page with tags | opening and closing tags; `<h1>` and `<p>`; an element is tag plus content |
| `web-text` | Headings and text | structuring text with headings and emphasis | `<h1>` to `<h3>` as an outline; `<strong>`, `<em>`, `<br>` |
| `web-links-images` | Links and images | adding links and images | `<a href="...">`; `<img src="..." alt="...">`; attributes; `<img>` has no closing tag |
| `web-lists` | Lists | making lists | `<ul>`, `<ol>`, `<li>`; a list inside a list item |

### Unit 2, CSS basics: `u2-css.js` (`web-u2`)
| id | title | concept | scope |
|---|---|---|---|
| `css-rules` | Style a page with CSS | writing CSS rules | `<style>`; selector, property, value; `color`, `background-color`; one rule styles every matching element |
| `css-classes` | Classes and ids | choosing elements with classes and ids | `class="..."` and `.name`; `id="..."` and `#name`; several elements can share a class |
| `css-text` | Style your text | styling text with CSS | `font-size` in px, `font-family`, `font-weight`, `text-align` |
| `css-box` | The box model | spacing elements with the box model | `padding`, `border`, `margin`; `width`; `border-radius` |

### Unit 3, Layout and build: `u3-layout.js` (`web-u3`)
| id | title | concept | scope |
|---|---|---|---|
| `web-structure` | The shape of a full page | structuring a full HTML page | `<!DOCTYPE html>`, `<html>`, `<head>`, `<title>`, `<body>`; `<header>`, `<main>`, `<footer>` |
| `css-flex` | Line things up with flexbox | arranging elements with flexbox | `display: flex` on the parent; `gap`; `justify-content`; `align-items` |
| `web-forms` | Buttons and inputs | adding buttons and inputs | `<button>`, `<input type="text">`, `<label for>`, `placeholder`; styling a button |
| `web-profile-card` | Build: a profile card | combining HTML structure and CSS styling | Build lesson: a card with an image, a heading, text and a link, styled with classes, the box model and flexbox |

### Unit 4, Forms and polish: `u4-forms-and-polish.js` (`web-u4`)
| id | title | concept |
|---|---|---|
| `web-form-fields` | Forms and input types | building forms with different input types |
| `web-css-variables` | Reuse a color with CSS variables | storing a value once with CSS variables |
| `web-transitions-hover` | Hover effects and transitions | changing styles on hover with a transition |
| `web-signup-card` | Build: a sign-up card | combining forms, variables and hover effects |

### Unit 5, Pages for everyone: `u5-pages-for-everyone.js` (`web-u5`)
| id | title | concept |
|---|---|---|
| `web-semantic-html` | Semantic HTML: elements with meaning | choosing elements that describe the parts of a page |
| `web-accessibility` | Accessible pages: alt, labels and contrast | making a page easy to use for everyone |
| `web-tables-lists` | Tables for data | showing data in a table |
| `web-page-project` | Build: a camp web page | combining page structure, accessible images and a styled table |
