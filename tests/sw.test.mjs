import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from '../tools/build-sw.mjs';

test('sw.js precache list and version are up to date (run npm run build:sw)', async () => {
  const { src, next } = await build();
  assert.equal(src.replace(/\r\n/g, '\n'), next.replace(/\r\n/g, '\n'));
});
