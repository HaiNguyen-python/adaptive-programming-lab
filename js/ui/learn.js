/** The Learn screen: today's goal, memory checks that are due, and the trail of lessons. */
import { h, md, plural, relDay, formatDate } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { nova, novaSvg, treeSvg, campSvg, lanternSvg, svgEl } from '../lib/art.js';
import { store, save } from '../store.js';
import { now, log, emitChange } from '../app.js';
import * as catalog from '../catalog.js';
import { APP } from '../config.js';
import { startLesson, startReview, startPlacement, lessonStatus, nextLesson, courseProgress, isDone } from '../engine/tutor.js';
import { dueConcepts, flames, isDue, daysBetween, strength } from '../engine/mastery.js';
import { levelInfo, streak, xpToday } from '../engine/rewards.js';
import { openSheet, flamesEl, ringEl, bar } from './common.js';
import { openPlayer } from './player.js';
import { testStatus, startUnitTest, skipPreTest, dueDelayedTests } from '../engine/unit-tests.js';

const ROW = 132;
const TOP = 54;

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

// ---------------------------------------------------------------- trail

function campBlock(course, unit, unitIndex, firstIndex, width, openId) {
  const state = store.state;
  const amp = Math.max(40, Math.min(130, width * 0.24));
  const cx = width / 2;
  const n = unit.lessons.length;
  const height = TOP + (n - 1) * ROW + 118;
  const pts = unit.lessons.map((l, i) => {
    const k = Math.sin(((firstIndex + i) * Math.PI) / 2);
    return { x: cx + k * amp, y: TOP + i * ROW, k, lesson: l, status: lessonStatus(state, course, l) };
  });
  const seg = (a, b) => `M${a.x.toFixed(1)} ${a.y}C${a.x.toFixed(1)} ${a.y + ROW / 2} ${b.x.toFixed(1)} ${b.y - ROW / 2} ${b.x.toFixed(1)} ${b.y}`;
  let base = '';
  let lit = '';
  for (let i = 0; i < pts.length - 1; i++) {
    base += seg(pts[i], pts[i + 1]);
    if (pts[i].status === 'done' && pts[i + 1].status !== 'locked') lit += seg(pts[i], pts[i + 1]);
  }
  const svg = `<svg class="path" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">`
    + `<path d="${base}" fill="none" stroke="var(--path)" stroke-width="9" stroke-linecap="round" stroke-dasharray="1 20"/>`
    + (lit ? `<path d="${lit}" fill="none" stroke="var(--ember)" stroke-width="9" stroke-linecap="round" stroke-dasharray="1 20" opacity=".85"/>` : '')
    + '</svg>';
  const trees = h('div.trees');
  if (width >= 380) {
    pts.forEach((p, i) => {
      const g = firstIndex + i;
      const side = p.k > 0.1 ? -1 : p.k < -0.1 ? 1 : (g % 2 ? 1 : -1);
      const size = 46 + ((g * 37) % 30);
      const x = cx + side * (amp + 96 + ((g * 53) % 46));
      if (x < 6 || x > width - size * 0.67 - 6) return;
      const t = svgEl(treeSvg(size, (g % 2) + 1));
      t.style.left = `${Math.round(x)}px`;
      t.style.top = `${p.y - 10 + ((g * 29) % 40)}px`;
      trees.append(t);
    });
  }
  const nodes = pts.map((p) => {
    const { lesson, status } = p;
    const concept = state.concepts[lesson.id];
    const due = status === 'done' && isDue(concept, now());
    const here = lesson.id === openId;
    const label = status === 'locked' ? `${lesson.title}. Locked.` : status === 'done' ? `${lesson.title}. Done.${due ? ' Memory check ready.' : ''}` : `${lesson.title}. Start.`;
    return h(`div.node.node--${status}${due ? '.is-due' : ''}${p.k > 0.1 ? '.is-left' : ''}`, { style: { left: `${p.x.toFixed(1)}px`, top: `${p.y - 39}px` } },
      h('button.node-btn', { type: 'button', 'aria-label': label, onclick: () => lessonSheet(course, lesson), html: iconSvg(status === 'done' ? 'flame' : status === 'open' ? 'play' : 'lock') }),
      here ? svgEl(novaSvg('happy', state.profile.color, 'nova-here')) : null,
      h('div.node-label', lesson.title),
      status === 'done' ? flamesEl(flames(concept)) : null);
  });
  const doneCount = unit.lessons.filter((l) => isDone(state, l.id)).length;
  let testBtn = null;
  if (testsOn(state)) {
    const ts = testStatus(state, unit, now());
    if (ts.next === 'post') testBtn = h('button.btn.btn--primary.btn--sm', { type: 'button', html: iconSvg('award'), onclick: () => launchTest(course, unit, 'post') }, 'Unit test');
    else if (ts.next === 'delayed' && ts.due) testBtn = h('button.btn.btn--primary.btn--sm', { type: 'button', html: iconSvg('award'), onclick: () => launchTest(course, unit, 'delayed') }, 'One-week test');
    else if (ts.next === 'delayed') testBtn = h('span.tag', { title: 'The unit test comes back one week after you took it' }, `One-week test ${relDay(daysBetween(now(), ts.dueAt))}`);
  }
  return h('section.camp', { 'aria-label': `Unit ${unitIndex + 1}: ${unit.title}` },
    h('div.camp-head', svgEl(campSvg(doneCount > 0)),
      h('div.grow', h('div.camp-num', `Unit ${unitIndex + 1}`), h('h2', unit.title), h('div.small.muted', unit.blurb), testBtn ? h('div', { style: { marginTop: '8px' } }, testBtn) : null),
      h('div.camp-count', `${doneCount}/${n}`)),
    h('div.camp-path', { style: { '--h': `${height}px` }, html: svg }, trees, nodes));
}

function todayCard(course) {
  const state = store.state;
  const goal = state.settings.dailyGoal;
  const today = xpToday(state, now());
  const st = streak(state, now());
  const next = nextLesson(state, course);
  const lines = [];
  if (today >= goal) lines.push('Daily goal reached. Anything more is a bonus.');
  else if (today > 0) lines.push(`${goal - today} XP to go for today's goal.`);
  else lines.push(st.count ? `Do one lesson today to keep your ${st.count}-day streak.` : 'One short lesson is enough to start a streak.');
  const action = next
    ? h('button.btn.btn--primary', { type: 'button', onclick: () => launchLesson(course, next) }, today || state.xp ? 'Continue' : 'Start learning')
    : h('button.btn.btn--primary', { type: 'button', onclick: () => certificate(course), html: iconSvg('award') }, 'See your certificate');
  return h('div.card.today',
    ringEl(today, goal, String(today), `of ${goal} XP`),
    h('div.stack', h('div', h('h3', next ? next.title : `${course.title} complete!`), h('div.small.muted', lines[0])), h('div', action)));
}

function memoryCard(due) {
  return h('div.card.memory-card', svgEl(lanternSvg(true)),
    h('div.grow', h('h3', `${plural(due, 'idea')} ready for a memory check`), h('div.small.muted', 'A quick check, without help, keeps what you learned alive.')),
    h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: launchReview }, 'Start'));
}

function statCards(course) {
  const state = store.state;
  const lv = levelInfo(state.xp);
  const p = courseProgress(state, course);
  const lasting = Object.values(state.concepts).filter((c) => c.best >= 3).length;
  return [
    h('div.card.stack', h('div.row', h('h3.grow', `Level ${lv.level}`), h('span.small.muted', `${state.xp} XP`)), bar(lv.progress), h('div.small.muted', `${lv.to - state.xp} XP to level ${lv.level + 1}`)),
    h('div.card.stack', h('div.row', h('h3.grow', course.title), h('span.small.muted', `${p.done} of ${p.total} lessons`)), bar(p.ratio),
      h('div.small.muted', lasting ? `${plural(lasting, 'idea')} remembered after a week.` : 'Flames show how well each lesson has stuck: learned, next day, one week.')),
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
  const lv = levelInfo(state.xp);
  const due = dueCount();
  const next = nextLesson(state, course);
  const page = h('div.page.page--wide', { 'data-accent': course.accent });
  const trail = h('div.trail');
  const main = h('div.stack-l',
    h('div.topbar',
      h('button.course-btn', { type: 'button', 'aria-label': `Course: ${course.title}. Change course.`, onclick: coursePicker, html: `<span class="glyph">${course.glyph}</span><span>${course.title}</span>${iconSvg('down')}` }),
      h('span.grow'),
      h(`span.pill.pill--streak${st.doneToday ? '' : '.is-dim'}`, { title: st.doneToday ? 'Streak: days in a row' : 'Learn today to keep your streak', html: iconSvg('flame') }, h('span', String(st.count)), h('span.sr', ' day streak')),
      h('span.pill.pill--xp', { title: `Level ${lv.level}`, html: iconSvg('bolt') }, h('span', String(state.xp)), h('span.sr', ' XP'))),
    todayCard(course),
    due ? memoryCard(due) : null,
    ...(testsOn(state) ? dueDelayedTests(state, catalog.courses(), now()).map(({ course: c, unit }) => h('div.card.memory-card', svgEl(lanternSvg(true)),
      h('div.grow', h('h3', `One-week test: ${unit.title}`), h('div.small.muted', 'A week has passed since your unit test. What stayed with you?')),
      h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: () => launchTest(c, unit, 'delayed') }, 'Start'))) : []),
    h('div.only-narrow.stack', statCards(course)),
    trail);
  page.append(h('div.learn-grid', main, h('aside.aside-cards.only-wide', { 'aria-label': 'Your progress' }, statCards(course),
    h('div.card.stack', h('h3', 'How this works'),
      md('**Try first.** Nova helps after your first attempt, with a hint or a similar example, never the answer.\n\n**Prove it alone.** After help, you get one question on your own.\n\n**Make it stick.** Nova checks again the next day and one week later.', 'small.muted')))));
  root.append(page);

  function drawTrail() {
    const width = Math.max(280, Math.floor(trail.clientWidth || 560));
    let first = 0;
    trail.replaceChildren(...course.units.map((u, i) => {
      const block = campBlock(course, u, i, first, width, next ? next.id : null);
      first += u.lessons.length;
      return block;
    }));
  }
  drawTrail();
  let lastWidth = trail.clientWidth;
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (!trail.isConnected) { ro.disconnect(); return; }
      if (Math.abs(trail.clientWidth - lastWidth) > 4) { lastWidth = trail.clientWidth; drawTrail(); }
    });
    ro.observe(trail);
  }
  return { scrollTo: next ? `[aria-label^="${CSS.escape(next.title)}"]` : null };
}
