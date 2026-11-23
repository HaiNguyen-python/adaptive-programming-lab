/** The Learn screen: the next lesson with its code, memory checks that are due, Quick fire and the course map. */
import { h, md, plural, relDay, formatDate } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { nova, novaSvg, lanternSvg, svgEl } from '../lib/art.js';
import { store, save } from '../store.js';
import { now, log, emitChange } from '../app.js';
import * as catalog from '../catalog.js';
import { APP } from '../config.js';
import { startLesson, startReview, startPlacement, lessonStatus, nextLesson, courseProgress, isDone } from '../engine/tutor.js';
import { dueConcepts, flames, isDue, daysBetween, strength } from '../engine/mastery.js';
import { levelInfo, streak, xpToday } from '../engine/rewards.js';
import { openSheet, flamesEl, bar, codeBlock, resultTable, previewFrame } from './common.js';
import { openQuickFire, quickFirePool } from './quickfire.js';
import { openPlayer } from './player.js';
import { testStatus, startUnitTest, skipPreTest, dueDelayedTests } from '../engine/unit-tests.js';

export function currentCourse() {
  const state = store.state;
  return catalog.getCourse(state.course) || catalog.courses()[0] || null;
}

/** Unit tests are offered when the learner turned them on, and always in a study. */
export const testsOn = (state) => !!(state.study || state.settings.unitTests);

export function launchTest(course, unit, kind, after) {
  const session = startUnitTest({ state: store.state, course, unit, kind, now: now(), log });
  save();
  openPlayer({ session, course, onClose: (s) => { if (after && s.done) after(); } });
}

function startNow(course, lesson) {
  const session = startLesson({ state: store.state, course, lesson, now: now(), log });
  save();
  openPlayer({ session, course });
}

/** Start a lesson. Before the first lesson of a unit, offer the starting check (the unit's pre-test). */
export function launchLesson(course, lesson) {
  const state = store.state;
  const unit = course.units.find((u) => u.id === lesson.unitId);
  if (!unit || !testsOn(state) || testStatus(state, unit, now()).next !== 'pre') { startNow(course, lesson); return; }
  const n = unit.lessons.filter((l) => l.pool.length).length;
  const foot = [h('button.btn.btn--primary', { type: 'button', onclick: () => { sheet.close(); launchTest(course, unit, 'pre', () => startNow(course, lesson)); } }, 'Take the check')];
  if (!state.study) {
    foot.unshift(h('button.btn.btn--ghost', { type: 'button', onclick: () => {
      skipPreTest(state, unit, now());
      log('test_skipped', { test: 'pre', unit: unit.id, course: course.id });
      save(); sheet.close(); startNow(course, lesson);
    } }, 'Skip'));
  }
  const sheet = openSheet({
    title: 'First, a quick starting check',
    body: h('div.stack', h('div.help-kind', nova('think', state.profile.color), h('div', h('h3', unit.title), h('div.small.muted', `${plural(n, 'question')}, one try each, no help`))),
      md('Answer what you can, and it is fine to guess or get things wrong: you have not learned this yet. After the unit you take a similar test, so you can see how much you learned. You see your score at the end.')),
    foot,
  });
}

export function launchReview() {
  const session = startReview({ state: store.state, lessonIds: catalog.allLessonIds(), now: now(), log });
  openPlayer({ session, course: null });
}

export function launchPlacement(course) {
  const session = startPlacement({ course, now: now(), log });
  openPlayer({ session, course });
}

export function dueCount() {
  return dueConcepts(store.state, now(), catalog.allLessonIds()).length;
}

// ---------------------------------------------------------------- sheets

function lessonSheet(course, lesson) {
  const state = store.state;
  const status = lessonStatus(state, course, lesson);
  const unit = course.units.find((u) => u.id === lesson.unitId);
  const concept = state.concepts[lesson.id];
  const minutes = Math.max(3, Math.round(lesson.steps.length * 0.55));
  const body = h('div.stack-l',
    h('div.row-wrap', h('span.tag', unit.title), h('span.tag', { html: iconSvg('clock') }, `About ${minutes} minutes`), status === 'done' ? flamesEl(flames(concept), true) : null),
    h('div.stack', h('h4', 'You will learn to'), h('ul.goal-list', lesson.goals.map((g) => h('li', md(g))))));
  if (status === 'done' && concept) {
    const due = isDue(concept, now());
    const days = concept.due ? daysBetween(now(), concept.due) : null;
    body.append(h('div.card.stack',
      h('div.row', h('span.grow', { style: { fontWeight: '600' } }, 'How well it has stuck'), h('span.small.muted', `${Math.round(strength(concept, now()) * 100)}%`)),
      bar(strength(concept, now())),
      md(due ? 'A memory check for this lesson is **ready now**.' : days !== null ? `Next memory check: **${relDay(days)}**.` : '', 'small.muted'),
      state.lessons[lesson.id].testedOut ? md('You skipped this lesson in the placement check. You can still do it any time.', 'small.muted') : null));
  }
  if (status === 'locked') {
    const prev = course.lessons[lesson.index - 1];
    body.append(h('div.callout', md(`Finish **${prev.title}** to open this lesson.`)));
  }
  const sheet = openSheet({
    title: lesson.title,
    body,
    foot: status === 'locked'
      ? [h('button.btn.btn--primary', { type: 'button', onclick: () => sheet.close() }, 'OK')]
      : [h('button.btn.btn--primary', { type: 'button', onclick: () => { sheet.close(); launchLesson(course, lesson); } }, status === 'done' ? 'Practise again' : 'Start lesson')],
  });
}

export function courseIntro(course) {
  const body = h('div.stack-l', { 'data-accent': course.accent },
    h('div.row', h('span.glyph.glyph--lg', course.glyph), h('div', h('b', course.title), h('div.small.muted', `${course.units.length} units, ${plural(course.lessons.length, 'lesson')}`))),
    md(course.about || course.tagline),
    h('ol.unit-list', course.units.map((u, i) => h('li', h('span.n', String(i + 1)), h('div', h('b', u.title), h('div.small.muted', u.blurb))))));
  const sheet = openSheet({
    title: `Welcome to ${course.title}`,
    body,
    foot: [
      h('button.btn.btn--ghost', { type: 'button', onclick: () => { sheet.close(); launchPlacement(course); } }, 'I know some already'),
      h('button.btn.btn--primary', { type: 'button', onclick: () => sheet.close() }, 'Start at the beginning'),
    ],
  });
}

export function coursePicker() {
  const state = store.state;
  const sheet = openSheet({
    title: 'Choose a course',
    body: h('div.stack', catalog.courses().map((c) => {
      const p = courseProgress(state, c);
      return h(`button.course-row${c.id === state.course ? '.is-on' : ''}`, { type: 'button', 'data-accent': c.accent, onclick: () => {
        const first = p.done === 0 && !state.placement[c.id];
        state.course = c.id;
        save();
        sheet.close();
        emitChange();
        if (first) courseIntro(c);
      } }, h('span.glyph.glyph--lg', c.glyph), h('div.grow', h('b', c.title), h('span', c.tagline), h('div', { style: { marginTop: '8px' } }, bar(p.ratio, 'bar--thin'))), h('span.small.muted', `${p.done}/${p.total}`));
    })),
  });
}

export function certificate(course) {
  const state = store.state;
  const last = Math.max(...course.lessons.map((l) => (state.lessons[l.id] ? state.lessons[l.id].done : 0)));
  const sheet = openSheet({
    title: 'Your certificate',
    body: h('div.cert',
      svgEl(novaSvg('cheer', state.profile.color)),
      h('div.small', APP.name),
      h('h2', 'Certificate of completion'),
      h('p', 'This certifies that'),
      h('div.name', state.profile.name),
      h('p', `has completed all ${course.lessons.length} lessons of`),
      h('h2', `${course.title} foundations`),
      h('p.small', formatDate(last))),
    foot: [
      h('button.btn.btn--ghost', { type: 'button', onclick: () => sheet.close() }, 'Close'),
      h('button.btn.btn--primary', { type: 'button', onclick: () => window.print(), html: iconSvg('printer') }, 'Print'),
    ],
  });
}

// ---------------------------------------------------------------- course map

/** Three short bars: learned, kept the next day, kept for a week. */
function keptEl(n) {
  return h('span.kept', { role: 'img', 'aria-label': n >= 3 ? 'Kept for a week' : n === 2 ? 'Kept the next day' : 'Learned' },
    [0, 1, 2].map((i) => h(`i${i < n ? '.is-on' : ''}`)));
}

function unitBlock(course, unit, unitIndex, openId) {
  const state = store.state;
  const n = unit.lessons.length;
  const doneCount = unit.lessons.filter((l) => isDone(state, l.id)).length;
  let testBtn = null;
  if (testsOn(state)) {
    const ts = testStatus(state, unit, now());
    if (ts.next === 'post') testBtn = h('button.btn.btn--accent.btn--sm', { type: 'button', html: iconSvg('award'), onclick: () => launchTest(course, unit, 'post') }, 'Take the unit test');
    else if (ts.next === 'delayed' && ts.due) testBtn = h('button.btn.btn--accent.btn--sm', { type: 'button', html: iconSvg('award'), onclick: () => launchTest(course, unit, 'delayed') }, 'Take the one-week test');
    else if (ts.next === 'delayed') testBtn = h('span.tag', { title: 'The unit test comes back one week after you took it' }, `One-week test ${relDay(daysBetween(now(), ts.dueAt))}`);
  }
  const state2 = doneCount === n ? 'is-done' : doneCount > 0 || unit.lessons.some((l) => l.id === openId) ? 'is-active' : 'is-later';
  const rows = unit.lessons.map((lesson, i) => {
    const status = lessonStatus(state, course, lesson);
    const concept = state.concepts[lesson.id];
    const due = status === 'done' && isDue(concept, now());
    const here = lesson.id === openId;
    const label = status === 'locked' ? `${lesson.title}. Locked.` : status === 'done' ? `${lesson.title}. Done.${due ? ' Memory check ready.' : ''}` : `${lesson.title}. Start.`;
    return h(`li.lrow.lrow--${status}${here ? '.is-here' : ''}`,
      h('button.lrow-btn', { type: 'button', 'aria-label': label, onclick: () => lessonSheet(course, lesson) },
        h('span.lrow-dot', { 'aria-hidden': 'true', html: status === 'done' ? iconSvg('check') : status === 'locked' ? '' : '' }),
        h('span.lrow-num', { 'aria-hidden': 'true' }, `${unitIndex + 1}.${i + 1}`),
        h('span.lrow-title', lesson.title),
        h('span.lrow-meta',
          status === 'done' ? (due ? h('span.lrow-due', 'Check ready') : keptEl(flames(concept))) : null,
          status === 'open' ? h('span.lrow-go', here ? 'Up next' : 'Start') : null,
          status === 'locked' ? h('span.lrow-lock', { html: iconSvg('lock') }) : null)));
  });
  return h(`section.unit.${state2}`, { 'aria-label': `Unit ${unitIndex + 1}: ${unit.title}` },
    h('header.unit-head',
      h('span.unit-n', { 'aria-hidden': 'true' }, String(unitIndex + 1).padStart(2, '0')),
      h('div.unit-text',
        h('h2', unit.title),
        h('p', unit.blurb)),
      h('div.unit-side',
        h('span.unit-count', `${doneCount} of ${n}`),
        h('span.unit-bar', { 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round((doneCount / n) * 100)}%` } })))),
    testBtn ? h('div.unit-test', testBtn) : null,
    h('ol.lrows', rows));
}

let typedOnce = false;

/** The lesson's first worked code, set large: the one bold element on the Learn screen. */
function codeShowcase(course, lesson) {
  const step = lesson.steps.find((s) => s.kind === 'teach' && s.code) || lesson.steps.find((s) => s.code);
  if (!step) return null;
  const lang = course.lang;
  const file = { python: 'lesson.py', javascript: 'lesson.js', sql: 'query.sql', web: 'page.html' }[lang] || 'lesson';
  const block = codeBlock(step.code, lang === 'web' ? 'web' : lang, lang === 'python' || lang === 'javascript' ? { output: step.error ? `${step.output ? `${step.output}\n` : ''}${step.error}` : step.output, error: !!step.error } : {});
  const extra = lang === 'sql' && step.result ? resultTable(step.result) : lang === 'web' && step.preview ? previewFrame(step.code, 120) : null;
  const panel = h('figure.showcase', { 'aria-label': `Code from ${lesson.title}` },
    h('figcaption.showcase-bar', h('span.showcase-dots', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')), h('span', file)),
    block, extra);
  const reduce = document.documentElement.dataset.motion === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!typedOnce && !reduce) {
    typedOnce = true;
    const codeEl = block.querySelector('pre.code code');
    const out = block.querySelector('pre.out');
    const html = codeEl.innerHTML;
    const text = step.code;
    codeEl.textContent = '';
    if (out) out.style.visibility = 'hidden';
    const per = Math.max(8, Math.min(28, 900 / text.length));
    let i = 0;
    const tick = () => {
      if (!codeEl.isConnected) return;
      i = Math.min(text.length, i + 2);
      codeEl.textContent = text.slice(0, i);
      codeEl.classList.add('is-typing');
      if (i < text.length) setTimeout(tick, per);
      else { codeEl.innerHTML = html; codeEl.classList.remove('is-typing'); if (out) { out.style.visibility = ''; out.classList.add('is-arrived'); } }
    };
    setTimeout(tick, 250);
  }
  return panel;
}

function nextPanel(course) {
  const state = store.state;
  const goal = state.settings.dailyGoal;
  const today = xpToday(state, now());
  const st = streak(state, now());
  const next = nextLesson(state, course);
  let line;
  if (today >= goal) line = 'Daily goal reached. Anything more is a bonus.';
  else if (today > 0) line = `${goal - today} XP to go for today's goal.`;
  else line = st.count ? `One lesson today keeps your ${st.count}-day streak.` : 'One short lesson starts a streak.';
  const goalMeter = h('div.goal', { title: `${today} of ${goal} XP today` },
    h('div.goal-text', h('b', `${Math.min(today, goal)}/${goal} XP`), h('span', line)),
    h('div.goal-bar', { role: 'img', 'aria-label': `${today} of ${goal} XP today` }, h('i', { style: { width: `${Math.min(100, Math.round((today / goal) * 100))}%` } })));
  if (!next) {
    return h('section.next.next--done',
      h('div.next-text', h('p.next-where', `${course.title}, all lessons done`), h('h1.next-title', 'You finished the course'),
        h('p.next-line', 'Memory checks keep it fresh. Quick fire keeps it fast.'),
        h('div.next-actions', h('button.btn.btn--primary.btn--lg', { type: 'button', onclick: () => certificate(course), html: iconSvg('award') }, 'See your certificate')),
        goalMeter));
  }
  const unit = course.units.find((u) => u.id === next.unitId);
  const ui = course.units.indexOf(unit);
  const li = unit.lessons.indexOf(next);
  const started = today || state.xp;
  return h('section.next', { 'aria-label': 'Your next lesson' },
    h('div.next-text',
      h('p.next-where', `Unit ${ui + 1}, lesson ${li + 1} of ${unit.lessons.length}`),
      h('h1.next-title', next.title),
      h('ul.next-goals', next.goals.slice(0, 3).map((g) => h('li', md(g)))),
      h('div.next-actions',
        h('button.btn.btn--primary.btn--lg', { type: 'button', onclick: () => launchLesson(course, next) }, started ? 'Continue' : 'Start the first lesson'),
        h('span.next-time', `About ${Math.max(3, Math.round(next.steps.length * 0.55))} min`)),
      goalMeter),
    codeShowcase(course, next));
}

function noticeRow({ icon, title, text, action, onclick, tone = 'memory' }) {
  return h(`div.notice.notice--${tone}`, icon,
    h('div.grow', h('h3', title), h('p', text)),
    h('button.btn.btn--sm', { type: 'button', onclick }, action));
}

function quickFireRow(course) {
  const state = store.state;
  if (state.study) return null;
  const pool = quickFirePool(state, course);
  const best = (state.quickfire && state.quickfire[course.id]) || 0;
  if (pool.length < 4) {
    return h('div.notice.notice--fire.is-locked', h('span.notice-ic', { html: iconSvg('bolt') }),
      h('div.grow', h('h3', 'Quick fire'), h('p', 'Finish two lessons to unlock a 60-second round of "what does this print?"')));
  }
  return noticeRow({
    icon: h('span.notice-ic', { html: iconSvg('bolt') }),
    title: 'Quick fire',
    text: best ? `60 seconds of "what does this print?" from your lessons. Your best: ${best}.` : '60 seconds of "what does this print?" from your lessons. Answer fast, build a combo.',
    action: 'Play',
    tone: 'fire',
    onclick: () => openQuickFire(course),
  });
}

function sideCards(course) {
  const state = store.state;
  const lv = levelInfo(state.xp);
  const p = courseProgress(state, course);
  const lasting = Object.values(state.concepts).filter((c) => c.best >= 3).length;
  return [
    h('div.side-card',
      h('div.side-row', h('span', 'Level'), h('b', String(lv.level))), bar(lv.progress), h('p', `${lv.to - state.xp} XP to level ${lv.level + 1}`)),
    h('div.side-card',
      h('div.side-row', h('span', course.title), h('b', `${p.done}/${p.total}`)), bar(p.ratio),
      h('p', lasting ? `${plural(lasting, 'idea')} kept for a week.` : 'The three bars on a lesson fill as you keep it: learned, next day, one week.')),
  ];
}

export function learnPage(root) {
  const state = store.state;
  const course = currentCourse();
  if (!course) {
    root.append(h('div.page', h('div.empty', nova('oops'), h('h2', 'No courses could be loaded'), h('p', 'Reload the page to try again.'))));
    return;
  }
  if (state.course !== course.id) { state.course = course.id; save(); }
  const st = streak(state, now());
  const due = dueCount();
  const next = nextLesson(state, course);
  const page = h('div.page.page--wide', { 'data-accent': course.accent });
  const notices = [];
  if (due) notices.push(noticeRow({ icon: svgEl(lanternSvg(true)), title: `${plural(due, 'idea')} ready for a memory check`, text: 'One question each, without help. It keeps what you learned.', action: 'Check now', onclick: launchReview }));
  if (testsOn(state)) {
    for (const { course: c, unit } of dueDelayedTests(state, catalog.courses(), now())) {
      notices.push(noticeRow({ icon: svgEl(lanternSvg(true)), title: `One-week test: ${unit.title}`, text: 'A week has passed since your unit test. What stayed with you?', action: 'Start', onclick: () => launchTest(c, unit, 'delayed') }));
    }
  }
  const qf = quickFireRow(course);
  if (qf) notices.push(qf);
  const main = h('div.learn-main',
    h('div.topbar',
      h('button.course-btn', { type: 'button', 'aria-label': `Course: ${course.title}. Change course.`, onclick: coursePicker, html: `<span class="glyph">${course.glyph}</span><span>${course.title}</span>${iconSvg('down')}` }),
      h('span.grow'),
      h(`span.pill.pill--streak${st.doneToday ? '' : '.is-dim'}`, { title: st.doneToday ? 'Streak: days in a row' : 'Learn today to keep your streak', html: iconSvg('flame') }, h('span', String(st.count)), h('span.sr', ' day streak')),
      h('span.pill.pill--xp', { title: `Level ${levelInfo(state.xp).level}`, html: iconSvg('bolt') }, h('span', String(state.xp)), h('span.sr', ' XP'))),
    nextPanel(course),
    notices.length ? h('div.notices', notices) : null,
    h('div.map-head', h('h2', 'Course map'), h('span', `${course.units.length} units, ${plural(course.lessons.length, 'lesson')}`)),
    h('div.map', course.units.map((u, i) => unitBlock(course, u, i, next ? next.id : null))));
  page.append(h('div.learn-grid', main, h('aside.side.only-wide', { 'aria-label': 'Your progress' }, sideCards(course),
    h('div.side-card.side-how', h('h3', 'How Nova teaches'),
      h('ol',
        h('li', h('b', 'Try first. '), 'Help opens after your first attempt: a hint or a similar example, never the answer.'),
        h('li', h('b', 'Prove it alone. '), 'After help, one question on your own.'),
        h('li', h('b', 'Keep it. '), 'Nova checks again the next day and one week later.'))))));
  root.append(page);
  return { scrollTo: null };
}
