/**
 * Self-test page (open #/selftest). It runs every lesson's code through the same runners
 * learners use (Pyodide, the JavaScript worker, sql.js, the HTML checker) and reports anything
 * that does not behave as the lesson says. The content verifier does this with desktop tools;
 * this page proves it again inside the browser.
 */
import { h } from '../lib/dom.js';
import * as catalog from '../catalog.js';
import { isItem, fillCode } from '../engine/content.js';
import { normOut, gradeWriteRun, sameResult } from '../engine/grade.js';
import { run, checkWeb } from '../run/runners.js';
import { SAMPLES } from './lab-samples.js';
import { DB_SQL } from '../../content/sql/db.js';

export async function selftestPage(root) {
  const status = h('p.muted', 'Starting…');
  const list = h('div.stack');
  const page = h('div.page', h('div.page-head', h('h1', 'Self-test')), status, list);
  root.append(page);
  const report = { done: false, total: 0, passed: 0, failed: [] };
  window.__selftest = report;

  const fail = (where, msg) => {
    report.failed.push({ where, msg });
    list.append(h('div.callout.callout--warn', h('b', where), h('pre', { style: { whiteSpace: 'pre-wrap', margin: '6px 0 0', fontFamily: 'var(--font-code)', fontSize: '.82rem' } }, msg)));
  };
  const expectOut = async (where, lang, code, expected, opts) => {
    report.total++;
    const r = await run(lang, code, opts);
    if (r.unavailable) { fail(where, 'runtime not available'); return; }
    if (r.err) { fail(where, `error: ${r.err.text}`); return; }
    if (normOut(r.out) !== normOut(expected)) { fail(where, `expected ${JSON.stringify(normOut(expected))}\nactual   ${JSON.stringify(normOut(r.out))}`); return; }
    report.passed++;
  };

  for (const course of catalog.courses()) {
    const lang = course.lang;
    const opts = lang === 'sql' ? { seed: course.db } : {};
    for (const lesson of course.lessons) {
      status.textContent = `Checking ${course.title}: ${lesson.title}`;
      const all = [...lesson.steps, ...lesson.pool];
      for (const s of all) {
        const where = `${s.id} (${s.kind})`;
        if (lang === 'web') {
          if (s.kind !== 'write') continue;
          report.total += 2;
          const good = await checkWeb(s.solution, s.checks);
          if (good.passed) report.passed++; else fail(where, `solution fails: ${good.failures.map((f) => f.msg).join(' | ')}`);
          const start = await checkWeb(s.starter || '', s.checks);
          if (!start.passed) report.passed++; else fail(where, 'starter already passes');
          continue;
        }
        if (s.kind === 'teach' && s.code !== undefined && !s.norun && !s.error) {
          if (lang === 'sql') {
            if (!s.result) continue;
            report.total++;
            const r = await run('sql', s.code, opts);
            const want = s.result.rows.map((row) => row.map((c) => (c === null ? 'NULL' : String(c))));
            if (r.err || !r.result || JSON.stringify(r.result.cells) !== JSON.stringify(want)) fail(where, r.err ? r.err.text : `result differs: ${JSON.stringify(r.result && r.result.cells)}`);
            else report.passed++;
          } else if (s.output !== undefined) await expectOut(where, lang, s.code, s.output, opts);
        } else if (s.kind === 'predict') await expectOut(where, lang, s.code, s.answer, opts);
        else if (s.kind === 'fill' && s.output !== undefined && !s.norun) await expectOut(where, lang, fillCode(s.code, s.blanks.map((b) => b[0])), s.output, opts);
        else if (s.kind === 'order' && s.output !== undefined && !s.norun) await expectOut(where, lang, s.lines.join('\n'), s.output, opts);
        else if (s.kind === 'spot' && s.expect !== undefined) {
          const lines = s.code.split('\n');
          lines[s.bugLine - 1] = s.fix;
          await expectOut(where, lang, lines.join('\n'), s.expect, opts);
        } else if (s.kind === 'write') {
          report.total += 2;
          if (lang === 'sql') {
            const sol = await run('sql', s.solution, { ...opts, verify: s.verify });
            const start = await run('sql', (s.starter || '').trim() ? s.starter : 'SELECT 1 WHERE 0;', { ...opts, verify: s.verify });
            if (sol.err || !sol.result) fail(where, `solution fails: ${sol.err ? sol.err.text : 'no rows'}`); else report.passed++;
            if (!start.err && sameResult(start.result, sol.result, !!s.ordered)) fail(where, 'starter already matches'); else report.passed++;
          } else {
            const calls = (s.checks || []).map((c) => c.call);
            const sol = await run(lang, s.solution, { checks: calls });
            const g = gradeWriteRun(s, s.solution, sol);
            if (g.passed) report.passed++; else fail(where, `solution fails: ${JSON.stringify(g.failures)}`);
            const start = await run(lang, s.starter || '', { checks: calls });
            if (!gradeWriteRun(s, s.starter || '', start).passed) report.passed++; else fail(where, 'starter already passes');
          }
        }
      }
      const w = lesson.worked;
      if (w && lang !== 'web') {
        if (lang === 'sql') {
          if (w.result) {
            report.total++;
            const r = await run('sql', w.code, opts);
            const want = w.result.rows.map((row) => row.map((c) => (c === null ? 'NULL' : String(c))));
            if (r.err || !r.result || JSON.stringify(r.result.cells) !== JSON.stringify(want)) fail(`${lesson.id} worked`, r.err ? r.err.text : 'result differs'); else report.passed++;
          }
        } else await expectOut(`${lesson.id} worked`, lang, w.code, w.output, opts);
      }
    }
  }

  status.textContent = 'Checking the playground examples';
  for (const [lang, samples] of Object.entries(SAMPLES)) {
    if (lang === 'web') continue;
    for (const s of samples) {
      report.total++;
      const r = await run(lang, s.code.join('\n'), lang === 'sql' ? { seed: DB_SQL } : {});
      if (r.err) fail(`playground ${lang}: ${s.name}`, r.err.text); else report.passed++;
    }
  }

  report.done = true;
  status.textContent = `Done: ${report.passed} of ${report.total} checks passed, ${report.failed.length} failed.`;
  if (!report.failed.length) list.append(h('div.callout', 'Everything behaves exactly as the lessons say.'));
}
