/**
 * Study mode. A researcher gives each participant a link such as
 *   https://example.org/app/?study=AALTO-2026&pid=P014&cond=random
 * and the first start enrols the participant: they read and accept the information, the help condition
 * is assigned (at random, or as given), and the settings that define the condition are locked so the
 * learner cannot change the experiment. Everything is still stored on the learner's device only; the
 * participant sends the exported file to the researcher.
 *
 *   study   study code, 1 to 40 letters, digits, - or _
 *   pid     participant code chosen by the researcher (no names)
 *   cond    adaptive | fixed | random   (random is the default)
 *   arms    optional teacher-set bounds: the help types the policy may use, for example arms=hint,explain
 *   floor   optional minimum probability of each allowed help type in the adaptive condition (0 to 0.33)
 */
export const CONDITIONS = ['adaptive', 'fixed'];
export const HELP_TYPES = ['hint', 'explain', 'worked'];
export const STUDY_VERSION = 1;
const CODE = /^[A-Za-z0-9_-]{1,40}$/;

let pending = null;

/** Read study parameters from a query string. Returns null when there is no valid study code. */
export function readStudyParams(search) {
  let p;
  try { p = new URLSearchParams(search || ''); } catch { return null; }
  const id = p.get('study');
  if (!id || !CODE.test(id)) return null;
  const pidRaw = p.get('pid');
  const condRaw = (p.get('cond') || 'random').toLowerCase();
  const armsRaw = (p.get('arms') || '').toLowerCase().split(',').map((x) => x.trim()).filter((x) => HELP_TYPES.includes(x));
  const floorRaw = p.get('floor');
  const floorNum = floorRaw === null || floorRaw === '' ? null : Number(floorRaw);
  return {
    id,
    pid: pidRaw && CODE.test(pidRaw) ? pidRaw : null,
    cond: condRaw === 'adaptive' || condRaw === 'fixed' ? condRaw : 'random',
    arms: armsRaw.length ? [...new Set(armsRaw)].sort((a, b) => HELP_TYPES.indexOf(a) - HELP_TYPES.indexOf(b)) : null,
    floor: floorNum !== null && Number.isFinite(floorNum) ? Math.max(0, Math.min(1 / 3, floorNum)) : null,
  };
}

export const setPendingStudy = (s) => { pending = s; };
export const getPendingStudy = () => pending;

/** A fair coin from the browser's secure random source (falls back to Math.random in tests). */
export function coin(rand) {
  if (rand) return rand();
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0] / 4294967296;
  } catch { return Math.random(); }
}

/** Decide the condition. Returns { cond, assignment: 'random' | 'given', pAssign }. */
export function assignCondition(cond, rand) {
  if (cond === 'adaptive' || cond === 'fixed') return { cond, assignment: 'given', pAssign: 1 };
  return { cond: coin(rand) < 0.5 ? 'adaptive' : 'fixed', assignment: 'random', pAssign: 0.5 };
}

/** Enrol a freshly created learner. Returns the study record that was saved on the state. */
export function enrol(state, params, { consentAt, consentVersion = STUDY_VERSION, rand } = {}) {
  const a = assignCondition(params.cond, rand);
  state.study = {
    id: params.id, pid: params.pid, cond: a.cond, assignment: a.assignment, pAssign: a.pAssign,
    requested: params.cond, enrolledAt: consentAt, consentAt, consentVersion, version: STUDY_VERSION,
    // Teacher-set bounds (null = the app's defaults). They are applied to the settings and locked.
    arms: params.arms || null, floor: params.floor ?? null,
  };
  state.settings.helpMode = a.cond;
  if (params.arms) for (const t of HELP_TYPES) state.settings.allow[t] = params.arms.includes(t);
  if (params.floor !== null && params.floor !== undefined) state.settings.floor = params.floor;
  return state.study;
}

export const inStudy = (state) => !!(state && state.study);
