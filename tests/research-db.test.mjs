// Tests for the research database helpers and the study-link rules about sending data.
import test from 'node:test';
import assert from 'node:assert/strict';
import { eventRow, parseCodes, studyLinks, rebuildExports } from '../js/research-data.js';
import { readStudyParams, enrol } from '../js/study.js';
import { pool } from '../tools/analysis.mjs';

test('eventRow keeps time and type apart from the data and gives a stable key', () => {
  const e = { p: 'profile-1', t: 1795400000123, type: 'attempt', itemId: 'py-print.s1', correct: true };
  const r = eventRow(e);
  assert.equal(r.t, e.t);
  assert.equal(r.type, 'attempt');
  assert.deepEqual(r.d, { itemId: 'py-print.s1', correct: true });
  assert.ok(!('p' in r.d), 'the local profile id is not sent');
  assert.equal(eventRow({ ...e }).k, r.k, 'same event, same key');
  assert.notEqual(eventRow({ ...e, correct: false }).k, r.k, 'different data, different key');
  assert.ok(r.k.length <= 120);
});

test('parseCodes understands ranges, lists and lines, and drops bad codes', () => {
  assert.deepEqual(parseCodes('P01-P03'), ['P01', 'P02', 'P03']);
  assert.deepEqual(parseCodes('P8-10'), ['P8', 'P9', 'P10']);
  assert.deepEqual(parseCodes('A1, B2\nC3; A1'), ['A1', 'B2', 'C3']);
  assert.deepEqual(parseCodes('Anna Smith'), ['Anna', 'Smith'], 'each word is a code; names are the researcher\'s responsibility');
  assert.deepEqual(parseCodes('bad/code ok'), ['ok']);
  assert.equal(parseCodes('P001-P999').length, 500, 'ranges are capped at 500 codes');
});

test('studyLinks builds links that readStudyParams reads back', () => {
  const [a] = studyLinks('https://x.org/app/', 'pilot-1', ['P07'], { cond: 'fixed', ai: true });
  assert.equal(a.pid, 'P07');
  const p = readStudyParams(new URL(a.link).search);
  assert.equal(p.id, 'pilot-1');
  assert.equal(p.pid, 'P07');
  assert.equal(p.cond, 'fixed');
  assert.equal(p.ai, true);
  assert.equal(p.upload, true);
  const [b] = studyLinks('https://x.org/app/', 's', ['P1']);
  assert.ok(!b.link.includes('cond='), 'random is the default and is left out');
});

test('data is sent only with consent version 2 or later, and upload=0 turns it off', () => {
  const st = () => ({ settings: { allow: { hint: true, explain: true, worked: true } } });
  const on = readStudyParams('?study=s1&pid=P1');
  assert.equal(enrol(st(), on, { consentAt: 1, consentVersion: 2, rand: () => 0.1 }).upload, true);
  assert.equal(enrol(st(), on, { consentAt: 1, consentVersion: 1, rand: () => 0.1 }).upload, false, 'version 1 consent said nothing is sent');
  const off = readStudyParams('?study=s1&pid=P1&upload=0');
  assert.equal(off.upload, false);
  assert.equal(enrol(st(), off, { consentAt: 1, consentVersion: 2, rand: () => 0.1 }).upload, false);
});

test('rebuildExports turns database rows into exports that the analysis can pool', () => {
  const snap = {
    learner: 'L-AAAAAA', received_at: '2026-11-23T10:00:00Z',
    payload: { app: 'Adaptive Programming Lab', learner: 'L-AAAAAA', study: { id: 's1', pid: 'P1', cond: 'adaptive' }, decisions: [], tests: {}, policy: { mode: 'adaptive' } },
  };
  const events = [
    { learner: 'L-AAAAAA', pid: 'P1', t: '2026-11-23T09:00:00.000Z', type: 'attempt', data: { itemId: 'a', correct: true } },
    { learner: 'L-BBBBBB', pid: 'P2', t: '2026-11-23T09:05:00.000Z', type: 'attempt', data: { itemId: 'b', correct: false } },
  ];
  const ex = rebuildExports('s1', [snap], events);
  assert.equal(ex.length, 2);
  const a = ex.find((x) => x.learner === 'L-AAAAAA');
  assert.equal(a.events.length, 1);
  assert.equal(a.events[0].t, Date.parse('2026-11-23T09:00:00.000Z'));
  assert.equal(a.events[0].type, 'attempt');
  assert.equal(a.events[0].itemId, 'a');
  const b = ex.find((x) => x.learner === 'L-BBBBBB');
  assert.equal(b.partial, true);
  assert.deepEqual(b.study, { id: 's1', pid: 'P2' });
  const pooled = pool(ex);
  assert.equal(pooled.participants.length, 2);
});

test('participantStatus summarises activity, help outcomes, memory checks and unit tests', async () => {
  const { participantStatus, conditionBalance } = await import('../js/research-data.js');
  const now = Date.parse('2026-11-30T12:00:00Z');
  const ex = [
    {
      learner: 'L-AAAAAA', study: { id: 's', pid: 'P2', cond: 'adaptive' }, totals: { lessonsDone: 3 },
      decisions: [{ proximal: 1 }, { proximal: 0 }, { proximal: null }],
      concepts: { a: { checks: [{ role: 'memory', ok: true }, { role: 'helpcheck', ok: true }, { role: 'warmup', ok: false }] } },
      tests: { u1: { pre: { right: 1, total: 4 }, post: { right: 3, total: 4 } } },
      events: [{ t: Date.parse('2026-11-30T10:00:00Z'), type: 'attempt' }, { t: Date.parse('2026-11-29T10:00:00Z'), type: 'notes_opened' }],
    },
    { learner: 'L-BBBBBB', study: { id: 's', pid: 'P10', cond: 'fixed' }, decisions: [], tests: {}, partial: true, events: [{ t: Date.parse('2026-11-20T10:00:00Z'), type: 'attempt' }] },
  ];
  const rows = participantStatus(ex, now);
  assert.deepEqual(rows.map((r) => r.pid), ['P2', 'P10'], 'sorted by participant code, numbers in order');
  const a = rows[0];
  assert.equal(a.lessonsDone, 3);
  assert.equal(a.helpDecisions, 3);
  assert.equal(a.soloAfterHelp, 0.5);
  assert.equal(a.memoryChecks, 2);
  assert.equal(a.memoryPassed, 0.5);
  assert.equal(a.preTest, 0.25);
  assert.equal(a.postTest, 0.75);
  assert.equal(a.delayedTest, null);
  assert.equal(a.notesOpened, 1);
  assert.equal(a.daysSince, 0);
  assert.equal(a.flags, '');
  assert.match(rows[1].flags, /no progress snapshot/);
  assert.match(rows[1].flags, /inactive for 10 days/);
  const bal = conditionBalance(rows);
  assert.deepEqual(bal.adaptive, { participants: 1, activeLast3Days: 1, lessonsDone: 3 });
  assert.equal(bal.fixed.activeLast3Days, 0);
});
