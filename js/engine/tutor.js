/**
 * The tutor: builds sessions, records what the learner does, and adapts.
 *
 * A session is a queue of entries:
 *   { type: 'teach' | 'trace', step }                 a card to read
 *   { type: 'item', item, lessonId, role, solo }      a question
 *   { type: 'summary' }                               the end
 *
 * Roles of items:
 *   practice   a lesson step; help is available after a first attempt
 *   helpcheck  an unaided check right after an item that needed help (the proximal outcome)
 *   retry      an unaided check on an idea the learner just missed
 *   final      the unaided check that ends every lesson
 *   warmup     a memory check on an earlier lesson, at the start of a lesson
 *   memory     a memory check in a review session (next day, one week, then wider)
 *   extra      free practice on a weak idea
 *   placement  a placement question
 *   test-pre, test-post, test-delayed   unit test questions (js/engine/unit-tests.js)
 *
 * Solo items have no help and one attempt. They are the evidence the mastery model and the help
 * policy learn from, because only unaided performance shows what was learned.
 */
import { isItem, isBuildItem } from './content.js';
import {
  getConcept, updateMastery, guessProb, markLearned, applyMemoryCheck, pickPoolItem,
  dueConcepts, strength, daysLater, daysBetween, startOfDay, checkGapDays, isDue,
} from './mastery.js';
import { priorKnowledge, contextKey, availableArms, chooseHelp, updateBandit, HELP_COST } from './help-policy.js';
import { XP, addXp, checkBadges } from './rewards.js';
import { calibration } from './calibration.js';
import { isTestRole, saveTestResult } from './unit-tests.js';

export const MAX_INSERTED = 2;
export const MAX_SKIPS = 2;
const PLACEMENT_PASS = 0.75;

let counter = 0;
const uid = (prefix, now) => `${prefix}${Math.floor(now).toString(36)}${(counter++).toString(36)}`;
const checkEntry = (lessonId, role, extra) => ({ type: 'item', item: null, lessonId, role, solo: true, ...extra });

function baseSession(type, now, extra) {
  return {
    id: uid('s', now), type, startedAt: now, endedAt: null, queue: [], pos: 0,
    xp: 0, results: [], inserted: 0, skipped: 0, clean: 0, notes: [], done: false, outcome: null, ...extra,
  };
}

// ---------------------------------------------------------------- starting sessions

export function startLesson({ state, course, lesson, now, log }) {
  const s = baseSession('lesson', now, { courseId: course.id, lessonId: lesson.id });
  const others = course.lessons.map((l) => l.id).filter((id) => id !== lesson.id);
  for (const id of dueConcepts(state, now, others).slice(0, 2)) s.queue.push(checkEntry(id, 'warmup'));
  for (const step of lesson.steps) {
    s.queue.push(isItem(step)
      ? { type: 'item', item: step, lessonId: lesson.id, role: 'practice', solo: false }
      : { type: step.kind, step, lessonId: lesson.id });
  }
  if (lesson.pool.length) s.queue.push(checkEntry(lesson.id, 'final'));
  s.queue.push({ type: 'summary' });
  if (log) log('session_start', { session: s.id, kind: 'lesson', lesson: lesson.id, course: course.id });
  return s;
}

/** Memory checks for every concept that is due, across the loaded courses. */
export function startReview({ state, lessonIds, now, max = 8, log }) {
  const s = baseSession('review', now, {});
  for (const id of dueConcepts(state, now, lessonIds).slice(0, max)) s.queue.push(checkEntry(id, 'memory'));
  s.queue.push({ type: 'summary' });
  if (log) log('session_start', { session: s.id, kind: 'review', due: s.queue.length - 1 });
  return s;
}

/**
 * Free practice on the weakest learned ideas. It trains, but does not move the memory-check dates. Ideas with a
 * memory check due (and any in `exclude`, such as lessons whose one-week unit test is due) are left out, so the
 * unaided checks are not practised with feedback just before they are taken.
 */
export function startPractice({ state, lessonIds, now, max = 6, log, exclude = [] }) {
  const s = baseSession('practice', now, {});
  const skip = new Set(exclude);
  const learned = lessonIds.filter((id) => state.concepts[id] && state.concepts[id].stage >= 1 && !isDue(state.concepts[id], now) && !skip.has(id));
  learned.sort((a, b) => strength(state.concepts[a], now) - strength(state.concepts[b], now));
  for (const id of learned.slice(0, max)) s.queue.push(checkEntry(id, 'extra'));
  s.queue.push({ type: 'summary' });
  if (log) log('session_start', { session: s.id, kind: 'practice' });
  return s;
}

function pushPlacementUnit(session, course, idx) {
  for (const l of course.units[idx].lessons) if (l.pool.length) session.queue.push(checkEntry(l.id, 'placement', { unitIdx: idx }));
}

/** A placement check: one question per lesson, unit by unit, until a unit is not passed. */
export function startPlacement({ course, now, log }) {
  const s = baseSession('placement', now, { courseId: course.id, unitIdx: 0, unitScores: [], passedUnits: 0 });
  pushPlacementUnit(s, course, 0);
  if (!s.queue.length) s.queue.push({ type: 'summary' });
  if (log) log('session_start', { session: s.id, kind: 'placement', course: course.id });
  return s;
}

// ---------------------------------------------------------------- reading the queue

/** The entry the learner is on. Check items are chosen from the pool only when they come up. */
export function current(session, { state, findLesson, now, rng }) {
  for (;;) {
    const e = session.queue[session.pos];
    if (!e || e.type !== 'item' || e.item) return e || null;
    const lesson = findLesson(e.lessonId);
    const concept = getConcept(state, e.lessonId);
    const usedHere = session.queue.filter((q) => q.item && q.lessonId === e.lessonId).map((q) => q.item.id);
    e.item = lesson ? (pickPoolItem(lesson, concept, rng, now, usedHere) || pickPoolItem(lesson, concept, rng, now)) : null;
    if (e.item) return e;
    session.queue.splice(session.pos, 1);
  }
}

/** Should the learner rate their confidence before this entry? */
export function needsConfidence(entry, settings) {
  if (!entry || entry.type !== 'item' || entry.role === 'placement' || settings.confidence === 'off') return false;
  return settings.confidence === 'all' || entry.solo;
}

export function progress(session) {
  const total = session.queue.filter((e) => e.type !== 'summary').length;
  return { done: Math.min(session.pos, total), total };
}

// ---------------------------------------------------------------- help

/**
 * The learner asks for help on a practice item. The policy picks the kind of help.
 * item: { fails, hintsUsed, workedUsed, helps } for the current item.
 * Returns { decision, hint, worked } or null when no help is left.
 */
export function requestHelp({ session, state, lesson, entry, item, now, rng, log, shift = 0 }) {
  const settings = state.settings;
  const concept = getConcept(state, lesson.id);
  const arms = availableArms(entry.item, lesson, { hints: item.hintsUsed, worked: item.workedUsed }, settings.allow);
  if (!arms.length) return null;
  const pk = priorKnowledge(concept.pL);
  const key = contextKey(pk, item.fails);
  const choice = chooseHelp({ mode: settings.helpMode, arms, bandit: state.bandit, key, floor: settings.floor, costWeight: settings.costWeight, rng });
  const decision = {
    id: uid('d', now), t: now, sessionId: session.id, lessonId: lesson.id, itemId: entry.item.id,
    key, pk, errors: item.fails, helpsBefore: item.helps.length, pL: Math.round(concept.pL * 1000) / 1000,
    arms, probs: choice.probs, arm: choice.arm, policy: choice.policy, cost: HELP_COST[choice.arm],
    // Everything needed to recompute the probabilities and the draw (off-policy evaluation, audits).
    floor: settings.floor, costWeight: settings.costWeight, posterior: choice.posterior || null, u: choice.u ?? null,
    cond: state.study ? state.study.cond : null, shift: shift || 0, allow: { ...settings.allow },
    proximal: null, nextDay: null, week: null,
  };
  state.decisions.push(decision);
  // Keep the latest 1000 decisions, but never drop one that is still waiting for its one-week outcome.
  if (state.decisions.length > 1000) {
    const extra = state.decisions.length - 1000;
    let removed = 0;
    state.decisions = state.decisions.filter((d) => {
      if (removed >= extra) return true;
      const open = d.proximal === null || d.nextDay === null || d.week === null;
      if (open && d.t > now - 60 * 86400000) return true;
      removed++;
      return false;
    });
  }
  state.counters.helps[choice.arm]++;
  if (log) log('help_decision', { ...decision, session: decision.sessionId });
  return {
    decision,
    hint: choice.arm === 'worked' ? null : entry.item.hints[item.hintsUsed],
    worked: choice.arm === 'worked' ? lesson.worked : null,
  };
}

// ---------------------------------------------------------------- recording results

/**
 * Record the result of the current item and adapt the rest of the session.
 * outcome: { firstTry, correct, attempts, helps: [kinds], walkthrough, skipped, conf, ms }
 */
export function recordItem({ session, state, outcome, now, log }) {
  const entry = session.queue[session.pos];
  const item = entry.item;
  const concept = getConcept(state, entry.lessonId);
  const helps = outcome.helps || [];
  const helped = helps.length > 0 || !!outcome.walkthrough;
  const res = {
    itemId: item.id, lessonId: entry.lessonId, kind: item.kind, role: entry.role, solo: entry.solo,
    firstTry: !!outcome.firstTry, correct: !!outcome.correct, attempts: outcome.attempts || 0,
    helps: [...helps], walkthrough: !!outcome.walkthrough, skipped: !!outcome.skipped,
    conf: outcome.conf || null, ms: outcome.ms || 0, xp: 0, memory: null, unitIdx: entry.unitIdx,
  };
  const c = state.counters;

  if (res.attempts > 0) {
    concept.pL = updateMastery(concept.pL, { correct: res.firstTry, guess: guessProb(item), assisted: helped });
    c.items++;
    if (res.firstTry && !helped) c.firstTry++;
    if (!res.firstTry && res.correct && !helped && !entry.solo) c.comeback++;
  }

  if (entry.solo) {
    const stageBefore = concept.stage;
    const gap = checkGapDays(concept, now);
    const ok = res.firstTry ? 1 : 0;
    const isMemory = entry.role === 'memory' || entry.role === 'warmup';
    const isTest = isTestRole(entry.role);
    if (entry.role === 'placement') res.xp = 0;
    else if (isTest) res.xp = XP.checkTried;          // the same for right and wrong: tests give no feedback
    else if (!res.firstTry) res.xp = XP.checkTried;
    else if (isMemory) res.xp = stageBefore >= 2 ? XP.memoryWeek : XP.memoryNextDay;
    else res.xp = XP.soloCheck;

    if (isTest) {
      concept.checks.push({ t: now, ok: res.firstTry, conf: res.conf, role: entry.role, gap, stage: stageBefore, afterHelp: false });
      if (concept.checks.length > 40) concept.checks.splice(0, concept.checks.length - 40);
    }
    if (entry.role !== 'placement' && !isTest) {
      // Proximal outcome: the first unaided check after help, in the same session.
      for (const d of state.decisions) {
        if (d.lessonId === entry.lessonId && d.sessionId === session.id && d.proximal === null) {
          d.proximal = ok;
          d.proximalRole = entry.role;      // 'helpcheck' is the intended check; 'final' or 'retry' came later
          d.proximalItemId = item.id;
          d.proximalAt = now;
          updateBandit(state.bandit, d.key, d.arm, ok, 1);
          if (log) log('help_outcome', { decision: d.id, kind: 'proximal', value: ok, role: entry.role, itemId: item.id, lessonId: d.lessonId, arm: d.arm, sinceMs: now - d.t });
        }
      }
      // Delayed outcomes: the next-day check and the main one-week check.
      if (isMemory) {
        const today = startOfDay(now);
        for (const d of state.decisions) {
          if (d.lessonId !== entry.lessonId || d.t >= today) continue;
          const gapDays = daysBetween(d.t, now);
          if (stageBefore === 1 && d.nextDay === null) {
            d.nextDay = ok; d.nextDayGap = gapDays;
            updateBandit(state.bandit, d.key, d.arm, ok, 0.5);
            if (log) log('help_outcome', { decision: d.id, kind: 'nextDay', value: ok, role: entry.role, itemId: item.id, lessonId: d.lessonId, arm: d.arm, gapDays });
          } else if (stageBefore === 2 && d.week === null) {
            d.week = ok; d.weekGap = gapDays;
            updateBandit(state.bandit, d.key, d.arm, ok, 1);
            if (log) log('help_outcome', { decision: d.id, kind: 'week', value: ok, role: entry.role, itemId: item.id, lessonId: d.lessonId, arm: d.arm, gapDays });
          }
        }
        res.memory = { ...applyMemoryCheck(concept, res.firstTry, now), stageBefore };
      }
      const afterHelp = session.results.some((r) => r.lessonId === entry.lessonId && (r.helps.length || r.walkthrough));
      concept.checks.push({ t: now, ok: res.firstTry, conf: res.conf, role: entry.role, gap, stage: stageBefore, afterHelp });
      if (concept.checks.length > 40) concept.checks.splice(0, concept.checks.length - 40);
    }
  } else if (res.skipped && !res.correct) res.xp = 0;
  else if (res.walkthrough) res.xp = XP.walkthrough;
  else if (helps.length) res.xp = XP.helped;
  else res.xp = res.firstTry ? XP.firstTry : XP.retry;

  if (!entry.solo && isBuildItem(item)) {
    state.recentItems.push({ t: now, helps: helps.length });
    if (state.recentItems.length > 12) state.recentItems.shift();
  }

  // Adapt the rest of a lesson.
  if (session.type === 'lesson' && !entry.solo) {
    const finalAt = session.queue.findIndex((e) => e.role === 'final');
    const limit = finalAt >= 0 ? finalAt : session.queue.length - 1;
    if (helps.length && session.inserted < MAX_INSERTED) {
      session.queue.splice(session.pos + 1, 0, checkEntry(entry.lessonId, 'helpcheck'));
      session.inserted++;
    } else if (!helps.length && !res.firstTry && res.attempts > 0 && session.inserted < MAX_INSERTED) {
      session.queue.splice(Math.min(session.pos + 3, limit), 0, checkEntry(entry.lessonId, 'retry'));
      session.inserted++;
    }
    session.clean = res.firstTry && !helped ? session.clean + 1 : 0;
  }

  addXp(state, res.xp, now);
  session.xp += res.xp;
  session.results.push(res);
  if (log) log('item_result', { session: session.id, ...res, pL: Math.round(concept.pL * 1000) / 1000, stage: concept.stage });
  return res;
}

/** Fast track: after three clean answers in a row, skip an easier practice item that a later one covers. */
function shouldSkip(session) {
  const e = session.queue[session.pos];
  if (!e || e.type !== 'item' || e.solo || e.role !== 'practice') return false;
  if (session.type !== 'lesson' || session.clean < 3 || session.skipped >= MAX_SKIPS) return false;
  if (e.item.level >= 3) return false;
  return session.queue.slice(session.pos + 1).some((q) => q.type === 'item' && q.role === 'practice' && q.item.level >= e.item.level);
}

function finish({ session, state, now, catalog, log }) {
  session.done = true;
  session.endedAt = now;
  const out = { firstTime: false, lessonXp: 0, badges: [] };
  if (session.type === 'lesson') {
    const rec = state.lessons[session.lessonId] || (state.lessons[session.lessonId] = { done: null, runs: 0 });
    out.firstTime = !rec.done;
    if (!rec.done) rec.done = now;
    rec.runs = (rec.runs || 0) + 1;
    markLearned(getConcept(state, session.lessonId), now);
    out.lessonXp = out.firstTime ? XP.lessonDone : XP.lessonAgain;
    addXp(state, out.lessonXp, now);
    session.xp += out.lessonXp;
  }
  if (session.type === 'test') out.test = saveTestResult(state, session, now);
  out.badges = checkBadges(state, now, catalog || []);
  session.outcome = out;
  if (log) log('session_end', { session: session.id, kind: session.type, xp: session.xp, items: session.results.length, ms: now - session.startedAt });
}

function closePlacement({ session, state, course, now, catalog, log }) {
  state.placement[course.id] = { t: now, units: session.passedUnits };
  session.queue.push({ type: 'summary' });
  finish({ session, state, now, catalog, log });
}

function advancePlacement(ctx) {
  const { session, state, course, now } = ctx;
  if (session.queue[session.pos]) return;
  const idx = session.unitIdx;
  const unit = course.units[idx];
  const rs = session.results.filter((r) => r.unitIdx === idx);
  const right = rs.filter((r) => r.firstTry).length;
  const passed = rs.length > 0 && right >= Math.ceil(rs.length * PLACEMENT_PASS);
  session.unitScores.push({ unitId: unit.id, title: unit.title, right, total: rs.length, passed });
  if (passed) {
    for (const l of unit.lessons) {
      const r = rs.find((x) => x.lessonId === l.id);
      const concept = getConcept(state, l.id);
      concept.pL = Math.max(concept.pL, r && r.firstTry ? 0.85 : 0.55);
      concept.stage = Math.max(concept.stage, 1);
      concept.best = Math.max(concept.best, 1);
      concept.learned = concept.learned || now;
      concept.last = now;
      concept.lastCheck = now;
      concept.due = daysLater(now, 7);
      if (!(state.lessons[l.id] && state.lessons[l.id].done)) state.lessons[l.id] = { done: now, runs: 0, testedOut: true };
    }
    session.passedUnits++;
    const next = course.units[idx + 1];
    if (next && next.lessons.length) {
      session.unitIdx = idx + 1;
      pushPlacementUnit(session, course, idx + 1);
      if (session.queue[session.pos]) return;
    }
  }
  closePlacement(ctx);
}

/** Stop a placement check early: the unit in progress does not count as passed. */
export function stopPlacement(ctx) {
  const { session } = ctx;
  if (session.type !== 'placement' || session.done) return;
  session.queue.length = session.pos;
  closePlacement(ctx);
}

/** Close a session whose only remaining entry is the summary (for example a review with nothing due). */
export function ensureFinished(ctx) {
  const { session } = ctx;
  const e = session.queue[session.pos];
  if (!session.done && (!e || e.type === 'summary')) {
    if (!e) session.queue.push({ type: 'summary' });
    finish(ctx);
  }
}

/**
 * Move to the next entry. Applies the fast track, runs the placement logic,
 * and closes the session when the summary is reached.
 * ctx: { session, state, course, now, catalog, log }
 */
export function advance(ctx) {
  const { session } = ctx;
  session.pos++;
  if (session.type === 'placement') { advancePlacement(ctx); return session.queue[session.pos] || null; }
  while (shouldSkip(session)) {
    const [gone] = session.queue.splice(session.pos, 1);
    session.skipped++;
    session.clean = 2;
    session.notes.push({ type: 'skipped', itemId: gone.item.id });
  }
  const e = session.queue[session.pos];
  if (e && e.type === 'summary' && !session.done) finish(ctx);
  return e || null;
}

// ---------------------------------------------------------------- summaries and progress

export function summarize(session) {
  const practice = session.results.filter((r) => !r.solo);
  const checks = session.results.filter((r) => r.solo);
  const helps = { hint: 0, explain: 0, worked: 0, walkthrough: 0 };
  for (const r of practice) {
    for (const h of r.helps) helps[h]++;
    if (r.walkthrough) helps.walkthrough++;
  }
  return {
    xp: session.xp,
    minutes: Math.max(1, Math.round(((session.endedAt || session.startedAt) - session.startedAt) / 60000)),
    practice: { total: practice.length, clean: practice.filter((r) => r.firstTry && !r.helps.length && !r.walkthrough).length },
    checks: { total: checks.length, right: checks.filter((r) => r.firstTry).length },
    memory: checks.filter((r) => r.memory).map((r) => ({ lessonId: r.lessonId, ok: r.firstTry, ...r.memory })),
    helps,
    helpTotal: helps.hint + helps.explain + helps.worked + helps.walkthrough,
    calibration: calibration(checks.map((r) => ({ conf: r.conf, ok: r.firstTry }))),
    skipped: session.skipped,
    inserted: session.inserted,
  };
}

export const isDone = (state, lessonId) => !!(state.lessons[lessonId] && state.lessons[lessonId].done);

/** 'done', 'open' or 'locked'. A lesson opens when the one before it is done. */
export function lessonStatus(state, course, lesson) {
  if (isDone(state, lesson.id)) return 'done';
  if (lesson.index === 0) return 'open';
  return isDone(state, course.lessons[lesson.index - 1].id) ? 'open' : 'locked';
}

/** The first lesson of the course that is not done yet, or null when the course is finished. */
export function nextLesson(state, course) {
  return course.lessons.find((l) => !isDone(state, l.id)) || null;
}

export function courseProgress(state, course) {
  const done = course.lessons.filter((l) => isDone(state, l.id)).length;
  return { done, total: course.lessons.length, ratio: course.lessons.length ? done / course.lessons.length : 0 };
}
