/**
 * The learner's saved state. Everything lives on the learner's own device.
 */

export const STATE_VERSION = 1;

export const DEFAULT_SETTINGS = {
  theme: 'auto',            // auto | night | day
  sound: true,
  textSize: 'm',            // s | m | l
  reduceMotion: false,
  dailyGoal: 50,            // XP per day
  helpMode: 'adaptive',     // adaptive | fixed
  allow: { hint: true, explain: true, worked: true, walkthrough: true },
  confidence: 'checks',     // checks | all | off
  floor: 0.2,               // minimum probability of each kind of help (adaptive mode)
  costWeight: 0.05,         // how much the cost of more specific help counts against it
};

/** A short, random code that identifies the learner in exported data without using a name. */
export function learnerCode(rand = Math.random) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'L-';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(rand() * chars.length)];
  return s;
}

export function newState(profile) {
  return {
    v: STATE_VERSION,
    profile,                 // { id, name, color, code, createdAt }
    settings: structuredClone(DEFAULT_SETTINGS),
    onboarded: false,
    study: null,             // set when the learner was enrolled in a study: { id, pid, cond, ... }
    course: null,
    xp: 0,
    days: {},                // 'YYYY-MM-DD' -> XP earned that day
    lessons: {},             // lessonId -> { done, runs, testedOut }
    concepts: {},            // lessonId -> mastery and memory-check record
    bandit: {},              // help policy beliefs
    decisions: [],           // help decisions with their outcomes
    counters: { items: 0, firstTry: 0, comeback: 0, explains: 0, runs: 0, nudges: 0, helps: { hint: 0, explain: 0, worked: 0, walkthrough: 0 } },
    badges: {},
    placement: {},
    recentItems: [],
  };
}

/** Fill in anything missing, so states saved by older versions keep working. */
export function repairState(state) {
  const fresh = newState(state.profile);
  const out = { ...fresh, ...state };
  out.settings = { ...fresh.settings, ...(state.settings || {}) };
  out.settings.allow = { ...fresh.settings.allow, ...((state.settings && state.settings.allow) || {}) };
  out.counters = { ...fresh.counters, ...(state.counters || {}) };
  out.counters.helps = { ...fresh.counters.helps, ...((state.counters && state.counters.helps) || {}) };
  for (const key of ['days', 'lessons', 'concepts', 'bandit', 'badges', 'placement']) {
    if (!out[key] || typeof out[key] !== 'object') out[key] = {};
  }
  if (!Array.isArray(out.decisions)) out.decisions = [];
  if (!Array.isArray(out.recentItems)) out.recentItems = [];
  out.v = STATE_VERSION;
  return out;
}
