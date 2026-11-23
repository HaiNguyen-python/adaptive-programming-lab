/**
 * Views for lesson steps. Each practice item view is a small controller:
 *
 *   el              the element to show
 *   ready()         has the learner given a complete answer?
 *   check()         -> Promise<{ correct, why, detail, unavailable }>
 *   retry(result)   mark what is wrong so the learner can try again
 *   finish(correct) lock the item; show the right state
 *   solution()      an element showing the correct answer
 */
import { h, md, mdInline } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { highlight, highlightLines, highlightWithSlots } from '../lib/highlight.js';
import { createEditor } from '../lib/editor.js';
import { shuffle, shuffleChanged } from '../engine/rng.js';
import { fillCode } from '../engine/content.js';
import { gradeMcq, gradePredict, gradeFill, gradeOrder, gradeSpot, gradeWriteRun, sourceProblems, sameResult, normOut } from '../engine/grade.js';
import { run, checkWeb, previewDoc, runtimeStatus } from '../run/runners.js';
import { codeBlock, outputPanel, resultTable, previewFrame, errorHelp } from './common.js';

const pretty = (s) => (s === '' ? '(nothing)' : s);

// ---------------------------------------------------------------- reading cards

export function teachView(step, course) {
  const el = h('div.stage');
  if (step.title) el.append(h('h2', step.title));
  el.append(md(step.text));
  if (step.code !== undefined) {
    if (step.lang === 'sql') {
      el.append(codeBlock(step.code, 'sql'));
      if (step.result) el.append(resultTable(step.result));
    } else if (step.lang === 'web') {
      el.append(codeBlock(step.code, 'web'));
      if (step.preview) el.append(h('div', h('div.preview-label', 'This is how the browser shows it'), previewFrame(step.code, step.previewHeight || 180)));
    } else {
      const out = step.error ? `${step.output ? `${step.output}\n` : ''}${step.error}` : step.output;
      el.append(codeBlock(step.code, step.lang, { output: out, error: !!step.error, outLabel: step.error ? 'Python stops with an error' : 'Output' }));
      if (step.error && step.lang === 'javascript') el.querySelector('.out').dataset.label = 'JavaScript stops with an error';
    }
  }
  if (step.note) el.append(md(step.note, 'muted.small'));
  return { el };
}

/** Step through code one line at a time, watching variables and output change. */
export function traceView(step, onMove) {
  const lines = highlightLines(step.code, step.lang);
  const steps = step.steps || [];
  let i = 0;
  const codeEl = h('div.trace-code', { role: 'img', 'aria-label': 'Code being run step by step' });
  const lineEls = lines.map((html, n) => {
    const row = h('div.trace-line', h('span.n', String(n + 1)), h('span', { html: html || ' ' }));
    codeEl.append(row);
    return row;
  });
  const varsEl = h('div');
  const outEl = h('div.trace-out');
  const where = h('div.where', { 'aria-live': 'polite' });
  const back = h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => go(i - 1) }, 'Back');
  const el = h('div.stage',
    step.title ? h('h2', step.title) : null,
    step.text ? md(step.text) : null,
    h('div.trace', codeEl,
      h('div.trace-panels',
        h('div.trace-panel', h('h4', 'Variables'), varsEl),
        h('div.trace-panel', h('h4', 'Output so far'), outEl)),
      h('div.trace-nav', back, where)));

  function paint() {
    const s = steps[i] || { line: 0, vars: {}, out: '' };
    const prev = i > 0 ? steps[i - 1].vars : {};
    lineEls.forEach((row, n) => {
      row.classList.toggle('is-now', s.line === n + 1);
    });
    varsEl.replaceChildren();
    const names = step.watch.filter((n) => n in s.vars);
    if (!names.length) varsEl.append(h('div.muted.small', 'None yet'));
    for (const n of names) {
      const changed = prev[n] !== s.vars[n];
      varsEl.append(h(`div.var${changed ? '.is-new' : ''}`, h('b', n), h('span', s.vars[n])));
    }
    outEl.textContent = s.out === '' ? '' : s.out.replace(/\n$/, '');
    if (s.out === '') outEl.append(h('span.muted.small', 'Nothing yet'));
    where.textContent = s.line === 0 ? 'The program has finished.' : `Step ${i + 1} of ${steps.length - 1}: about to run line ${s.line}`;
    back.disabled = i === 0;
    const now = lineEls[s.line - 1];
    if (now && now.scrollIntoView) now.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (onMove) onMove();
  }
  function go(n) {
    i = Math.max(0, Math.min(steps.length - 1, n));
    paint();
  }
  paint();
  return { el, atEnd: () => i >= steps.length - 1, next: () => go(i + 1) };
}

// ---------------------------------------------------------------- choosing items

function optionButton(text, mono, onPick) {
  const label = mono ? h('span.opt-text', text) : mdInline(text);
  if (!mono) label.className = 'opt-text';
  return h(`button.opt${mono ? '.opt--code' : ''}`, { type: 'button', role: 'radio', 'aria-checked': 'false', onclick: onPick },
    h('span.mark', { html: iconSvg('check') }), label);
}

/** Shared behaviour for "pick one" items. choices: [{ key, text }] */
function pickOne({ choices, mono, onChange, isRight, why, top }) {
  let picked = null;
  let locked = false;
  const buttons = new Map();
  const list = h('div.opts', { role: 'radiogroup', 'aria-label': 'Answers' });
  const paint = () => {
    for (const [key, b] of buttons) {
      b.classList.toggle('is-picked', key === picked);
      b.setAttribute('aria-checked', key === picked ? 'true' : 'false');
    }
  };
  for (const c of choices) {
    const b = optionButton(c.text, mono, () => {
      if (locked || b.disabled) return;
      picked = c.key;
      paint();
      onChange();
    });
    b.dataset.n = String(buttons.size + 1);
    b.setAttribute('aria-keyshortcuts', String(buttons.size + 1));
    buttons.set(c.key, b);
    list.append(b);
  }
  return {
    el: h('div.stack', top, list),
    ready: () => picked !== null,
    check: async () => ({ correct: isRight(picked), why: why ? why(picked) : null }),
    retry() {
      const b = buttons.get(picked);
      b.classList.remove('is-picked');
      b.classList.add('is-wrong', 'is-off');
      b.querySelector('.mark').innerHTML = iconSvg('x');
      b.disabled = true;
      picked = null;
    },
    finish(correct) {
      locked = true;
      if (!correct && picked !== null) {
        const b = buttons.get(picked);
        b.classList.remove('is-picked');
        b.classList.add('is-wrong');
        b.querySelector('.mark').innerHTML = iconSvg('x');
      }
      for (const [key, b] of buttons) {
        if (isRight(key)) { b.classList.remove('is-picked'); b.classList.add('is-right'); }
        b.disabled = true;
      }
    },
    solution: () => null,
  };
}

function mcqView(item, { rng, onChange }) {
  const order = shuffle(rng, item.options.map((_, i) => i));
  return pickOne({
    choices: order.map((i) => ({ key: i, text: item.options[i].t })),
    mono: !!item.mono,
    onChange,
    isRight: (i) => gradeMcq(item, i),
    why: (i) => item.options[i].why || null,
    top: item.code ? codeBlock(item.code, item.lang) : null,
  });
}

function predictChooseView(item, { rng, onChange }) {
  const outs = shuffle(rng, [item.answer, ...item.options]);
  return pickOne({
    choices: outs.map((t) => ({ key: t, text: t })),
    mono: true,
    onChange,
    isRight: (t) => gradePredict(item, t),
    top: codeBlock(item.code, item.lang),
  });
}

function predictTypeView(item, { onChange, onSubmit }) {
  const rows = Math.min(6, Math.max(1, item.answer.split('\n').length));
  const sql = item.lang === 'sql';
  const ta = h('textarea.answer-input', {
    rows: String(rows), spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off',
    'aria-label': sql ? 'The result of the query' : 'What the code prints',
    placeholder: sql ? 'Type the result' : 'Type the output',
  });
  ta.addEventListener('input', () => { ta.classList.remove('is-wrong'); onChange(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && rows === 1) { e.preventDefault(); if (ta.value.trim()) onSubmit(); }
  });
  const tip = sql
    ? (rows > 1 ? 'Type the result, one row per line.' : 'Type the result exactly as the database shows it.')
    : (rows > 1 ? 'Type exactly what appears on the screen, with each printed line on its own line.' : 'Type exactly what appears on the screen.');
  return {
    el: h('div.stack', codeBlock(item.code, item.lang), h('div.answer-box', h('label', tip), ta)),
    ready: () => ta.value.trim() !== '',
    answerText: () => `They typed this output: ${ta.value}`,
    focus: () => ta.focus(),
    async check() {
      const correct = gradePredict(item, ta.value);
      let why = null;
      if (!correct) {
        const loose = (s) => normOut(s).toLowerCase().replace(/\s+/g, '');
        const unquoted = normOut(ta.value).replace(/^["']|["']$/g, '');
        if (unquoted !== normOut(ta.value) && unquoted === normOut(item.answer)) why = 'Close. The screen shows the text without the quotes.';
        else if (loose(ta.value) === loose(item.answer)) why = 'Very close. Check capital letters, spaces and punctuation.';
      }
      return { correct, why };
    },
    retry() { ta.classList.add('is-wrong'); },
    finish(correct) { ta.readOnly = true; ta.classList.remove('is-wrong'); ta.classList.add(correct ? 'is-right' : 'is-wrong'); },
    solution: () => h('pre.answer', item.answer),
  };
}

function spotView(item, { onChange }) {
  const htmlLines = highlightLines(item.code, item.lang);
  let picked = null;
  let locked = false;
  const rows = htmlLines.map((html, i) => {
    const b = h('button.spot-line', { type: 'button', 'aria-label': `Line ${i + 1}`, 'aria-pressed': 'false', onclick: () => {
      if (locked || b.disabled) return;
      picked = i + 1;
      rows.forEach((r, j) => { r.classList.toggle('is-picked', j === i); r.setAttribute('aria-pressed', j === i ? 'true' : 'false'); });
      onChange();
    } }, h('span.n', String(i + 1)), h('span', { html: html || ' ' }));
    return b;
  });
  return {
    el: h('div.spot', { role: 'group', 'aria-label': 'Lines of code. Choose the line with the bug.' }, rows),
    ready: () => picked !== null,
    check: async () => ({ correct: gradeSpot(item, picked), why: null }),
    retry() {
      const b = rows[picked - 1];
      b.classList.remove('is-picked');
      b.classList.add('is-wrong');
      b.disabled = true;
      picked = null;
    },
    finish(correct) {
      locked = true;
      if (!correct && picked) { rows[picked - 1].classList.remove('is-picked'); rows[picked - 1].classList.add('is-wrong'); }
      rows[item.bugLine - 1].classList.remove('is-picked');
      rows[item.bugLine - 1].classList.add('is-right');
      rows.forEach((r) => { r.disabled = true; });
    },
    solution: () => h('div.stack', h('div.small', `Line ${item.bugLine} should be:`), codeBlock(item.fix, item.lang)),
  };
}

// ---------------------------------------------------------------- building items

function fillView(item, { rng, onChange }) {
  const bank = shuffle(rng, item.bank.map((t, i) => ({ t, i })));
  const n = item.blanks.length;
  const slots = new Array(n).fill(null); // index into bank, or null
  let locked = false;
  const pre = h('pre.code', { html: `<code>${highlightWithSlots(item.code, item.lang, (k) => `<button type="button" class="slot" data-slot="${k}"></button>`)}</code>` });
  const slotEls = [...pre.querySelectorAll('.slot')];
  const chipEls = bank.map((c, pos) => h('button.chip', { type: 'button', onclick: () => place(pos) }, c.t));
  const bankEl = h('div.bank', { role: 'group', 'aria-label': 'Pieces of code to choose from' }, chipEls);

  function paint() {
    const next = slots.indexOf(null);
    slotEls.forEach((el, k) => {
      const filled = slots[k] !== null;
      el.textContent = filled ? bank[slots[k]].t : ' ';
      el.classList.toggle('is-filled', filled);
      el.classList.toggle('is-next', !locked && k === next);
      el.setAttribute('aria-label', filled ? `Gap ${k + 1}: ${bank[slots[k]].t}. Tap to clear.` : `Gap ${k + 1}, empty`);
    });
    chipEls.forEach((el, pos) => { el.classList.toggle('is-used', slots.includes(pos)); el.disabled = locked || slots.includes(pos); });
  }
  function place(pos) {
    if (locked) return;
    const k = slots.indexOf(null);
    if (k < 0) return;
    slots[k] = pos;
    slotEls[k].classList.remove('is-wrong', 'is-right');
    paint();
    onChange();
  }
  pre.addEventListener('click', (e) => {
    const el = e.target.closest('.slot');
    if (!el || locked) return;
    const k = Number(el.dataset.slot);
    if (slots[k] === null) return;
    slots[k] = null;
    el.classList.remove('is-wrong', 'is-right');
    paint();
    onChange();
  });
  paint();
  const tokens = () => slots.map((pos) => (pos === null ? null : bank[pos].t));
  return {
    el: h('div.stack', pre, bankEl),
    ready: () => !slots.includes(null),
    answerText: () => (slots.includes(null) ? '' : `Their filled-in code:
${fillCode(item.code, tokens())}`),
    async check() {
      const g = gradeFill(item, tokens());
      return { correct: g.correct, why: null, perBlank: g.perBlank };
    },
    retry(result) {
      slotEls.forEach((el, k) => { el.classList.toggle('is-wrong', !result.perBlank[k]); el.classList.toggle('is-right', result.perBlank[k]); });
    },
    finish(correct) {
      locked = true;
      if (correct) slotEls.forEach((el) => { el.classList.remove('is-wrong'); el.classList.add('is-right'); });
      paint();
      slotEls.forEach((el) => { el.disabled = true; });
    },
    solution: () => codeBlock(fillCode(item.code, item.blanks.map((b) => b[0])), item.lang),
  };
}

function orderView(item, { rng, onChange }) {
  const pieces = shuffleChanged(rng, [
    ...item.lines.map((t, i) => ({ t, id: `l${i}` })),
    ...(item.distractors || []).map((t, i) => ({ t, id: `d${i}` })),
  ]);
  const byId = new Map(pieces.map((p) => [p.id, p]));
  let placed = [];
  let locked = false;
  let marks = null;
  const target = h('div.order-target', { role: 'list', 'aria-label': 'Your program, in order' });
  const tray = h('div.order-tray', { role: 'group', 'aria-label': 'Lines to place' });
  const trayLabel = h('div.order-label', item.distractors && item.distractors.length ? 'Lines to use (not every line is needed)' : 'Lines to use');

  function move(i, d) {
    const j = i + d;
    if (locked || j < 0 || j >= placed.length) return;
    [placed[i], placed[j]] = [placed[j], placed[i]];
    marks = null;
    paint();
    onChange();
  }
  function paint() {
    target.replaceChildren(...placed.map((id, i) => {
      const cls = marks ? (i < marks.firstWrong ? '.is-right' : i === marks.firstWrong ? '.is-wrong' : '') : '';
      return h(`div.pline${cls}`, { role: 'listitem' },
        h('span.n', String(i + 1)),
        h('code', { html: highlight(byId.get(id).t, item.lang) }),
        locked ? null : h('button.move', { type: 'button', 'aria-label': `Move line ${i + 1} up`, onclick: () => move(i, -1), html: iconSvg('up') }),
        locked ? null : h('button.move', { type: 'button', 'aria-label': `Move line ${i + 1} down`, onclick: () => move(i, 1), html: iconSvg('down') }),
        locked ? null : h('button.move', { type: 'button', 'aria-label': `Take line ${i + 1} out`, onclick: () => { placed.splice(i, 1); marks = null; paint(); onChange(); }, html: iconSvg('x') }));
    }));
    const rest = pieces.filter((p) => !placed.includes(p.id));
    tray.replaceChildren(...rest.map((p) => h('button.pline', { type: 'button', disabled: locked, onclick: () => {
      if (locked) return;
      placed.push(p.id);
      marks = null;
      paint();
      onChange();
    } }, h('code', { html: highlight(p.t, item.lang) }))));
    trayLabel.classList.toggle('hide', !rest.length);
  }
  paint();
  return {
    el: h('div.order-box', target, trayLabel, tray),
    ready: () => placed.length === item.lines.length,
    answerText: () => (placed.length ? `Their order so far:\n${placed.map((id) => byId.get(id).t).join('\n')}` : ''),
    async check() {
      const g = gradeOrder(item, placed.map((id) => byId.get(id).t));
      return { correct: g.correct, why: null, firstWrong: g.firstWrong };
    },
    retry(result) { marks = { firstWrong: result.firstWrong }; paint(); },
    finish(correct) {
      locked = true;
      marks = correct ? { firstWrong: placed.length } : marks;
      paint();
    },
    solution: () => codeBlock(item.lines.join('\n'), item.lang),
  };
}

function failureList(failures) {
  const box = h('div.tests');
  for (const f of failures) {
    if (f.type === 'error') box.append(h('pre.out.out--solo.is-error', { 'data-label': 'Error' }, f.msg));
    else if (f.type === 'output') {
      box.append(h('div.diff',
        h('div', h('b', 'Your program printed'), h('pre', pretty(f.got))),
        h('div', h('b', 'It should print'), h('pre', pretty(f.expected)))));
    } else if (f.type === 'check') {
      box.append(h('div.test.is-bad', { html: iconSvg('x') }, h('span', h('code.inline-code', f.call), ` should give ${f.expected}, but gave ${f.got === undefined ? 'nothing' : f.got}.`)));
    } else box.append(h('div.test.is-bad', { html: iconSvg('x') }, mdInline(f.msg)));
  }
  return box;
}

function writeView(item, { onChange, course }) {
  const lang = item.lang;
  let locked = false;
  const outBox = h('div.stack', { 'aria-live': 'polite' });
  let frame = null;
  let previewTimer = null;
  const editor = createEditor({
    value: item.starter || '',
    lang,
    label: 'Your code',
    onChange: () => {
      onChange();
      if (frame) { clearTimeout(previewTimer); previewTimer = setTimeout(() => { frame.srcdoc = previewDoc(editor.getValue()); }, 350); }
    },
  });
  const runBtn = h('button.btn.btn--ghost.btn--sm', { type: 'button', html: iconSvg('play') }, 'Run');
  const resetBtn = h('button.btn.btn--quiet.btn--sm', { type: 'button', html: iconSvg('reset') }, 'Start over');
  const status = h('span.small.muted', { 'aria-live': 'polite' });
  resetBtn.addEventListener('click', () => { if (!locked) { editor.setValue(item.starter || ''); outBox.replaceChildren(); } });

  function waitingText() {
    const st = runtimeStatus(lang);
    if (st === 'ready') return 'Running…';
    return lang === 'python' ? 'Getting Python ready. The first time takes a few seconds…' : 'Opening the database…';
  }
  function showRun(res) {
    outBox.replaceChildren();
    if (lang === 'sql') {
      if (res.err) outBox.append(outputPanel(res.err.text, { error: true, label: 'Error' }), errorHelp('sql', res.err) || '');
      else if (res.result) outBox.append(resultTable(res.result));
      else outBox.append(h('div.small.muted', 'Done. This statement does not return rows.'));
    } else if (res.err) outBox.append(outputPanel(`${res.out || ''}${res.err.text}`, { error: true, label: 'Output' }), errorHelp(lang, res.err) || '');
    else outBox.append(outputPanel(res.out.replace(/\n$/, '')));
  }
  async function doRun() {
    if (locked) return null;
    runBtn.disabled = true;
    status.textContent = waitingText();
    const res = await run(lang, editor.getValue(), lang === 'sql' ? { seed: course.db } : {});
    runBtn.disabled = false;
    status.textContent = '';
    showRun(res);
    return res;
  }
  runBtn.addEventListener('click', doRun);

  const parts = [editor.el];
  if (lang === 'web') {
    frame = previewFrame(item.starter || '', 190);
    parts.push(h('div', h('div.preview-label', 'Live preview'), frame));
    parts.push(h('div.run-row', resetBtn));
  } else parts.push(h('div.run-row', runBtn, resetBtn, status));
  parts.push(outBox);

  return {
    el: h('div.stack', parts),
    ready: () => editor.getValue().trim() !== '',
    answerText: () => `Their code:
${editor.getValue()}`,
    focus: () => editor.focus(),
    async check() {
      const source = editor.getValue();
      status.textContent = lang === 'web' ? 'Checking…' : waitingText();
      let result;
      if (lang === 'web') {
        const g = await checkWeb(source, item.checks || []);
        const rules = sourceProblems(item, source).map((msg) => ({ type: 'rule', msg }));
        const failures = [...g.failures, ...rules];
        result = { correct: failures.length === 0, detail: failures.length ? failureList(failures) : null };
      } else if (lang === 'sql') {
        const mine = await run('sql', source, { seed: course.db, verify: item.verify });
        if (mine.unavailable) result = { correct: false, unavailable: true, detail: failureList([{ type: 'error', msg: mine.err.text }]) };
        else {
          showRun(mine);
          const want = await run('sql', item.solution, { seed: course.db, verify: item.verify });
          const failures = [];
          if (mine.err) failures.push({ type: 'error', msg: mine.err.text });
          else if (!mine.result) failures.push({ type: 'rule', msg: 'Your query did not return any rows to check. Did you write a SELECT?' });
          else if (!sameResult(mine.result, want.result, !!item.ordered)) {
            const a = mine.result;
            const b = want.result;
            if (a.columns.length !== b.columns.length) failures.push({ type: 'rule', msg: `The result should have ${b.columns.length} column${b.columns.length === 1 ? '' : 's'}, but yours has ${a.columns.length}.` });
            else if (a.values.length !== b.values.length) failures.push({ type: 'rule', msg: `The result should have ${b.values.length} row${b.values.length === 1 ? '' : 's'}, but yours has ${a.values.length}.` });
            else if (item.ordered && sameResult(a, b, false)) failures.push({ type: 'rule', msg: 'You found the right rows, but they are in a different order than the task asks for.' });
            else failures.push({ type: 'rule', msg: 'The result has the right shape, but some values are different. Read the task once more.' });
          }
          for (const msg of sourceProblems(item, source)) failures.push({ type: 'rule', msg });
          const shown = failures.filter((f) => f.type !== 'error');
          result = { correct: failures.length === 0, detail: shown.length ? failureList(shown) : null };
          if (mine.err) result.why = 'The database could not run your query. Read the error message above your answer, then check your spelling and the order of the clauses.';
        }
      } else {
        const res = await run(lang, source, { checks: (item.checks || []).map((c) => c.call) });
        if (res.unavailable) result = { correct: false, unavailable: true, detail: failureList([{ type: 'error', msg: res.err.text }]) };
        else {
          showRun(res);
          const g = gradeWriteRun(item, source, res);
          const shown = g.failures.filter((f) => f.type !== 'error');
          result = { correct: g.passed, detail: shown.length ? failureList(shown) : null };
          if (!g.passed && res.err) result.why = `Your program stopped with ${/^[AEIOU]/.test(res.err.name) ? 'an' : 'a'} \`${res.err.name}\`${res.err.line ? ` on line ${res.err.line}` : ''}. Read the message under your code, then look at that line.`;
        }
      }
      status.textContent = '';
      return result;
    },
    retry() {},
    finish() { locked = true; editor.textarea.readOnly = true; runBtn.disabled = true; resetBtn.disabled = true; },
    solution: () => codeBlock(item.solution, lang),
  };
}

/** Build the view for a practice item. ctx: { rng, onChange, onSubmit, course } */
export function itemView(item, ctx) {
  switch (item.kind) {
    case 'mcq': return mcqView(item, ctx);
    case 'predict': return item.mode === 'choose' ? predictChooseView(item, ctx) : predictTypeView(item, ctx);
    case 'fill': return fillView(item, ctx);
    case 'order': return orderView(item, ctx);
    case 'spot': return spotView(item, ctx);
    default: return writeView(item, ctx);
  }
}
