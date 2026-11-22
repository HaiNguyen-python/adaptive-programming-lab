/**
 * Grading for every item kind. Pure functions shared by the app and the verifier.
 */

/** Normalise program output for comparison: unify newlines, drop trailing spaces and trailing blank lines. */
export const normOut = (s) =>
  String(s ?? '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');

export function gradeMcq(item, index) {
  return !!(item.options[index] && item.options[index].ok);
}

export function gradePredict(item, text) {
  return normOut(text) === normOut(item.answer);
}

/** tokens: one chosen token per blank. Returns per-blank results so the UI can mark the wrong ones. */
export function gradeFill(item, tokens) {
  const perBlank = item.blanks.map((accepted, i) => accepted.includes(tokens[i]));
  return { correct: perBlank.every(Boolean), perBlank };
}

/** All accepted orders of an order item, as arrays of line strings. */
export function acceptedOrders(item) {
  const orders = [item.lines];
  for (const alt of item.alt || []) orders.push(alt.map((i) => item.lines[i]));
  return orders;
}

/** lines: the learner's chosen lines in order. firstWrong is the first position that fits no accepted order. */
export function gradeOrder(item, lines) {
  const orders = acceptedOrders(item);
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (orders.some((o) => same(o, lines))) return { correct: true, firstWrong: -1 };
  let best = 0;
  for (const o of orders) {
    let n = 0;
    while (n < lines.length && n < o.length && lines[n] === o[n]) n++;
    best = Math.max(best, n);
  }
  return { correct: false, firstWrong: best };
}

export function gradeSpot(item, line) {
  return Number(line) === Number(item.bugLine);
}

/** Source checks for write items: required and forbidden patterns. Returns a list of messages (empty = fine). */
export function sourceProblems(item, source) {
  const problems = [];
  for (const rule of item.mustUse || []) {
    if (!new RegExp(rule.re, rule.flags || '').test(source)) problems.push(rule.msg);
  }
  for (const rule of item.mustNotUse || []) {
    if (new RegExp(rule.re, rule.flags || '').test(source)) problems.push(rule.msg);
  }
  return problems;
}

/**
 * Grade a write item for Python or JavaScript from a run result
 * ({ out, err, results }) produced by the language runner.
 */
export function gradeWriteRun(item, source, run) {
  const failures = [];
  if (run.err) {
    failures.push({ type: 'error', msg: run.err.text || `${run.err.name}: ${run.err.message}` });
    return { passed: false, failures };
  }
  if (item.expectOutput !== undefined && normOut(run.out) !== normOut(item.expectOutput)) {
    failures.push({ type: 'output', expected: normOut(item.expectOutput), got: normOut(run.out) });
  }
  (item.checks || []).forEach((c, i) => {
    const got = run.results ? run.results[i] : undefined;
    if (got !== c.equals) failures.push({ type: 'check', call: c.call, expected: c.equals, got });
  });
  for (const msg of sourceProblems(item, source)) failures.push({ type: 'rule', msg });
  return { passed: failures.length === 0, failures };
}

/** Compare two SQL result sets ({ columns, values }). Row order only matters when ordered is true. */
export function sameResult(a, b, ordered) {
  if (!a || !b) return false;
  if (a.columns.length !== b.columns.length || a.values.length !== b.values.length) return false;
  const key = (row) => row.map((v) => (v === null ? '\u0000NULL' : typeof v === 'number' ? `n:${v}` : `s:${v}`)).join('\u0001');
  const ka = a.values.map(key);
  const kb = b.values.map(key);
  if (!ordered) { ka.sort(); kb.sort(); }
  return ka.every((k, i) => k === kb[i]);
}
