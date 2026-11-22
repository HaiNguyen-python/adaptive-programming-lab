/**
 * XP, levels, streaks and badges.
 *
 * Rewards are tuned to the behaviours the research links to durable learning: solving without help
 * earns more than solving with help, and passing a memory check a day or a week later earns the most.
 */
import { dayKey, daysLater } from './mastery.js';
import { calibration, allChecks } from './calibration.js';

export const XP = {
  firstTry: 10,
  retry: 6,
  helped: 4,
  walkthrough: 1,
  soloCheck: 12,
  memoryNextDay: 15,
  memoryWeek: 20,
  checkTried: 2,
  lessonDone: 20,
  lessonAgain: 8,
};

export const GOALS = [
  { xp: 20, label: 'Easy going', note: 'about 5 minutes a day' },
  { xp: 50, label: 'Steady', note: 'about 10 minutes a day' },
  { xp: 100, label: 'Serious', note: 'about 20 minutes a day' },
];

/** Level n starts at 60 * (n - 1) squared XP. */
export function levelInfo(xp) {
  const level = Math.floor(Math.sqrt(xp / 60)) + 1;
  const from = 60 * (level - 1) ** 2;
  const to = 60 * level ** 2;
  return { level, from, to, progress: (xp - from) / (to - from) };
}

export function addXp(state, amount, now) {
  if (!amount) return;
  state.xp += amount;
  const k = dayKey(now);
  state.days[k] = (state.days[k] || 0) + amount;
}

export const xpToday = (state, now) => state.days[dayKey(now)] || 0;

/** Days in a row with any XP. Today counts if done; otherwise the streak is still alive until midnight. */
export function streak(state, now) {
  const doneToday = !!state.days[dayKey(now)];
  let count = 0;
  let offset = doneToday ? 0 : -1;
  while (state.days[dayKey(daysLater(now, offset))]) { count++; offset--; }
  return { count, doneToday };
}

export const BADGES = [
  { id: 'first-spark', name: 'First spark', how: 'Finish your first lesson.', icon: 'spark' },
  { id: 'on-your-own', name: 'On your own', how: 'Answer 10 questions right on the first try, with no help.', icon: 'solo' },
  { id: 'bounce-back', name: 'Bounce back', how: 'Get 5 questions right after a miss, without asking for help.', icon: 'bounce' },
  { id: 'own-words', name: 'In your own words', how: 'Explain 5 hints in your own words.', icon: 'pencil' },
  { id: 'still-there', name: 'Still there', how: 'Pass a memory check the day after a lesson.', icon: 'flame' },
  { id: 'built-to-last', name: 'Built to last', how: 'Remember an idea one week later.', icon: 'lantern' },
  { id: 'keeper', name: 'Keeper of the flame', how: 'Remember 5 ideas one week later.', icon: 'campfire' },
  { id: 'good-judge', name: 'Good judge', how: 'Over 10 solo checks, your confidence matches your results.', icon: 'scale' },
  { id: 'streak-3', name: 'Three in a row', how: 'Learn 3 days in a row.', icon: 'streak' },
  { id: 'streak-7', name: 'A full week', how: 'Learn 7 days in a row.', icon: 'streak' },
  { id: 'streak-30', name: 'Thirty days', how: 'Learn 30 days in a row.', icon: 'streak' },
  { id: 'camp-reached', name: 'Camp reached', how: 'Finish every lesson in a unit.', icon: 'tent' },
  { id: 'trail-blazer', name: 'Trail blazer', how: 'Finish a whole course.', icon: 'trophy' },
  { id: 'two-trails', name: 'Two trails', how: 'Finish lessons in two different courses.', icon: 'paths' },
  { id: 'tinkerer', name: 'Tinkerer', how: 'Run your own code 10 times in the playground.', icon: 'wrench' },
];

/**
 * Award any badges that are now earned. catalog: the loaded courses (for unit and course badges).
 * Returns the newly earned badges.
 */
export function checkBadges(state, now, catalog = []) {
  const done = (id) => !!(state.lessons[id] && state.lessons[id].done);
  const concepts = Object.values(state.concepts);
  const c = state.counters;
  const lessonsDone = Object.keys(state.lessons).filter(done).length;
  const s = streak(state, now).count;
  const recent = allChecks(state).filter((x) => x.conf).slice(-10);
  const cal = calibration(recent);
  const coursesTouched = catalog.filter((course) => course.lessons.some((l) => done(l.id))).length;
  const earned = {
    'first-spark': lessonsDone >= 1,
    'on-your-own': c.firstTry >= 10,
    'bounce-back': c.comeback >= 5,
    'own-words': c.explains >= 5,
    'still-there': concepts.some((x) => x.best >= 2),
    'built-to-last': concepts.some((x) => x.best >= 3),
    keeper: concepts.filter((x) => x.best >= 3).length >= 5,
    'good-judge': recent.length >= 10 && cal.absError <= 0.25,
    'streak-3': s >= 3,
    'streak-7': s >= 7,
    'streak-30': s >= 30,
    'camp-reached': catalog.some((course) => course.units.some((u) => u.lessons.length && u.lessons.every((l) => done(l.id)))),
    'trail-blazer': catalog.some((course) => course.lessons.length && course.lessons.every((l) => done(l.id))),
    'two-trails': coursesTouched >= 2,
    tinkerer: c.runs >= 10,
  };
  const fresh = [];
  for (const b of BADGES) {
    if (earned[b.id] && !state.badges[b.id]) { state.badges[b.id] = now; fresh.push(b); }
  }
  return fresh;
}
