// Nova's error explanations are checked against the real messages of CPython, Node and SQLite.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { explainError } from '../js/engine/errors.js';
import { runJs } from '../tools/jsrun.mjs';
import { runSql } from '../tools/sqlrun.mjs';
import { DB_SQL } from '../content/sql/db.js';

const PY = [
  ['print(nmae)', 'Python does not know `nmae`'],
  ['if True\n    print(1)', 'A colon is missing'],
  ['print("hi"', 'never closed'],
  ['print("hi)', 'A text value never ends'],
  ['x = 3\nif x = 3:\n    print(x)', 'One = or two?'],
  ['if True:\nprint(1)', 'A block is empty'],
  ['  print(1)', 'indented when it should not be'],
  ['age = 9\nprint("Age: " + age)', 'Text and a number cannot be joined'],
  ['print(3 + "4")', 'does not work on these two values'],
  ['print = 3\nprint(4)', 'used like a function'],
  ['def f(a, b):\n    return a\nf(1)', 'missing a value'],
  ['def f(a):\n    return a\nf(1, 2)', 'wrong number of values'],
  ['int("abc")', 'is not a whole number'],
  ['print(1 / 0)', 'Division by zero'],
  ['xs = [1, 2]\nprint(xs[5])', 'no item at that position'],
  ['d = {"a": 1}\nprint(d["b"])', 'That key is not in the dictionary'],
  ['"abc".shout()', 'has no `shout`'],
];

test('Python: every common error gets an explanation that matches its real message', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'err-'));
  const jobs = PY.map(([code], id) => ({ id, code, trace: null, checks: [] }));
  writeFileSync(path.join(dir, 'j.json'), JSON.stringify(jobs));
  let r;
  for (const cmd of ['py', 'python3', 'python']) { r = spawnSync(cmd, ['-X', 'utf8', 'tools/pyrun.py', path.join(dir, 'j.json'), path.join(dir, 'r.json')]); if (!r.error && r.status === 0) break; }
  const results = JSON.parse(readFileSync(path.join(dir, 'r.json'), 'utf8')).results;
  PY.forEach(([code, want], i) => {
    const res = results[i];
    assert.ok(res.err, `${code} raises`);
    const ex = explainError('python', { name: res.err, message: res.msg, line: 2 });
    assert.ok(ex, `explained: ${res.err}: ${res.msg}`);
    assert.ok(ex.title.includes(want), `"${ex.title}" should include "${want}" for ${res.err}: ${res.msg}`);
  });
});

const JS = [
  ['console.log(nmae);', 'JavaScript does not know `nmae`'],
  ['console.log(x);\nlet x = 1;', 'is used before its line'],
  ['const a = 1;\na = 2;', 'A const cannot get a new value'],
  ['const s = "hi";\ns.toUppercase();', 'is not a function'],
  ['const xs = [];\nconsole.log(xs[3].length);', 'Reading `length` from `undefined`'],
  ['let a = 1;\nlet a = 2;', 'is created twice'],
  ['console.log("hi";', 'A closing bracket is missing'],
  ['if (true) {\nconsole.log(1);', 'The code stops in the middle'],
  ['while (true) {}', 'did not finish'],
];

test('JavaScript: real V8 messages are explained', () => {
  for (const [code, want] of JS) {
    const r = runJs(code);
    assert.ok(r.err, `${code} fails`);
    const ex = explainError('javascript', { name: r.err, message: r.msg });
    assert.ok(ex, `explained: ${r.err}: ${r.msg}`);
    assert.ok(ex.title.includes(want), `"${ex.title}" should include "${want}" for ${r.err}: ${r.msg}`);
  }
});

const SQLS = [
  ['SELECT nme FROM products;', 'There is no column `nme`'],
  ['SELECT * FROM product;', 'There is no table `product`'],
  ['SELECT name FROM WHERE id = 1;', 'SQL got confused near'],
  ["SELECT name FROM products WHERE name = 'Tent", 'SQL cannot read'],
  ['SELECT id FROM orders JOIN campers ON campers.id = orders.camper_id;', 'Which table'],
  ['SELECT category FROM products WHERE COUNT(*) > 2 GROUP BY category;', 'summary function is in the wrong place'],
  ["INSERT INTO campers (id, name, town, age) VALUES (1, 'X', 'Y', 3);", 'already taken'],
  ["INSERT INTO campers (id, name, town) VALUES (20, 'X', 'Y');", 'A required value is missing'],
  ['CREATE TABLE products (id INTEGER);', 'already exists'],
  ["INSERT INTO campers (id, name) VALUES (21, 'X', 'Y');", 'does not match'],
];

test('SQL: real SQLite messages are explained', () => {
  for (const [code, want] of SQLS) {
    const r = runSql(DB_SQL, code);
    assert.ok(r.err, `${code} fails`);
    const ex = explainError('sql', { name: 'SQL error', message: r.msg });
    assert.ok(ex, `explained: ${r.msg}`);
    assert.ok(ex.title.includes(want), `"${ex.title}" should include "${want}" for ${r.msg}`);
  }
});

test('explanations never contain fixed code, and unknown errors give nothing', () => {
  assert.equal(explainError('python', { name: 'WeirdError', message: 'strange' }), null);
  assert.equal(explainError('sql', { name: 'SQL error', message: 'something new' }), null);
  assert.equal(explainError('python', null), null);
  const ex = explainError('python', { name: 'NameError', message: "name 'scroe' is not defined", line: 4 });
  assert.match(ex.text, /on line 4/);
  assert.doesNotMatch(ex.text, /score/, 'it does not guess the correct name for the learner');
});
