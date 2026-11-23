// Tests for Nova's optional AI tutor, with a fake Claude client (no network, no key).
import test from 'node:test';
import assert from 'node:assert/strict';
import { COURSES } from '../content/index.js';
import u1 from '../content/python/u1-first-steps.js';
import { normalizeCourse } from '../js/engine/content.js';
import { setClientFactory, generateHelp, leaksAnswer, answerForms, taskContext, feedbackOnExplanation, playgroundHint, aiActive, setKey } from '../js/ai.js';
import { runJs } from '../tools/jsrun.mjs';

const course = normalizeCourse(COURSES.find((c) => c.id === 'python'), { units: [u1] });
const lesson = course.byId['py-numbers'];
const write = lesson.steps.find((s) => s.kind === 'write');
const fill = course.byId['py-print'].steps.find((s) => s.kind === 'fill');

/** A fake client that returns `payload` as the model's JSON answer and records the requests. */
function fake(payload, { failBeta = false, stop = 'end_turn' } = {}) {
  const calls = [];
  const respond = (req) => ({ stop_reason: stop, model: req.model, usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: JSON.stringify(payload) }] });
  const client = {
    beta: { messages: { create: async (req) => { calls.push({ beta: true, req }); if (failBeta) throw Object.assign(new Error('fallbacks is not supported'), { status: 400 }); return respond(req); } } },
    messages: { create: async (req) => { calls.push({ beta: false, req }); return respond(req); } },
  };
  setClientFactory(() => client);
  return calls;
}

test('the answer key is never sent, and the leak guard knows every form of the answer', () => {
  const ctx = taskContext({ lesson, item: write, attempt: 'Their code:\nprint(price + tickets)', feedback: 'Wrong total' });
  assert.ok(!ctx.includes('price * tickets'), 'the solution is not in the prompt');
  assert.ok(ctx.includes('print(price + tickets)'), 'the learner attempt is in the prompt');
  assert.ok(answerForms(write).some((f) => f.includes('price * tickets')));
  assert.equal(leaksAnswer('Try `print(price * tickets)`', write), true);
  assert.equal(leaksAnswer('Try   PRINT( price*tickets )', write), true, 'spacing and case do not hide a leak');
  assert.equal(leaksAnswer('Which operator multiplies two numbers?', write), false);
  assert.equal(leaksAnswer('Use `print("Pizza time!")` here', fill), true, 'the filled-in line of a fill item counts as the answer');
});

test('hints: the chosen kind is written by the AI; with explain it also gives a question', async () => {
  const calls = fake({ hint: 'Which operator multiplies?', question: 'In your words, what does * do here?' });
  const h = await generateHelp({ arm: 'explain', lesson, item: write, attempt: 'x', model: 'claude-opus-5-5' });
  assert.deepEqual([h.kind, h.hint, h.question], ['explain', 'Which operator multiplies?', 'In your words, what does * do here?']);
  const req = calls[0].req;
  assert.equal(req.model, 'claude-opus-5-5');
  assert.equal(req.output_config.format.type, 'json_schema');
  assert.deepEqual(req.betas, ['server-side-fallback-2026-07-01']);
  assert.equal(req.fallbacks, 'default');
  assert.match(req.system, /Never give the answer/);
});

test('a hint that contains the answer is rejected (the app then shows the written hint)', async () => {
  fake({ hint: 'Just write print(price * tickets).' });
  await assert.rejects(generateHelp({ arm: 'hint', lesson, item: write, model: 'm' }), (e) => e.code === 'leak');
});

test('if the fallback beta is refused, the request is repeated once without it', async () => {
  const calls = fake({ hint: 'Look at the operator.' }, { failBeta: true });
  const h = await generateHelp({ arm: 'hint', lesson, item: write, model: 'claude-haiku-5-5' });
  assert.equal(h.hint, 'Look at the operator.');
  assert.deepEqual(calls.map((c) => c.beta), [true, false]);
  assert.equal(calls[1].req.fallbacks, undefined);
});

test('refusals and cut-off answers fall back to written help', async () => {
  fake({ hint: 'x' }, { stop: 'refusal' });
  await assert.rejects(generateHelp({ arm: 'hint', lesson, item: write, model: 'm' }), (e) => e.code === 'refusal');
  fake({ hint: 'x' }, { stop: 'max_tokens' });
  await assert.rejects(generateHelp({ arm: 'hint', lesson, item: write, model: 'm' }), (e) => e.code === 'max_tokens');
});

const workedJs = {
  title: 'Snack boxes', problem: 'Each box holds 5 snacks. Print the snacks in 3 boxes.',
  steps: [{ label: 'Name the values', text: 'Store both numbers.', code: 'const box = 5;' }, { label: 'Multiply', text: 'Use *.', code: '' }, { label: 'Show it', text: 'Print the result.', code: '' }],
  code: 'const box = 5;\nconst boxes = 3;\nconsole.log(box * boxes);',
};
const jsItem = { ...write, lang: 'javascript', solution: 'console.log(price * tickets);', starter: '' };
const runner = async (lang, code) => { const r = runJs(code); return { out: r.out, err: r.err ? { name: r.err, message: r.msg } : null }; };

test('an AI worked example is run, and the real output is shown', async () => {
  fake(workedJs);
  const w = await generateHelp({ arm: 'worked', lesson, item: jsItem, model: 'm', run: runner });
  assert.equal(w.worked.output, '15', 'the output comes from running the code, not from the model');
  assert.equal(w.worked.steps.length, 3);
  assert.equal(w.worked.steps[1].code, undefined, 'empty step code is dropped');
  fake({ ...workedJs, code: 'console.log(box * boxes);' });
  await assert.rejects(generateHelp({ arm: 'worked', lesson, item: jsItem, model: 'm', run: runner }), (e) => e.code === 'invalid_example');
  fake({ ...workedJs, code: 'const price = 1;\nconst tickets = 2;\nconsole.log(price * tickets);' });
  await assert.rejects(generateHelp({ arm: 'worked', lesson, item: jsItem, model: 'm', run: runner }), (e) => e.code === 'leak', 'an example that is the learner task itself is rejected');
});

test('feedback on explanations and playground hints', async () => {
  fake({ hint: 'Good: you saw that * multiplies. What does the + do instead?' });
  const fb = await feedbackOnExplanation({ lesson, item: write, hint: 'h', explanation: 'I need to multiply', model: 'm' });
  assert.match(fb.text, /multiplies/);
  fake({ hint: 'Look at line 2: is the name spelled the same as on line 1?' });
  const ph = await playgroundHint({ lang: 'python', code: 'x = 1\nprint(y)', error: 'NameError', model: 'm' });
  assert.match(ph.text, /line 2/);
});

test('AI help is on only with a key, and in a study only when the study link turns it on', () => {
  globalThis.localStorage = { store: {}, getItem(k) { return this.store[k] ?? null; }, setItem(k, v) { this.store[k] = v; }, removeItem(k) { delete this.store[k]; } };
  const state = { settings: { ai: { enabled: true } }, study: null };
  assert.equal(aiActive(state), false, 'no key');
  setKey('sk-test');
  assert.equal(aiActive(state), true);
  assert.equal(aiActive({ ...state, study: { id: 'S' } }), false, 'a study without ai=1 never uses AI');
  assert.equal(aiActive({ settings: { ai: { enabled: false } }, study: { id: 'S', ai: true } }), true, 'a study with ai=1 uses it');
  setKey('');
  delete globalThis.localStorage;
});
