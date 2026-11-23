/**
 * Unit tests: the pre-test, post-test and delayed post-test of the research design (Paper III: "Pre-, post-
 * and delayed post-tests describe overall learning").
 *
 *   pre      before the first lesson of a unit: what the learner already knows
 *   post     after the last lesson of the unit
 *   delayed  one week after the post-test, unaided
 *
 * Each test has one question per lesson of the unit, taken from the lesson's pool of check items. The three
 * tests use three different items per lesson, and which item goes to which test is rotated by a hash of the
 * learner code and the lesson (counterbalancing), so test differences are not tied to one item's
 * difficulty. Test questions are unaided, rated for confidence first, and give no feedback on correctness
 * until the end, so the test itself teaches as little as possible.
 */
import { daysLater, getConcept } from './mastery.js';

export const TEST_KINDS = ['pre', 'post', 'delayed'];
export const TEST_ROLE = { pre: 'test-pre', post: 'test-post', delayed: 'test-delayed' };
export const DELAY_DAYS = 7;
export const isTestRole = (role) => typeof role === 'string' && role.startsWith('test-');

/** Small stable hash of a string (FNV-1a). */
export function hashString(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

/** The pool item a learner gets for a lesson in a given test. */
export function testItem(learnerCode, lesson, kind) {
  const pool = lesson.pool || [];
  if (!pool.length) return null;
  const offset = hashString(`${learnerCode}|${lesson.id}`) % pool.length;
  return pool[(offset + TEST_KINDS.indexOf(kind)) % pool.length];
}

const record = (state, unitId) => (state.tests && state.tests[unitId]) || {};

/**
 * Where a learner is with the tests of a unit.
 * next: 'pre' | 'post' | 'delayed' | null; due: true when that test can be taken now.
 * Pre-tests are only offered while no lesson of the unit is done (otherwise it would not be a pre-test).
 */
export function testStatus(state, unit, now) {
  const r = record(state, unit.id);
  const done = unit.lessons.filter((l) => state.lessons[l.id] && state.lessons[l.id].done && !state.lessons[l.id].testedOut).length;
  const all = unit.lessons.length > 0 && unit.lessons.every((l) => state.lessons[l.id] && state.lessons[l.id].done);
  if (!r.pre && !r.preSkipped && done === 0 && !all) return { next: 'pre', due: true, record: r };
  if (all && !r.post) return { next: 'post', due: true, record: r };
  if (r.post && !r.delayed) {
    const dueAt = daysLater(r.post.t, DELAY_DAYS);
    return { next: 'delayed', due: now >= dueAt, dueAt, record: r };
  }
  return { next: null, due: false, record: r };
}

/** Every unit (across the given courses) whose delayed post-test is due now. */
export function dueDelayedTests(state, courses, now) {
  const out = [];
  for (const course of courses) {
    for (const unit of course.units) {
      const s = testStatus(state, unit, now);
      if (s.next === 'delayed' && s.due) out.push({ course, unit });
    }
  }
  return out;
}

/** A test session for one unit (same shape as the tutor's sessions; see js/engine/tutor.js). */
export function startUnitTest({ state, course, unit, kind, now, log }) {
  const s = {
    id: `t${Math.floor(now).toString(36)}${Math.random().toString(36).slice(2, 6)}`, type: 'test', testKind: kind,
    courseId: course.id, unitId: unit.id, startedAt: now, endedAt: null, queue: [], pos: 0,
    xp: 0, results: [], inserted: 0, skipped: 0, clean: 0, notes: [], done: false, outcome: null,
  };
  for (const lesson of unit.lessons) {
    const item = testItem(state.profile.code, lesson, kind);
    if (!item) continue;
    const concept = getConcept(state, lesson.id);
    concept.seen[item.id] = now;
    s.queue.push({ type: 'item', item, lessonId: lesson.id, role: TEST_ROLE[kind], solo: true });
  }
  s.queue.push({ type: 'summary' });
  if (log) log('session_start', { session: s.id, kind: 'test', test: kind, unit: unit.id, course: course.id, items: s.queue.length - 1 });
  return s;
}

/** Save a finished test on the state. Called by the tutor when a test session ends. */
export function saveTestResult(state, session, now) {
  if (!state.tests) state.tests = {};
  const r = state.tests[session.unitId] || (state.tests[session.unitId] = {});
  const rs = session.results;
  r[session.testKind] = {
    t: now,
    right: rs.filter((x) => x.firstTry).length,
    total: rs.length,
    items: rs.map((x) => ({ lessonId: x.lessonId, itemId: x.itemId, ok: x.firstTry ? 1 : 0, conf: x.conf })),
  };
  return r[session.testKind];
}

/** The learner chose to skip the pre-test of a unit (logged; it is not offered again). */
export function skipPreTest(state, unit, now) {
  if (!state.tests) state.tests = {};
  const r = state.tests[unit.id] || (state.tests[unit.id] = {});
  r.preSkipped = now;
}

/**
 * Learning gain for a unit: post minus pre, the normalised gain (post - pre) / (1 - pre) (Hake), and how much
 * of the post-test level was kept a week later (delayed / post). Scores are shares of questions right.
 */
export function learningGain(r) {
  const score = (x) => (x && x.total ? x.right / x.total : null);
  const pre = score(r.pre); const post = score(r.post); const delayed = score(r.delayed);
  return {
    pre, post, delayed,
    gain: pre !== null && post !== null ? post - pre : null,
    normalisedGain: pre !== null && post !== null && pre < 1 ? (post - pre) / (1 - pre) : null,
    kept: post && delayed !== null ? delayed / post : null,
  };
}
