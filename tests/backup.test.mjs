import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBackup, parseBackup } from '../js/backup.js';
import { newState } from '../js/engine/state.js';

const profile = { id: 'p1', name: 'Ada', color: 'ember', code: 'L-TEST01', createdAt: 1 };

test('a backup round-trips state and events', () => {
  const state = newState(profile);
  state.xp = 120;
  const text = JSON.stringify(buildBackup(state, [{ p: 'p1', t: 5, type: 'attempt' }]));
  const out = parseBackup(text);
  assert.equal(out.state.xp, 120);
  assert.equal(out.state.profile.name, 'Ada');
  assert.deepEqual(out.events, [{ t: 5, type: 'attempt' }]);
});

test('files that are not backups are refused with a readable message', () => {
  assert.throws(() => parseBackup('not json'), /not a backup/);
  assert.throws(() => parseBackup('{"hello":1}'), /not a backup from this app/);
});

test('backups from a newer version are refused and bad events are dropped', () => {
  const b = buildBackup(newState(profile), []);
  assert.throws(() => parseBackup(JSON.stringify({ ...b, stateVersion: 999 })), /newer version/);
  const withBad = JSON.stringify({ ...b, events: [null, { t: 'x' }, { t: 1, type: 'ok' }] });
  assert.equal(parseBackup(withBad).events.length, 1);
});
