/**
 * Running learner code. One entry point for all languages:
 *
 *   run(lang, code, options) -> { out, err, results, result, sets, unavailable }
 *
 *   out      text the program printed (SQL: the last result as text)
 *   err      null, or { name, message, line, text }
 *   results  values of the check expressions (Python and JavaScript write items)
 *   result   SQL only: the last result set { columns, values, cells }
 *
 * Python runs on Pyodide in a worker, JavaScript in a fresh worker per run, SQL on sql.js (SQLite).
 * Python and SQL runtimes are fetched the first time they are needed.
 */
import { RUNTIME } from '../config.js';
import { makeInspect } from './jsfmt.js';
import { flattenCells, sqlCell } from '../engine/content.js';

const unavailable = (what) => ({
  out: '',
  results: [],
  result: null,
  unavailable: true,
  err: {
    name: 'NotLoaded',
    message: `${what} could not be loaded. Check your internet connection and try again.`,
    text: `${what} could not be loaded. Check your internet connection and try again.`,
  },
});

// ---------------------------------------------------------------- Python

const py = { worker: null, ready: null, seq: 0, waiting: new Map(), status: 'idle', version: '' };

function pyKill() {
  if (py.worker) py.worker.terminate();
  for (const done of py.waiting.values()) done({ ok: false, error: 'stopped' });
  py.waiting.clear();
  py.worker = null;
  py.ready = null;
  py.status = 'idle';
}

function pyCall(msg, timeoutMs) {
  return new Promise((resolve) => {
    const id = ++py.seq;
    const timer = setTimeout(() => { py.waiting.delete(id); resolve({ timeout: true }); }, timeoutMs);
    py.waiting.set(id, (data) => { clearTimeout(timer); resolve(data); });
    py.worker.postMessage({ ...msg, id });
  });
}

/** Start loading Python in the background. Safe to call often. */
export function warmUpPython() {
  if (py.ready) return py.ready;
  py.status = 'loading';
  try {
    py.worker = new Worker(new URL('./py-worker.js', import.meta.url));
  } catch (e) {
    py.status = 'failed';
    return Promise.reject(e);
  }
  py.worker.onmessage = (e) => {
    const done = py.waiting.get(e.data.id);
    if (done) { py.waiting.delete(e.data.id); done(e.data); }
  };
  py.worker.onerror = () => { for (const done of py.waiting.values()) done({ ok: false, error: 'worker error' }); py.waiting.clear(); };
  const ready = pyCall({ type: 'init', url: RUNTIME.pyodide }, RUNTIME.loadTimeoutMs).then((r) => {
    if (!r.ok) { pyKill(); py.status = 'failed'; throw new Error(r.error || 'timeout'); }
    py.status = 'ready';
    py.version = r.version;
  });
  py.ready = ready;
  ready.catch(() => {});
  return ready;
}

export const pythonStatus = () => py.status;

async function runPython(code, { stdin = '', checks = [], timeoutMs = RUNTIME.runTimeoutMs } = {}) {
  try { await warmUpPython(); } catch { return unavailable('Python'); }
  const r = await pyCall({ type: 'run', code, stdin, checks }, timeoutMs);
  if (r.timeout) {
    pyKill();
    const text = `Your program ran for more than ${Math.round(timeoutMs / 1000)} seconds, so it was stopped. Check for a loop that never ends.`;
    return { out: '', results: [], err: { name: 'Timeout', message: text, text } };
  }
  if (!r.ok) return { out: '', results: [], err: { name: 'RunnerError', message: r.error, text: r.error } };
  const res = r.result;
  if (res.err && res.err.name === 'EOFError') {
    res.err.text += '\n\ninput() needs someone to type an answer. Here, store the value in a variable instead.';
  }
  return res;
}

// ---------------------------------------------------------------- JavaScript

const JS_WORKER = `"use strict";
const __K = (${makeInspect.toString()})();
const __OFFSET = (() => {
  try { new Function('throw new Error("x")')(); }
  catch (e) { const m = /<anonymous>:(\\d+)|Function:(\\d+)/.exec(String(e.stack)); return m ? Number(m[1] || m[2]) - 1 : null; }
  return null;
})();
self.onmessage = (e) => {
  const { code, checks } = e.data;
  const out = [];
  const log = (...a) => { out.push(__K.formatArgs(a)); };
  const console = { log, info: log, warn: log, error: log, debug: log, table: log };
  let err = null;
  let results = [];
  const checkSrc = checks.map((c) => '(() => { try { return __fmt(' + c + '); } catch (e) { return "\\u26a0 " + e.name; } })()').join(',');
  try {
    const fn = new Function('console', '__fmt', '"use strict";' + code + '\\n;return [' + checkSrc + '];');
    results = fn(console, __K.inspect);
  } catch (e) {
    let line = null;
    const stack = String((e && e.stack) || '');
    const m = /<anonymous>:(\\d+):\\d+|Function:(\\d+):\\d+/.exec(stack);
    if (m && __OFFSET !== null) { line = Number(m[1] || m[2]) - __OFFSET; if (!(line >= 1)) line = null; }
    const name = (e && e.name) || 'Error';
    const message = (e && e.message) || String(e);
    err = { name, message, line, text: name + ': ' + message + (line ? '\\n    at line ' + line : '') };
  }
  setTimeout(() => self.postMessage({ out: out.length ? out.join('\\n') + '\\n' : '', err, results }), 0);
};
`;
let jsWorkerUrl = null;

function runJavaScript(code, { checks = [], timeoutMs = 4000 } = {}) {
  return new Promise((resolve) => {
    if (!jsWorkerUrl) jsWorkerUrl = URL.createObjectURL(new Blob([JS_WORKER], { type: 'text/javascript' }));
    let worker;
    try { worker = new Worker(jsWorkerUrl); } catch { resolve(unavailable('The JavaScript runner')); return; }
    const timer = setTimeout(() => {
      worker.terminate();
      const text = `Your program ran for more than ${Math.round(timeoutMs / 1000)} seconds, so it was stopped. Check for a loop that never ends.`;
      resolve({ out: '', results: [], err: { name: 'Timeout', message: text, text } });
    }, timeoutMs);
    worker.onmessage = (e) => { clearTimeout(timer); worker.terminate(); resolve(e.data); };
    worker.onerror = (e) => {
      clearTimeout(timer);
      worker.terminate();
      const message = (e && e.message) || 'The program could not run.';
      resolve({ out: '', results: [], err: { name: 'Error', message, text: message } });
    };
    worker.postMessage({ code, checks });
  });
}

// ---------------------------------------------------------------- SQL

const sql = { SQL: null, loading: null, status: 'idle' };

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = () => { s.remove(); reject(new Error(`could not load ${src}`)); };
    document.head.append(s);
  });
}

export function warmUpSql() {
  if (sql.loading) return sql.loading;
  sql.status = 'loading';
  const loading = loadScript(`${RUNTIME.sqljs}sql-wasm.js`)
    .then(() => window.initSqlJs({ locateFile: (f) => `${RUNTIME.sqljs}${f}` }))
    .then((SQL) => { sql.SQL = SQL; sql.status = 'ready'; })
    .catch((e) => { sql.loading = null; sql.status = 'failed'; throw e; });
  sql.loading = loading;
  loading.catch(() => {});
  return loading;
}

export const sqlStatus = () => sql.status;

/** Run SQL on a fresh copy of the course database. verify: an extra query run afterwards. */
async function runSql(code, { seed = '', verify = '' } = {}) {
  try { await warmUpSql(); } catch { return unavailable('The SQL database'); }
  const db = new sql.SQL.Database();
  const sets = [];
  let err = null;
  try {
    db.run(seed);
    for (const stmt of db.iterateStatements(verify ? `${code}\n;${verify}` : code)) {
      const columns = stmt.getColumnNames();
      if (!columns.length) { stmt.step(); continue; }
      const values = [];
      const cells = [];
      while (stmt.step()) {
        const row = stmt.get(null, { useBigInt: true });
        const vals = [];
        const texts = [];
        for (const v of row) {
          if (typeof v === 'bigint') { vals.push(Number(v)); texts.push(String(v)); continue; }
          vals.push(v);
          texts.push(v instanceof Uint8Array ? '[binary data]' : sqlCell(v, typeof v === 'number'));
        }
        values.push(vals);
        cells.push(texts);
      }
      sets.push({ columns, values, cells });
    }
  } catch (e) {
    const message = (e && e.message) || String(e);
    err = { name: 'SQL error', message, line: null, text: `SQL error: ${message}` };
  } finally {
    db.close();
  }
  const result = sets.length ? sets[sets.length - 1] : null;
  return { out: result ? flattenCells(result.cells) : '', err, results: [], result, sets };
}

// ---------------------------------------------------------------- HTML and CSS

/** A complete page for the preview frame. Links open nowhere and scripts never run. */
export function previewDoc(code) {
  const base = '<base target="_blank">';
  if (/<html[\s>]|<!doctype/i.test(code)) {
    return /<head[^>]*>/i.test(code) ? code.replace(/<head[^>]*>/i, (m) => `${m}${base}`) : `${base}${code}`;
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${base}`
    + '<style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:12px;color:#1b1b1b;background:#fff;line-height:1.5}img{max-width:100%}</style>'
    + `</head><body>${code}</body></html>`;
}

const squash = (s) => String(s).replace(/\s+/g, ' ').trim();
const styleNorm = (s) => String(s).toLowerCase().replace(/\s+/g, '').replace(/["']/g, '');

/** Check a rendered page against a write item's checks. Returns { passed, failures }. */
export function checkWeb(code, checks) {
  return new Promise((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('sandbox', 'allow-same-origin');
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:800px;height:600px;border:0;visibility:hidden';
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const failures = [];
      try {
        const doc = frame.contentDocument;
        const win = frame.contentWindow;
        for (const c of checks) {
          let els = [];
          try { els = [...doc.querySelectorAll(c.sel)]; } catch { els = []; }
          let ok = els.length > 0;
          const el = els[0];
          if (ok && c.count !== undefined) ok = els.length === c.count;
          if (ok && c.text !== undefined) ok = squash(el.textContent) === squash(c.text);
          if (ok && c.attr) {
            for (const [k, v] of Object.entries(c.attr)) {
              const a = el.getAttribute(k);
              if (v === true ? !(a && a.trim()) : a !== v) { ok = false; break; }
            }
          }
          if (ok && c.style) {
            const cs = win.getComputedStyle(el);
            for (const [k, v] of Object.entries(c.style)) {
              if (styleNorm(cs.getPropertyValue(k)) !== styleNorm(v)) { ok = false; break; }
            }
          }
          if (!ok) failures.push({ type: 'rule', msg: c.msg });
        }
      } catch (e) {
        failures.push({ type: 'error', msg: 'The page could not be checked.' });
      }
      frame.remove();
      resolve({ passed: failures.length === 0, failures });
    };
    // Set the page before adding the frame, and only check once the learner's page (about:srcdoc) has
    // loaded: the frame first loads an empty about:blank page, which must not be checked.
    frame.srcdoc = previewDoc(code);
    frame.addEventListener('load', () => {
      let url = '';
      try { url = frame.contentWindow.location.href; } catch { url = ''; }
      if (url === 'about:srcdoc') finish();
    });
    setTimeout(finish, 4000);
    document.body.append(frame);
  });
}

// ---------------------------------------------------------------- one entry point

export function run(lang, code, options = {}) {
  if (lang === 'python') return runPython(code, options);
  if (lang === 'javascript') return runJavaScript(code, options);
  if (lang === 'sql') return runSql(code, options);
  return Promise.resolve({ out: '', err: null, results: [] });
}

/** Start loading whatever the language needs, so it is ready when the learner gets to a coding task. */
export function warmUp(lang) {
  if (lang === 'python') warmUpPython().catch(() => {});
  if (lang === 'sql') warmUpSql().catch(() => {});
}

export function runtimeStatus(lang) {
  if (lang === 'python') return py.status;
  if (lang === 'sql') return sql.status;
  return 'ready';
}
