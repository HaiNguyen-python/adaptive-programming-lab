#!/usr/bin/env node
/**
 * Content verifier. Checks the structure of every lesson and runs every code snippet
 * with a real interpreter (CPython, Node, SQLite) so that no lesson can state a wrong output.
 *
 *   node tools/verify-content.mjs                 verify everything
 *   node tools/verify-content.mjs --course sql    one course
 *   node tools/verify-content.mjs --unit py-u2    one unit
 *   node tools/verify-content.mjs --lesson py-if  one lesson
 *   node tools/verify-content.mjs --emit          also print the real trace steps / SQL results to paste in
 *   node tools/verify-content.mjs --strict        warnings fail the run too
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COURSES } from '../content/index.js';
import { normalizeCourse, fillCode, countBlanks, isItem, POOL_KINDS } from '../js/engine/content.js';
import { gradeFill, gradeOrder, normOut, gradeWriteRun, sameResult, sourceProblems } from '../js/engine/grade.js';
import { runJs } from './jsrun.mjs';
import { runSql } from './sqlrun.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : null; };
const flag = (name) => argv.includes(`--${name}`);
const only = { course: opt('course'), unit: opt('unit'), lesson: opt('lesson') };
const EMIT = flag('emit');
const STRICT = flag('strict');
const RUNNABLE = ['python', 'javascript', 'sql'];

const problems = [];
const emitted = [];
const error = (where, msg) => problems.push({ level: 'error', where, msg });
const warn = (where, msg) => problems.push({ level: 'warn', where, msg });

const jobs = [];
function exec(course, code, opts, cb) {
  if (!RUNNABLE.includes(course.lang)) return;
  jobs.push({ lang: course.lang, code, opts: opts || {}, cb, seed: course.db });
}

const LIMITS = { title: 52, concept: 64, goal: 90, teach: 520, prompt: 300, explain: 340, hint: 230, why: 220, label: 64, problem: 300 };
const CURLY = /[‘’“”]/;

function checkText(where, name, value, max, required = true) {
  if (value === undefined || value === null || value === '') {
    if (required) error(where, `missing "${name}"`);
    return;
  }
  if (typeof value !== 'string') { error(where, `"${name}" must be a string`); return; }
  if (value.length > max) warn(where, `"${name}" is ${value.length} characters (limit ${max})`);
  if ((value.match(/`/g) || []).length % 2) error(where, `"${name}" has an unmatched backtick`);
  const prose = value.split('`').filter((part, i) => i % 2 === 0).join(' ');
  if ((prose.match(/\*\*/g) || []).length % 2) error(where, `"${name}" has an unmatched **`);
  value.split('`').forEach((part, i) => {
    if (i % 2 && CURLY.test(part)) error(where, `"${name}" has curly quotes inside inline code`);
  });
  if (/—/.test(value)) warn(where, `"${name}" contains an em dash; use a comma, colon or full stop`);
  if (/\s{2,}$|^\s/.test(value)) warn(where, `"${name}" starts or ends with spaces`);
}

function checkCode(where, name, code, { allowEmpty = false } = {}) {
  if (typeof code !== 'string') { error(where, `"${name}" must be a string or an array of lines`); return false; }
  if (!code.trim()) { if (!allowEmpty) error(where, `"${name}" is empty`); return allowEmpty; }
  const lines = code.split('\n');
  if (lines.length > 14) warn(where, `"${name}" has ${lines.length} lines (keep to 12 or fewer)`);
  lines.forEach((l, i) => {
    if (l.length > 64) error(where, `"${name}" line ${i + 1} is ${l.length} characters wide (max 64)`);
    else if (l.length > 48) warn(where, `"${name}" line ${i + 1} is ${l.length} characters wide (aim for 40 or fewer)`);
    if (/\t/.test(l)) error(where, `"${name}" line ${i + 1} contains a tab; indent with spaces`);
    if (/\s+$/.test(l)) warn(where, `"${name}" line ${i + 1} has trailing spaces`);
  });
  if (CURLY.test(code)) error(where, `"${name}" contains curly quotes`);
  return true;
}

const show = (s) => JSON.stringify(normOut(s));
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

function jsMismatch(where, r) {
  for (const m of r.mismatches || []) {
    error(where, `console.log output would differ from Node. App: ${JSON.stringify(m.mine)}  Node: ${JSON.stringify(m.node)}. Print simpler values (for example use .join()).`);
  }
}

/** Compare a run with the expected output. Returns true when it matches. */
function expectOutput(where, label, r, expected) {
  if (r.err) { error(where, `${label} raises ${r.err}: ${r.msg}`); return false; }
  if (normOut(r.out) !== normOut(expected)) {
    error(where, `${label}: output mismatch\n      stated: ${show(expected)}\n      actual: ${show(r.out)}`);
    return false;
  }
  return true;
}

const ARTEFACT = 'returns a decimal with a long tail (such as 4.449999999999999). Wrap the value in ROUND().';
const rowsForPaste = (cells, values) => cells.map((row, i) => row.map((t, j) => (values[i][j] === null ? null : typeof values[i][j] === 'number' && String(values[i][j]) === t ? values[i][j] : t)));
function checkSqlResult(where, label, r, expected) {
  if (r.err) { error(where, `${label} fails: ${r.msg}`); return; }
  if (r.artefact) error(where, `${label} ${ARTEFACT}`);
  const actual = r.result ? { columns: r.result.columns, rows: rowsForPaste(r.result.cells, r.result.values) } : null;
  if (!expected) {
    if (actual) { warn(where, `${label} returns rows but the step has no "result"`); if (EMIT) emitted.push({ where, result: actual }); }
    return;
  }
  const text = (rows) => (rows || []).map((row) => row.map((c) => (c === null ? 'NULL' : String(c))));
  if (!r.result || canon({ c: r.result.columns, r: r.result.cells }) !== canon({ c: expected.columns, r: text(expected.rows) })) {
    error(where, `${label}: "result" does not match the real query result (run with --emit to print it)`);
    if (EMIT) emitted.push({ where, result: actual });
  }
}

function permutations(n, k, limit) {
  const out = [];
  const used = new Array(n).fill(false);
  const cur = [];
  (function rec() {
    if (out.length >= limit) return;
    if (cur.length === k) { out.push([...cur]); return; }
    for (let i = 0; i < n; i++) {
      if (used[i]) continue;
      used[i] = true; cur.push(i); rec(); cur.pop(); used[i] = false;
    }
  })();
  return out;
}

// ---------------------------------------------------------------- step checks

function verifyTeach(course, s, where) {
  checkText(where, 'title', s.title, LIMITS.title, false);
  checkText(where, 'text', s.text, LIMITS.teach);
  if (s.code === undefined) return;
  if (!checkCode(where, 'code', s.code)) return;
  if (s.norun) return;
  exec(course, s.code, {}, (r) => {
    jsMismatch(where, r);
    if (s.error) {
      if (!r.err) error(where, `code should raise ${s.error} but ran without error`);
      else if (course.lang !== 'sql' && r.err !== s.error) error(where, `code raises ${r.err}, not ${s.error}`);
      if (s.output !== undefined && normOut(r.out) !== normOut(s.output)) error(where, `output before the error: stated ${show(s.output)}, actual ${show(r.out)}`);
      return;
    }
    if (course.lang === 'sql') { checkSqlResult(where, 'code', r, s.result); return; }
    if (s.output !== undefined) expectOutput(where, 'code', r, s.output);
    else if (r.err) error(where, `code raises ${r.err}: ${r.msg}`);
    else if (normOut(r.out) !== '') warn(where, `code prints ${show(r.out)} but the step has no "output"`);
  });
}

function verifyTrace(course, s, where) {
  checkText(where, 'title', s.title, LIMITS.title, false);
  checkText(where, 'text', s.text, LIMITS.teach, false);
  if (!['python', 'javascript'].includes(course.lang)) { error(where, 'trace steps are only for Python and JavaScript'); return; }
  if (!checkCode(where, 'code', s.code)) return;
  if (!Array.isArray(s.watch) || !s.watch.length) { error(where, 'trace needs "watch": the variable names to show'); return; }
  exec(course, s.code, { trace: s.watch }, (r) => {
    jsMismatch(where, r);
    if (r.err) { error(where, `trace code raises ${r.err}: ${r.msg}`); return; }
    if (r.steps.length > 40) warn(where, `trace has ${r.steps.length} steps (keep to 40 or fewer)`);
    if (canon(r.steps) !== canon(s.steps || null)) {
      error(where, 'trace "steps" do not match the real run (run with --emit to print the correct steps)');
      if (EMIT) emitted.push({ where, steps: r.steps });
    }
  });
}

function verifyMcq(course, s, where) {
  checkText(where, 'prompt', s.prompt, LIMITS.prompt);
  if (s.code !== undefined) checkCode(where, 'code', s.code);
  const opts = s.options || [];
  if (opts.length < 2 || opts.length > 4) error(where, `mcq needs 2 to 4 options (has ${opts.length})`);
  if (opts.filter((o) => o.ok).length !== 1) error(where, 'mcq needs exactly one option with ok: true');
  const seen = new Set();
  opts.forEach((o, i) => {
    if (s.mono) { if (typeof o.t !== 'string' || !o.t.trim()) error(where, `option ${i + 1} has no text`); else if (CURLY.test(o.t)) error(where, `option ${i + 1} contains curly quotes`); }
    else checkText(`${where} option ${i + 1}`, 't', o.t, 160);
    if (seen.has(o.t)) error(where, `duplicate option ${JSON.stringify(o.t)}`);
    seen.add(o.t);
    if (!o.ok) checkText(`${where} option ${i + 1}`, 'why', o.why, LIMITS.why, false);
    if (!o.ok && !o.why) warn(where, `option ${i + 1} has no "why" (feedback for that wrong choice)`);
    if (o.ok && o.why) warn(where, `the correct option does not need "why"; use "explain"`);
  });
}

function verifyPredict(course, s, where) {
  checkText(where, 'prompt', s.prompt, LIMITS.prompt);
  if (!checkCode(where, 'code', s.code)) return;
  if (typeof s.answer !== 'string' || s.answer === '') { error(where, 'predict needs "answer"'); return; }
  if (s.options) {
    if (s.options.length < 2 || s.options.length > 3) error(where, 'predict "options" should list 2 or 3 wrong outputs');
    const all = [s.answer, ...s.options].map(normOut);
    if (new Set(all).size !== all.length) error(where, 'predict options must differ from each other and from the answer');
  }
  if (!RUNNABLE.includes(course.lang)) { error(where, 'predict items need a runnable language'); return; }
  exec(course, s.code, {}, (r) => {
    jsMismatch(where, r);
    if (course.lang === 'sql' && r.artefact) error(where, `query ${ARTEFACT}`);
    expectOutput(where, 'code', r, s.answer);
  });
}

function verifyFill(course, s, where) {
  checkText(where, 'prompt', s.prompt, LIMITS.prompt);
  if (!checkCode(where, 'code', s.code)) return;
  const n = countBlanks(s.code);
  if (!n) { error(where, 'fill code has no ___ blank'); return; }
  if (s.blanks.length !== n) { error(where, `fill has ${n} blank(s) in the code but ${s.blanks.length} in "blanks"`); return; }
  const bank = s.bank || [];
  if (bank.length > 8) warn(where, `fill bank has ${bank.length} chips (keep to 8 or fewer)`);
  const left = [...bank];
  for (const accepted of s.blanks) {
    const at = left.findIndex((t) => accepted.includes(t));
    if (at < 0) { error(where, `fill bank is missing a chip for blank ${JSON.stringify(accepted[0])}`); return; }
    left.splice(at, 1);
  }
  if (!left.length) error(where, 'fill bank has no distractor chips');
  const primary = s.blanks.map((b) => b[0]);
  if (!RUNNABLE.includes(course.lang) || s.norun) return;
  exec(course, fillCode(s.code, primary), {}, (r) => {
    jsMismatch(where, r);
    if (s.output !== undefined) expectOutput(where, 'filled code', r, s.output);
    else if (r.err) error(where, `filled code raises ${r.err}: ${r.msg}`);
    else warn(where, `fill has no "output" (the filled code prints ${show(r.out)})`);
  });
  if (s.output === undefined) return;
  s.blanks.forEach((accepted, i) => accepted.slice(1).forEach((alt) => {
    const toks = [...primary]; toks[i] = alt;
    exec(course, fillCode(s.code, toks), {}, (r) => expectOutput(where, `alternative ${JSON.stringify(alt)}`, r, s.output));
  }));
  for (const combo of permutations(bank.length, n, 800)) {
    const toks = combo.map((i) => bank[i]);
    if (gradeFill(s, toks).correct) continue;
    exec(course, fillCode(s.code, toks), {}, (r) => {
      if (!r.err && normOut(r.out) === normOut(s.output)) {
        error(where, `ambiguous: the chips ${JSON.stringify(toks)} also give the expected output. Change a distractor or accept it in "blanks".`);
      }
    });
  }
}

function verifyOrder(course, s, where) {
  checkText(where, 'prompt', s.prompt, LIMITS.prompt);
  const lines = s.lines || [];
  if (lines.length < 3 || lines.length > 7) error(where, `order needs 3 to 7 lines (has ${lines.length})`);
  lines.forEach((l) => checkCode(where, 'lines', l));
  const distractors = s.distractors || [];
  if (distractors.length > 2) warn(where, 'order has more than 2 distractor lines');
  distractors.forEach((d) => { if (lines.includes(d)) error(where, `distractor ${JSON.stringify(d)} is also a correct line`); });
  const okPerm = (alt) => Array.isArray(alt) && alt.length === lines.length && [...alt].sort((a, b) => a - b).every((v, i) => v === i);
  for (const alt of s.alt || []) if (!okPerm(alt)) error(where, `"alt" entry ${JSON.stringify(alt)} is not a reordering of the line indexes`);
  if (!RUNNABLE.includes(course.lang) || s.norun) return;
  exec(course, lines.join('\n'), {}, (r) => {
    jsMismatch(where, r);
    if (s.output !== undefined) expectOutput(where, 'ordered code', r, s.output);
    else if (r.err) error(where, `ordered code raises ${r.err}: ${r.msg}`);
    else warn(where, `order has no "output" (the code prints ${show(r.out)})`);
  });
  if (s.output === undefined) return;
  for (const alt of (s.alt || []).filter(okPerm)) {
    exec(course, alt.map((i) => lines[i]).join('\n'), {}, (r) => expectOutput(where, `alt order ${JSON.stringify(alt)}`, r, s.output));
  }
  if (s.strict) {
    if ((s.alt || []).length) error(where, '"strict" order items must not have "alt"');
    return;
  }
  if (lines.length > 6) { warn(where, 'order has 7 lines: other valid orders are not checked automatically'); return; }
  for (const perm of permutations(lines.length, lines.length, 800)) {
    const attempt = perm.map((i) => lines[i]);
    if (gradeOrder(s, attempt).correct) continue;
    exec(course, attempt.join('\n'), {}, (r) => {
      if (!r.err && normOut(r.out) === normOut(s.output)) {
        error(where, `ambiguous: the order ${JSON.stringify(perm)} also gives the expected output. Add it to "alt" or change the lines.`);
      }
    });
  }
}

function verifySpot(course, s, where) {
  checkText(where, 'prompt', s.prompt, LIMITS.prompt);
  if (!checkCode(where, 'code', s.code)) return;
  const lines = s.code.split('\n');
  if (lines.length < 2) error(where, 'spot code needs at least 2 lines');
  if (!(Number.isInteger(s.bugLine) && s.bugLine >= 1 && s.bugLine <= lines.length)) { error(where, `"bugLine" must be a line number from 1 to ${lines.length}`); return; }
  if (typeof s.fix !== 'string' || !s.fix.trim()) { error(where, 'spot needs "fix": the corrected line'); return; }
  if (lines[s.bugLine - 1] === s.fix) error(where, '"fix" is the same as the buggy line');
  if (!RUNNABLE.includes(course.lang)) return;
  if (s.expect === undefined) { error(where, 'spot needs "expect": the output of the fixed code'); return; }
  exec(course, s.code, {}, (r) => {
    if (s.error) {
      if (!r.err) error(where, `buggy code should raise ${s.error} but ran without error`);
      else if (course.lang !== 'sql' && r.err !== s.error) error(where, `buggy code raises ${r.err}, not ${s.error}`);
    } else if (r.err) error(where, `buggy code raises ${r.err}; add error: '${r.err}' to the item`);
    else if (normOut(r.out) === normOut(s.expect)) error(where, 'buggy code already gives the expected output');
  });
  const fixed = [...lines];
  fixed[s.bugLine - 1] = s.fix;
  exec(course, fixed.join('\n'), {}, (r) => { jsMismatch(where, r); expectOutput(where, 'fixed code', r, s.expect); });
}

function verifyWrite(course, s, where) {
  checkText(where, 'prompt', s.prompt, LIMITS.prompt);
  if (!checkCode(where, 'solution', s.solution)) return;
  if (s.starter !== undefined) checkCode(where, 'starter', s.starter, { allowEmpty: true });
  for (const rule of [...(s.mustUse || []), ...(s.mustNotUse || [])]) {
    if (!rule.re || !rule.msg) error(where, 'mustUse / mustNotUse entries need "re" and "msg"');
    else { try { new RegExp(rule.re, rule.flags || ''); } catch (e) { error(where, `bad regular expression ${rule.re}: ${e.message}`); } checkText(where, 'rule msg', rule.msg, 160); }
  }
  for (const h of s.hints || []) {
    const squash = (t) => t.replace(/\s+/g, '');
    if (squash(h).includes(squash(s.solution))) error(where, 'a hint contains the full solution');
  }
  const starter = s.starter || '';
  try {
    const own = sourceProblems(s, s.solution);
    if (own.length) error(where, `the solution breaks its own mustUse / mustNotUse rules: ${own.join(' | ')}`);
  } catch { /* bad pattern already reported */ }
  if (course.lang === 'web') {
    if (!Array.isArray(s.checks) || !s.checks.length) { error(where, 'web write items need "checks"'); return; }
    s.checks.forEach((c, i) => {
      if (!c.sel || !c.msg) error(where, `check ${i + 1} needs "sel" and "msg"`);
      if (!('count' in c) && !('text' in c) && !('attr' in c) && !('style' in c) && !('exists' in c)) warn(where, `check ${i + 1} only tests that ${c.sel} exists`);
    });
    return;
  }
  if (course.lang === 'sql') {
    let want = null;
    exec(course, s.solution, { verify: s.verify }, (r) => {
      if (r.err) { error(where, `solution fails: ${r.msg}`); return; }
      if (r.artefact) error(where, `solution ${ARTEFACT}`);
      if (!r.result || !r.result.values.length) warn(where, 'solution returns no rows');
      want = r.result;
    });
    exec(course, starter.trim() ? starter : 'SELECT 1 WHERE 0;', { verify: s.verify }, (r) => {
      if (!r.err && want && sameResult(r.result, want, !!s.ordered)) error(where, 'starter already gives the solution result');
    });
    return;
  }
  if (s.expectOutput === undefined && !(s.checks || []).length) { error(where, 'write needs "expectOutput" and/or "checks"'); return; }
  const calls = (s.checks || []).map((c) => c.call);
  exec(course, s.solution, { checks: calls }, (r) => {
    jsMismatch(where, r);
    const g = gradeWriteRun(s, s.solution, { ...r, err: r.err ? { name: r.err, message: r.msg } : null });
    if (!g.passed) error(where, `the solution does not pass its own tests: ${JSON.stringify(g.failures)}`);
  });
  exec(course, starter, { checks: calls }, (r) => {
    const g = gradeWriteRun(s, starter, { ...r, err: r.err ? { name: r.err, message: r.msg } : null });
    if (g.passed) error(where, 'the starter code already passes the tests');
  });
}

const VERIFY = { mcq: verifyMcq, predict: verifyPredict, fill: verifyFill, order: verifyOrder, spot: verifySpot, write: verifyWrite };

function verifyItem(course, s, where, inPool) {
  checkText(where, 'explain', s.explain, LIMITS.explain);
  if (inPool) {
    if (!POOL_KINDS.includes(s.kind)) error(where, `pool items must be one of ${POOL_KINDS.join(', ')} (this is ${s.kind})`);
  } else if (['fill', 'order', 'write'].includes(s.kind)) {
    if ((s.hints || []).length !== 2) error(where, `${s.kind} items in "steps" need exactly 2 hints (general, then more specific)`);
  }
  (s.hints || []).forEach((h, i) => checkText(where, `hint ${i + 1}`, h, LIMITS.hint));
  if (s.level !== undefined && ![1, 2, 3].includes(s.level)) error(where, '"level" must be 1, 2 or 3');
  VERIFY[s.kind](course, s, where);
}

function verifyWorked(course, lesson) {
  const where = `${lesson.id} worked`;
  const w = lesson.worked;
  if (!w) { error(where, 'lesson has no worked example'); return; }
  checkText(where, 'title', w.title, LIMITS.title);
  checkText(where, 'problem', w.problem, LIMITS.problem);
  if (!Array.isArray(w.steps) || w.steps.length < 3 || w.steps.length > 5) error(where, 'worked example needs 3 to 5 steps');
  (w.steps || []).forEach((st, i) => {
    checkText(`${where} step ${i + 1}`, 'label', st.label, LIMITS.label);
    checkText(`${where} step ${i + 1}`, 'text', st.text, 260, false);
    if (st.code !== undefined) checkCode(`${where} step ${i + 1}`, 'code', st.code);
    if (!st.text && st.code === undefined) error(`${where} step ${i + 1}`, 'step needs "text" or "code"');
  });
  if (!checkCode(where, 'code', w.code)) return;
  exec(course, w.code, {}, (r) => {
    jsMismatch(where, r);
    if (course.lang === 'sql') { checkSqlResult(where, 'code', r, w.result); return; }
    if (w.output === undefined) error(where, 'worked example needs "output"');
    else expectOutput(where, 'code', r, w.output);
  });
}

function verifyLesson(course, lesson) {
  const where = lesson.id;
  if (!/^[a-z]+(-[a-z0-9]+)+$/.test(lesson.id || '')) error(where, 'lesson id must look like "py-for-range"');
  checkText(where, 'title', lesson.title, LIMITS.title);
  checkText(where, 'concept', lesson.concept, LIMITS.concept);
  if (lesson.goals.length < 1 || lesson.goals.length > 3) error(where, 'lesson needs 1 to 3 goals');
  lesson.goals.forEach((g) => checkText(where, 'goal', g, LIMITS.goal));
  const steps = lesson.steps;
  if (steps.length < 8 || steps.length > 14) warn(where, `lesson has ${steps.length} steps (aim for 9 to 12)`);
  if (steps.length && steps[0].kind !== 'teach') error(where, 'the first step must be a teach card');
  const items = steps.filter(isItem);
  if (items.length < 5) error(where, `lesson has ${items.length} practice items (needs at least 5)`);
  const kinds = new Set(items.map((s) => s.kind));
  const need = course.lang === 'web' ? ['fill', 'write'] : ['predict', 'fill', 'write'];
  for (const k of need) if (!kinds.has(k)) warn(where, `lesson has no "${k}" item`);
  if (!kinds.has('order') && !kinds.has('spot')) warn(where, 'lesson has neither an "order" nor a "spot" item');
  steps.forEach((s, i) => {
    const w = `${lesson.id} step ${i + 1} (${s.kind})`;
    if (s.kind === 'teach') verifyTeach(course, s, w);
    else if (s.kind === 'trace') verifyTrace(course, s, w);
    else if (isItem(s)) verifyItem(course, s, w, false);
    else error(w, `unknown step kind "${s.kind}"`);
  });
  if (lesson.pool.length < 5) error(where, `pool has ${lesson.pool.length} items (needs at least 5)`);
  const production = lesson.pool.filter((s) => s.kind === 'fill' || (s.kind === 'predict' && s.mode === 'type')).length;
  if (lesson.pool.length >= 5 && production < 2) warn(where, 'pool should have at least 2 items where the learner types or fills in');
  lesson.pool.forEach((s, i) => {
    const w = `${lesson.id} pool ${i + 1} (${s.kind})`;
    if (!isItem(s)) error(w, 'pool entries must be practice items');
    else verifyItem(course, s, w, true);
  });
  verifyWorked(course, lesson);
}

// ---------------------------------------------------------------- run jobs

let pythonVersion = '';
function runPythonBatch(list) {
  if (!list.length) return [];
  const dir = mkdtempSync(path.join(os.tmpdir(), 'haicodelab-'));
  const jobsFile = path.join(dir, 'jobs.json');
  const resFile = path.join(dir, 'results.json');
  writeFileSync(jobsFile, JSON.stringify(list.map((j, i) => ({ id: i, code: j.code, trace: j.opts.trace || null, checks: j.opts.checks || [] }))));
  let done = null;
  for (const cmd of ['py', 'python3', 'python']) {
    const r = spawnSync(cmd, ['-X', 'utf8', path.join(ROOT, 'tools', 'pyrun.py'), jobsFile, resFile], { encoding: 'utf8' });
    if (!r.error && r.status === 0) { done = r; break; }
    done = r;
  }
  if (!done || done.error || done.status !== 0) {
    console.error('Could not run Python for verification:', (done && (done.error ? done.error.message : done.stderr)) || 'unknown error');
    process.exit(2);
  }
  const data = JSON.parse(readFileSync(resFile, 'utf8'));
  rmSync(dir, { recursive: true, force: true });
  pythonVersion = data.python;
  return data.results;
}

// ---------------------------------------------------------------- main

const stats = [];
const lessonIds = new Map();
/**
 * Load a course one unit file at a time, so that a unit someone else is still editing
 * cannot stop the check of another unit.
 */
async function loadCourse(meta) {
  const dir = path.join(ROOT, 'content', meta.id);
  const indexSrc = readFileSync(path.join(dir, 'index.js'), 'utf8');
  const files = [...indexSrc.matchAll(/import\s+u\d+\s+from\s+["']\.\/([^"']+)["']/g)].map((m) => m[1]);
  const raw = { units: [] };
  for (const file of files) {
    try {
      raw.units.push((await import(pathToFileURL(path.join(dir, file)).href)).default);
    } catch (e) {
      const wanted = !only.unit && !only.lesson;
      (wanted ? error : warn)(`${meta.id}/${file}`, `could not load this unit file: ${e.message}`);
    }
  }
  if (meta.lang === 'sql') raw.db = (await import(pathToFileURL(path.join(dir, 'db.js')).href)).DB_SQL;
  return raw;
}

for (const meta of COURSES) {
  if (only.course && meta.id !== only.course) continue;
  let raw;
  try { raw = await loadCourse(meta); } catch (e) { error(meta.id, `could not load course: ${e.message}`); continue; }
  const course = normalizeCourse(meta, raw);
  const stat = { course: meta.id, units: 0, lessons: 0, steps: 0, items: 0, pool: 0 };
  if (course.lang === 'sql' && typeof course.db !== 'string') error(meta.id, 'SQL course needs "db": the SQL that creates the database');
  for (const unit of course.units) {
    if (only.unit && unit.id !== only.unit) continue;
    if (!unit.id || !unit.title || !unit.blurb) error(unit.id || meta.id, 'unit needs id, title and blurb');
    if (!unit.lessons.length && !only.lesson) warn(unit.id, 'unit has no lessons yet');
    stat.units++;
    for (const lesson of unit.lessons) {
      if (lessonIds.has(lesson.id)) error(lesson.id, `duplicate lesson id (also in ${lessonIds.get(lesson.id)})`);
      lessonIds.set(lesson.id, unit.id);
      if (only.lesson && lesson.id !== only.lesson) continue;
      stat.lessons++;
      stat.steps += lesson.steps.length;
      stat.items += lesson.steps.filter(isItem).length;
      stat.pool += lesson.pool.length;
      verifyLesson(course, lesson);
    }
  }
  stats.push(stat);
}

const pyJobs = jobs.filter((j) => j.lang === 'python');
const pyResults = runPythonBatch(pyJobs);
pyJobs.forEach((j, i) => { j.result = pyResults[i]; });
for (const j of jobs) {
  if (j.lang === 'javascript') j.result = runJs(j.code, { checks: j.opts.checks || [], trace: j.opts.trace || null });
  else if (j.lang === 'sql') j.result = runSql(j.seed || '', j.code, { verify: j.opts.verify });
}
for (const j of jobs) j.cb(j.result);

const errors = problems.filter((p) => p.level === 'error');
const warnings = problems.filter((p) => p.level === 'warn');
console.log('HaiCodeLab content check');
for (const s of stats) console.log(`  ${s.course.padEnd(11)} ${String(s.units).padStart(2)} units  ${String(s.lessons).padStart(3)} lessons  ${String(s.steps).padStart(4)} steps  ${String(s.items).padStart(4)} practice items  ${String(s.pool).padStart(4)} check items`);
console.log(`  ${jobs.length} code runs${pythonVersion ? ` (Python ${pythonVersion}, Node ${process.versions.node})` : ` (Node ${process.versions.node})`}`);
for (const p of problems) console.log(`\n${p.level === 'error' ? 'ERROR' : 'warn '}  ${p.where}\n      ${p.msg}`);
if (EMIT && emitted.length) {
  console.log('\n--- real values to paste in ---');
  for (const e of emitted) {
    console.log(`\n${e.where}`);
    if (e.steps) console.log(`steps: [\n${e.steps.map((st) => `  ${JSON.stringify(st)},`).join('\n')}\n],`);
    if (e.result) console.log(`result: ${JSON.stringify(e.result)},`);
  }
}
console.log(`\n${errors.length} error(s), ${warnings.length} warning(s)`);
process.exit(errors.length || (STRICT && warnings.length) ? 1 : 0);
