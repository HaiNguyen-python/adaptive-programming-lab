/**
 * Quick fire: a 60-second round of "what does this print?" built from the learner's finished lessons.
 * It is extra practice for fun: no help, no effect on mastery or memory checks, and it is not offered
 * in a study (it would add unplanned retrieval practice before the delayed checks).
 */
import { h, md } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { store, save } from '../store.js';
import { now, log, rng, emitChange } from '../app.js';
import { isDone } from '../engine/tutor.js';
import { gradePredict } from '../engine/grade.js';
import { shuffle } from '../engine/rng.js';
import { addXp } from '../engine/rewards.js';
import { play, burst } from '../lib/effects.js';
import { codeBlock } from './common.js';

const SECONDS = 60;
const POINTS = 10;

/** Choose-mode predict items from the lessons this learner has finished in this course. */
export function quickFirePool(state, course) {
  const items = [];
  for (const lesson of course.lessons) {
    if (!isDone(state, lesson.id)) continue;
    for (const s of [...lesson.steps, ...lesson.pool]) {
      if (s.kind === 'predict' && s.mode === 'choose' && s.code && s.answer.length < 160) items.push(s);
    }
  }
  return items;
}

const multiplier = (combo) => (combo >= 8 ? 3 : combo >= 4 ? 2 : 1);

export function openQuickFire(course) {
  const state = store.state;
  if (state.study) return; // never in a study: it would add unplanned practice before the delayed checks
  const pool = quickFirePool(state, course);
  if (pool.length < 4) return;
  const best = (state.quickfire && state.quickfire[course.id]) || 0;

  const root = h('div.qf', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Quick fire', tabindex: '-1', 'data-accent': course.accent });
  const appEl = document.getElementById('app');
  let timer = null;
  let deadline = 0;
  let order = [];
  let at = 0;
  let locked = false;
  const run = { score: 0, right: 0, total: 0, combo: 0, bestCombo: 0, start: 0 };
  let keyHandler = null;
  let nextQ = null;

  function close() {
    clearInterval(timer);
    clearTimeout(nextQ);
    document.removeEventListener('keydown', onKey);
    root.remove();
    if (appEl) appEl.inert = false;
    emitChange();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (keyHandler) keyHandler(e);
  }

  function intro() {
    keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); start(); } };
    root.replaceChildren(h('div.qf-card.qf-intro',
      h('button.qf-x', { type: 'button', 'aria-label': 'Close', onclick: close, html: iconSvg('x') }),
      h('span.qf-badge', { html: iconSvg('bolt') }),
      h('h2', 'Quick fire'),
      h('p', `You have ${SECONDS} seconds. Each question shows code from your ${course.title} lessons: pick what it prints.`),
      h('ul.qf-rules',
        h('li', h('b', `${POINTS} points`), ' for each right answer'),
        h('li', h('b', '4 in a row'), ' doubles the points, ', h('b', '8 in a row'), ' triples them'),
        h('li', 'Number keys ', h('kbd', '1'), ' to ', h('kbd', '4'), ' pick an answer')),
      best ? h('p.qf-best', `Your best: ${best}`) : null,
      h('button.btn.btn--primary.btn--lg', { type: 'button', onclick: start }, 'Start')));
    root.focus();
  }

  function start() {
    clearInterval(timer);
    clearTimeout(nextQ);
    order = shuffle(rng, pool);
    at = 0;
    Object.assign(run, { score: 0, right: 0, total: 0, combo: 0, bestCombo: 0, start: Date.now() });
    deadline = Date.now() + SECONDS * 1000;
    log('quickfire_start', { course: course.id, pool: pool.length });
    question();
    timer = setInterval(tick, 100);
  }

  const timeEl = h('span.qf-time');
  const timeBar = h('i');
  const scoreEl = h('b.qf-score', '0');
  const comboEl = h('span.qf-combo');

  function tick() {
    const left = Math.max(0, deadline - Date.now());
    timeEl.textContent = `${Math.ceil(left / 1000)}s`;
    timeBar.style.width = `${(left / (SECONDS * 1000)) * 100}%`;
    root.classList.toggle('is-last', left < 10000);
    if (left <= 0 && !locked) finish();
  }

  function paintCombo() {
    const m = multiplier(run.combo);
    comboEl.textContent = run.combo >= 2 ? `${run.combo} in a row${m > 1 ? `, ${m}x points` : ''}` : '';
    comboEl.className = `qf-combo${m > 1 ? ` is-x${m}` : ''}`;
  }

  function question() {
    if (at >= order.length) { order = shuffle(rng, pool); at = 0; }
    const item = order[at++];
    const outs = shuffle(rng, [item.answer, ...item.options]).slice(0, 4);
    if (!outs.includes(item.answer)) outs[0] = item.answer;
    locked = false;
    const btns = outs.map((t, i) => h('button.qf-opt', { type: 'button', onclick: () => pick(i) }, h('span.qf-key', String(i + 1)), h('span.qf-out', t)));
    function pick(i) {
      if (locked) return;
      locked = true;
      const ok = gradePredict(item, outs[i]);
      run.total += 1;
      btns.forEach((b, j) => { b.disabled = true; if (gradePredict(item, outs[j])) b.classList.add('is-right'); });
      if (ok) {
        run.right += 1;
        run.combo += 1;
        run.bestCombo = Math.max(run.bestCombo, run.combo);
        const gain = POINTS * multiplier(run.combo);
        run.score += gain;
        scoreEl.textContent = String(run.score);
        scoreEl.classList.remove('is-pop'); void scoreEl.offsetWidth; scoreEl.classList.add('is-pop');
        if (run.combo === 4 || run.combo === 8) burst(comboEl);
        play('right');
      } else {
        btns[i].classList.add('is-wrong');
        run.combo = 0;
        play('wrong');
      }
      paintCombo();
      nextQ = setTimeout(() => { if (!root.isConnected) return; if (Date.now() < deadline) question(); else finish(); }, ok ? 420 : 1100);
    }
    keyHandler = (e) => { const n = Number(e.key); if (n >= 1 && n <= btns.length) { e.preventDefault(); pick(n - 1); } };
    root.replaceChildren(h('div.qf-card.qf-play',
      h('div.qf-top',
        h('button.qf-x', { type: 'button', 'aria-label': 'Stop the round', onclick: close, html: iconSvg('x') }),
        h('div.qf-timer', { 'aria-hidden': 'true' }, timeBar),
        timeEl,
        scoreEl),
      h('div.qf-q', md(item.prompt, 'qf-prompt'), codeBlock(item.code, item.lang)),
      h('div.qf-opts', btns),
      comboEl));
    tick();
  }

  function finish() {
    clearInterval(timer);
    locked = true;
    const prev = (state.quickfire && state.quickfire[course.id]) || 0;
    const record = run.score > prev;
    state.quickfire = { ...(state.quickfire || {}), [course.id]: Math.max(prev, run.score) };
    const xp = Math.min(15, run.right);
    if (xp) addXp(state, xp, now());
    save();
    log('quickfire_round', { course: course.id, score: run.score, right: run.right, total: run.total, bestCombo: run.bestCombo, record, ms: Date.now() - run.start });
    if (record && run.score > 0) play('done');
    keyHandler = (e) => { if (e.key === 'Enter') { e.preventDefault(); start(); } };
    root.classList.remove('is-last');
    root.replaceChildren(h('div.qf-card.qf-end',
      h('button.qf-x', { type: 'button', 'aria-label': 'Close', onclick: close, html: iconSvg('x') }),
      h('p.qf-label', record && run.score > 0 ? 'New best' : 'Time'),
      h('div.qf-final', String(run.score)),
      h('dl.qf-stats',
        h('div', h('dt', 'Right'), h('dd', `${run.right} of ${run.total}`)),
        h('div', h('dt', 'Longest run'), h('dd', String(run.bestCombo))),
        h('div', h('dt', 'XP'), h('dd', `+${xp}`))),
      h('p.qf-note', record && prev ? `Your old best was ${prev}.` : !record ? `Your best is ${prev}.` : 'Quick fire never changes your memory checks: it is only for fun.'),
      h('div.qf-actions',
        h('button.btn.btn--ghost', { type: 'button', onclick: close }, 'Done'),
        h('button.btn.btn--primary', { type: 'button', onclick: start }, 'Play again'))));
    root.focus();
  }

  document.addEventListener('keydown', onKey);
  document.body.append(root);
  if (appEl) appEl.inert = true;
  intro();
}
