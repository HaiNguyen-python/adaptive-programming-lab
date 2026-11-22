/**
 * Runs JavaScript lesson snippets in Node for the content verifier.
 * Output is formatted with the app's own console formatter and compared with Node's,
 * so a lesson can never show output that differs from what real JavaScript prints.
 */
import vm from 'node:vm';
import util from 'node:util';
import { inspect, formatArgs } from '../js/run/jsfmt.js';

const captureFn = (watch) =>
  `(() => { const o = {}; ${watch
    .map((n) => `try { o[${JSON.stringify(n)}] = __fmt(${n}); } catch (e) {}`)
    .join(' ')} return o; })`;

/**
 * Add a trace call to every executable line. Lines must hold one full statement each.
 * For loops the call is placed at the start of the body, so the header shows once per turn.
 */
export function instrument(code, watch) {
  const cap = captureFn(watch);
  const hook = (n) => `__t(${n}, ${cap});`;
  const lines = code.split('\n').map((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('//') || t.startsWith('}')) return line;
    if (/^(for|while)\b.*\{\s*$/.test(t)) return `${line} ${hook(i + 1)}`;
    return `${hook(i + 1)} ${line}`;
  });
  return `${lines.join('\n')}\n;__t(0, ${cap});`;
}

export function runJs(code, { checks = [], trace = null } = {}) {
  const out = [];
  const mismatches = [];
  const steps = [];
  const text = () => (out.length ? `${out.join('\n')}\n` : '');
  const log = (...args) => {
    const mine = formatArgs(args);
    const node = args.map((a) => (typeof a === 'string' ? a : util.inspect(a))).join(' ');
    if (mine !== node) mismatches.push({ mine, node });
    out.push(mine);
  };
  const sandbox = {
    console: { log, info: log, warn: log, error: log, debug: log },
    __fmt: inspect,
    __t: (line, get) => steps.push({ line, vars: get(), out: text() }),
  };
  const body = trace ? instrument(code, trace) : code;
  const checkSrc = checks
    .map((c) => `(() => { try { return __fmt(${c}); } catch (e) { return '⚠ ' + e.name; } })()`)
    .join(',');
  const source = `"use strict";${body}\n;var __results = [${checkSrc}];`;
  const res = { out: '', err: null, msg: '', steps: trace ? steps : null, results: [], mismatches };
  try {
    vm.runInNewContext(source, sandbox, { timeout: 2000 });
    res.results = Array.from(sandbox.__results || []);
  } catch (e) {
    res.err = e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ? 'Timeout' : (e && e.name) || 'Error';
    res.msg = (e && e.message) || String(e);
  }
  res.out = text();
  return res;
}
