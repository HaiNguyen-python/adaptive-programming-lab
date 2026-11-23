/** Things every screen needs: the clock, random numbers, logging and change notices. */
import { store } from './store.js';
import { logEvent } from './log.js';
import { makeRng, randomSeed } from './engine/rng.js';
import * as catalog from './catalog.js';

export const rng = makeRng(randomSeed());

const DAY = 86400000;
let shiftDays = 0;
try { shiftDays = Number(sessionStorage.getItem('hcl.shiftDays')) || 0; } catch { shiftDays = 0; }

/** The current time. Settings has a testing tool that moves this clock forward by whole days. */
export const now = () => Date.now() + shiftDays * DAY;
export const clockShift = () => shiftDays;
export function setClockShift(days) {
  shiftDays = Math.max(0, Math.round(days) || 0);
  try { sessionStorage.setItem('hcl.shiftDays', String(shiftDays)); } catch { /* not saved */ }
}

export function log(type, data) {
  if (store.state) logEvent(store.state.profile.id, type, { ...data, shift: shiftDays || undefined });
}

/** Everything the tutor engine needs for a call. */
export function tutorCtx(session, course) {
  return { session, state: store.state, course, now: now(), catalog: catalog.courses(), findLesson: catalog.findLesson, rng, log };
}

const listeners = new Set();
/** Run fn whenever progress or settings change (used to refresh the screen behind a dialog). */
export function onAppChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function emitChange() { for (const fn of listeners) fn(); }

/** Apply theme, text size and motion settings to the page. */
export function applyLook() {
  const s = store.state ? store.state.settings : { theme: 'day', textSize: 'm', reduceMotion: false };
  const root = document.documentElement;
  const theme = s.theme === 'auto' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'day' : 'night') : s.theme;
  root.dataset.theme = theme;
  root.dataset.size = s.textSize;
  root.dataset.motion = s.reduceMotion ? 'off' : 'on';
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'day' ? '#f3f4f7' : '#14171d';
}
