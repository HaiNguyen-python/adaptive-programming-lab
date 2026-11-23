/**
 * Nova explains error messages: a plain-language reading of the most common beginner errors in Python,
 * JavaScript and SQL. It says what the error means and what to look at, but never gives the fixed code,
 * in line with the app's rule that help keeps the thinking with the learner.
 *
 * explainError(lang, err) -> { title, text } | null
 *   lang  'python' | 'javascript' | 'sql'
 *   err   { name, message, line } as produced by js/run/runners.js
 * Text uses the app's lesson formatting (`code` and **bold**).
 */

const q = (s) => `\`${s}\``;
const at = (err) => (err && err.line ? ` on line ${err.line}` : '');

/** Rules are tried in order; the first whose `test` matches wins. `make` builds the explanation. */
const PYTHON = [
  [/name '([^']+)' is not defined/, (m, e) => ({
    title: `Python does not know ${q(m[1])}`,
    text: `Python reached ${q(m[1])}${at(e)} but has no variable or function with that name yet. Check three things: is it spelled exactly like where you created it (capital letters count)? Is it created **before** this line runs? If you meant the word itself as text, it needs quotes.`,
  })],
  [/expected ':'/, (m, e) => ({ title: 'A colon is missing', text: `Lines that start a block, such as ${q('if')}, ${q('for')}, ${q('while')} and ${q('def')}, end with a colon${at(e)}.` })],
  [/'([([{])' was never closed/, (m, e) => ({ title: `An opening ${q(m[1])} is never closed`, text: `Every ${q(m[1])} needs its partner. Count the opening and closing brackets around line ${e.line || 'shown above'}; the missing one is often at the end of that line.` })],
  [/unmatched '([)\]}])'/, (m, e) => ({ title: `A closing ${q(m[1])} has no partner`, text: `Python found ${q(m[1])}${at(e)} without a matching opening bracket. Look for an extra closing bracket or a missing opening one.` })],
  [/unterminated (triple-quoted )?string literal/, (m, e) => ({ title: 'A text value never ends', text: `Text starts with a quote and must end with the same kind of quote${at(e)}. Look for a missing closing quote, or a mix of ${q('"')} and ${q("'")}.` })],
  [/(?:Did|Maybe) you mean[t]? '=='/, (m, e) => ({ title: 'One = or two?', text: `${q('=')} stores a value in a variable. To **compare** two values, Python uses ${q('==')}. Check the condition${at(e)}.` })],
  [/Perhaps you forgot a comma/, (m, e) => ({ title: 'Something between two values is missing', text: `Python found two values side by side with nothing between them${at(e)}. Inside brackets, items are separated by commas; text needs quotes around it.` })],
  [/expected an indented block/, (m, e) => ({ title: 'A block is empty', text: `After a line ending in a colon, the next line must be indented (moved right, usually 4 spaces)${at(e)}.` })],
  [/unexpected indent/, (m, e) => ({ title: 'A line is indented when it should not be', text: `Python only expects indentation after a line that ends with a colon. Check the spaces at the start of the line${at(e)}.` })],
  [/unindent does not match|inconsistent use of tabs/, (m, e) => ({ title: 'The indentation does not line up', text: `Lines in the same block must start at exactly the same position${at(e)}. Use spaces only, the same number on each line.` })],
  [/can only concatenate str \(not "(\w+)"\) to str/, (m) => ({ title: 'Text and a number cannot be joined with +', text: `${q('+')} can join text to text, or add numbers to numbers, but not mix them. Turn the ${m[1] === 'int' || m[1] === 'float' ? 'number' : m[1]} into text first, or use an f-string.` })],
  [/unsupported operand type\(s\) for ([^:]+): '(\w+)' and '(\w+)'/, (m) => ({ title: `${q(m[1].trim())} does not work on these two values`, text: `Python cannot use ${q(m[1].trim())} with a ${q(m[2])} and a ${q(m[3])}. Check the type of each value: is one of them text that looks like a number?` })],
  [/'(\w+)' object is not callable/, (m) => ({ title: 'Something is used like a function but is not one', text: `Brackets after a name, like ${q('name()')}, call a function. Here the name holds a ${q(m[1])}. Did you reuse a function name (such as ${q('print')} or ${q('len')}) for a variable?` })],
  [/missing (\d+) required positional argument/, (m) => ({ title: 'A function call is missing a value', text: `The function needs ${m[1]} more value${m[1] === '1' ? '' : 's'} than you gave it. Compare the call with the ${q('def')} line: one value for each parameter.` })],
  [/takes (\d+) positional arguments? but (\d+) (?:was|were) given/, (m) => ({ title: 'A function call has the wrong number of values', text: `The function takes ${m[1]} value${m[1] === '1' ? '' : 's'}, but the call gives ${m[2]}. Compare the call with the ${q('def')} line.` })],
  [/invalid literal for int\(\) with base 10: '([^']*)'/, (m) => ({ title: `${q(m[1])} is not a whole number`, text: `${q('int()')} can only turn text made of digits into a number. ${q(m[1])} has other characters in it.` })],
  [/division by zero|ZeroDivisionError/, () => ({ title: 'Division by zero', text: 'A number was divided by 0, which has no answer. Check what value the divisor has at that moment.' })],
  [/list index out of range|string index out of range/, () => ({ title: 'There is no item at that position', text: `Positions start at 0, so a list of 3 items has positions 0, 1 and 2. Check the number in the square brackets, and ${q('len()')} of the list.` })],
  [/'(\w+)' object has no attribute '(\w+)'/, (m) => ({ title: `A ${q(m[1])} has no ${q(m[2])}`, text: `The value is a ${q(m[1])}, and ${q(m[2])} is not something a ${q(m[1])} has. Check the spelling, and check that the value is the type you expect.` })],
  [/No module named '([^']+)'/, (m) => ({ title: `There is no module ${q(m[1])} here`, text: 'This module is not available in the app. The lessons only use what Python has built in.' })],
  [/maximum recursion depth/, () => ({ title: 'A function keeps calling itself', text: 'Each call starts another call and none of them stops. A function that calls itself needs a case where it returns without calling itself again.' })],
  [/EOF when reading a line/, () => ({ title: 'input() has nothing to read', text: `${q('input()')} waits for someone to type. Here, store the value in a variable instead, or type answers in the box under the editor in the Playground.` })],
];

const PY_BY_NAME = {
  KeyError: (e) => {
    const k = String(e.message || '').match(/^'([^']*)'$/);
    return { title: 'That key is not in the dictionary', text: `The dictionary has no key ${k ? q(k[1]) : 'with that name'}. Keys must match exactly, including capital letters and quotes. ${q('in')} checks whether a key exists.` };
  },
  SyntaxError: (e) => ({ title: 'Python cannot read this line', text: `Something in the way the code is written${at(e)} is not valid Python. Look at the line shown (and the line before it) for a missing bracket, quote, colon or comma.` }),
  IndentationError: (e) => ({ title: 'The indentation is off', text: `Python uses the spaces at the start of lines to group code${at(e)}. Lines in one block must line up.` }),
  TypeError: (e) => ({ title: 'A value of the wrong type', text: `An operation got a kind of value it cannot work with${at(e)}. Check whether each value is a number, text or a list.` }),
  ValueError: (e) => ({ title: 'The right type, but a value that does not work', text: `A function got a value it cannot use${at(e)}. Print the value just before that line to see what it really is.` }),
};

const JAVASCRIPT = [
  [/Cannot access '([^']+)' before initialization/, (m, e) => ({ title: `${q(m[1])} is used before its line`, text: `Variables made with ${q('let')} or ${q('const')} exist only from the line where they are created. Move the line that creates ${q(m[1])} above where it is used${e.line ? ` (line ${e.line})` : ''}.` })],
  [/^(\w+) is not defined/, (m, e) => ({ title: `JavaScript does not know ${q(m[1])}`, text: `There is no variable or function called ${q(m[1])}${at(e)}. Check the spelling and capital letters, check that it is created with ${q('let')}, ${q('const')} or ${q('function')}, and if it should be text, give it quotes.` })],
  [/Assignment to constant variable/, (m, e) => ({ title: 'A const cannot get a new value', text: `A variable made with ${q('const')} keeps its first value${at(e)}. If it needs to change, create it with ${q('let')}.` })],
  [/([\w.$[\]]+) is not a function/, (m, e) => ({ title: `${q(m[1])} is not a function`, text: `Brackets after a name call a function, but ${q(m[1])} holds something else${at(e)}. Check the spelling (method names are case-sensitive, for example ${q('toUpperCase')}).` })],
  [/Cannot read properties of (undefined|null) \(reading '([^']+)'\)/, (m, e) => ({ title: `Reading ${q(m[2])} from ${q(m[1])}`, text: `The value before ${q(`.${m[2]}`)} is ${q(m[1])}${at(e)}, so it has nothing to read. Often an index is past the end of an array, or a property name is misspelled.` })],
  [/Identifier '([^']+)' has already been declared/, (m) => ({ title: `${q(m[1])} is created twice`, text: `A name can be created with ${q('let')} or ${q('const')} only once in the same block. To change it later, leave out ${q('let')}.` })],
  [/missing \) after argument list/, (m, e) => ({ title: 'A closing bracket is missing', text: `A function call is not closed with ${q(')')}${at(e)}. Text inside the call may also be missing a quote.` })],
  [/Unexpected end of input/, () => ({ title: 'The code stops in the middle', text: `Something opened is never closed, usually a ${q('{')} or a ${q('(')}. Count the opening and closing braces.` })],
  [/Invalid or unexpected token|Unterminated string constant/, (m, e) => ({ title: 'JavaScript cannot read a character', text: `Often a text value has no closing quote, or uses curly quotes instead of straight ones${at(e)}.` })],
  [/Unexpected token '([^']+)'/, (m, e) => ({ title: `${q(m[1])} is in an unexpected place`, text: `JavaScript did not expect ${q(m[1])} here${at(e)}. Check the line before it for a missing bracket, comma or operator.` })],
  [/Unexpected identifier '?([^'\s]*)'?/, (m, e) => ({ title: 'Two words side by side', text: `JavaScript found ${m[1] ? q(m[1]) : 'a name'} where it expected an operator, comma or semicolon${at(e)}. Text needs quotes; values in a list need commas.` })],
];

const JS_BY_NAME = {
  SyntaxError: (e) => ({ title: 'JavaScript cannot read this code', text: `Something in the way the code is written is not valid JavaScript${at(e)}. Check brackets, quotes and semicolons.` }),
  TypeError: (e) => ({ title: 'A value of the wrong type', text: `An operation got a value it cannot use${at(e)}. ${q('console.log')} the value just before to see what it really is.` }),
  RangeError: () => ({ title: 'A value is outside what is allowed', text: 'Often a function calls itself without stopping, or an array size is negative.' }),
};

const SQL = [
  [/no such column: ([\w.]+)/, (m) => ({ title: `There is no column ${q(m[1])}`, text: `Check the spelling against the table (the Playground lists every table and its columns). Text values need single quotes, otherwise SQL reads them as column names.` })],
  [/no such table: ([\w.]+)/, (m) => ({ title: `There is no table ${q(m[1])}`, text: `The camp shop has the tables ${q('products')}, ${q('campers')} and ${q('orders')}. Check the name after ${q('FROM')} or ${q('JOIN')}.` })],
  [/near "([^"]+)": syntax error/, (m) => ({ title: `SQL got confused near ${q(m[1])}`, text: `The problem is at or just before ${q(m[1])}. Check the order of the clauses (${q('SELECT')}, ${q('FROM')}, ${q('WHERE')}, ${q('GROUP BY')}, ${q('HAVING')}, ${q('ORDER BY')}, ${q('LIMIT')}) and commas between columns.` })],
  [/unrecognized token: "(.*)"/, (m) => ({ title: `SQL cannot read ${q(m[1])}`, text: 'Often a text value has no closing single quote, or uses double or curly quotes. Text in SQL goes between straight single quotes.' })],
  [/incomplete input/, () => ({ title: 'The query stops too early', text: 'Something is not finished: a quote or bracket that is never closed, or a clause with nothing after it.' })],
  [/ambiguous column name: ([\w.]+)/, (m) => ({ title: `Which table's ${q(m[1])}?`, text: `More than one table in the query has a column ${q(m[1])}. Write the table name (or its short alias) and a dot in front of it.` })],
  [/misuse of aggregate/, () => ({ title: 'A summary function is in the wrong place', text: `Functions like ${q('COUNT')}, ${q('SUM')} and ${q('AVG')} cannot be used in ${q('WHERE')}. To filter on them, use ${q('HAVING')} after ${q('GROUP BY')}.` })],
  [/UNIQUE constraint failed: ([\w.]+)/, (m) => ({ title: 'That value is already taken', text: `${q(m[1])} must be different in every row, and a row with this value already exists.` })],
  [/NOT NULL constraint failed: ([\w.]+)/, (m) => ({ title: 'A required value is missing', text: `${q(m[1])} must always have a value. Give it one in the ${q('INSERT')}.` })],
  [/table (\w+) already exists/, (m) => ({ title: `${q(m[1])} already exists`, text: 'A table with that name is already in the database. Choose another name.' })],
  [/(\d+) values for (\d+) columns/, (m) => ({ title: 'The number of values does not match', text: `The ${q('INSERT')} lists ${m[2]} columns but gives ${m[1]} values. Give one value for each column, in the same order.` })],
];

function match(rules, err) {
  const msg = String((err && (err.message || err.text)) || '');
  for (const [re, make] of rules) {
    const m = msg.match(re);
    if (m) return make(m, err || {});
  }
  return null;
}

export function explainError(lang, err) {
  if (!err || err.name === 'Timeout' || err.name === 'NotLoaded' || err.name === 'RunnerError') {
    if (err && err.name === 'Timeout') return { title: 'The program did not finish', text: 'It ran for several seconds without stopping, so it was stopped. Look for a loop whose condition never becomes false: does the counter really change inside the loop?' };
    return null;
  }
  if (lang === 'python') return match(PYTHON, err) || (PY_BY_NAME[err.name] ? PY_BY_NAME[err.name](err) : null);
  if (lang === 'javascript') return match(JAVASCRIPT, err) || (JS_BY_NAME[err.name] ? JS_BY_NAME[err.name](err) : null);
  if (lang === 'sql') return match(SQL, err);
  return null;
}
