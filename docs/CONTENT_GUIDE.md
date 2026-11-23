# PhD Programming Lab content guide

How to write lessons for PhD Programming Lab. Read this fully before writing. The reference example is
`content/python/u1-first-steps.js`: copy its structure, tone and level of detail.

## 1. Why lessons look the way they do

PhD Programming Lab follows the research plan "The Cost of Easy Answers" (durable, unaided learning and accurate
self-assessment in programming education). That shapes every lesson:

- **Attempt first.** Learners try before they get help. Help is never the answer.
- **Three kinds of help**, chosen by the app: a hint, a hint the learner must explain in their own words,
  or a worked example of a *similar* problem (never the task itself).
- **Solo check after help.** After help, the learner answers a short check item on the same concept, unaided.
- **Memory checks.** The same concept is checked again, unaided, the next day and one week later.
- **Calibration.** Before each solo check the learner rates their confidence; the app compares it with the result.

So each lesson needs: practice steps with two hints each, one worked example of a similar problem, and a
pool of extra check items that test the same concept with a new story ("same pattern, new surface").

## 2. Files

One file per unit: `content/<course>/<unit-file>.js`, default-exporting
`{ id, title, blurb, lessons: [...] }`. Do not change unit ids, lesson ids, `content/index.js`, the
course `index.js` files or `content/sql/db.js`. Plain JavaScript objects only: no imports, no functions.

## 3. Lesson shape

```js
{
  id: 'py-print',                       // given in the syllabus, never change it
  title: 'Say hello with print()',      // 52 characters or fewer
  concept: 'showing text with print()', // completes "A question on ..."; lowercase start
  goals: ['Show text on the screen with print()', '...'],   // 1 to 3 short outcomes
  steps: [ /* teach cards and practice items, in learning order: 9 to 12 steps */ ],
  worked: { /* one worked example of a similar problem */ },
  pool: [ /* exactly 5 unaided check items */ ],
}
```

### Order of steps

Go from reading to writing (trace before write):

1. `teach` (always first), then an easy reading item (`predict` or `mcq`).
2. More `teach` cards, each followed by practice on that idea. Never two teach cards in a row unless the
   second is a `trace`.
3. Constrained writing: `fill`, `order`, `spot`.
4. Last step: one `write` item that combines the lesson.

Every lesson has at least 5 practice items, including at least one `predict`, one `fill`, one `order` or
`spot`, and one `write` (HTML & CSS lessons have no `predict`). Use 2 to 4 teach cards. Use a `trace` step
where watching values change helps (loops, reassignment, function calls): Python and JavaScript only.

## 4. Text rules

Text fields (`text`, `prompt`, `explain`, `why`, hints, goals, worked steps) support only:
`` `inline code` ``, `**bold**` and a blank line (`\n\n`) for a new paragraph. No other Markdown, no HTML.

- Write for a curious 10-year-old and a busy adult at once: short sentences, plain words, no idioms,
  no jokes at anyone's expense. Many learners read English as a second language.
- No contractions ("do not", not "don't"). It reads more clearly and avoids quote problems.
- Introduce each new term once in **bold** with a plain explanation. Use the term consistently after that.
- No em dashes. Use a comma, a colon or a full stop.
- Speak to the learner as "you". Nova is the app's mascot; mention Nova rarely.
- Examples use everyday, friendly themes: games, pets, snacks, music, sport, weather, camping, space,
  school. Invented names from many cultures. No brands, no real people, no real-world facts that could be
  wrong or change (populations, records, prices, dates of events).
- Nothing scary, violent or romantic. This app is used by children.
- Limits (the verifier warns): teach text 520 characters, prompt 300, explain 340, hint 230, why 220.

### Code rules

- Code fields may be a string or an **array of lines** (preferred for more than one line). Never use
  template literals for code. Inside single-quoted JavaScript strings, escape `'` as `\'`.
- At most 12 lines, and lines of 40 characters or fewer where possible (phones are narrow). Over 48 the
  verifier warns, over 64 it fails.
- Spaces only, no tabs. Straight quotes only. No trailing spaces.
- Every snippet must be complete and runnable on its own, and deterministic: no input, no random numbers,
  no dates or times.
- Never state the text of an error message. Name only the error type (`NameError`, `TypeError`,
  `ReferenceError`): messages differ between versions and browsers.

## 5. Step kinds

Every practice item needs `explain`: one or two sentences on *why* the right answer is right. It is shown
after the learner answers. Items in `steps` of kind `fill`, `order` and `write` need exactly two `hints`
(see section 6). Pool items have no hints.

### teach

```js
{ kind: 'teach', title: 'Your first instruction', text: '...', code: 'print("Hi")', output: 'Hi' }
```

`code` and `output` are optional. If the code prints something, `output` is required and is checked
against a real run. To show code that fails on purpose add `error: 'NameError'` (the type it raises).
Use `norun: true` only for a fragment that cannot run on its own.

### trace (Python and JavaScript)

```js
{ kind: 'trace', title: 'Watch the value change', text: 'Press Next to run one line at a time.',
  code: ['coins = 5', 'print(coins)'], watch: ['coins'], steps: [ /* paste from --emit */ ] }
```

Write `steps: []`, run the verifier with `--emit`, and paste the printed steps. One statement per line.
In JavaScript trace code, do not spread an array or object literal over several lines. Keep traces to
40 steps or fewer (small loops).

### mcq

```js
{ kind: 'mcq', prompt: '...', code: [...],        // code is optional
  mono: true,                                      // set when the options are code
  options: [ { t: 'print("x")', ok: true }, { t: 'Print("x")', why: 'Why this choice is wrong.' } ],
  explain: '...' }
```

2 to 4 options, exactly one `ok: true`. Every wrong option gets a `why` that addresses the misconception
behind it, without naming the right answer. The app shuffles options: never write "the first one" or
"all of the above".

### predict

```js
{ kind: 'predict', code: [...], answer: 'exact output',
  options: ['wrong output', 'another wrong output'],   // leave out to make the learner type the answer
  explain: '...' }
```

`answer` is the exact text the code prints (array of lines for several lines), checked against a real run.
With `options` (2 or 3 wrong outputs) the learner chooses; without, the learner types the output, which is
harder. Wrong options should be what a real misconception would produce. The default prompt is "What does
this code print?" (SQL: "What does this query return?"); set `prompt` to change it.

### fill

```js
{ kind: 'fill', prompt: '...', code: ['___ = 7', 'print(___)'],
  blanks: ['lives', 'lives'],                 // correct chip for each ___ in order
  bank: ['lives', 'lives', 'life', '"lives"'], // all chips shown: the correct ones plus 1 to 4 distractors
  output: '7', hints: ['...', '...'], explain: '...' }
```

Blanks are written `___` (three underscores). A blank may accept several chips: `blanks: [['<', '<=']]`.
If the same chip is needed twice, list it twice in `bank`. `output` is the output of the completed code.
The verifier tries **every** combination of chips: if a wrong combination also produces `output`, the item
is ambiguous and fails. Fix it by changing the distractor or the numbers.

### order

```js
{ kind: 'order', prompt: '...', lines: ['price = 10', 'count = 3', 'total = price * count', 'print(total)'],
  alt: [[1, 0, 2, 3]],        // other correct orders, as indexes into lines (only if they exist)
  distractors: ['total = price + count'],   // optional extra wrong lines, at most 2
  output: '30', hints: ['...', '...'], explain: '...' }
```

`lines` is the correct order, 3 to 6 lines, indentation included. The verifier runs every other order: if
another order also gives `output`, add it to `alt` or change the lines. If those other orders would teach
the wrong structure (for example a line moved outside the block it belongs to), set `strict: true`
instead: only the order in `lines` is accepted.

### spot

```js
{ kind: 'spot', prompt: 'This program should print `12`, but it stops with an error. Tap the line with the bug.',
  code: ['age = 12', 'print(Age)'], bugLine: 2, fix: 'print(age)', expect: '12', error: 'NameError',
  explain: '...' }
```

One line is wrong and replacing it with `fix` repairs the program. `expect` is the output after the fix.
Add `error` when the buggy code raises an error; leave it out when the buggy code runs but prints the
wrong thing. Say in the prompt what the program should do and what goes wrong.

### write

```js
{ kind: 'write', prompt: '...', starter: ['price = 9', 'tickets = 4', ''],
  solution: ['price = 9', 'tickets = 4', 'print(price * tickets)'],
  expectOutput: '36',
  checks: [{ call: 'area(2, 3)', equals: '6' }],                       // optional, for functions
  mustUse: [{ re: 'price\\s*\\*\\s*tickets', msg: 'Multiply `price` by `tickets`.' }],
  mustNotUse: [{ re: 'print\\(\\s*36\\s*\\)', msg: 'Use the variables instead of typing 36.' }],
  hints: ['...', '...'], explain: '...' }
```

- `expectOutput`: the exact output the learner's program must print.
- `checks`: expressions evaluated after the learner's code runs; `equals` is the result as the language
  shows it (Python `repr`: `'6'`, `"'hi'"`, `'[1, 2]'`, `'True'`; JavaScript: `'6'`, `"'hi'"`, `'[ 1, 2 ]'`, `'true'`).
- `mustUse` / `mustNotUse`: regular expressions on the source, to stop hard-coded answers. Keep them loose
  so every reasonable solution passes, and give each a helpful `msg`.
- The verifier requires that `solution` passes and `starter` fails. The solution is never shown as help.
- Keep write tasks small: 1 to 6 lines for the learner to type. State exactly what must be printed.

## 6. Hints, worked example and pool

**Hints** (two per `fill`, `order` and `write` item in `steps`):

1. The first hint orients: what to think about, which idea from the lesson applies.
2. The second hint is more specific: where to look, which construct to use, a first step.

Neither hint gives the answer. Do not name the missing chip, do not show the solution line. A good hint
leaves the last step of thinking to the learner.

**Worked example** (`worked`, one per lesson): a *different* problem of the same kind as the lesson's
`write` task, solved step by step. Never reuse the story or the values of any item in the lesson.

```js
worked: {
  title: 'Worked example: counting eggs',
  problem: 'A box holds `6` eggs. You have `4` boxes and `3` loose eggs. Print the total number of eggs.',
  steps: [                                   // 3 to 5 steps
    { label: 'Name the values', code: ['per_box = 6', 'boxes = 4', 'loose = 3'] },
    { label: 'Plan the math', text: 'Eggs in boxes are `per_box * boxes`. Then add the loose eggs.' },
    ...
  ],
  code: [...],        // the complete final program (it is run and checked)
  output: '27',
}
```

Each step has a `label` that names the *purpose* of the step ("Name the values", "Plan the math", "Show the
result"), and `text`, `code` or both. Step `code` is display only; the final `code` is run and checked.

**Pool** (`pool`, exactly 5 items): unaided check items for the same concept. Kinds allowed: `mcq`,
`predict`, `fill`, `spot`. No hints. Each uses a **new story and new values** not used in the steps. At
least two must make the learner produce something (`fill`, or `predict` without options). Together they
should cover the lesson's goals. They are used right after help, at the end of the lesson, the next day and
one week later, so each must stand alone and test understanding, not memory of the lesson's examples.

## 7. Language notes

### Python

- Target Python 3.10 and later; lessons must behave the same on 3.11 to 3.15. No `input()`.
- 4-space indentation. Double quotes for strings. `snake_case` names. f-strings for formatting.
- `checks` values are Python `repr` strings.

### JavaScript

- Modern JavaScript: `let` and `const` (never `var`), `===` and `!==`, semicolons, double quotes for
  strings, template literals for building text, 2-space indentation, `camelCase` names.
- Code runs in strict mode in a worker: no DOM, no `prompt`, no `alert`. Output with `console.log`.
- Printing arrays and objects follows Node: `[ 1, 2, 3 ]`, `{ name: 'Ada', age: 36 }`. Only print arrays of
  6 or fewer simple values, or use `.join(", ")`. The verifier fails if the app and Node would print differently.

### SQL

- The database is fixed: `content/sql/db.js` (tables `products`, `campers`, `orders`). Read it first. Every
  run starts from a fresh copy, so `INSERT`, `UPDATE` and `DELETE` examples are safe.
- Standard SQL that SQLite runs. Keywords in capitals, names in lowercase, text in single quotes, every
  statement ends with `;`. One clause per line for longer queries.
- For SQL, "output" means the result rows as text: cells joined by ` | `, rows by new lines, no header.
  `NULL` is written `NULL`. Decimal results that are whole show as `28.0`, as SQLite shows them.
  Round averages: `ROUND(AVG(price), 1)`. The verifier fails on long decimal tails.
- `teach` and `worked` use `result: { columns: [...], rows: [[...]] }` instead of `output`: write the query,
  run the verifier with `--emit`, and paste the printed result. Keep results to 8 rows or fewer.
- `predict`: `answer` is the result as text (for example `'3'` or `['Tent', 'Lantern']`). Best with one
  column and few rows.
- `write`: give `solution`. The learner's result is compared with the solution's result. Add
  `ordered: true` when the task asks for a sort order. For `INSERT`, `UPDATE`, `DELETE` or `CREATE TABLE`
  tasks add `verify: 'SELECT ... ORDER BY id;'`, a query that shows the changed data.
- Add `ORDER BY` to every query whose row order matters for the answer. Without it, a database may
  return rows in any order.
- Mention differences between database systems only when needed, and only if you are sure.

### HTML & CSS

- HTML5, lowercase tags, double-quoted attributes, 2-space indentation. Code is a page fragment until the
  lesson on page structure. CSS goes in a `<style>` block at the top of the code.
- No scripts. Images only from `assets/img/nova.svg`, `assets/img/tent.svg`, `assets/img/lantern.svg`,
  `assets/img/campfire.svg`. Links point to `https://example.com`.
- No `predict` items. `teach` cards may add `preview: true` to show the rendered page. `fill`, `order` and
  `spot` items have no `output`, `expect` or `error` (nothing is run), so make distractors clearly wrong.
- `write` items use `checks` on the rendered page:

```js
checks: [
  { sel: 'h1', text: 'My Camp', msg: 'Add an <h1> with the text "My Camp".' },   // text of the first match
  { sel: 'li', count: 3, msg: 'Add three <li> items inside the list.' },         // number of matches
  { sel: 'a', attr: { href: 'https://example.com' }, msg: '...' },               // attribute value (true = present and not empty)
  { sel: '.card', style: { 'background-color': 'rgb(255, 255, 0)' }, msg: '...' } // computed style
]
```

  Computed styles are compared as the browser reports them: colors as `rgb(r, g, b)`, sizes in `px`.
  Ask for named colors with a known rgb value or for sizes in px. Each `msg` tells the learner what is missing.

## 8. Checking your work

```
node tools/verify-content.mjs --unit <unit-id>          # for example --unit py-u2
node tools/verify-content.mjs --unit <unit-id> --emit   # also prints real trace steps and SQL results
```

Done means: **0 errors and 0 warnings** for your units. Then read every lesson once more as a learner:
is each answer unambiguous, is each explanation true, does each hint stop short of the answer, does the
pool use new stories?
