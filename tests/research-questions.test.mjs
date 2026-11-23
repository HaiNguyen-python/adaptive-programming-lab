// Tests for the research-question analyses (RQ1 to RQ4) in tools/research-questions.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../js/engine/rng.js';
import {
  helpSeekingFeatures, helpSeekingReport, learningEpisodes, proxyReport, auc, excursions, fixedLadder,
  fitOutcomeModel, drValue, policyEvaluation, carryOver, laterRequests, researchQuestionsMarkdown,
} from '../tools/research-questions.mjs';
import { pool, researchQuestions } from '../tools/analysis.mjs';

const S = 's1';
const ev = (t, type, data) => ({ t, type, session: S, ...data });

test('RQ1: help-seeking features count rapid and repeated requests from the event log', () => {
  const events = [
    ev(0, 'session_start', { kind: 'lesson', lesson: 'L1' }),
    ev(1000, 'attempt', { itemId: 'a', solo: false }),
    ev(3000, 'help_decision', { sessionId: S, itemId: 'a', arm: 'hint' }),        // rapid (2 s after the attempt)
    ev(20000, 'attempt', { itemId: 'a', solo: false }),
    ev(21000, 'attempt', { itemId: 'a', solo: false }),
    ev(60000, 'help_decision', { sessionId: S, itemId: 'a', arm: 'worked' }),     // repeat, not rapid, 2 attempts between
    ev(61000, 'item_result', { itemId: 'a', lessonId: 'L1', solo: false, firstTry: false, correct: true }),
    ev(62000, 'item_result', { itemId: 'b', lessonId: 'L1', solo: false, firstTry: true, correct: true }),
    ev(63000, 'walkthrough', { itemId: 'b' }),
    ev(64000, 'item_result', { itemId: 'c', lessonId: 'L1', solo: true, role: 'memory', firstTry: true, conf: 5, memory: { stageBefore: 2 } }),
    ev(65000, 'item_result', { itemId: 'd', lessonId: 'L1', solo: true, role: 'memory', firstTry: false, conf: 5, memory: { stageBefore: 1 } }),
  ];
  const f = helpSeekingFeatures('L-A', events);
  assert.equal(f.requests, 2);
  assert.equal(f.practiceItems, 2);
  assert.equal(f.helpRate, 1);
  assert.equal(f.rapidShare, 0.5);
  assert.equal(f.repeatShare, 0.5);
  assert.equal(f.specificShare, 0.5);
  assert.equal(f.attemptsBetween, 2);
  assert.equal(f.walkthroughRate, 0.5);
  assert.equal(f.priorPerformance, 0.5);
  assert.equal(f.weekRate, 1);
  assert.equal(f.nextDayRate, 0);
  assert.equal(f.calibrationBias, 0.5, 'confidence 5 (1.0) on a pass and a miss: mean (0 + 1) / 2');
  assert.equal(f.pattern, 'asks after trying', 'two requests are not enough to call a pattern rapid and repeated');

  const rep = helpSeekingReport([
    { ...f, learner: 'a', helpRate: 0.1, weekRate: 0.9 }, { ...f, learner: 'b', helpRate: 0.5, weekRate: 0.5 }, { ...f, learner: 'c', helpRate: 0.9, weekRate: 0.1 },
  ]);
  assert.equal(rep.correlations.helpRate.weekRate.r, -1, 'perfectly negative relation is found');
  assert.equal(rep.byPattern['asks after trying'].learners, 3);
});

test('RQ3: learning episodes collect short-term signals and the delayed outcomes per lesson', () => {
  const events = [
    ev(0, 'session_start', { kind: 'lesson', lesson: 'L1' }),
    ev(1, 'help_decision', { sessionId: S, lessonId: 'L1', itemId: 'a', arm: 'worked' }),
    ev(2, 'item_result', { lessonId: 'L1', itemId: 'a', solo: false, firstTry: false, correct: true }),
    ev(3, 'item_result', { lessonId: 'L1', itemId: 'h', solo: true, role: 'helpcheck', firstTry: true }),
    ev(4, 'item_result', { lessonId: 'L1', itemId: 'b', solo: false, firstTry: true, correct: true }),
    ev(5, 'item_result', { lessonId: 'L1', itemId: 'f', solo: true, role: 'final', firstTry: true, conf: 4 }),
    { t: 100, type: 'item_result', session: 's2', lessonId: 'L1', itemId: 'm1', solo: true, role: 'memory', firstTry: true, memory: { stageBefore: 1 } },
    { t: 200, type: 'item_result', session: 's3', lessonId: 'L1', itemId: 'm2', solo: true, role: 'memory', firstTry: false, memory: { stageBefore: 2 } },
    { t: 300, type: 'item_result', session: 's4', lessonId: 'L1', itemId: 'm3', solo: true, role: 'memory', firstTry: true, memory: { stageBefore: 1 } },
  ];
  const [e] = learningEpisodes('L-A', events, 'adaptive');
  assert.deepEqual(e, {
    learner: 'L-A', cond: 'adaptive', lessonId: 'L1', immediateSuccess: 1, firstTryRate: 0.5, helpRequests: 1, helpSpecificity: 2,
    checkAfterHelp: 1, lessonCheck: 1, confidenceGap: 0.25, nextDay: 1, week: 0,
  });
});

test('RQ3: AUC and the proxy report rank signals by how well they predict the week check', () => {
  assert.equal(auc([{ s: 1, y: 1 }, { s: 0, y: 0 }], 's', 'y'), 1);
  assert.equal(auc([{ s: 0, y: 1 }, { s: 1, y: 0 }], 's', 'y'), 0);
  assert.equal(auc([{ s: 1, y: 1 }, { s: 1, y: 0 }], 's', 'y'), 0.5);
  assert.equal(auc([{ s: 1, y: 1 }], 's', 'y'), null);
  const episodes = [
    { immediateSuccess: 1, checkAfterHelp: 1, helpRequests: 0, week: 1 },
    { immediateSuccess: 1, checkAfterHelp: 0, helpRequests: 3, week: 0 },
    { immediateSuccess: 1, checkAfterHelp: 1, helpRequests: 1, week: 1 },
    { immediateSuccess: 0.5, checkAfterHelp: 0, helpRequests: 2, week: 0 },
  ];
  const r = proxyReport(episodes);
  const by = Object.fromEntries(r.signals.map((s) => [s.key, s.auc]));
  assert.equal(r.episodes, 4);
  assert.equal(by.checkAfterHelp, 1);
  assert.equal(by.helpRequests, 1, 'fewer requests predicting a pass gives AUC 1 after the sign flip');
  assert.equal(by.immediateSuccess, 0.75);
});

test('RQ2: inverse-probability-weighted contrasts recover a known difference', () => {
  const arms = ['hint', 'explain', 'worked'];
  const probs = { hint: 1 / 3, explain: 1 / 3, worked: 1 / 3 };
  const decisions = arms.map((arm) => ({ arm, arms, probs, pk: 'low', proximal: arm === 'explain' ? 1 : 0 }));
  const x = excursions(decisions);
  assert.equal(x.overall['explain vs hint'].effect, 1);
  assert.equal(x.overall['worked vs hint'].effect, 0);
  assert.equal(x.byPriorKnowledge.low['explain vs worked'].effect, 1);
  assert.equal(x.byPriorKnowledge.high['explain vs worked'].n, 0);
  assert.equal(excursions(decisions.map((d) => ({ ...d, policy: 'fixed-ladder' }))).decisions, 0, 'fixed-ladder decisions are not randomised');
});

/** Simulated randomised data with a known truth: worked examples help low prior knowledge, hints help high. */
function simulate(learners, perLearner, seed) {
  const rng = makeRng(seed);
  const truth = { low: { hint: 0.3, explain: 0.5, worked: 0.7 }, mid: { hint: 0.5, explain: 0.6, worked: 0.5 }, high: { hint: 0.8, explain: 0.7, worked: 0.5 } };
  const pks = ['low', 'mid', 'high'];
  const arms = ['hint', 'explain', 'worked'];
  const probs = { hint: 0.2, explain: 0.3, worked: 0.5 };
  const decisions = [];
  const prior = {};
  for (let l = 0; l < learners; l++) {
    const learner = `L${l}`;
    const pkBias = l % 3;
    prior[learner] = pkBias / 2 + rng() * 0.1;
    for (let i = 0; i < perLearner; i++) {
      const pk = pks[(pkBias + (rng() < 0.3 ? 1 : 0)) % 3];
      const u = rng();
      const arm = u < 0.2 ? 'hint' : u < 0.5 ? 'explain' : 'worked';
      decisions.push({ learner, t: l * 1e6 + i, sessionId: `${learner}-s${Math.floor(i / 5)}`, itemId: `i${i}`, pk, arms, probs, arm, policy: 'thompson-floor-1', proximal: rng() < truth[pk][arm] ? 1 : 0 });
    }
  }
  return { decisions, prior, truth };
}

test('RQ4: the doubly robust estimator recovers the true value of the fixed tutor', () => {
  const { decisions, truth } = simulate(90, 40, 5);
  const q = fitOutcomeModel(decisions, 'proximal');
  const est = drValue(decisions, fixedLadder, q, 'proximal');
  const share = (pk) => decisions.filter((d) => d.pk === pk).length / decisions.length;
  const trueFixed = ['low', 'mid', 'high'].reduce((s, pk) => s + share(pk) * truth[pk].hint, 0);
  assert.ok(Math.abs(est - trueFixed) < 0.03, `DR estimate ${est.toFixed(3)} is close to the truth ${trueFixed.toFixed(3)}`);
  const wrongModel = () => 0.5;
  const est2 = drValue(decisions, fixedLadder, wrongModel, 'proximal');
  assert.ok(Math.abs(est2 - trueFixed) < 0.04, 'still close with a wrong outcome model, because the propensities are known');
});

test('RQ4: policy evaluation with a fairness check on the lowest tertile', () => {
  const { decisions, prior } = simulate(60, 30, 9);
  const pe = policyEvaluation(decisions, prior, { boot: 200, seed: 3 });
  assert.equal(pe.learners, 60);
  assert.equal(pe.lowestTertileLearners, 20);
  assert.ok(pe.all.learned > pe.all.fixed, 'the learned context-aware policy beats the fixed hint-first tutor');
  assert.ok(pe.lowestTertile.difference > 0.15, 'the gain is largest for low prior knowledge, where hints are weakest');
  assert.ok(pe.lowestTertile.ci95[0] <= pe.lowestTertile.difference && pe.lowestTertile.difference <= pe.lowestTertile.ci95[1]);
  assert.equal(pe.nonInferiorForLowest, true);
  const empty = policyEvaluation([], {}, { boot: 10 });
  assert.equal(empty.all.fixed, null);
  assert.equal(empty.nonInferiorForLowest, null);
});

test('Paper III secondary outcomes: carry-over and later requests', () => {
  const base = { learner: 'A', sessionId: 's', arms: ['hint', 'worked'] };
  const ds = [
    { ...base, t: 0, itemId: 'a', arm: 'hint', proximal: 1 },
    { ...base, t: 60000, itemId: 'b', arm: 'worked', proximal: 0 },
    { ...base, t: 120000, itemId: 'c', arm: 'worked', proximal: 1 },
    { ...base, t: 99999999, itemId: 'd', arm: 'hint', proximal: 1 },
  ];
  assert.deepEqual(carryOver(ds), {
    'hint then worked': { n: 1, rate: 0 }, 'worked then hint': { n: 1, rate: 1 }, 'worked then worked': { n: 1, rate: 1 },
  });
  const lr = laterRequests(ds);
  assert.equal(lr.hint.meanLaterRequests, 1, 'the first hint is followed by two requests within 30 minutes; the late one by none');
  assert.equal(lr.worked.meanLaterRequests, 0.5);
});

test('the pooled pipeline produces every research-question section', () => {
  const { decisions } = simulate(9, 12, 4);
  const exportsList = [...new Set(decisions.map((d) => d.learner))].map((learner) => ({
    learner, study: { id: 'S', pid: learner, cond: 'adaptive' }, dataVersion: 2, decisions: decisions.filter((d) => d.learner === learner),
    events: [{ t: 0, type: 'item_result', session: 'x', lessonId: 'L1', itemId: 'p', solo: false, firstTry: learner.endsWith('1') }],
  }));
  const data = pool(exportsList);
  assert.equal(data.learners.length, 9);
  const rq = researchQuestions(data, { boot: 50 });
  assert.ok(rq.helpSeeking && rq.excursions.proximal && rq.proxy && rq.policy.week && rq.carryOver && rq.laterRequests);
  const md = researchQuestionsMarkdown(rq);
  for (const h of ['## RQ1', '## RQ2', '## RQ3', '## RQ4', 'Paper III secondary outcomes']) assert.ok(md.includes(h), h);
});

// ---------------------------------------------------------------- unit tests (pre, post, delayed)
import { COURSES } from '../content/index.js';
import u1 from '../content/python/u1-first-steps.js';
import { normalizeCourse } from '../js/engine/content.js';
import { newState } from '../js/engine/state.js';
import { current, recordItem, advance, startLesson, needsConfidence } from '../js/engine/tutor.js';
import { daysLater } from '../js/engine/mastery.js';
import { testItem, testStatus, startUnitTest, learningGain, dueDelayedTests, skipPreTest, TEST_KINDS } from '../js/engine/unit-tests.js';
import { checkRows } from '../js/export.js';

test('unit tests: pre, post and delayed use different counterbalanced items and are scheduled correctly', () => {
  const course = normalizeCourse(COURSES.find((c) => c.id === 'python'), { units: [u1] });
  const unit = course.units[0];
  const lesson = unit.lessons[0];
  const ids = TEST_KINDS.map((k) => testItem('L-AAAAAA', lesson, k).id);
  assert.equal(new Set(ids).size, 3, 'three different items for the three tests');
  const offsets = new Set(['L-AAAAAA', 'L-BBBBBB', 'L-CCCCCC', 'L-DDDDDD', 'L-EEEEEE', 'L-FFFFFF'].map((c) => testItem(c, lesson, 'pre').id));
  assert.ok(offsets.size >= 2, 'different learners start at different items');

  const T = new Date(2026, 10, 2, 10).getTime();
  const state = newState({ id: 'p', code: 'L-AAAAAA' });
  state.onboarded = true;
  assert.equal(testStatus(state, unit, T).next, 'pre');
  const events = [];
  const log = (type, data) => events.push({ t: T, type, ...data });
  const run = (session, now, answer) => {
    const ctx = { session, state, course, now, catalog: [course], findLesson: (id) => course.byId[id], rng: makeRng(1), log };
    for (let e = current(session, ctx); e && e.type !== 'summary'; e = current(session, ctx)) {
      assert.equal(needsConfidence(e, state.settings), true, 'confidence is rated before every test question');
      recordItem({ session, state, outcome: { firstTry: answer(e), correct: answer(e), attempts: 1, helps: [], conf: 3, ms: 1000 }, now, log });
      advance(ctx);
    }
    return session;
  };
  const pre = run(startUnitTest({ state, course, unit, kind: 'pre', now: T, log }), T, () => false);
  assert.equal(pre.done, true);
  assert.equal(state.tests[unit.id].pre.total, unit.lessons.length);
  assert.equal(state.tests[unit.id].pre.right, 0);
  assert.equal(pre.results.every((r) => r.xp === 2), true, 'the same small XP for right and wrong answers');
  assert.equal(state.concepts[lesson.id].stage, 0, 'a test does not count as learning the lesson or as a memory check');
  assert.equal(testStatus(state, unit, T).next, null, 'no lesson is done yet, so no post-test');

  for (const l of unit.lessons) state.lessons[l.id] = { done: T, runs: 1 };
  assert.equal(testStatus(state, unit, T).next, 'post');
  run(startUnitTest({ state, course, unit, kind: 'post', now: T, log }), T, () => true);
  const s1 = testStatus(state, unit, T + 3600000);
  assert.deepEqual([s1.next, s1.due], ['delayed', false]);
  assert.equal(dueDelayedTests(state, [course], daysLater(T, 6)).length, 0);
  assert.equal(dueDelayedTests(state, [course], daysLater(T, 7)).length, 1, 'the delayed test opens one week after the post-test');
  run(startUnitTest({ state, course, unit, kind: 'delayed', now: daysLater(T, 7), log }), daysLater(T, 7), (e) => e.lessonId !== lesson.id);
  const g = learningGain(state.tests[unit.id]);
  assert.deepEqual([g.pre, g.post, g.normalisedGain], [0, 1, 1]);
  assert.equal(g.delayed, (unit.lessons.length - 1) / unit.lessons.length);
  assert.equal(testStatus(state, unit, daysLater(T, 8)).next, null);

  const rows = checkRows({ profile: { code: 'L-AAAAAA' }, study: null }, events);
  assert.deepEqual([...new Set(rows.map((r) => r.role))].sort(), ['test-delayed', 'test-post', 'test-pre'], 'test answers are in the unaided-checks export');

  const st2 = newState({ id: 'q', code: 'L-B' });
  skipPreTest(st2, unit, T);
  assert.equal(testStatus(st2, unit, T).next, null, 'a skipped pre-test is not offered again');
  const st3 = newState({ id: 'r', code: 'L-C' });
  st3.lessons[unit.lessons[0].id] = { done: T, runs: 1 };
  assert.equal(testStatus(st3, unit, T).next, null, 'once a lesson is done a pre-test would not be a pre-test');
});

test('learning gains per condition from unit test scores', async () => {
  const { learningGains } = await import('../tools/research-questions.mjs');
  const g = learningGains([
    { learner: 'A', cond: 'adaptive', pre: 0.25, post: 0.75, delayed: 0.5 },
    { learner: 'B', cond: 'adaptive', pre: 0.5, post: 1, delayed: null },
    { learner: 'C', cond: 'fixed', pre: null, post: 0.5, delayed: 0.5 },
  ]);
  assert.equal(g.adaptive.gain, 0.5);
  assert.equal(g.adaptive.normalisedGain, Math.round(((0.5 / 0.75) + 1) / 2 * 1000) / 1000);
  assert.equal(g.adaptive.kept, Math.round((0.5 / 0.75) * 1000) / 1000);
  assert.equal(g.fixed.pairedUnits, 0);
  assert.equal(g.fixed.kept, 1);
});

test('pooling keeps the latest export of a learner', () => {
  const older = { learner: 'L-1', exportedAt: '2026-11-01T10:00:00Z', decisions: [{ id: 'd1', arm: 'hint', week: null }], events: [] };
  const newer = { learner: 'L-1', exportedAt: '2026-11-08T10:00:00Z', decisions: [{ id: 'd1', arm: 'hint', week: 1 }], events: [{ t: 1, type: 'x' }] };
  const data = pool([older, newer]);
  assert.equal(data.decisions.length, 1);
  assert.equal(data.decisions[0].week, 1, 'the one-week outcome from the later file is kept');
  assert.deepEqual(data.duplicates, ['L-1']);
});
