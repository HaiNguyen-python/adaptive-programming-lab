/**
 * The learner's saved state. Everything lives on the learner's own device.
 */

export const STATE_VERSION = 2;

export const DEFAULT_SETTINGS = {
  theme: 'day',             // day | night | auto (follows the device)
  sound: true,
  textSize: 'm',            // s | m | l
  reduceMotion: false,
  dailyGoal: 50,            // XP per day
  helpMode: 'adaptive',     // adaptive | fixed
  allow: { hint: true, explain: true, worked: true, walkthrough: true },
  confidence: 'checks',     // checks | all | off
  floor: 0.2,               // minimum probability of each kind of help (adaptive mode)
  costWeight: 0.05,         // how much the cost of more specific help counts against it
  unitTests: true,          // offer a pre-test before each unit and a post-test after it (always on in a study)
  ai: { enabled: false, model: 'claude-opus-5-5' },   // optional AI tutor (js/ai.js); the key is stored separately
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
    tests: {},               // unitId -> { pre, post, delayed: { t, right, total, items }, preSkipped }
    recentItems: [],
    quickfire: {},           // courseId -> best Quick fire score (practice for fun, not in studies)
  };
}

/** Fill in anything missing, so states saved by older versions keep working. */
export function repairState(state) {
  const fresh = newState(state.profile);
  const out = { ...fresh, ...state };
  out.settings = { ...fresh.settings, ...(state.settings || {}) };
  out.settings.allow = { ...fresh.settings.allow, ...((state.settings && state.settings.allow) || {}) };
  out.settings.ai = { ...fresh.settings.ai, ...((state.settings && state.settings.ai) || {}) };
  out.counters = { ...fresh.counters, ...(state.counters || {}) };
  out.counters.helps = { ...fresh.counters.helps, ...((state.counters && state.counters.helps) || {}) };
  for (const key of ['days', 'lessons', 'concepts', 'bandit', 'badges', 'placement', 'tests', 'quickfire']) {
    if (!out[key] || typeof out[key] !== 'object') out[key] = {};
  }
  if (!Array.isArray(out.decisions)) out.decisions = [];
  if (!Array.isArray(out.recentItems)) out.recentItems = [];
  // Version 2 made the bright day theme the default: learners still on the old default move to it once.
  if ((state.v || 1) < 2 && out.settings.theme === 'auto') out.settings.theme = 'day';
  out.v = STATE_VERSION;
  return out;
}
