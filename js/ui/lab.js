/** The playground: write and run your own code in any of the four languages. */
import { h } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { createEditor } from '../lib/editor.js';
import { store, save } from '../store.js';
import { now, log } from '../app.js';
import * as catalog from '../catalog.js';
import { DB_SQL, DB_TABLES } from '../../content/sql/db.js';
import { run, previewDoc, runtimeStatus, warmUp } from '../run/runners.js';
import { checkBadges } from '../engine/rewards.js';
import { outputPanel, resultTable, previewFrame, toast } from './common.js';
import { LAB_LANGS, SAMPLES, sampleCode } from './lab-samples.js';

function tableColumns(name) {
  const m = new RegExp(`CREATE TABLE ${name} \\(([\\s\\S]*?)\\n\\);`).exec(DB_SQL);
  if (!m) return [];
  return m[1].split('\n').map((l) => l.trim().replace(/,$/, '')).filter(Boolean).map((l) => {
    const [col, type, ...rest] = l.split(/\s+/);
    return { col, type, note: rest.join(' ').replace(/REFERENCES.*/, 'links to another table').toLowerCase() };
  });
}

export function labPage(root) {
  const state = store.state;
  if (!state.lab) state.lab = { lang: null, code: {} };
  const courseLang = (catalog.getCourse(state.course) || {}).lang;
  let lang = state.lab.lang || courseLang || 'python';
  if (!SAMPLES[lang]) lang = 'python';

  const page = h('div.page.page--wide');
  const tabs = h('div.lab-tabs', { role: 'tablist', 'aria-label': 'Language' });
  const body = h('div.lab');
  page.append(h('div.page-head', h('h1', 'Playground')), h('p.muted', { style: { marginTop: '-12px', marginBottom: '16px' } }, 'Try your own ideas here. Nothing you do in the playground can break anything.'), tabs, body);
  root.append(page);

  function paintTabs() {
    tabs.replaceChildren(...LAB_LANGS.map((l) => h(`button.lab-tab${l.id === lang ? '.is-on' : ''}`, {
      type: 'button', role: 'tab', 'aria-selected': l.id === lang ? 'true' : 'false', 'data-accent': l.accent,
      onclick: () => { lang = l.id; state.lab.lang = lang; save(); paintTabs(); paintBody(); },
    }, h('span.glyph', l.glyph), h('span', l.title))));
  }

  function paintBody() {
    const meta = LAB_LANGS.find((l) => l.id === lang);
    page.dataset.accent = meta.accent;
    const out = h('div.stack.lab-out', { 'aria-live': 'polite' });
    const status = h('span.small.muted');
    let frame = null;
    let timer = null;
    const editor = createEditor({
      value: state.lab.code[lang] ?? sampleCode(lang),
      lang,
      label: `${meta.title} code`,
      onChange: (v) => {
        state.lab.code[lang] = v;
        save();
        if (frame) { clearTimeout(timer); timer = setTimeout(() => { frame.srcdoc = previewDoc(v); }, 300); }
      },
    });
    const stdin = h('textarea.input', { rows: '2', 'aria-label': 'Answers for input()', placeholder: 'One answer per line', style: { padding: '10px 14px', fontFamily: 'var(--font-code)' } });
    const runBtn = h('button.btn.btn--primary', { type: 'button', html: iconSvg('play') }, 'Run');
    const samples = h('select.input', { 'aria-label': 'Examples', style: { width: 'auto', minHeight: '48px' } },
      h('option', { value: '' }, 'Examples'), SAMPLES[lang].map((s, i) => h('option', { value: String(i) }, s.name)));
    samples.addEventListener('change', () => {
      if (samples.value === '') return;
      editor.setValue(sampleCode(lang, Number(samples.value)));
      samples.value = '';
      out.replaceChildren();
    });

    async function doRun() {
      runBtn.disabled = true;
      status.textContent = runtimeStatus(lang) === 'ready' ? 'Running…' : lang === 'python' ? 'Getting Python ready. The first time takes a few seconds…' : 'Opening the database…';
      const res = await run(lang, editor.getValue(), lang === 'sql' ? { seed: DB_SQL } : { stdin: stdin.value });
      runBtn.disabled = false;
      status.textContent = '';
      out.replaceChildren();
      if (lang === 'sql') {
        if (res.err) out.append(outputPanel(res.err.text, { error: true, label: 'Error' }));
        else if (res.sets && res.sets.length) res.sets.forEach((s) => out.append(resultTable(s)));
        else out.append(h('div.callout', 'Done. No rows to show: this statement changed the database or returned nothing. Every run starts from a fresh copy of the database.'));
      } else if (res.err) out.append(outputPanel(`${res.out || ''}${res.err.text}`, { error: true }));
      else out.append(outputPanel(res.out.replace(/\n$/, '')));
      if (!res.unavailable) {
        state.counters.runs++;
        log('lab_run', { lang, ok: !res.err, chars: editor.getValue().length });
        for (const b of checkBadges(state, now(), catalog.courses())) toast(`New badge: ${b.name}`, 'award');
        save();
      }
    }
    runBtn.addEventListener('click', doRun);
    editor.textarea.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (lang !== 'web') doRun(); } });

    const left = h('div.stack', editor.el);
    const right = h('div.stack');
    if (lang === 'web') {
      frame = previewFrame(editor.getValue(), 360);
      left.append(h('div.run-row', samples));
      right.append(h('div', h('div.preview-label', 'Live preview'), frame));
    } else {
      left.append(h('div.run-row', runBtn, samples, status));
      if (lang === 'python') left.append(h('details.why', h('summary', 'Does your program use input()?'), h('div.stack', { style: { marginTop: '8px' } }, h('span.small', 'Type the answers here before you press Run, one per line.'), stdin)));
      right.append(h('div.preview-label', lang === 'sql' ? 'Result' : 'Output'), out);
      out.append(h('div.muted.small', lang === 'sql' ? 'Press Run to see the rows your query returns.' : 'Press Run to see what your program prints. Tip: Ctrl + Enter also runs it.'));
      if (lang === 'sql') {
        right.append(h('div.preview-label', 'Tables in the camp shop database'), h('div.schema', DB_TABLES.map((t) => h('details',
          h('summary', t.name), h('div.small.muted', { style: { marginTop: '4px' } }, t.about),
          h('ul', tableColumns(t.name).map((c) => h('li', `${c.col}  ${c.type}${c.note ? `  (${c.note})` : ''}`)))))));
      }
      warmUp(lang);
    }
    body.replaceChildren(h('div.lab-grid', left, right));
  }

  paintTabs();
  paintBody();
}
