/**
 * Nova's optional AI tutor (Claude). Off by default. A teacher or researcher turns it on in Settings with
 * their own Claude API key, which stays in this browser only and is never exported or backed up.
 *
 * The help policy (js/engine/help-policy.js) still decides WHICH kind of help is given; the AI only writes
 * the content for the chosen kind, so the randomised design of the research is unchanged. Every response
 * is checked before it is shown:
 *   - it must not contain the answer to the learner's task (leak guard; on a leak the written help is used),
 *   - an AI worked example is run in the real language runtime and its real output is shown; if the code
 *     does not run, the written worked example is used instead.
 * Whatever goes wrong (no key, offline, refusal, timeout), the learner gets the written help.
 */
import { RUNTIME } from './config.js';
import { fillCode } from './engine/content.js';
import { normOut } from './engine/grade.js';

const KEY_STORE = 'hcl.ai.key';
export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', note: 'best quality (recommended)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', note: 'faster, about half the cost' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', note: 'fastest and cheapest' },
];
export const DEFAULT_MODEL = 'claude-opus-5-5';

// ---------------------------------------------------------------- key and availability

export function getKey() { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } }
export function setKey(k) { try { if (k) localStorage.setItem(KEY_STORE, k.trim()); else localStorage.removeItem(KEY_STORE); } catch { /* storage blocked */ } }

/** Is AI help in use for this learner right now? In a study only when the study link turned it on. */
export function aiActive(state) {
  if (!state || !getKey()) return false;
  if (state.study) return !!state.study.ai;
  return !!(state.settings.ai && state.settings.ai.enabled);
}
export const aiModel = (state) => (state.settings.ai && state.settings.ai.model) || DEFAULT_MODEL;

// ---------------------------------------------------------------- client

let factory = null;
/** For tests: replace the SDK client with a fake. */
export function setClientFactory(fn) { factory = fn; }

async function client() {
  if (factory) return factory();
  const mod = await import(/* webpackIgnore: true */ RUNTIME.anthropicSdk);
  const Anthropic = mod.default || mod.Anthropic;
  // The key belongs to the teacher or researcher who entered it on this device.
  return new Anthropic({ apiKey: getKey(), dangerouslyAllowBrowser: true, timeout: 45000, maxRetries: 1 });
}

/**
 * One structured request. Uses the server-side refusal fallback (routes a declined request to another
 * model inside the same call); if that beta is not accepted, retries once without it.
 */
async function ask(model, system, user, schema, effort) {
  const c = await client();
  const base = {
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort, format: { type: 'json_schema', schema } },
  };
  let res;
  try {
    res = await c.beta.messages.create({ ...base, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  } catch (e) {
    if (e && e.status === 400 && /fallback|beta/i.test(String(e.message))) res = await c.messages.create(base);
    else throw e;
  }
  if (res.stop_reason === 'refusal') throw Object.assign(new Error('The model declined this request.'), { code: 'refusal' });
  if (res.stop_reason === 'max_tokens') throw Object.assign(new Error('The answer was cut off.'), { code: 'max_tokens' });
  const text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
  let data;
  try { data = JSON.parse(text); } catch { throw Object.assign(new Error('The answer was not in the expected format.'), { code: 'format' }); }
  return { data, usage: res.usage || {}, model: res.model || model };
}

// ---------------------------------------------------------------- prompts

const LANG_NAME = { python: 'Python', javascript: 'JavaScript', sql: 'SQL (SQLite)', web: 'HTML and CSS' };

const RULES = `You are Nova, a friendly tutor in a programming learning app used by children and adults, many of whom read English as a second language.
The app follows research on durable learning: help must keep the thinking with the learner.
Hard rules:
- Never give the answer to the learner's task. Never write the corrected code, the missing piece, the right option or the expected output of the task.
- Point at the learner's actual mistake and what to look at, using ideas from the lesson. Leave the last step of thinking to the learner.
- Plain, short, kind sentences. No contractions. No em dashes. No jokes at the learner's expense.
- Formatting: only \`inline code\` and **bold**. No other markdown, no HTML, no code blocks in hint text.`;

/** What the learner is working on, as text for the model. The answer key is never sent. */
export function taskContext({ lesson, item, attempt, feedback, previous }) {
  const lines = [
    `Language: ${LANG_NAME[item.lang] || item.lang}`,
    `Lesson: ${lesson.title} (concept: ${lesson.concept})`,
    `Task type: ${item.kind}`,
    `Task: ${item.prompt || ''}`,
  ];
  if (item.kind === 'fill') lines.push(`Code with gaps (___):\n${item.code}`, `Pieces offered: ${item.bank.join(' | ')}`);
  else if (item.kind === 'order') lines.push(`Lines to put in order:\n${[...item.lines, ...(item.distractors || [])].join('\n')}`);
  else if (item.kind === 'write' && item.starter) lines.push(`Starter code:\n${item.starter}`);
  else if (item.code) lines.push(`Code:\n${item.code}`);
  if (attempt) lines.push(`The learner's latest attempt:\n${attempt}`);
  if (feedback) lines.push(`What went wrong: ${feedback}`);
  if (previous && previous.length) lines.push(`Help already given (do not repeat it, go one small step further):\n- ${previous.join('\n- ')}`);
  return lines.join('\n\n');
}

const HINT_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['hint'],
  properties: { hint: { type: 'string', description: 'One or two sentences.' } },
};
const EXPLAIN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['hint', 'question'],
  properties: {
    hint: { type: 'string', description: 'One or two sentences.' },
    question: { type: 'string', description: 'One question that asks the learner to explain the hint in their own words.' },
  },
};
const WORKED_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['title', 'problem', 'steps', 'code'],
  properties: {
    title: { type: 'string' },
    problem: { type: 'string', description: 'A short task similar to the learner\'s, with a different story and different names and values.' },
    steps: {
      type: 'array', description: '3 to 5 steps.',
      items: {
        type: 'object', additionalProperties: false, required: ['label', 'text', 'code'],
        properties: {
          label: { type: 'string', description: 'The purpose of the step, 2 to 5 words.' },
          text: { type: 'string' },
          code: { type: 'string', description: 'Code for this step, or an empty string.' },
        },
      },
    },
    code: { type: 'string', description: 'The complete, correct program or query for the similar problem. Deterministic: no input, no random numbers, no dates.' },
  },
};

// ---------------------------------------------------------------- guards

const squash = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();

/** The answer to an item in forms that must not appear in AI help. */
export function answerForms(item) {
  const forms = [];
  if (item.kind === 'write' && item.solution) {
    for (const line of String(item.solution).split('\n')) if (squash(line).length >= 10 && !(item.starter || '').includes(line.trim())) forms.push(line);
  }
  if (item.kind === 'fill') {
    const filled = fillCode(item.code, item.blanks.map((b) => b[0])).split('\n');
    const original = item.code.split('\n');
    filled.forEach((l, i) => { if (l !== original[i] && squash(l).length >= 6) forms.push(l); });
  }
  if (item.kind === 'order') forms.push(item.lines.join('\n'));
  if (item.kind === 'spot' && item.fix) forms.push(item.fix);
  if (item.kind === 'predict' && item.answer && squash(item.answer).length >= 4) forms.push(item.answer);
  return forms.filter((f) => squash(f).length >= 4);
}

/** True when the text contains the task's answer. */
export function leaksAnswer(text, item) {
  const t = squash(text);
  return answerForms(item).some((f) => t.includes(squash(f)));
}

// ---------------------------------------------------------------- the three kinds of help

/**
 * Generate the content for one kind of help. `run` executes code in the learner's runtimes (js/run/runners.js),
 * so the worked example's output is the real one.
 * Returns { kind, hint?, question?, worked?, model, usage, ms } or throws (the caller then uses written help).
 */
export async function generateHelp({ arm, lesson, item, attempt, feedback, previous, model, run, seed }) {
  const t0 = Date.now();
  const context = taskContext({ lesson, item, attempt, feedback, previous });
  if (arm === 'worked') {
    const system = `${RULES}
Write a worked example of a SIMILAR problem that uses the same idea as the lesson, so the learner can see how to think it through and then go back to their own task.
It must not be the learner's task: use a different story, different names and different values. Never include the learner's solution.
Keep code lines under 48 characters. Only use ideas from this lesson and earlier beginner lessons.${item.lang === 'sql' ? ' The database has the tables products(id, name, category, price, stock, rating), campers(id, name, town, age, email) and orders(id, camper_id, product_id, quantity, order_date). Write one SELECT query.' : ''}${item.lang === 'web' ? ' Write a small HTML fragment with a <style> block if needed. No scripts.' : ''}`;
    const r = await ask(model, system, `${context}\n\nWrite the worked example now.${seed ? ` Variation ${seed}.` : ''}`, WORKED_SCHEMA, 'medium');
    const w = r.data;
    if (!Array.isArray(w.steps) || w.steps.length < 2 || w.steps.length > 7 || !w.code) throw Object.assign(new Error('The example was incomplete.'), { code: 'format' });
    const all = [w.problem, w.code, ...w.steps.flatMap((s) => [s.text, s.code])].join('\n');
    if (leaksAnswer(all, item)) throw Object.assign(new Error('The example contained the answer.'), { code: 'leak' });
    const worked = { title: `Worked example: ${w.title}`, problem: w.problem, steps: w.steps.map((s) => ({ label: s.label, text: s.text, code: s.code || undefined })), code: w.code };
    if (item.lang !== 'web' && run) {
      const res = await run(item.lang, w.code);
      if (!res || res.err || res.unavailable) throw Object.assign(new Error('The example code did not run.'), { code: 'invalid_example' });
      if (item.lang === 'sql') {
        if (!res.result) throw Object.assign(new Error('The example query returned no rows.'), { code: 'invalid_example' });
        worked.result = { columns: res.result.columns, rows: res.result.cells.slice(0, 8) };
      } else worked.output = normOut(res.out);
    }
    return { kind: 'worked', worked, model: r.model, usage: r.usage, ms: Date.now() - t0 };
  }
  const explain = arm === 'explain';
  const system = `${RULES}
Give ${explain ? 'one hint and then one question that asks the learner to explain the hint in their own words' : 'one hint'}. ${previous && previous.length ? 'It must be more specific than the help already given, but still not the answer.' : 'Start general: what to think about, which idea from the lesson applies.'}`;
  const r = await ask(model, system, context, explain ? EXPLAIN_SCHEMA : HINT_SCHEMA, 'low');
  const text = `${r.data.hint} ${r.data.question || ''}`;
  if (leaksAnswer(text, item)) throw Object.assign(new Error('The hint contained the answer.'), { code: 'leak' });
  return { kind: arm, hint: r.data.hint, question: r.data.question || null, model: r.model, usage: r.usage, ms: Date.now() - t0 };
}

/** Short feedback on a learner's own explanation of a hint (self-explanation), without the answer. */
export async function feedbackOnExplanation({ lesson, item, hint, explanation, model }) {
  const system = `${RULES}
The learner was given a hint and wrote what it means in their own words. In one or two sentences, say what is right about their explanation and, if something is missing or wrong, ask one question that points to it. Do not give the answer.`;
  const r = await ask(model, system, `${taskContext({ lesson, item })}\n\nHint: ${hint}\n\nThe learner's explanation: ${explanation}`, HINT_SCHEMA, 'low');
  if (leaksAnswer(r.data.hint, item)) throw Object.assign(new Error('The feedback contained the answer.'), { code: 'leak' });
  return { text: r.data.hint, model: r.model, usage: r.usage };
}

/** A Socratic hint about the learner's own code in the Playground (no corrected code). */
export async function playgroundHint({ lang, code, output, error, model }) {
  const system = `${RULES}
The learner is experimenting freely in a playground. Look at their code and what happened when it ran. Give one hint about the most important problem, or, if it works, one idea to try next. Do not rewrite their code.`;
  const user = `Language: ${LANG_NAME[lang] || lang}\n\nCode:\n${code}\n\n${error ? `Error:\n${error}` : `Output:\n${output || '(nothing)'}`}`;
  const r = await ask(model, system, user, HINT_SCHEMA, 'low');
  return { text: r.data.hint, model: r.model, usage: r.usage };
}

/** A tiny request to check that the key and model work. */
export async function testConnection(model) {
  const r = await ask(model, 'Reply with the JSON requested.', 'Say hello to a new programmer in five words or fewer.', HINT_SCHEMA, 'low');
  return r.data.hint;
}
