/**
 * The lesson player: one full-screen flow for lessons, memory checks, practice and placement.
 *
 * The rules it enforces come from the research the app follows:
 *  - Try first. Help unlocks only after a real attempt, and a new attempt is needed before more help.
 *  - Help is a hint, a hint to explain in your own words, or a worked example of a similar problem.
 *    The tutor engine chooses which. The answer itself is not on offer.
 *  - After help comes a solo check: one attempt, no help, with a confidence rating first.
 */
import { h, md, mdInline, plural, relDay } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { nova, novaSvg, confFaceSvg, medalSvg, svgEl } from '../lib/art.js';
import { play, confetti, burst } from '../lib/effects.js';
import { store, save } from '../store.js';
import { rng, now, log, tutorCtx, emitChange, clockShift } from '../app.js';
import * as catalog from '../catalog.js';
import { isBuildItem } from '../engine/content.js';
import { current, needsConfidence, requestHelp, recordItem, advance, summarize, progress, stopPlacement, ensureFinished, nextLesson } from '../engine/tutor.js';
import { availableArms, helpSeekingFlags, explainChoice, HELP_NAME } from '../engine/help-policy.js';
import { CONF_LEVELS, checkFeedback } from '../engine/calibration.js';
import { getConcept, flames } from '../engine/mastery.js';
import { warmUp, run } from '../run/runners.js';
import { aiActive, aiModel, generateHelp, feedbackOnExplanation } from '../ai.js';
import { isTestRole, learningGain } from '../engine/unit-tests.js';
import { openSheet, confirmSheet, toast, codeBlock, resultTable, previewFrame, flamesEl } from './common.js';
import { teachView, traceView, itemView } from './items.js';

const ROLE = {
  warmup: { tag: 'Memory check', title: 'First, something from before' },
  memory: { tag: 'Memory check', title: 'Do you still have it?' },
  final: { tag: 'Lesson check', title: 'One last question, on your own' },
  helpcheck: { tag: 'Solo check', title: 'Now one on your own' },
  retry: { tag: 'Solo check', title: 'One more on this idea' },
  extra: { tag: 'Practice', title: 'Quick practice' },
  practice: { tag: 'Question', title: 'Next question' },
  placement: { tag: 'Placement check', title: '' },
  'test-pre': { tag: 'Starting check', title: 'What do you know already?' },
  'test-post': { tag: 'Unit test', title: 'Show what you learned' },
  'test-delayed': { tag: 'One-week unit test', title: 'What stayed with you?' },
};
const pickOf = (list) => list[Math.floor(Math.random() * list.length)];

function defaultWhy(item, res) {
  const sql = item.lang === 'sql';
  switch (item.kind) {
    case 'mcq': return 'Have another look, then pick again.';
    case 'predict':
      if (item.mode === 'choose') return sql ? 'That is not what this query returns. Go through it clause by clause.' : 'That is not what this code prints. Run it in your head, one line at a time.';
      return sql ? 'Not yet. Work out which rows match, then type exactly what comes back.' : 'Not yet. Run the code in your head, one line at a time, and type exactly what appears.';
    case 'spot': return 'That line is fine. Check what each line needs in order to work.';
    case 'fill': return res.perBlank.filter((x) => !x).length > 1 ? 'The gaps marked in red are not right yet. Tap a gap to clear it.' : 'The gap marked in red is not right yet. Tap it to clear it.';
    case 'order':
      if (res.firstWrong === 0) return 'The first line is not right yet. Which line has to come first?';
      return `The first ${res.firstWrong === 1 ? 'line is' : `${res.firstWrong} lines are`} in the right place. Look at what comes next.`;
    default: return 'Not passing yet. Compare what your code does with what the task asks for.';
  }
}

function feedbackEl(kind, title, xp, ...body) {
  const iconName = kind === 'ok' ? 'check' : kind === 'bad' ? 'x' : 'info';
  return h(`div.feedback.is-${kind}`, { role: 'status', 'aria-live': 'polite' },
    h('div.feedback-title', { html: iconSvg(iconName) }, h('span', title), xp ? h('span.xp', `+${xp} XP`) : null),
    h('div.stack', body));
}

/**
 * Open the player for a session. onClose(session) runs when the learner leaves.
 */
export function openPlayer({ session, course, onClose }) {
  const state = store.state;
  const ctx = () => tutorCtx(session, course);
  const prog = h('i');
  const progBox = h('div.player-progress', { role: 'progressbar', 'aria-label': 'Progress', 'aria-valuemin': '0', 'aria-valuemax': '100' }, prog);
  const count = h('span.player-count');
  // Right first time, in a row. For fun only: it gives no XP. It is not shown in a study, because a streak that
  // breaks when help is used could discourage asking for help, which is the behaviour the study measures.
  let combo = 0;
  const comboEl = h('span.player-combo', { 'aria-live': 'polite' });
  function paintCombo(bump) {
    comboEl.replaceChildren(...(combo >= 3 ? [h('span', { html: iconSvg('flame') }), h('span', `${combo} in a row`)] : []));
    comboEl.classList.toggle('is-on', combo >= 3);
    if (bump && combo >= 3) { comboEl.classList.remove('is-bump'); void comboEl.offsetWidth; comboEl.classList.add('is-bump'); }
  }
  const stage = h('div.player-stage');
  const bar = h('div.player-bar');
  const root = h('div.player', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Learning session', tabindex: '-1' },
    h('div.player-top', h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: () => tryClose(), html: iconSvg('x') }), progBox, comboEl, count),
    stage, bar);
  let it = null;          // what the learner has done on the item on screen
  let notesSeen = 0;
  let closed = false;
  let mainBtn = null;

  const langs = new Set(session.queue.filter((e) => e.type === 'item' && e.item && e.item.kind === 'write').map((e) => e.item.lang));
  langs.forEach((l) => warmUp(l));

  function onKey(e) {
    if (closed || document.querySelector('#layer .backdrop')) return;
    if (e.key === 'Escape') { e.preventDefault(); tryClose(); return; }
    if (/^[1-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const tag = e.target && e.target.tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT' || (e.target && e.target.isContentEditable)) return;
      const opt = root.querySelectorAll('.opts .opt')[Number(e.key) - 1];
      if (opt && !opt.disabled) { e.preventDefault(); opt.click(); }
      return;
    }
    if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.metaKey) return;
    const t = e.target;
    if (t && !root.contains(t)) { e.preventDefault(); if (mainBtn && !mainBtn.disabled) mainBtn.click(); return; }
    if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'SUMMARY')) return;
    if (mainBtn && !mainBtn.disabled) { e.preventDefault(); mainBtn.click(); }
  }
  document.addEventListener('keydown', onKey);
  document.body.append(root);
  // The app behind the player cannot be reached with the keyboard or a screen reader while it is open.
  const appEl = document.getElementById('app');
  if (appEl) appEl.inert = true;

  // ---------------------------------------------------------------- bar

  function primary(label, onclick, { disabled = false, ok = false } = {}) {
    mainBtn = h(`button.btn.btn--lg.${ok ? 'btn--ok' : 'btn--primary'}`, { type: 'button', disabled, onclick }, label);
    return mainBtn;
  }
  const quiet = (label, onclick) => h('button.btn.btn--quiet', { type: 'button', onclick }, label);

  function setBar({ feedback = null, left = [], main = null, note = '' }) {
    if (!main) mainBtn = null;
    bar.replaceChildren();
    if (feedback) bar.append(feedback);
    bar.append(h('div.player-bar-in', left, main));
    if (note) bar.append(h('div.help-note', note));
  }

  // ---------------------------------------------------------------- flow

  function show() {
    const entry = current(session, ctx());
    const p = progress(session);
    const pct = p.total ? Math.round((p.done / p.total) * 100) : 100;
    prog.style.width = `${Math.max(3, pct)}%`;
    progBox.setAttribute('aria-valuenow', String(pct));
    stage.scrollTop = 0;
    it = null;
    if (!root.contains(document.activeElement) || document.activeElement === document.body) root.focus({ preventScroll: true });
    else if (document.activeElement && !document.activeElement.isConnected) root.focus({ preventScroll: true });
    if (!entry || entry.type === 'summary') { count.textContent = ''; showSummary(); return; }
    count.textContent = session.type === 'placement' ? '' : `${p.done + 1} / ${p.total}`;
    if (entry.type === 'teach') showTeach(entry);
    else if (entry.type === 'trace') showTrace(entry);
    else showItem(entry);
  }

  function next() {
    advance(ctx());
    save();
    const fresh = session.notes.slice(notesSeen).filter((n) => n.type === 'skipped').length;
    notesSeen = session.notes.length;
    if (fresh) toast('You are on a roll, so Nova skipped an easier question.', 'bolt');
    show();
  }

  function showTeach(entry) {
    stage.replaceChildren(teachView(entry.step, course).el);
    setBar({ main: primary('Continue', next) });
  }

  function showTrace(entry) {
    let view = null;
    const paint = () => {
      if (!view) return;
      if (view.atEnd()) setBar({ main: primary('Continue', next) });
      else setBar({ left: [quiet('Skip', next)], main: primary('Next line', () => view.next()) });
    };
    view = traceView(entry.step, paint);
    stage.replaceChildren(view.el);
    paint();
  }

  // ---------------------------------------------------------------- items

  function showItem(entry) {
    const lesson = catalog.findLesson(entry.lessonId);
    it = {
      entry, item: entry.item, lesson, t0: now(), attempts: 0, fails: 0, firstTry: null, done: false, solved: false,
      helps: [], hintsUsed: 0, workedUsed: false, lastHelp: null, failsAtHelp: -1, lastFeedbackAt: now(),
      conf: null, walkthrough: false, nudged: false, changed: true, busy: false, runtimeDown: false, view: null, feedback: null,
    };
    if (needsConfidence(entry, state.settings)) showConfidence();
    else renderItem();
  }

  function showConfidence() {
    const { entry, lesson } = it;
    const role = ROLE[entry.role] || ROLE.practice;
    const buttons = CONF_LEVELS.map((c) => h('button.conf-btn', { type: 'button', onclick: () => {
      it.conf = c.level;
      log('confidence', { session: session.id, itemId: entry.item.id, lessonId: entry.lessonId, role: entry.role, conf: c.level });
      play('tap');
      renderItem();
    }, html: confFaceSvg(c.level) }, h('span', c.label)));
    stage.replaceChildren(h('div.stage.solo-card',
      nova('think', state.profile.color),
      h('span.tag.tag--solo', role.tag),
      h('h2', role.title),
      md(`Next comes a question on **${lesson.concept}**${entry.solo ? ', with no help' : ''}. How sure are you that you will get it right?`),
      h('div.conf', { role: 'group', 'aria-label': 'How sure are you?' }, buttons)));
    setBar({ note: 'Your answer here is only for you. It helps you learn to judge what you know.' });
  }

  function renderItem() {
    const { entry, item } = it;
    // Response times are measured from the moment the question appears, not from the confidence screen.
    it.t0 = now();
    it.lastFeedbackAt = it.t0;
    const itemCourse = catalog.courseOf(entry.lessonId) || course;
    it.view = itemView(item, {
      rng,
      course: itemCourse,
      onChange: () => { if (it && !it.done) { it.changed = true; paintBar(); } },
      onSubmit: () => doCheck(),
    });
    const tags = [];
    if (entry.solo) {
      const role = ROLE[entry.role] || ROLE.practice;
      tags.push(h('span.tag.tag--solo', { html: iconSvg('solo') }, entry.role === 'placement' ? role.tag : `${role.tag}: one try, no help`));
      if (entry.role === 'memory' || entry.role === 'warmup' || entry.role === 'extra') tags.push(h('span.tag', it.lesson.title));
    }
    stage.replaceChildren(h('div.stage',
      tags.length ? h('div.stage-tags', tags) : null,
      md(item.prompt, 'prompt'),
      it.view.el));
    stage.scrollTop = 0;
    log('item_shown', { session: session.id, itemId: item.id, lessonId: entry.lessonId, kind: item.kind, role: entry.role, solo: entry.solo });
    paintBar();
  }

  function helpState() {
    const { entry, item, lesson } = it;
    if (entry.solo || !isBuildItem(item)) return { show: false };
    const allow = state.settings.allow;
    const arms = availableArms(item, lesson, { hints: it.hintsUsed, worked: it.workedUsed }, allow);
    if (it.walkthrough) return { show: true, enabled: true, label: 'Show the walkthrough', again: 'walk' };
    if (it.fails === 0) return { show: true, enabled: false, label: 'Help', note: 'Have a go first. Help opens after your first try.' };
    if (it.lastHelp && it.fails === it.failsAtHelp) return { show: true, enabled: true, label: 'Show the help again', again: 'help' };
    if (arms.length) return { show: true, enabled: true, label: 'Ask Nova for help', calling: it.fails >= 2 && !it.helps.length };
    if (allow.walkthrough && it.fails - Math.max(0, it.failsAtHelp) >= 2) return { show: true, enabled: true, label: 'Walk me through it', walk: true };
    if (allow.walkthrough) return { show: true, enabled: false, label: 'Help', note: 'You have every hint for this one. Try twice more and Nova will walk you through it.' };
    return { show: true, enabled: false, label: 'Help', note: 'You have every hint for this one. Give it another go.' };
  }

  function paintBar() {
    if (!it || it.done) return;
    const { entry, item, view } = it;
    const hs = helpState();
    const left = [];
    if (hs.show) {
      left.push(h(`button.help-btn${hs.calling ? '.is-calling' : ''}`, { type: 'button', disabled: !hs.enabled || it.busy, onclick: () => {
        if (it.busy) return;
        if (hs.again === 'walk') showWalkthrough(false);
        else if (hs.again === 'help') showHelp(it.lastHelp, false);
        else if (hs.walk) showWalkthrough(true);
        else askHelp();
      }, html: iconSvg('bulb') }, h('span', hs.label)));
    }
    if (!entry.solo && isBuildItem(item) && (it.fails >= 4 || it.runtimeDown)) left.push(h('button.btn.btn--quiet', { type: 'button', disabled: it.busy, onclick: () => { if (!it.busy) skipItem(); } }, 'Skip for now'));
    if (session.type === 'placement') left.push(quiet('Stop here', () => { stopPlacement(ctx()); save(); show(); }));
    const label = it.busy ? 'Checking…' : item.kind === 'write' ? 'Check my code' : 'Check';
    setBar({
      feedback: it.feedback,
      left,
      main: primary(label, doCheck, { disabled: it.busy || !view.ready() || !it.changed }),
      note: hs.note || '',
    });
  }

  async function doCheck() {
    if (!it || it.busy || it.done || !it.view.ready() || !it.changed) return;
    const mine = it;
    const { entry, item } = mine;
    mine.busy = true;
    paintBar();
    let res;
    try { res = await mine.view.check(); } catch (e) { res = { correct: false, unavailable: true, why: 'Something went wrong while checking. Please try again.' }; }
    if (it !== mine || closed) return;
    mine.busy = false;
    if (res.unavailable) {
      mine.runtimeDown = true;
      mine.feedback = feedbackEl('info', 'The code runner is not available', 0,
        md(res.why || 'Your code could not be run just now. Check your internet connection and try again, or skip this task for now.'), res.detail || null);
      paintBar();
      return;
    }
    mine.attempts++;
    if (mine.firstTry === null) mine.firstTry = !!res.correct;
    mine.lastFeedbackAt = now();
    log('attempt', { session: session.id, itemId: item.id, lessonId: entry.lessonId, kind: item.kind, role: entry.role, solo: entry.solo, attempt: mine.attempts, correct: !!res.correct, helps: mine.helps.length, ms: now() - mine.t0 });
    if (res.correct) { resolve(true, res); return; }
    mine.fails++;
    if (entry.solo || (!isBuildItem(item) && mine.attempts >= 2)) { resolve(false, res); return; }
    play('wrong');
    mine.view.retry(res);
    mine.changed = false;
    const hs = helpState();
    const stuck = hs.enabled && !hs.again && mine.fails >= 2 ? md(hs.walk ? 'Still stuck? Nova can walk you through it.' : 'Stuck? Nova can give you a nudge.', 'small') : null;
    mine.lastWhy = res.why || defaultWhy(item, res);
    mine.feedback = feedbackEl('bad', pickOf(['Not quite', 'Not yet', 'Almost']), 0, md(mine.lastWhy), res.detail || null, stuck);
    paintBar();
  }

  function resolve(correct, res) {
    const { entry, item } = it;
    it.done = true;
    it.solved = correct;
    if (isTestRole(entry.role)) { resolveTest(correct); return; }
    it.view.finish(correct);
    const r = recordItem({
      session, state, now: now(), log,
      outcome: { firstTry: it.firstTry === true, correct, attempts: it.attempts, helps: it.helps, walkthrough: it.walkthrough, skipped: false, conf: it.conf, ms: now() - it.t0 },
    });
    save();
    const extra = [];
    if (it.conf) extra.push(md(checkFeedback(it.conf, correct), 'small'));
    if (r.memory) {
      extra.push(md(correct
        ? `You remembered this ${r.memory.gapDays <= 0 ? 'today' : `after ${plural(r.memory.gapDays, 'day')}`}. Nova will check it again ${relDay(r.memory.nextInDays)}.`
        : 'This one faded a little. Nova will bring it back tomorrow.', 'small'));
    }
    if (!state.study) {
      if (correct && it.firstTry === true && !it.helps.length && !it.walkthrough) { combo += 1; paintCombo(true); } else { combo = 0; paintCombo(false); }
    }
    let fb;
    if (correct) {
      play('right');
      const helped = it.helps.length > 0 || it.walkthrough;
      const title = helped ? 'Solved!' : it.attempts > 1 ? 'You got there!' : pickOf(['Correct!', 'Nice work!', 'That is right!']);
      fb = feedbackEl('ok', title, r.xp, md(item.explain), ...extra);
    } else {
      play('wrong');
      const sol = it.view.solution();
      fb = feedbackEl('info', 'Not this time', r.xp,
        sol ? h('div.stack', h('div.small', item.kind === 'spot' ? '' : 'The answer:'), sol) : null,
        md(item.explain), ...extra,
        entry.role === 'placement' ? null : md('This idea will come back, so you get another go at it.', 'small'));
    }
    setBar({ feedback: fb, main: primary('Continue', next, { ok: correct }) });
    if (correct) burst(mainBtn);
    if (mainBtn) mainBtn.focus({ preventScroll: true });
  }

  /** Test questions give no feedback on correctness, so the test teaches as little as possible. */
  function resolveTest(correct) {
    const box = stage.querySelector('.stage');
    if (box) { box.inert = true; box.style.opacity = '0.75'; }
    const r = recordItem({
      session, state, now: now(), log,
      outcome: { firstTry: it.firstTry === true, correct, attempts: it.attempts, helps: [], walkthrough: false, skipped: false, conf: it.conf, ms: now() - it.t0 },
    });
    save();
    play('tap');
    const fb = feedbackEl('info', 'Answer saved', r.xp, md('You will see your score at the end of the test.', 'small'));
    setBar({ feedback: fb, main: primary('Continue', next) });
    if (mainBtn) mainBtn.focus({ preventScroll: true });
  }

  function skipItem() {
    const r = recordItem({
      session, state, now: now(), log,
      outcome: { firstTry: false, correct: false, attempts: it.attempts, helps: it.helps, walkthrough: it.walkthrough, skipped: true, conf: it.conf, ms: now() - it.t0 },
    });
    save();
    toast(r.attempts ? 'Skipped for now. This idea will come back in your memory checks.' : 'Skipped for now.', 'skip');
    next();
  }

  // ---------------------------------------------------------------- help

  function askHelp() {
    const flags = helpSeekingFlags(state.recentItems, { msSinceFeedback: now() - it.lastFeedbackAt, helpsOnItem: it.helps.length });
    if (flags.rapid && !it.nudged) {
      it.nudged = true;
      state.counters.nudges++;
      log('nudge', { session: session.id, itemId: it.item.id, lessonId: it.entry.lessonId, helps: it.helps.length, ms: now() - it.lastFeedbackAt });
      save();
      const sheet = openSheet({
        title: 'One more look first?',
        body: h('div.stack', h('div.help-kind', nova('wink', state.profile.color), md('People remember more when they wrestle with a problem a little longer before getting help. Try once more, and the help will still be here.'))),
        foot: [
          h('button.btn.btn--ghost', { type: 'button', onclick: () => { sheet.close(); giveHelp(); } }, 'Help me now'),
          h('button.btn.btn--primary', { type: 'button', onclick: () => sheet.close() }, 'I will try again'),
        ],
      });
      return;
    }
    giveHelp();
  }

  function giveHelp() {
    const help = requestHelp({
      session, state, lesson: it.lesson, entry: it.entry, now: now(), rng, log, shift: clockShift(),
      item: { fails: it.fails, hintsUsed: it.hintsUsed, workedUsed: it.workedUsed, helps: it.helps },
    });
    if (!help) { paintBar(); return; }
    const arm = help.decision.arm;
    it.helps.push(arm);
    if (arm === 'worked') it.workedUsed = true; else it.hintsUsed++;
    it.failsAtHelp = it.fails;
    it.lastHelp = help;
    help.decision.source = 'authored';
    save();
    play('help');
    paintBar();
    if (aiActive(state)) aiHelp(help); else showHelp(help, true);
  }

  /**
   * Ask the AI tutor to write the help the policy chose. The learner sees a short wait; on any problem the
   * written help is shown instead. What happened is recorded on the decision and in the event log.
   */
  async function aiHelp(help) {
    const mine = it;
    const d = help.decision;
    const wait = openSheet({ title: 'Nova is thinking', body: h('div.help-kind', nova('think', state.profile.color), h('p', 'Nova is looking at your answer…')), dismissable: false });
    const previous = mine.aiTexts || [];
    try {
      const out = await generateHelp({
        arm: d.arm, lesson: mine.lesson, item: mine.item, model: aiModel(state), run,
        attempt: mine.view.answerText ? mine.view.answerText() : '', feedback: mine.lastWhy || '', previous,
      });
      if (out.kind === 'worked') help.worked = out.worked; else { help.hint = out.hint; help.question = out.question; }
      d.source = 'ai'; d.model = out.model; d.aiMs = out.ms;
      mine.aiTexts = [...(mine.aiTexts || []), out.hint || out.worked.problem];
      log('ai_help', { decision: d.id, itemId: mine.item.id, lessonId: mine.entry.lessonId, arm: d.arm, model: out.model, ms: out.ms, inputTokens: out.usage.input_tokens, outputTokens: out.usage.output_tokens, hint: out.hint || null, question: out.question || null, worked: out.worked || null });
    } catch (e) {
      d.source = 'authored'; d.aiError = (e && (e.code || e.status || e.name)) || 'error';
      log('ai_fallback', { decision: d.id, itemId: mine.item.id, lessonId: mine.entry.lessonId, arm: d.arm, reason: String(d.aiError), message: String((e && e.message) || '').slice(0, 200) });
    }
    save();
    wait.close();
    if (it === mine && !closed) showHelp(help, true);
  }

  function whyNode(d) {
    let text = explainChoice(d);
    if (d.policy !== 'fixed-ladder' && d.arms.length > 1) {
      const top = d.arms.reduce((a, b) => (d.probs[b] > d.probs[a] ? b : a));
      if (top !== d.arm) text += ` This time it picked a ${HELP_NAME[d.arm].toLowerCase()}, to keep learning what works for you.`;
    }
    const box = h('details.why', h('summary', 'Why this kind of help?'), h('p', { style: { marginTop: '8px' } }, text));
    if (d.policy !== 'fixed-ladder' && d.arms.length > 1) {
      box.append(h('div.why-probs', d.arms.map((a) => h('span', `${HELP_NAME[a]}: ${Math.round(d.probs[a] * 100)}%`))),
        h('p.tiny.muted', { style: { marginTop: '6px' } }, 'These were the chances of each kind this time. You can turn kinds of help on or off in Settings.'));
    }
    return box;
  }

  function workedNode(w, lang, stepwise, onDone) {
    const steps = w.steps.map((st, i) => h('div.worked-step', h('div.num', String(i + 1)),
      h('div', h('h4', st.label), st.text ? md(st.text) : null, st.code !== undefined ? codeBlock(st.code, lang) : null)));
    const final = h('div.stack', h('h4', 'The finished solution'));
    if (lang === 'sql') { final.append(codeBlock(w.code, 'sql')); if (w.result) final.append(resultTable(w.result)); }
    else if (lang === 'web') { final.append(codeBlock(w.code, 'web'), previewFrame(w.code, 170)); }
    else final.append(codeBlock(w.code, lang, { output: w.output }));
    const list = h('div.stack-l');
    const box = h('div.stack-l', h('div.problem', md(w.problem)), list);
    let shown = stepwise ? 0 : steps.length;
    const more = h('button.btn.btn--ghost.btn--block', { type: 'button' });
    function paint() {
      list.replaceChildren(...steps.slice(0, shown));
      if (shown >= steps.length) { list.append(final); more.remove(); if (onDone) onDone(); }
      else { more.textContent = shown === 0 ? 'Show the first step' : 'Next step'; if (!more.isConnected) box.append(more); }
    }
    more.addEventListener('click', () => { shown++; paint(); more.scrollIntoView({ block: 'nearest' }); });
    if (stepwise) shown = 1;
    paint();
    return box;
  }

  function showHelp(help, fresh) {
    const d = help.decision;
    const arm = d.arm;
    const lang = it.item.lang;
    const body = h('div.stack-l');
    const sub = {
      hint: 'A nudge in the right direction. The thinking stays yours.',
      explain: 'Read the hint, then put it in your own words.',
      worked: 'A similar problem, solved step by step. Then back to yours.',
    }[arm];
    body.append(h('div.help-kind', nova(arm === 'worked' ? 'happy' : 'think', state.profile.color), h('div', h('h3', HELP_NAME[arm]), h('div.small.muted', sub))));
    let needExplain = false;
    let done = null;
    if (arm === 'worked') body.append(workedNode(help.worked, lang, fresh, null));
    else body.append(h('div.help-text', md(help.hint)));
    if (d.source === 'ai') body.append(h('div.tiny.muted', `Written by Nova's AI tutor (${d.model}) for your answer, and checked so it does not contain the answer.`));
    if (arm === 'explain') {
      if (help.explained) body.append(h('div.stack', h('div.small.muted', 'You wrote:'), h('div.help-text', help.explained), help.explainFeedback ? h('div.nova-explain', h('div', h('b', 'Nova'), md(help.explainFeedback, 'small'))) : null));
      else {
        needExplain = true;
        const ta = h('textarea', { 'aria-label': 'Your explanation', placeholder: 'Write one or two sentences', 'data-autofocus': '' });
        const starters = ['The hint means that ', 'I need to change ', 'My mistake was '];
        const t0 = now();
        done = h('button.btn.btn--primary', { type: 'button', disabled: true }, 'Done');
        ta.addEventListener('input', () => { done.disabled = ta.value.trim().length < 15; });
        done.addEventListener('click', async () => {
          help.explained = ta.value.trim();
          state.counters.explains++;
          log('explain', { session: session.id, itemId: it.item.id, lessonId: it.entry.lessonId, decision: d.id, chars: help.explained.length, text: help.explained, ms: now() - t0 });
          save();
          if (!aiActive(state)) { sheet.close(); return; }
          // With the AI tutor on, Nova answers the learner's explanation (what is right, one question if not).
          done.disabled = true;
          done.textContent = 'Nova is reading…';
          const mine = it;
          try {
            const fb = await feedbackOnExplanation({ lesson: mine.lesson, item: mine.item, hint: help.hint, explanation: help.explained, model: aiModel(state) });
            help.explainFeedback = fb.text;
            log('ai_explain_feedback', { decision: d.id, itemId: mine.item.id, model: fb.model, text: fb.text, inputTokens: fb.usage.input_tokens, outputTokens: fb.usage.output_tokens });
            save();
            ta.disabled = true;
            box.after(h('div.nova-explain', h('div', { html: novaSvg('happy', state.profile.color, 'nova-mini') }), h('div', h('b', 'Nova'), md(fb.text, 'small'))));
            done.textContent = 'Back to my question';
            done.disabled = false;
            done.onclick = () => sheet.close();
          } catch (e) {
            log('ai_fallback', { decision: d.id, itemId: mine.item.id, kind: 'explain_feedback', reason: String((e && (e.code || e.status)) || 'error') });
            sheet.close();
          }
        }, { once: true });
        var box = h('div.explain-box.stack',
          h('label', { style: { fontWeight: '600' } }, help.question || 'Now say it in your own words: what is this hint telling you to do?'),
          ta,
          h('div.starters', starters.map((s) => h('button', { type: 'button', onclick: () => { ta.value = s; ta.focus(); done.disabled = true; } }, `${s.trim()}…`))),
          h('div.tiny.muted', 'Explaining it yourself is the part that helps you remember. One or two sentences are enough.'));
        body.append(box);
      }
    }
    body.append(whyNode(d));
    const sheet = openSheet({
      title: fresh ? 'Nova is here to help' : 'Your help for this question',
      body,
      dismissable: !needExplain,
      foot: needExplain ? [done] : [h('button.btn.btn--primary', { type: 'button', onclick: () => sheet.close() }, 'Back to my question')],
      onClose: () => { if (it && it.view && it.view.focus) it.view.focus(); },
    });
  }

  function showWalkthrough(first) {
    if (first) {
      it.walkthrough = true;
      state.counters.helps.walkthrough++;
      log('walkthrough', { session: session.id, itemId: it.item.id, lessonId: it.entry.lessonId, fails: it.fails, helps: it.helps.length });
      save();
      paintBar();
    }
    const sheet = openSheet({
      title: 'Let us walk through it',
      body: h('div.stack-l',
        h('div.help-kind', nova('happy', state.profile.color), h('div', h('h3', 'Here is one way to do it'), h('div.small.muted', 'Read it, close this, then build it yourself.'))),
        it.view.solution(),
        h('div.help-text', md(it.item.explain)),
        h('div.callout', 'Building it yourself after seeing it is what makes it stick. This question does not count as solved on your own, so Nova will check the idea again soon.')),
      foot: [h('button.btn.btn--primary', { type: 'button', onclick: () => sheet.close() }, 'Now I will do it')],
    });
  }

  // ---------------------------------------------------------------- summaries

  function tile(value, label, cls = '') { return h(`div.tile${cls ? `.${cls}` : ''}`, h('b', value), h('span', label)); }

  function badgeRows(badges) {
    return badges.map((b) => h('div.badge-pop', svgEl(medalSvg(b.icon)), h('div', h('div.small.muted', 'New badge'), h('b', b.name), h('div.small', b.how))));
  }

  function showSummary() {
    ensureFinished(ctx());
    save();
    emitChange();
    prog.style.width = '100%';
    const s = summarize(session);
    const out = session.outcome || { badges: [] };
    const box = h('div.stage.summary');
    const done = () => close();
    if (session.type === 'lesson') {
      const lesson = catalog.findLesson(session.lessonId);
      const concept = getConcept(state, session.lessonId);
      const finishedCourse = out.firstTime && !nextLesson(state, course);
      box.append(
        nova('cheer', state.profile.color),
        h('h1', finishedCourse ? 'Course complete!' : out.firstTime ? 'Lesson complete!' : 'Practice makes it stick'),
        h('p.muted', lesson.title),
        h('div.tiles',
          tile(`+${s.xp}`, 'XP earned', 'tile--xp'),
          tile(`${s.practice.clean}/${s.practice.total}`, 'right on the first try'),
          tile(`${s.checks.right}/${s.checks.total}`, s.checks.total === 1 ? 'solo check passed' : 'solo checks passed')),
        lesson.goals && lesson.goals.length ? h('div.recap', h('h4', 'What you can do now'), h('ul.recap-list', lesson.goals.map((g) => h('li', { html: iconSvg('check') }, md(g))))) : null,
        out.firstTime ? h('div.note-card', { html: iconSvg('flame', 'ic') }, h('div',
          h('h4', h('span', 'One flame lit '), flamesEl(flames(concept))),
          md('Nova will check this idea again **tomorrow** and **one week later**, without help. Passing those checks lights the other two flames.', 'small')))
          : h('div.note-card', { html: iconSvg('flame', 'ic') }, h('div',
            h('h4', h('span', 'Extra practice '), flamesEl(flames(concept))),
            md('Practice keeps an idea fresh. Your memory checks stay on their own schedule.', 'small'))));
      if (s.helpTotal) {
        const passed = s.checks.right === s.checks.total;
        box.append(h('div.note-card', { html: iconSvg('bulb', 'ic') }, h('div', h('h4', `You asked for help ${s.helpTotal === 1 ? 'once' : `${s.helpTotal} times`}`),
          md(passed ? 'Then you showed you could do it on your own. That is what help is for.' : 'The solo checks show what is not solid yet. That is useful to know, and tomorrow gives you another go.', 'small'))));
      }
      if (s.skipped) box.append(h('div.note-card', { html: iconSvg('bolt', 'ic') }, h('div', h('h4', 'Fast track'), md(`You answered so well that Nova skipped ${plural(s.skipped, 'easier question')}.`, 'small'))));
    } else if (session.type === 'test') {
      const unit = course.units.find((u) => u.id === session.unitId);
      const r = (state.tests && state.tests[session.unitId]) || {};
      const g = learningGain(r);
      const pct = (x) => (x === null ? 'Not yet' : `${Math.round(x * 100)}%`);
      const title = { pre: 'Starting check done', post: 'Unit test done', delayed: 'One-week test done' }[session.testKind];
      const lead = {
        pre: 'Now you know where you start. After the unit, a test like this one shows how far you came.',
        post: 'Nova will give you one more test like this in a week, to see what stays with you.',
        delayed: 'This is the real measure of learning: what you can still do a week later, on your own.',
      }[session.testKind];
      box.append(
        nova(s.checks.right >= s.checks.total / 2 ? 'proud' : 'happy', state.profile.color),
        h('h1', title), h('p.muted', unit ? unit.title : ''),
        h('div.tiles',
          tile(pct(g.pre), 'starting check', ''),
          tile(pct(g.post), 'after the unit', ''),
          tile(pct(g.delayed), 'one week later', '')),
        h('div.note-card', { html: iconSvg('chart', 'ic') }, h('div', h('h4', `${s.checks.right} of ${s.checks.total} right this time`), md(lead, 'small'))));
      if (session.testKind === 'post' && g.gain !== null) box.append(h('div.note-card', { html: iconSvg('trophy', 'ic') }, h('div', h('h4', g.gain > 0 ? `You improved by ${Math.round(g.gain * 100)} points` : 'Same score as at the start'), md(g.gain > 0 ? 'Compared with your starting check for this unit.' : 'Practise the lessons again or use your memory checks: they are made for this.', 'small'))));
    } else if (session.type === 'placement') {
      const passed = session.unitScores.filter((u) => u.passed).length;
      const start = course.units[Math.min(passed, course.units.length - 1)];
      box.append(
        nova(passed ? 'proud' : 'happy', state.profile.color),
        h('h1', passed >= course.units.length ? 'You know this course well' : passed ? `You start at unit ${passed + 1}` : 'You start at the beginning'),
        h('p.muted', passed >= course.units.length ? 'Every unit is open. Nova will still check these ideas in a week.' : passed ? `${start.title}. Nova will check the units you skipped in a week, to make sure they are solid.` : 'A good place to start. Every lesson here is short.'),
        h('div.check-list', session.unitScores.map((u) => h(`div.check-row.${u.passed ? 'is-ok' : 'is-bad'}`, { html: iconSvg(u.passed ? 'check' : 'x', 'state') },
          h('div.grow', h('b', u.title), h('span.small.muted', `${u.right} of ${u.total} right`)), h('span.tag', u.passed ? 'Skipped' : 'Start here')))));
    } else {
      const all = s.checks.total;
      const right = s.checks.right;
      const review = session.type === 'review';
      box.append(
        nova(right === all ? 'cheer' : right >= all / 2 ? 'proud' : 'oops', state.profile.color),
        h('h1', review ? 'Memory check done' : 'Practice done'),
        h('p.muted', all ? `You remembered ${right} of ${all} without help.` : 'Nothing was due today.'),
        h('div.tiles', tile(`+${s.xp}`, 'XP earned', 'tile--xp'), tile(`${right}/${all}`, 'remembered'), tile(String(s.minutes), s.minutes === 1 ? 'minute' : 'minutes')),
        h('div.check-list', session.results.map((r) => {
          const lesson = catalog.findLesson(r.lessonId);
          const when = r.memory ? `Next check ${relDay(r.memory.nextInDays)}` : 'Practice only';
          return h(`div.check-row.${r.firstTry ? 'is-ok' : 'is-bad'}`, { html: iconSvg(r.firstTry ? 'check' : 'x', 'state') },
            h('div.grow', h('b', lesson ? lesson.title : r.lessonId), h('span.small.muted', when)), flamesEl(flames(state.concepts[r.lessonId])));
        })));
      if (review && right < all) box.append(h('div.note-card', { html: iconSvg('memory', 'ic') }, h('div', h('h4', 'Forgetting is normal'), md('The ideas you missed come back tomorrow. You can also open a lesson again from the trail to practise it.', 'small'))));
    }
    if (s.calibration.n >= 2) {
      const c = s.calibration;
      const text = c.verdict === 'early' || c.verdict === 'good'
        ? `On the solo checks you felt ${Math.round(c.meanConf * 100)}% sure and got ${Math.round(c.accuracy * 100)}% right.`
        : c.bias > 0
          ? `On the solo checks you felt ${Math.round(c.meanConf * 100)}% sure but got ${Math.round(c.accuracy * 100)}% right. A little more practice before feeling done will help.`
          : `On the solo checks you felt ${Math.round(c.meanConf * 100)}% sure but got ${Math.round(c.accuracy * 100)}% right. You know more than you think.`;
      box.append(h('div.note-card', { html: iconSvg('scale', 'ic') }, h('div', h('h4', 'How well you judged yourself'), md(text, 'small'))));
    }
    box.append(...badgeRows(out.badges || []));
    stage.replaceChildren(box);
    setBar({ main: primary(session.type === 'placement' ? 'Start learning' : 'Continue', done) });
    if (session.type !== 'placement' && (s.checks.right > 0 || session.type === 'lesson')) { play('done'); confetti(); }
    if (mainBtn) mainBtn.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- leaving

  async function tryClose() {
    if (closed) return;
    if (session.done) { close(); return; }
    const leave = await confirmSheet({
      title: session.type === 'placement' ? 'Stop the placement check?' : 'Leave this session?',
      text: session.type === 'lesson'
        ? 'Your answers so far are saved, but the lesson only counts once you reach the end. You can start it again any time.'
        : session.type === 'placement' ? 'Units you have already passed stay open. The unit you are on will not count.' : 'Checks you have answered are saved. The rest stay due.',
      yes: 'Leave',
      no: 'Keep going',
    });
    if (!leave) return;
    if (session.type === 'placement') { stopPlacement(ctx()); save(); }
    log('session_left', { session: session.id, kind: session.type, at: session.pos });
    close();
  }

  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    root.remove();
    if (appEl) appEl.inert = false;
    save();
    emitChange();
    if (onClose) onClose(session);
  }

  show();
  return { close };
}
