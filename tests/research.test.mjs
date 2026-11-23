// Tests for the research features: decision audit fields, outcome events, study mode, exports and pooled analysis.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../content/index.js';
import u1 from '../content/python/u1-first-steps.js';
import { normalizeCourse } from '../js/engine/content.js';
import { makeRng, sampleFrom } from '../js/engine/rng.js';
import { daysLater } from '../js/engine/mastery.js';
import { newState } from '../js/engine/state.js';
import { startLesson, startReview, current, recordItem, requestHelp, advance } from '../js/engine/tutor.js';
import { readStudyParams, assignCondition, enrol } from '../js/study.js';
import { store, createProfile, resetProgress } from '../js/store.js';
import { buildJson, eventsCsv, decisionsCsv, checksCsv, toCsv } from '../js/export.js';
import { pool, armValues, retention, calibrationOf, summarise, reportMarkdown } from '../tools/analysis.mjs';

const course = normalizeCourse(COURSES.find((c) => c.id === 'python'), { units: [u1] });
const findLesson = (id) => course.byId[id];
const T0 = new Date(2026, 10, 2, 10, 0, 0).getTime();
const HOUR = 3600000;
const clean = { firstTry: true, correct: true, attempts: 1, helps: [], walkthrough: false, skipped: false, conf: 4, ms: 4000 };
const missed = { firstTry: false, correct: true, attempts: 2, helps: [], walkthrough: false, skipped: false, conf: null, ms: 9000 };

function freshState() {
  const s = newState({ id: 'p1', name: 'Test', color: 'ember', code: 'L-TEST01', createdAt: T0 });
  s.onboarded = true;
  s.course = 'python';
  return s;
}

/** A lesson in which one fill item needed help, then everything else was clean. Returns the logged events. */
function lessonWithHelp(state, rng, events) {
  const log = (type, data) => events.push({ t: T0, type, ...data });
  const lesson = course.byId['py-print'];
  const s = startLesson({ state, course, lesson, now: T0, log });
  const ctx = { session: s, state, course, now: T0, catalog: [course], findLesson, rng, log };
  let helped = false;
  for (let e = current(s, ctx); e.type !== 'summary'; e = current(s, ctx)) {
    if (e.type === 'item') {
      if (!helped && e.item.kind === 'fill') {
        requestHelp({ session: s, state, lesson, entry: e, item: { fails: 1, hintsUsed: 0, workedUsed: false, helps: [] }, now: T0, rng, log, shift: 0 });
        recordItem({ session: s, state, outcome: { ...missed, helps: [state.decisions[0].arm] }, now: T0, log });
        helped = true;
      } else recordItem({ session: s, state, outcome: clean, now: T0, log });
    }
    advance(ctx);
  }
  return lesson;
}

test('every help decision records what is needed to audit and replay it', () => {
  const state = freshState();
  const events = [];
  lessonWithHelp(state, makeRng(21), events);
  const d = state.decisions[0];
  assert.equal(d.floor, 0.2);
  assert.equal(d.costWeight, 0.05);
  assert.deepEqual(Object.keys(d.posterior).sort(), [...d.arms].sort());
  assert.ok(d.u >= 0 && d.u < 1);
  assert.equal(sampleFrom(() => 0, d.probs, d.u), d.arm, 'the logged draw and probabilities reproduce the chosen arm');
  assert.deepEqual(d.allow, state.settings.allow);
  assert.equal(d.cond, null);
  const logged = events.find((e) => e.type === 'help_decision');
  assert.equal(logged.id, d.id);
  assert.ok(logged.posterior && logged.u === d.u);
});

test('outcomes are written to the event log as they happen, with their timing', () => {
  const state = freshState();
  const events = [];
  const rng = makeRng(22);
  lessonWithHelp(state, rng, events);
  const d = state.decisions[0];
  assert.equal(d.proximalRole, 'helpcheck');
  const prox = events.filter((e) => e.type === 'help_outcome' && e.kind === 'proximal');
  assert.equal(prox.length, 1);
  assert.equal(prox[0].decision, d.id);
  assert.equal(prox[0].role, 'helpcheck');
  assert.equal(prox[0].value, 1);

  const log = (type, data) => events.push({ t: 0, type, ...data });
  const ids = course.lessons.map((l) => l.id);
  const day1 = daysLater(T0, 1) + 9 * HOUR;
  const review = startReview({ state, lessonIds: ids, now: day1, log });
  const ctx = (now) => ({ session: review, state, course, now, catalog: [course], findLesson, rng, log });
  for (let e = current(review, ctx(day1)); e.type !== 'summary'; e = current(review, ctx(day1))) { recordItem({ session: review, state, outcome: clean, now: day1, log }); advance(ctx(day1)); }
  assert.equal(d.nextDay, 1);
  assert.equal(d.nextDayGap, 1);
  assert.ok(events.some((e) => e.type === 'help_outcome' && e.kind === 'nextDay' && e.decision === d.id && e.gapDays === 1));

  const day8 = daysLater(day1, 7) + 9 * HOUR;
  const review2 = startReview({ state, lessonIds: ids, now: day8, log });
  const ctx2 = () => ({ session: review2, state, course, now: day8, catalog: [course], findLesson, rng, log });
  for (let e = current(review2, ctx2()); e.type !== 'summary'; e = current(review2, ctx2())) { recordItem({ session: review2, state, outcome: clean, now: day8, log }); advance(ctx2()); }
  assert.equal(d.week, 1);
  assert.equal(d.weekGap, 8, 'the gap in days is recorded, so late checks can be told apart');
  assert.ok(events.some((e) => e.type === 'help_outcome' && e.kind === 'week'));
});

test('study links: parameters are validated and conditions are assigned', () => {
  assert.equal(readStudyParams(''), null);
  assert.equal(readStudyParams('?study=bad code!'), null);
  assert.deepEqual(readStudyParams('?study=AALTO-1&pid=P01&cond=Fixed'), { id: 'AALTO-1', pid: 'P01', cond: 'fixed', arms: null, floor: null, ai: false });
  assert.deepEqual(readStudyParams('?study=S&pid=a b'), { id: 'S', pid: null, cond: 'random', arms: null, floor: null, ai: false });
  assert.deepEqual(readStudyParams('?study=S&arms=Worked,hint,bad&floor=0.1').arms, ['hint', 'worked'], 'teacher-set bounds: valid help types, in a fixed order');
  assert.equal(readStudyParams('?study=S&floor=0.9').floor, 1 / 3, 'the floor is capped at one third');
  assert.equal(readStudyParams('?study=S&cond=bogus').cond, 'random');

  assert.deepEqual(assignCondition('adaptive'), { cond: 'adaptive', assignment: 'given', pAssign: 1 });
  const rng = makeRng(7);
  let adaptive = 0;
  for (let i = 0; i < 2000; i++) if (assignCondition('random', rng).cond === 'adaptive') adaptive++;
  assert.ok(adaptive > 900 && adaptive < 1100, `random assignment is balanced (${adaptive} of 2000)`);

  const state = freshState();
  const st = enrol(state, { id: 'S', pid: 'P1', cond: 'fixed' }, { consentAt: T0 });
  assert.equal(state.settings.helpMode, 'fixed');
  assert.deepEqual([st.id, st.pid, st.cond, st.assignment, st.consentAt], ['S', 'P1', 'fixed', 'given', T0]);
});

test('starting over keeps the study enrolment', () => {
  createProfile({ name: 'Ada', color: 'ember' });
  enrol(store.state, { id: 'S', pid: 'P1', cond: 'adaptive' }, { consentAt: T0 });
  store.state.xp = 99;
  resetProgress();
  assert.equal(store.state.xp, 0);
  assert.equal(store.state.study.id, 'S');
  assert.equal(store.state.onboarded, true);
});

test('exports: study fields, escaping, the clock flag and the unaided-checks file', () => {
  const state = freshState();
  const events = [];
  lessonWithHelp(state, makeRng(23), events);
  enrol(state, { id: 'S', pid: 'P7', cond: 'adaptive' }, { consentAt: T0 });
  const json = buildJson(state, events.map((e) => ({ p: 'p1', ...e })), new Date(T0));
  assert.equal(json.dataVersion, 2);
  assert.equal(json.study.pid, 'P7');
  assert.equal(json.clockShifted, false);
  assert.ok(json.events.every((e) => !('p' in e)), 'the internal profile id is not exported');
  assert.equal(buildJson(state, [{ t: 1, type: 'x', shift: 3 }]).clockShifted, true);

  const ev = eventsCsv(state, events).split('\r\n');
  assert.match(ev[0], /^learner,study,pid,cond,time,t,type/);
  assert.ok(ev[1].startsWith('L-TEST01,S,P7,adaptive,'));
  const dec = decisionsCsv(state).split('\r\n');
  assert.match(dec[0], /posterior,u,floor,costWeight/);
  assert.equal(dec.length, 2);

  const checks = checksCsv(state, events).split('\r\n');
  assert.match(checks[0], /conf,correct,attempts/);
  assert.ok(checks.length > 1, 'solo checks are listed');
  const row = Object.fromEntries(checks[0].split(',').map((k, i) => [k, checks[1].split(',')[i]]));
  assert.equal(row.afterHelp, '1', 'the check after help is marked');

  assert.equal(toCsv([{ a: 'x,y', b: 'say "hi"', c: null }], ['a', 'b', 'c']), 'a,b,c\r\n"x,y","say ""hi""",');
});

/** A synthetic participant export with n decisions of one arm and a given pass rate. */
function fakeExport(code, cond, rows) {
  const decisions = rows.map((r, i) => ({
    id: `${code}-${i}`, t: T0 + i, lessonId: 'py-print', arms: ['hint', 'explain', 'worked'], probs: r.probs || { hint: 0.2, explain: 0.2, worked: 0.6 },
    arm: r.arm, proximal: r.proximal ?? null, nextDay: r.nextDay ?? null, week: r.week ?? null, proximalRole: 'helpcheck',
  }));
  return { learner: code, study: { id: 'S', pid: code, cond }, policy: { mode: cond }, dataVersion: 2, clockShifted: false, totals: { xp: 10, lessonsDone: 1 }, decisions, events: [] };
}

test('analysis: IPW value, pooling, retention, calibration and the report', () => {
  const a = fakeExport('A', 'adaptive', [
    { arm: 'worked', proximal: 1 }, { arm: 'worked', proximal: 1 }, { arm: 'hint', proximal: 0, probs: { hint: 0.2, explain: 0.2, worked: 0.6 } }, { arm: 'explain', proximal: 1 },
  ]);
  const dup = fakeExport('A', 'adaptive', [{ arm: 'hint', proximal: 0 }]);
  const b = fakeExport('B', 'fixed', [{ arm: 'hint', proximal: 1, probs: { hint: 1, explain: 0, worked: 0 } }, { arm: 'hint', proximal: 0, probs: { hint: 1, explain: 0, worked: 0 } }]);
  const data = pool([a, dup, b]);
  assert.equal(data.participants.length, 2, 'the same learner exported twice counts once');
  assert.equal(data.duplicates.length, 1);
  assert.equal(data.decisions.length, 6);

  const v = armValues(data.decisions.filter((d) => d.learner === 'A'), 'proximal');
  assert.equal(v.n, 4);
  assert.deepEqual([v.arms.worked.chosen, v.arms.worked.value], [2, 1]);
  assert.equal(v.arms.worked.ipw, Math.round(((1 / 0.6 + 1 / 0.6) / 4) * 1000) / 1000, 'mean of Y/pi over decisions where the arm was offered');
  assert.equal(v.arms.hint.value, 0);

  const checks = [
    { role: 'memory', stageBefore: 1, correct: 1 }, { role: 'memory', stageBefore: 1, correct: 0 },
    { role: 'memory', stageBefore: 2, correct: 1 }, { role: 'final', stageBefore: 0, correct: 1 },
  ];
  assert.deepEqual(retention(checks), { 'next day': { n: 2, rate: 0.5 }, 'one week': { n: 1, rate: 1 } });

  const cal = calibrationOf([{ conf: 5, correct: 1 }, { conf: 5, correct: 0 }, { conf: 1, correct: 0 }, { conf: 3, correct: 1 }]);
  assert.equal(cal.n, 4);
  assert.equal(cal.accuracy, 0.5);
  assert.equal(cal.meanConf, 0.625);
  assert.equal(cal.bias, 0.125);
  assert.equal(cal.brier, Math.round(((1 - 1) ** 2 + 1 + 0 + 0.25) / 4 * 1000) / 1000);

  const summary = summarise(data);
  assert.deepEqual(Object.keys(summary.conditions), ['adaptive', 'fixed']);
  assert.equal(summary.conditions.fixed.participants, 1);
  assert.equal(summary.quality.decisionsWithoutProximal, 0);
  const md = reportMarkdown(summary, data);
  assert.match(md, /## Condition: adaptive/);
  assert.match(md, /Data quality/);
});
