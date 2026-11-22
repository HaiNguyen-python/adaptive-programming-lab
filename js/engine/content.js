/**
 * Content helpers shared by the app and the content verifier (tools/verify-content.mjs).
 * Pure functions only: no DOM, no storage.
 */

export const BLANK = '___';
export const ITEM_KINDS = ['mcq', 'predict', 'fill', 'order', 'spot', 'write'];
/** Kinds that may appear in a lesson's pool of unaided check items. */
export const POOL_KINDS = ['mcq', 'predict', 'fill', 'spot'];
/** Kinds where the learner builds the answer; these get hints and adaptive help. */
export const BUILD_KINDS = ['fill', 'order', 'write'];

const BLOCK_FIELDS = ['code', 'output', 'answer', 'expect', 'expectOutput', 'starter', 'solution', 'fix', 'verify'];
const DEFAULT_LEVEL = { mcq: 1, spot: 1, predict: 1, fill: 2, order: 2, write: 3 };

export const isItem = (step) => ITEM_KINDS.includes(step.kind);
const joinLines = (v) => (Array.isArray(v) ? v.join('\n') : v);

function normBlocks(o) {
  for (const k of BLOCK_FIELDS) if (k in o) o[k] = joinLines(o[k]);
  return o;
}

export const countBlanks = (code) => (String(code).match(/___/g) || []).length;

/** Replace each blank in order with the matching token. */
export function fillCode(code, tokens) {
  let i = 0;
  return String(code).replace(/___/g, () => (tokens[i++] ?? BLANK));
}

/** True when the item is answered by typing or assembling rather than picking. */
export function isBuildItem(item) {
  return BUILD_KINDS.includes(item.kind) || (item.kind === 'predict' && item.mode === 'type');
}

export function normalizeStep(raw, id, lesson, course, inPool) {
  const s = normBlocks({ ...raw, id, lessonId: lesson.id, lang: raw.lang || course.lang, pool: !!inPool });
  if (s.kind === 'predict') {
    s.mode = Array.isArray(s.options) && s.options.length ? 'choose' : 'type';
    if (!s.prompt) s.prompt = s.lang === 'sql' ? 'What does this query return?' : 'What does this code print?';
  }
  if (s.kind === 'fill') s.blanks = (s.blanks || []).map((b) => (Array.isArray(b) ? b : [b]));
  if (s.kind === 'order') s.lines = [...(s.lines || [])];
  if (s.kind === 'mcq') s.options = (s.options || []).map((o) => ({ ...o }));
  if (isItem(s)) {
    s.level = s.level || (s.kind === 'predict' && s.mode === 'type' ? 2 : DEFAULT_LEVEL[s.kind]);
    s.hints = inPool ? [] : [...(s.hints || [])];
  }
  return s;
}

export function normalizeLesson(raw, unit, course) {
  const lesson = { ...raw, unitId: unit.id, courseId: course.id, lang: course.lang };
  lesson.goals = [...(raw.goals || [])];
  lesson.steps = (raw.steps || []).map((s, i) => normalizeStep(s, `${raw.id}.s${i}`, lesson, course, false));
  lesson.pool = (raw.pool || []).map((s, i) => normalizeStep(s, `${raw.id}.p${i}`, lesson, course, true));
  if (raw.worked) {
    lesson.worked = normBlocks({ ...raw.worked });
    lesson.worked.steps = (raw.worked.steps || []).map((st) => normBlocks({ ...st }));
  }
  return lesson;
}

/**
 * Turn a course's meta (from content/index.js) and its raw module into the shape the app uses:
 * arrays of lines are joined, ids are assigned and lookup tables are built.
 */
export function normalizeCourse(meta, raw) {
  const course = { ...meta, ...raw, id: meta.id, lang: meta.lang };
  delete course.load;
  course.units = (raw.units || []).map((u) => {
    const unit = { ...u };
    unit.lessons = (u.lessons || []).map((l) => normalizeLesson(l, unit, course));
    return unit;
  });
  course.lessons = course.units.flatMap((u) => u.lessons);
  course.byId = Object.fromEntries(course.lessons.map((l) => [l.id, l]));
  course.lessons.forEach((l, i) => { l.index = i; });
  return course;
}

/** Display text for one SQL value. Decimal (REAL) values that are whole keep ".0", as SQLite shows them. */
export function sqlCell(v, isReal) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number' && isReal && Number.isInteger(v)) return v.toFixed(1);
  return String(v);
}

/** Text form of a SQL result set: cells joined by " | ", rows by newlines. */
export const flattenCells = (cells) => (cells || []).map((row) => row.join(' | ')).join('\n');
