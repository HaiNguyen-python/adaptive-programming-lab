// The app's console.log formatter must print what Node prints.
import test from 'node:test';
import assert from 'node:assert/strict';
import util from 'node:util';
import { inspect, formatArgs } from '../js/run/jsfmt.js';
import { runJs } from '../tools/jsrun.mjs';

const VALUES = [
  1, -0, 0.1 + 0.2, 1 / 3, NaN, Infinity, 10n, true, null, undefined, 'hi', "it's", 'say "hi"', 'a\nb',
  [], {}, [1, 2, 3], ['a', 'b'], [[1, 2], [3, 4]], [1.5, 'x', null, undefined, true],
  { name: 'Ada', age: 36 }, { 'my-key': 1, list: [1, 2] }, { a: { b: { c: { d: 1 } } } },
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  ['apple', 'banana', 'cherry', 'dragonfruit', 'elderberry', 'fig', 'grape'],
  { name: 'A very long name indeed', town: 'Somewhere far away', items: ['lantern', 'tent', 'rope'], nested: { a: 1, b: [1, 2, 3] } },
  [{ name: 'Ada', age: 3 }, { name: 'Bo', age: 4 }],
  [[1, 2, 3], [4, 5, 6], [7, 8, 9]],
  [1.25, 22.5, 333.125, 4, 5, 6, 7, 8],
  [true, false, true, false, true, false, true],
  { a: [], b: {}, c: null, d: undefined },
  Array.from({ length: 30 }, (_, i) => i * 3),
  Array.from({ length: 120 }, (_, i) => i),
  ['x'.repeat(30), 'y'.repeat(30), 'z'.repeat(30)],
  new Map([['a', 1]]), new Set([1, 2]), /ab+c/gi,
  function foo() {}, () => 1, class A {},
  { scores: [90, 85, 77], best: { name: 'Mia', score: 90 }, tags: ['a', 'b'] },
  [['Tent', 120], ['Lantern', 25], ['Rope', 9]],
];

test('inspect matches util.inspect for the values beginners print', () => {
  for (const v of VALUES) assert.equal(inspect(v), util.inspect(v));
});

test('formatArgs prints top-level strings without quotes', () => {
  assert.equal(formatArgs(['Total:', 3, [1, 2], 'ok']), 'Total: 3 [ 1, 2 ] ok');
});

test('runJs captures output, errors, checks and traces', () => {
  const r = runJs('const xs = [1, 2, 3];\nconsole.log(xs, "done");\nconsole.log({ a: 1 });');
  assert.equal(r.out, "[ 1, 2, 3 ] done\n{ a: 1 }\n");
  assert.deepEqual(r.mismatches, []);

  const e = runJs('console.log(missing);');
  assert.equal(e.err, 'ReferenceError');

  const strict = runJs('total = 5;');
  assert.equal(strict.err, 'ReferenceError', 'undeclared variables are an error (strict mode)');

  const c = runJs('function add(a, b) {\n  return a + b;\n}', { checks: ['add(2, 3)', 'add("a", "b")', 'nope(1)'] });
  assert.deepEqual([...c.results], ['5', "'ab'", '⚠ ReferenceError']);

  const t = runJs('let total = 0;\nfor (let i = 1; i <= 2; i++) {\n  total = total + i;\n}\nconsole.log(total);', { trace: ['i', 'total'] });
  assert.deepEqual(JSON.parse(JSON.stringify(t.steps)), [
    { line: 1, vars: {}, out: '' },
    { line: 2, vars: { i: '1', total: '0' }, out: '' },
    { line: 3, vars: { i: '1', total: '0' }, out: '' },
    { line: 2, vars: { i: '2', total: '1' }, out: '' },
    { line: 3, vars: { i: '2', total: '1' }, out: '' },
    { line: 5, vars: { total: '3' }, out: '' },
    { line: 0, vars: { total: '3' }, out: '3\n' },
  ]);

  const loop = runJs('while (true) {}');
  assert.equal(loop.err, 'Timeout');
});
