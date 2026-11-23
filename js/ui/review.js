/** The Memory screen: checks that are due, what is coming up, and free practice. */
import { h, md, plural, relDay } from '../lib/dom.js';
import { nova, lanternSvg, svgEl } from '../lib/art.js';
import { store } from '../store.js';
import { now, log } from '../app.js';
import * as catalog from '../catalog.js';
import { dueConcepts, daysBetween, flames } from '../engine/mastery.js';
import { startPractice } from '../engine/tutor.js';
import { flamesEl } from './common.js';
import { openPlayer } from './player.js';
import { launchReview, launchTest, testsOn } from './learn.js';
import { dueDelayedTests } from '../engine/unit-tests.js';

export function reviewPage(root) {
  const state = store.state;
  const t = now();
  const ids = catalog.allLessonIds();
  const due = dueConcepts(state, t, ids);
  const learned = ids.filter((id) => state.concepts[id] && state.concepts[id].stage >= 1);
  const upcoming = learned
    .filter((id) => !due.includes(id) && state.concepts[id].due !== null)
    .map((id) => ({ id, days: daysBetween(t, state.concepts[id].due) }))
    .sort((a, b) => a.days - b.days);
  const page = h('div.page', h('div.page-head', h('h1', 'Memory checks')));
  if (testsOn(state)) {
    for (const { course, unit } of dueDelayedTests(state, catalog.courses(), t)) {
      page.append(h('div.card.memory-card', { style: { marginBottom: '14px' } }, svgEl(lanternSvg(true)),
        h('div.grow', h('h3', `One-week unit test: ${unit.title}`), h('div.small.muted', `${course.title}. One question per lesson, no help. It shows what stayed with you.`)),
        h('button.btn.btn--primary', { type: 'button', onclick: () => launchTest(course, unit, 'delayed') }, 'Start')));
    }
  }

  if (due.length) {
    page.append(h('div.card.memory-card', svgEl(lanternSvg(true)),
      h('div.grow', h('h3', `${plural(due.length, 'idea')} ready to check`),
        h('div.small.muted', due.length > 8 ? 'Nova checks up to 8 at a time. Each one is a single question, without help.' : 'One question each, without help. It takes a few minutes.')),
      h('button.btn.btn--primary', { type: 'button', onclick: launchReview }, 'Start')));
  } else if (!learned.length) {
    page.append(h('div.card.empty', nova('happy', state.profile.color), h('h3', 'Nothing to check yet'),
      h('p', 'Finish a lesson, and Nova will check it here the next day and one week later.'),
      h('a.btn.btn--primary', { href: '#/learn' }, 'Go to the lessons')));
  } else {
    const first = upcoming[0];
    page.append(h('div.card.empty', nova('proud', state.profile.color), h('h3', 'All caught up'),
      h('p', first ? `Your next memory check is ${relDay(first.days)}.` : 'Every idea you have learned is fresh.')));
  }

  if (upcoming.length) {
    const groups = new Map();
    for (const u of upcoming) { if (!groups.has(u.days)) groups.set(u.days, []); groups.get(u.days).push(u.id); }
    const rows = [...groups.entries()].slice(0, 8).map(([days, list]) => h('div.skill',
      h('b', relDay(days).replace(/^./, (c) => c.toUpperCase())), h('span.small.muted', plural(list.length, 'idea')),
      h('div.small.muted', { style: { gridColumn: '1 / -1' } }, list.map((id) => catalog.findLesson(id).title).join(', '))));
    page.append(h('div.section-title', h('h2', 'Coming up')), h('div.card', rows));
  }

  if (learned.length) {
    page.append(h('div.card.row', h('div.grow', h('h3', 'Practise your weakest ideas'), h('div.small.muted', 'Extra questions on the ideas that have faded most. This does not change when your memory checks are due.')),
      h('button.btn.btn--ghost', { type: 'button', onclick: () => {
        const session = startPractice({ state, lessonIds: ids, now: now(), log });
        openPlayer({ session, course: null });
      } }, 'Practise')));
  }

  page.append(h('div.section-title', h('h2', 'What the flames mean')),
    h('div.card.stack',
      [[1, 'Learned', 'You finished the lesson.'], [2, 'Next day', 'You still had it the day after, without help.'], [3, 'One week', 'You still had it a week later. This is what lasting learning looks like.']]
        .map(([n, title, text]) => h('div.row', flamesEl(n, true), h('div', h('b', title), h('div.small.muted', text)))),
      md('Getting something right with help feels good, but it does not show what you can do alone. That is why only unaided checks, spread over time, light the flames.', 'small.muted')));
  root.append(page);
}
