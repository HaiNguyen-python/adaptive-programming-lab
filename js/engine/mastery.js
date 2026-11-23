/**
 * What the learner knows, and when to check it again.
 *
 * Mastery is estimated per concept (one concept per lesson) with Bayesian knowledge tracing.
 * Only unaided first attempts count as evidence: finishing an item with help says little about
 * what the learner can do alone, which is the point of the research this app follows.
 *
 * Memory checks follow the research design: a check the next day and the main delayed check
 * one week later, then wider intervals to keep the concept alive.
 */

const DAY = 86400000;

export const BKT = { init: 0.15, learn: 0.18, learnAssisted: 0.08, slip: 0.1 };

/** Days until the next memory check, by stage. Stage 1 = lesson learned, 2 = next-day check passed, 3 = one-week check passed. */
export const INTERVALS = [0, 1, 7, 21, 60, 120];
export const MAX_STAGE = INTERVALS.length - 1;

export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

/** Local calendar day as YYYY-MM-DD. */
export function dayKey(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function startOfDay(ts) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Start of the local day that is n days after ts. A check due "tomorrow" opens at midnight. */
export function daysLater(ts, n) {
  const d = new Date(startOfDay(ts));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/** Whole calendar days from a to b. */
export function daysBetween(a, b) {
  return Math.round((startOfDay(b) - startOfDay(a)) / DAY);
}

/** Chance of getting an item right without knowing the concept. */
export function guessProb(item) {
  switch (item.kind) {
    case 'mcq': return 1 / Math.max(2, item.options.length);
    case 'predict': return item.mode === 'choose' ? 1 / (item.options.length + 1) : 0.03;
    case 'spot': return 1 / Math.max(2, String(item.code).split('\n').length);
    case 'fill': return clamp(Math.pow(1 / Math.max(2, item.bank.length), item.blanks.length), 0.02, 0.5);
    case 'order': return 0.03;
    default: return 0.02;
  }
}

/**
 * One knowledge-tracing step.
 * correct: was the first, unaided attempt right?
 * assisted: the item was then finished with help, so the "practised it" gain is smaller.
 */
export function updateMastery(pL, { correct, guess, assisted = false }) {
  const s = BKT.slip;
  const posterior = correct
    ? (pL * (1 - s)) / (pL * (1 - s) + (1 - pL) * guess)
    : (pL * s) / (pL * s + (1 - pL) * (1 - guess));
  const learn = assisted ? BKT.learnAssisted : BKT.learn;
  return clamp(posterior + (1 - posterior) * learn, 0.01, 0.995);
}

export function newConcept(pL = BKT.init) {
  return { pL, stage: 0, best: 0, due: null, learned: null, last: null, checks: [], seen: {} };
}

export function getConcept(state, lessonId) {
  if (!state.concepts[lessonId]) state.concepts[lessonId] = newConcept();
  return state.concepts[lessonId];
}

/** Called when a lesson is finished for the first time: the next-day check is scheduled. */
export function markLearned(concept, now) {
  if (!concept.learned) concept.learned = now;
  if (concept.stage < 1) {
    concept.stage = 1;
    concept.due = daysLater(now, INTERVALS[1]);
  }
  concept.best = Math.max(concept.best, 1);
  // `lastCheck` is when the concept was last learned or checked by a memory check. Practising a lesson
  // again updates `last` (used for strength) but not `lastCheck`, so memory-check gaps stay correct.
  if (!concept.lastCheck) concept.lastCheck = now;
  concept.last = now;
}

/** Days since the concept was learned or last checked (the gap recorded on a memory check). */
export const checkGapDays = (concept, now) => {
  const from = concept.lastCheck || concept.last;
  return from ? daysBetween(from, now) : 0;
};

/**
 * Apply the result of a memory check (an unaided item on a concept that was due).
 * Pass: move to the next, longer interval. Miss: go back one stage and check again tomorrow.
 * Returns what happened, for the summary screen.
 */
export function applyMemoryCheck(concept, ok, now) {
  const before = concept.stage;
  const gapDays = checkGapDays(concept, now);
  if (ok) {
    concept.stage = Math.min(MAX_STAGE, Math.max(1, before) + 1);
    concept.best = Math.max(concept.best, concept.stage);
    concept.due = daysLater(now, INTERVALS[concept.stage]);
  } else {
    concept.stage = Math.max(1, before - 1);
    concept.due = daysLater(now, 1);
  }
  concept.last = now;
  concept.lastCheck = now;
  return { before, after: concept.stage, gapDays, nextInDays: daysBetween(now, concept.due) };
}

/** Flames shown on a lesson: 1 learned, 2 remembered the next day, 3 remembered after a week. */
export const flames = (concept) => (concept ? Math.min(3, concept.best || 0) : 0);

export const isDue = (concept, now) => !!(concept && concept.stage >= 1 && concept.due !== null && concept.due <= now);

/** Concepts due for a memory check, most overdue first. */
export function dueConcepts(state, now, lessonIds) {
  return lessonIds
    .filter((id) => isDue(state.concepts[id], now))
    .sort((a, b) => state.concepts[a].due - state.concepts[b].due);
}

/** Estimated chance the concept is still remembered right now, for the strength bars. */
export function strength(concept, now) {
  if (!concept || concept.stage < 1) return concept ? concept.pL * 0.5 : 0;
  const halfLife = [1, 2, 9, 30, 90, 180][Math.min(concept.stage, 5)];
  const days = Math.max(0, (now - (concept.last || now)) / DAY);
  return concept.pL * Math.pow(0.5, days / halfLife);
}

/**
 * Choose a check item from a lesson's pool: one the learner has not seen if possible,
 * otherwise the one seen longest ago. Marks it as seen.
 */
export function pickPoolItem(lesson, concept, rng, now, exclude = []) {
  const pool = lesson.pool.filter((it) => !exclude.includes(it.id));
  if (!pool.length) return null;
  const unseen = pool.filter((it) => !concept.seen[it.id]);
  let chosen;
  if (unseen.length) chosen = unseen[Math.floor(rng() * unseen.length)];
  else chosen = [...pool].sort((a, b) => concept.seen[a.id] - concept.seen[b.id])[0];
  concept.seen[chosen.id] = now;
  return chosen;
}
