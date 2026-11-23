// Tests for the adaptive engine: mastery, memory checks, help policy, calibration, rewards and sessions.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../content/index.js';
import u1 from '../content/python/u1-first-steps.js';
import { normalizeCourse, fillCode, countBlanks, isBuildItem } from '../js/engine/content.js';
import { gradeMcq, gradePredict, gradeFill, gradeOrder, gradeSpot, gradeWriteRun, sameResult, normOut } from '../js/engine/grade.js';
import { makeRng, shuffle, shuffleChanged, sampleBeta, sampleFrom } from '../js/engine/rng.js';
import {
  updateMastery, guessProb, newConcept, markLearned, applyMemoryCheck, flames, isDue, dueConcepts,
  daysLater, daysBetween, dayKey, pickPoolItem, strength, BKT,
} from '../js/engine/mastery.js';
import {
  chooseHelp, availableArms, updateBandit, armState, contextKey, priorKnowledge, helpSeekingFlags,
  explainChoice, helpOutcomes, ARMS,
} from '../js/engine/help-policy.js';
import { calibration, confProb, checkFeedback } from '../js/engine/calibration.js';
import { levelInfo, addXp, streak, checkBadges, XP } from '../js/engine/rewards.js';
import { newState, repairState, learnerCode } from '../js/engine/state.js';
import {
  startLesson, startReview, startPractice, startPlacement, stopPlacement, current, needsConfidence, requestHelp,
  recordItem, advance, summarize, lessonStatus, nextLesson, courseProgress, progress,
} from '../js/engine/tutor.js';

const meta = COURSES.find((c) => c.id === 'python');
const course = normalizeCourse(meta, { units: [u1] });
const findLesson = (id) => course.byId[id];
const T0 = new Date(2026, 10, 2, 10, 0, 0).getTime(); // 2 Nov 2026, 10:00 local time
const HOUR = 3600000;

function freshState() {
  const s = newState({ id: 'p1', name: 'Test', color: 'ember', code: 'L-TEST01', createdAt: T0 });
  s.onboarded = true;
  s.course = 'python';
  return s;
}

const clean = { firstTry: true, correct: true, attempts: 1, helps: [], walkthrough: false, skipped: false, conf: null, ms: 4000 };
const missed = { firstTry: false, correct: true, attempts: 2, helps: [], walkthrough: false, skipped: false, conf: null, ms: 9000 };

/** Play a session to the end. answer(entry, index) returns the outcome for each item. */
function play(session, state, now, rng, answer, log) {
  const ctx = () => ({ session, state, course, now, catalog: [course], findLesson, rng, log });
  let guard = 0;
  for (let e = current(session, ctx()); e && e.type !== 'summary'; e = current(session, ctx())) {
    if (e.type === 'item') {
      const outcome = answer(e, session.pos);
      recordItem({ session, state, outcome: { ...outcome, conf: e.solo ? (outcome.conf ?? 4) : null }, now, log });
    }
    advance(ctx());
    if (++guard > 200) throw new Error('session did not end');
  }
  return session;
}

// ---------------------------------------------------------------- content helpers and grading

test('content helpers', () => {
  assert.equal(countBlanks('a ___ b ___'), 2);
  assert.equal(fillCode('print(___, ___)', ['1', '2']), 'print(1, 2)');
  const lesson = course.byId['py-print'];
  assert.equal(lesson.steps[0].id, 'py-print.s0');
  assert.equal(lesson.pool[0].id, 'py-print.p0');
  assert.equal(lesson.pool[0].pool, true);
  assert.deepEqual(lesson.pool[0].hints, []);
  assert.equal(lesson.steps[1].mode, 'choose');
  assert.equal(lesson.steps[1].prompt, 'What does this code print?');
  assert.equal(lesson.steps[3].code, 'print("Ready")\nprint(\'Set\')\nprint("Go!")');
  assert.equal(course.lessons.length, 4);
  assert.equal(course.lessons[2].index, 2);
  assert.ok(isBuildItem(lesson.steps[2]));
  assert.ok(!isBuildItem(lesson.steps[1]));
});

test('grading every item kind', () => {
  const print = course.byId['py-print'];
  const mcq = print.steps.find((s) => s.kind === 'mcq');
  assert.equal(gradeMcq(mcq, 0), true);
  assert.equal(gradeMcq(mcq, 1), false);

  const predict = print.steps.find((s) => s.kind === 'predict');
  assert.equal(gradePredict(predict, 'Good morning!'), true);
  assert.equal(gradePredict(predict, 'Good morning!  \n\n'), true, 'trailing space and blank lines are ignored');
  assert.equal(gradePredict(predict, 'good morning!'), false, 'case matters');

  const fill = course.byId['py-strings'].steps.find((s) => s.kind === 'fill');
  assert.deepEqual(gradeFill(fill, ['f', '{level}']), { correct: true, perBlank: [true, true] });
  assert.deepEqual(gradeFill(fill, ['f', 'level']), { correct: false, perBlank: [true, false] });

  const order = course.byId['py-numbers'].steps.find((s) => s.kind === 'order');
  assert.equal(gradeOrder(order, order.lines).correct, true);
  assert.equal(gradeOrder(order, [order.lines[1], order.lines[0], order.lines[2], order.lines[3]]).correct, true, 'listed alternative order');
  const wrong = gradeOrder(order, [order.lines[0], order.lines[2], order.lines[1], order.lines[3]]);
  assert.equal(wrong.correct, false);
  assert.equal(wrong.firstWrong, 1);

  const spot = print.steps.find((s) => s.kind === 'spot');
  assert.equal(gradeSpot(spot, 2), true);
  assert.equal(gradeSpot(spot, 1), false);

  const write = course.byId['py-numbers'].steps.find((s) => s.kind === 'write');
  assert.equal(gradeWriteRun(write, write.solution, { out: '36\n', err: null, results: [] }).passed, true);
  const hard = gradeWriteRun(write, 'print(36)', { out: '36\n', err: null, results: [] });
  assert.equal(hard.passed, false, 'hard-coded answer is rejected by the source rules');
  assert.equal(hard.failures.every((f) => f.type === 'rule'), true);
  const err = gradeWriteRun(write, 'x', { out: '', err: { name: 'NameError', message: 'x' }, results: [] });
  assert.equal(err.failures[0].type, 'error');
  assert.equal(normOut('a  \r\nb\n\n'), 'a\nb');
});

test('SQL result comparison', () => {
  const a = { columns: ['name'], values: [['Tent'], ['Rope']] };
  const b = { columns: ['n'], values: [['Rope'], ['Tent']] };
  assert.equal(sameResult(a, b, false), true);
  assert.equal(sameResult(a, b, true), false);
  assert.equal(sameResult(a, { columns: ['name'], values: [['Tent']] }, false), false);
  assert.equal(sameResult({ columns: ['x'], values: [[null]] }, { columns: ['x'], values: [['NULL']] }, false), false);
});

// ---------------------------------------------------------------- random tools

test('seeded random tools are reproducible and well behaved', () => {
  const a = makeRng(42);
  const b = makeRng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  const r = makeRng(7);
  const xs = [1, 2, 3, 4, 5];
  assert.deepEqual([...shuffle(r, xs)].sort(), xs);
  for (let i = 0; i < 50; i++) assert.notDeepEqual(shuffleChanged(r, xs), xs);
  assert.deepEqual(shuffleChanged(r, ['a', 'a']), ['a', 'a']);
  let sum = 0;
  for (let i = 0; i < 4000; i++) { const v = sampleBeta(r, 3, 2); assert.ok(v > 0 && v < 1); sum += v; }
  assert.ok(Math.abs(sum / 4000 - 0.6) < 0.02, 'Beta(3, 2) has mean 0.6');
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) counts[sampleFrom(r, { a: 0.25, b: 0.75 })]++;
  assert.ok(Math.abs(counts.a / 4000 - 0.25) < 0.03);
});

// ---------------------------------------------------------------- mastery and memory checks

test('mastery rises with unaided success, falls with misses, and help counts for less', () => {
  const p0 = BKT.init;
  const up = updateMastery(p0, { correct: true, guess: 0.25 });
  const down = updateMastery(p0, { correct: false, guess: 0.25 });
  assert.ok(up > p0);
  assert.ok(down < up);
  const assisted = updateMastery(p0, { correct: false, guess: 0.25, assisted: true });
  assert.ok(assisted < down, 'finishing with help adds less than finishing alone');
  let p = p0;
  for (let i = 0; i < 6; i++) p = updateMastery(p, { correct: true, guess: 0.03 });
  assert.ok(p > 0.95 && p <= 0.995);
  const lucky = updateMastery(0.2, { correct: true, guess: 0.5 });
  const earned = updateMastery(0.2, { correct: true, guess: 0.03 });
  assert.ok(earned > lucky, 'a right answer that is easy to guess is weaker evidence');
  for (const lesson of course.lessons) {
    for (const item of [...lesson.steps, ...lesson.pool]) {
      if (!item.kind || ['teach', 'trace'].includes(item.kind)) continue;
      const g = guessProb(item);
      assert.ok(g > 0 && g <= 0.5, `guess probability for ${item.id}`);
    }
  }
});

test('memory checks: next day, then one week, then wider; a miss steps back', () => {
  const c = newConcept();
  assert.equal(flames(c), 0);
  markLearned(c, T0);
  assert.equal(c.stage, 1);
  assert.equal(flames(c), 1);
  assert.equal(dayKey(c.due), '2026-11-03');
  assert.equal(isDue(c, T0 + 5 * HOUR), false);
  assert.equal(isDue(c, daysLater(T0, 1) + 60000), true, 'due any time the next day');

  const day1 = daysLater(T0, 1) + 9 * HOUR;
  const r1 = applyMemoryCheck(c, true, day1);
  assert.deepEqual([r1.before, r1.after, r1.gapDays, r1.nextInDays], [1, 2, 1, 7]);
  assert.equal(flames(c), 2);
  assert.equal(dayKey(c.due), '2026-11-10');

  const day8 = daysLater(T0, 8) + 9 * HOUR;
  const r2 = applyMemoryCheck(c, true, day8);
  assert.deepEqual([r2.after, r2.nextInDays], [3, 21]);
  assert.equal(flames(c), 3);

  const later = daysLater(day8, 21) + HOUR;
  const r3 = applyMemoryCheck(c, false, later);
  assert.deepEqual([r3.before, r3.after, r3.nextInDays], [3, 2, 1]);
  assert.equal(flames(c), 3, 'flames show the best stage reached');
  assert.equal(daysBetween(T0, daysLater(T0, 7)), 7);

  const fresh = newConcept();
  markLearned(fresh, T0);
  applyMemoryCheck(fresh, false, day1);
  assert.equal(fresh.stage, 1, 'a missed next-day check stays at stage 1');
  assert.equal(dayKey(fresh.due), '2026-11-04');
});

test('due concepts are listed most overdue first, and strength fades with time', () => {
  const s = freshState();
  for (const [id, when] of [['py-print', T0], ['py-variables', daysLater(T0, 2) + HOUR]]) {
    s.concepts[id] = newConcept(0.8);
    markLearned(s.concepts[id], when);
  }
  const ids = course.lessons.map((l) => l.id);
  assert.deepEqual(dueConcepts(s, T0, ids), []);
  assert.deepEqual(dueConcepts(s, daysLater(T0, 1) + HOUR, ids), ['py-print']);
  assert.deepEqual(dueConcepts(s, daysLater(T0, 5), ids), ['py-print', 'py-variables']);
  const c = s.concepts['py-print'];
  assert.ok(strength(c, T0) > strength(c, daysLater(T0, 3)));
});

test('pool items: unseen first, then the one seen longest ago', () => {
  const lesson = course.byId['py-print'];
  const c = newConcept();
  const rng = makeRng(3);
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(pickPoolItem(lesson, c, rng, T0 + i).id);
  assert.equal(new Set(seen).size, 5, 'all five pool items are used before any repeats');
  assert.equal(pickPoolItem(lesson, c, rng, T0 + 10).id, seen[0], 'then the oldest comes back');
  const other = pickPoolItem(lesson, c, rng, T0 + 11, [seen[1]]);
  assert.notEqual(other.id, seen[1], 'excluded items are avoided');
});

// ---------------------------------------------------------------- help policy

test('help policy: every kind keeps the minimum probability and probabilities sum to 1', () => {
  const bandit = {};
  const key = contextKey('low', 1);
  for (let i = 0; i < 40; i++) updateBandit(bandit, key, 'worked', 1);
  for (let i = 0; i < 40; i++) updateBandit(bandit, key, 'hint', 0);
  const rng = makeRng(11);
  const counts = { hint: 0, explain: 0, worked: 0 };
  let probs;
  for (let i = 0; i < 600; i++) {
    const c = chooseHelp({ mode: 'adaptive', arms: [...ARMS], bandit, key, floor: 0.2, costWeight: 0.05, rng });
    probs = c.probs;
    counts[c.arm]++;
    const total = Object.values(c.probs).reduce((a, b) => a + b, 0);
    assert.ok(Math.abs(total - 1) < 1e-6);
    for (const a of ARMS) assert.ok(c.probs[a] >= 0.2 - 1e-9, `${a} keeps at least 0.2`);
    assert.equal(c.policy, 'thompson-floor-1');
  }
  assert.ok(probs.worked > 0.5, 'the kind that has worked best is chosen most often');
  assert.ok(counts.hint / 600 > 0.14 && counts.hint / 600 < 0.27, 'the weakest kind is still explored about 20% of the time');
});

test('help policy: priors follow the theory, fixed mode is a ladder, one option is certain', () => {
  const low = armState({}, contextKey('low', 1));
  const high = armState({}, contextKey('high', 1));
  const mean = ([a, b]) => a / (a + b);
  assert.ok(mean(low.worked) > mean(low.hint), 'worked examples start ahead when prior knowledge is low');
  assert.ok(mean(high.worked) < mean(high.hint), 'and behind when it is high (expertise reversal)');
  assert.equal(priorKnowledge(0.1), 'low');
  assert.equal(priorKnowledge(0.5), 'mid');
  assert.equal(priorKnowledge(0.9), 'high');
  assert.equal(contextKey('mid', 1), 'mid|one');
  assert.equal(contextKey('mid', 3), 'mid|many');

  const rng = makeRng(5);
  const fixed = chooseHelp({ mode: 'fixed', arms: ['hint', 'explain', 'worked'], bandit: {}, key: 'low|one', rng });
  assert.deepEqual([fixed.arm, fixed.policy, fixed.probs.hint], ['hint', 'fixed-ladder', 1]);
  assert.equal(chooseHelp({ mode: 'fixed', arms: ['explain', 'worked'], bandit: {}, key: 'low|one', rng }).arm, 'explain');
  assert.equal(chooseHelp({ mode: 'fixed', arms: ['worked'], bandit: {}, key: 'low|one', rng }).arm, 'worked');
  const only = chooseHelp({ mode: 'adaptive', arms: ['worked'], bandit: {}, key: 'low|one', rng });
  assert.deepEqual(only.probs, { worked: 1 });
  assert.equal(chooseHelp({ mode: 'adaptive', arms: [], bandit: {}, key: 'low|one', rng }), null);
  const two = chooseHelp({ mode: 'adaptive', arms: ['hint', 'worked'], bandit: {}, key: 'mid|one', floor: 0.2, rng });
  assert.ok(two.probs.hint >= 0.2 && two.probs.worked >= 0.2);
});

test('available help respects what is left and what Settings allow', () => {
  const lesson = course.byId['py-print'];
  const item = lesson.steps.find((s) => s.kind === 'fill');
  const all = { hint: true, explain: true, worked: true, walkthrough: true };
  assert.deepEqual(availableArms(item, lesson, { hints: 0, worked: false }, all), ['hint', 'explain', 'worked']);
  assert.deepEqual(availableArms(item, lesson, { hints: 2, worked: false }, all), ['worked']);
  assert.deepEqual(availableArms(item, lesson, { hints: 2, worked: true }, all), []);
  assert.deepEqual(availableArms(item, lesson, { hints: 0, worked: false }, { ...all, explain: false, worked: false }), ['hint']);
});

test('help-seeking flags, explanations and outcome table', () => {
  const calm = helpSeekingFlags([{ helps: 0 }, { helps: 0 }], { msSinceFeedback: 30000, helpsOnItem: 0 });
  assert.deepEqual(calm, { rapid: false, heavy: false });
  assert.equal(helpSeekingFlags([], { msSinceFeedback: 2000, helpsOnItem: 1 }).rapid, true, 'a second request seconds after the first');
  const heavy = helpSeekingFlags([{ helps: 1 }, { helps: 2 }, { helps: 1 }, { helps: 0 }, { helps: 1 }], { msSinceFeedback: 60000, helpsOnItem: 0 });
  assert.deepEqual(heavy, { rapid: false, heavy: true });
  assert.match(explainChoice({ policy: 'fixed-ladder', arms: ['hint'], pk: 'low' }), /fixed order/);
  assert.match(explainChoice({ policy: 'thompson-floor-1', arms: ['hint'], pk: 'low' }), /only kind/);
  assert.match(explainChoice({ policy: 'thompson-floor-1', arms: ['hint', 'worked'], pk: 'low' }), /new for you/);
  const table = helpOutcomes([
    { arm: 'hint', proximal: 1, week: null }, { arm: 'hint', proximal: 0, week: 1 }, { arm: 'worked', proximal: null, week: null },
  ]);
  assert.deepEqual(table.hint, { used: 2, checked: 2, passed: 1, weekChecked: 1, weekPassed: 1 });
  assert.deepEqual(table.worked, { used: 1, checked: 0, passed: 0, weekChecked: 0, weekPassed: 0 });
});

// ---------------------------------------------------------------- calibration and rewards

test('calibration: confidence minus result', () => {
  assert.equal(confProb(1), 0);
  assert.equal(confProb(5), 1);
  assert.equal(calibration([]).verdict, 'early');
  const over = calibration(Array.from({ length: 8 }, (_, i) => ({ conf: 5, ok: i < 2 })));
  assert.equal(over.verdict, 'over');
  assert.ok(Math.abs(over.bias - 0.75) < 1e-9);
  const under = calibration(Array.from({ length: 8 }, () => ({ conf: 2, ok: true })));
  assert.equal(under.verdict, 'under');
  const good = calibration([...Array.from({ length: 4 }, () => ({ conf: 5, ok: true })), ...Array.from({ length: 4 }, () => ({ conf: 1, ok: false }))]);
  assert.equal(good.verdict, 'good');
  assert.equal(good.absError, 0);
  assert.equal(good.byLevel[4].acc, 1);
  assert.equal(calibration([{ conf: null, ok: true }]).n, 0, 'unrated checks are left out');
  assert.match(checkFeedback(5, false), /felt sure/);
  assert.equal(checkFeedback(null, true), '');
});

test('levels, daily XP and streaks', () => {
  assert.deepEqual([levelInfo(0).level, levelInfo(59).level, levelInfo(60).level, levelInfo(240).level], [1, 1, 2, 3]);
  assert.equal(levelInfo(150).progress, (150 - 60) / (240 - 60));
  const s = freshState();
  assert.deepEqual(streak(s, T0), { count: 0, doneToday: false });
  addXp(s, 10, T0);
  addXp(s, 5, T0 + HOUR);
  assert.equal(s.days['2026-11-02'], 15);
  assert.deepEqual(streak(s, T0), { count: 1, doneToday: true });
  addXp(s, 10, daysLater(T0, 1) + HOUR);
  assert.equal(streak(s, daysLater(T0, 1) + 2 * HOUR).count, 2);
  assert.deepEqual(streak(s, daysLater(T0, 2) + HOUR), { count: 2, doneToday: false }, 'still alive until the end of today');
  assert.equal(streak(s, daysLater(T0, 3) + HOUR).count, 0, 'a missed day ends it');
});

test('state repair keeps saved data and fills gaps', () => {
  const s = freshState();
  s.xp = 77;
  delete s.counters.helps;
  delete s.settings.allow;
  delete s.recentItems;
  const r = repairState(JSON.parse(JSON.stringify(s)));
  assert.equal(r.xp, 77);
  assert.equal(r.settings.allow.worked, true);
  assert.equal(r.counters.helps.hint, 0);
  assert.deepEqual(r.recentItems, []);
  assert.match(learnerCode(makeRng(1)), /^L-[A-Z2-9]{6}$/);
});

// ---------------------------------------------------------------- sessions

test('a clean lesson: fast track skips easy items, the final check is unaided, the next-day check is scheduled', () => {
  const state = freshState();
  const rng = makeRng(1);
  const lesson = course.byId['py-print'];
  const events = [];
  const session = startLesson({ state, course, lesson, now: T0, log: (type, data) => events.push({ type, data }) });
  assert.equal(session.queue.filter((e) => e.role === 'final').length, 1);
  assert.equal(session.queue[session.queue.length - 1].type, 'summary');
  const before = progress(session).total;
  play(session, state, T0, rng, () => clean, (type, data) => events.push({ type, data }));
  assert.equal(session.done, true);
  assert.ok(session.skipped >= 1 && session.skipped <= 2, 'one or two easier items were skipped');
  assert.equal(progress(session).total, before - session.skipped);
  assert.ok(session.results.some((r) => r.kind === 'write' && !r.solo), 'the write item is never skipped');
  const final = session.results[session.results.length - 1];
  assert.deepEqual([final.role, final.solo, final.conf], ['final', true, 4]);
  assert.equal(state.lessons['py-print'].runs, 1);
  assert.ok(state.lessons['py-print'].done);
  const c = state.concepts['py-print'];
  assert.equal(c.stage, 1);
  assert.equal(dayKey(c.due), '2026-11-03');
  assert.ok(c.pL > 0.9);
  assert.equal(c.checks.length, 1);
  assert.equal(c.checks[0].afterHelp, false);
  const sum = summarize(session);
  assert.equal(sum.practice.clean, sum.practice.total);
  assert.deepEqual(sum.checks, { total: 1, right: 1 });
  assert.equal(sum.xp, sum.practice.total * XP.firstTry + XP.soloCheck + XP.lessonDone);
  assert.equal(state.xp, sum.xp);
  assert.equal(state.badges['first-spark'], T0);
  assert.equal(session.outcome.firstTime, true);
  assert.deepEqual(events.map((e) => e.type).filter((t) => t !== 'item_result'), ['session_start', 'session_end']);
  assert.equal(lessonStatus(state, course, course.byId['py-print']), 'done');
  assert.equal(lessonStatus(state, course, course.byId['py-variables']), 'open');
  assert.equal(lessonStatus(state, course, course.byId['py-numbers']), 'locked');
  assert.equal(nextLesson(state, course).id, 'py-variables');
  assert.deepEqual(courseProgress(state, course), { done: 1, total: 4, ratio: 0.25 });
});

test('help in a lesson: a decision is logged, a solo check follows, and its result teaches the policy', () => {
  const state = freshState();
  const rng = makeRng(9);
  const lesson = course.byId['py-print'];
  const session = startLesson({ state, course, lesson, now: T0 });
  const ctx = { session, state, course, now: T0, catalog: [course], findLesson, rng };
  let e = current(session, ctx);
  while (!(e.type === 'item' && e.item.kind === 'fill')) {
    if (e.type === 'item') recordItem({ session, state, outcome: missed, now: T0 });
    advance(ctx);
    e = current(session, ctx);
  }
  const item = { fails: 1, hintsUsed: 0, workedUsed: false, helps: [] };
  const help = requestHelp({ session, state, lesson, entry: e, item, now: T0, rng });
  const d = help.decision;
  assert.ok(['hint', 'explain', 'worked'].includes(d.arm));
  assert.deepEqual(d.arms, ['hint', 'explain', 'worked']);
  assert.equal(d.pk, priorKnowledge(d.pL));
  assert.equal(d.key, contextKey(d.pk, 1));
  assert.ok(Math.abs(Object.values(d.probs).reduce((a, b) => a + b, 0) - 1) < 1e-6);
  assert.ok(Object.values(d.probs).every((p) => p >= 0.2 - 1e-9));
  if (d.arm === 'worked') assert.equal(help.worked, lesson.worked); else assert.equal(help.hint, e.item.hints[0]);
  assert.equal(state.counters.helps[d.arm], 1);
  assert.equal(state.decisions.length, 1);

  const armBefore = [...armState(state.bandit, d.key)[d.arm]];
  const queueBefore = session.queue.length;
  recordItem({ session, state, outcome: { ...missed, helps: [d.arm] }, now: T0 });
  assert.equal(session.queue.length, queueBefore + 1);
  assert.equal(session.queue[session.pos + 1].role, 'helpcheck');
  assert.equal(session.results[session.results.length - 1].xp, XP.helped);
  advance(ctx);
  e = current(session, ctx);
  assert.deepEqual([e.role, e.solo, e.item.pool], ['helpcheck', true, true]);
  assert.equal(needsConfidence(e, state.settings), true);
  assert.equal(d.proximal, null);
  recordItem({ session, state, outcome: { ...clean, conf: 2 }, now: T0 });
  assert.equal(d.proximal, 1, 'the unaided check right after help is the proximal outcome');
  const armAfter = armState(state.bandit, d.key)[d.arm];
  assert.deepEqual(armAfter, [armBefore[0] + 1, armBefore[1]]);
  const check = state.concepts['py-print'].checks[0];
  assert.deepEqual([check.role, check.conf, check.ok, check.afterHelp], ['helpcheck', 2, true, true]);
});

test('a missed question brings back the idea as a solo check a little later; at most two extra checks', () => {
  const state = freshState();
  const rng = makeRng(4);
  const lesson = course.byId['py-variables'];
  const session = startLesson({ state, course, lesson, now: T0 });
  play(session, state, T0, rng, (e) => (e.solo ? clean : missed));
  assert.equal(session.inserted, 2);
  const roles = session.results.map((r) => r.role);
  assert.equal(roles.filter((r) => r === 'retry').length, 2);
  assert.equal(roles[roles.length - 1], 'final');
  assert.equal(session.skipped, 0, 'no fast track without clean answers');
  const ids = session.results.filter((r) => r.solo).map((r) => r.itemId);
  assert.equal(new Set(ids).size, ids.length, 'solo checks in one session use different pool items');
  assert.equal(state.counters.comeback, session.results.filter((r) => !r.solo).length);
});

test('memory checks the next day and after a week reward the help that was used', () => {
  const state = freshState();
  const rng = makeRng(21);
  const lesson = course.byId['py-print'];
  const s1 = startLesson({ state, course, lesson, now: T0 });
  const ctx1 = { session: s1, state, course, now: T0, catalog: [course], findLesson, rng };
  let helpedOnce = false;
  for (let e = current(s1, ctx1); e.type !== 'summary'; e = current(s1, ctx1)) {
    if (e.type === 'item') {
      if (!helpedOnce && e.item.kind === 'fill') {
        requestHelp({ session: s1, state, lesson, entry: e, item: { fails: 1, hintsUsed: 0, workedUsed: false, helps: [] }, now: T0, rng });
        recordItem({ session: s1, state, outcome: { ...missed, helps: [state.decisions[0].arm] }, now: T0 });
        helpedOnce = true;
      } else recordItem({ session: s1, state, outcome: { ...clean, conf: 4 }, now: T0 });
    }
    advance(ctx1);
  }
  const d = state.decisions[0];
  assert.equal(d.proximal, 1);

  const day1 = daysLater(T0, 1) + 9 * HOUR;
  const ids = course.lessons.map((l) => l.id);
  const review = startReview({ state, lessonIds: ids, now: day1 });
  assert.equal(review.queue.length, 2, 'one due concept and the summary');
  const before = [...armState(state.bandit, d.key)[d.arm]];
  play(review, state, day1, rng, () => clean);
  assert.equal(d.nextDay, 1);
  assert.deepEqual(armState(state.bandit, d.key)[d.arm], [before[0] + 0.5, before[1]]);
  assert.equal(state.concepts['py-print'].stage, 2);
  assert.equal(review.results[0].xp, XP.memoryNextDay);
  assert.equal(review.results[0].memory.nextInDays, 7);
  assert.equal(state.badges['still-there'], day1);
  assert.equal(startReview({ state, lessonIds: ids, now: day1 + HOUR }).queue.length, 1, 'nothing more is due today');

  const day8 = daysLater(T0, 8) + 9 * HOUR;
  const week = startReview({ state, lessonIds: ids, now: day8 });
  play(week, state, day8, rng, () => ({ ...clean, firstTry: false, correct: false }));
  assert.equal(d.week, 0, 'the one-week check is the main delayed outcome');
  assert.equal(state.concepts['py-print'].stage, 1, 'a missed one-week check goes back to daily checks');
  assert.equal(week.results[0].xp, XP.checkTried);
  assert.equal(summarize(week).memory[0].ok, false);
});

test('warm-ups: due ideas from earlier lessons open the next lesson', () => {
  const state = freshState();
  const rng = makeRng(8);
  play(startLesson({ state, course, lesson: course.byId['py-print'], now: T0 }), state, T0, rng, () => clean);
  const day1 = daysLater(T0, 1) + HOUR;
  const s2 = startLesson({ state, course, lesson: course.byId['py-variables'], now: day1 });
  assert.deepEqual([s2.queue[0].role, s2.queue[0].lessonId], ['warmup', 'py-print']);
  play(s2, state, day1, rng, () => clean);
  assert.equal(state.concepts['py-print'].stage, 2, 'the warm-up counted as the next-day memory check');
  assert.equal(s2.results[0].memory.stageBefore, 1);
});

test('free practice trains the weakest ideas without moving the memory-check dates', () => {
  const state = freshState();
  const rng = makeRng(12);
  play(startLesson({ state, course, lesson: course.byId['py-print'], now: T0 }), state, T0, rng, () => clean);
  const due = state.concepts['py-print'].due;
  const p = startPractice({ state, lessonIds: course.lessons.map((l) => l.id), now: T0 + HOUR });
  assert.equal(p.queue[0].role, 'extra');
  play(p, state, T0 + HOUR, rng, () => clean);
  assert.equal(state.concepts['py-print'].due, due);
  assert.equal(state.concepts['py-print'].stage, 1);
});

test('placement: passing a unit marks its lessons as known and schedules a one-week check', () => {
  const two = normalizeCourse(meta, { units: [u1, { ...u1, id: 'py-u1b', lessons: u1.lessons.slice(0, 2).map((l) => ({ ...l, id: `${l.id}-b` })) }] });
  const find = (id) => two.byId[id];
  const state = freshState();
  const rng = makeRng(2);
  const session = startPlacement({ course: two, now: T0 });
  assert.equal(session.queue.length, 4);
  const ctx = () => ({ session, state, course: two, now: T0, catalog: [two], findLesson: find, rng });
  let n = 0;
  for (let e = current(session, ctx()); e && e.type !== 'summary'; e = current(session, ctx())) {
    assert.equal(needsConfidence(e, state.settings), false, 'placement has no confidence rating');
    const inFirstUnit = e.unitIdx === 0;
    recordItem({ session, state, outcome: inFirstUnit ? (n === 1 ? { ...clean, firstTry: false, correct: false } : clean) : { ...clean, firstTry: false, correct: false }, now: T0 });
    n++;
    advance(ctx());
  }
  assert.equal(session.done, true);
  assert.deepEqual(session.unitScores.map((u) => [u.right, u.total, u.passed]), [[3, 4, true], [0, 2, false]]);
  assert.equal(state.placement.python.units, 1);
  for (const l of u1.lessons) {
    assert.equal(state.lessons[l.id].testedOut, true);
    assert.equal(dayKey(state.concepts[l.id].due), '2026-11-09');
  }
  assert.equal(state.lessons['py-print-b'], undefined);
  assert.equal(nextLesson(state, two).id, 'py-print-b');
  assert.equal(session.xp, 0, 'placement gives no XP');

  const s2 = startPlacement({ course: two, now: T0 });
  const state2 = freshState();
  const ctx2 = { session: s2, state: state2, course: two, now: T0, catalog: [two], findLesson: find, rng };
  current(s2, ctx2);
  recordItem({ session: s2, state: state2, outcome: clean, now: T0 });
  stopPlacement(ctx2);
  assert.equal(s2.done, true);
  assert.equal(state2.placement.python.units, 0, 'stopping early passes nothing');
});

test('badges for solo work, comebacks, explanations and calibration', () => {
  const state = freshState();
  state.counters.firstTry = 10;
  state.counters.comeback = 5;
  state.counters.explains = 5;
  state.counters.runs = 10;
  state.concepts.a = { ...newConcept(), best: 3, checks: Array.from({ length: 10 }, (_, i) => ({ t: T0 + i, ok: i < 9, conf: i < 9 ? 5 : 1 })) };
  const got = checkBadges(state, T0, [course]).map((b) => b.id);
  for (const id of ['on-your-own', 'bounce-back', 'own-words', 'tinkerer', 'still-there', 'built-to-last', 'good-judge']) assert.ok(got.includes(id), id);
  assert.deepEqual(checkBadges(state, T0, [course]), [], 'badges are awarded once');
});

test('practising a lesson again does not reset the gap recorded on the next memory check', () => {
  const c = newConcept();
  markLearned(c, T0);
  const day2 = daysLater(T0, 1) + 9 * HOUR;
  applyMemoryCheck(c, true, day2);
  markLearned(c, daysLater(T0, 7) + HOUR);            // "Practise again" on day 8
  const r = applyMemoryCheck(c, true, daysLater(T0, 8) + 9 * HOUR);
  assert.equal(r.gapDays, 7, 'days since the previous check, not since the extra practice');
});
