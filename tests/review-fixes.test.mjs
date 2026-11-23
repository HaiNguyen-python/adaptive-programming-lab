// Regression tests for the fixes from the 1.6 code review (research-data integrity).
import test from 'node:test';
import assert from 'node:assert/strict';
import { participantStatus } from '../js/research-data.js';
import { startPractice } from '../js/engine/tutor.js';
import { newState } from '../js/engine/state.js';
import { newConcept } from '../js/engine/mastery.js';

test('blocked note openings are not counted as openings', () => {
  const [r] = participantStatus([{
    learner: 'L-AAAAAA', study: { pid: 'P1', cond: 'fixed' }, decisions: [],
    events: [{ t: 1, type: 'notes_opened', shown: true }, { t: 2, type: 'notes_opened', shown: false }, { t: 3, type: 'notes_opened' }],
  }], 10);
  assert.equal(r.notesOpened, 2);
});

test('a participant code seen on two devices is flagged on both rows', () => {
  const rows = participantStatus([
    { learner: 'L-AAAAAA', study: { pid: 'P1', cond: 'fixed' }, decisions: [], events: [{ t: 1, type: 'x' }] },
    { learner: 'L-BBBBBB', study: { pid: 'P1', cond: 'fixed' }, decisions: [], events: [{ t: 1, type: 'x' }] },
    { learner: 'L-CCCCCC', study: { pid: 'P2', cond: 'adaptive' }, decisions: [], events: [{ t: 1, type: 'x' }] },
  ], 10);
  assert.equal(rows.filter((r) => /2 devices/.test(r.flags)).length, 2);
  assert.ok(!/devices/.test(rows.find((r) => r.pid === 'P2').flags));
});

test('free practice leaves out ideas whose memory check is due, and excluded lessons', () => {
  const state = newState({ id: 'x', name: 'n', color: 'sky', code: 'L-AAAAAA' });
  const now = Date.parse('2026-12-01T12:00:00Z');
  const day = 86400000;
  state.concepts.due = { ...newConcept(0.9), stage: 1, best: 1, learned: now - 2 * day, due: now - 1000 };
  state.concepts.ok = { ...newConcept(0.9), stage: 1, best: 1, learned: now - 2 * day, due: now + 3 * day };
  state.concepts.unitTestDue = { ...newConcept(0.9), stage: 1, best: 1, learned: now - 9 * day, due: now + 5 * day };
  const s = startPractice({ state, lessonIds: ['due', 'ok', 'unitTestDue'], now, exclude: ['unitTestDue'] });
  const ids = s.queue.filter((e) => e.type === 'item' || e.lessonId).map((e) => e.lessonId);
  assert.ok(ids.includes('ok'), 'an idea without a due check is practised');
  assert.ok(!ids.includes('due'), 'a due memory check is not practised first');
  assert.ok(!ids.includes('unitTestDue'), 'lessons of a due one-week test are not practised first');
});
