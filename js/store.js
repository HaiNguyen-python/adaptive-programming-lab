/**
 * Saving and loading. Learners (profiles) and their progress are kept in the browser's local storage,
 * on this device only. Several learners can share one device.
 */
import { newState, repairState, learnerCode } from './engine/state.js';

const KEY_PROFILES = 'hcl.profiles';
const keyState = (id) => `hcl.state.${id}`;
const memory = new Map(); // used when local storage is not available (for example in private windows)

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : (memory.get(key) ?? null);
  } catch { return memory.get(key) ?? null; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { memory.set(key, value); }
}
function drop(key) {
  try { localStorage.removeItem(key); } catch { /* nothing to remove */ }
  memory.delete(key);
}

export const store = { profiles: { active: null, list: [] }, state: null };
let timer = null;

export function saveNow() {
  clearTimeout(timer);
  timer = null;
  if (store.state) write(keyState(store.state.profile.id), store.state);
}

/** Save soon. Call after every change to the state. */
export function save() {
  clearTimeout(timer);
  timer = setTimeout(saveNow, 200);
}

function saveProfiles() { write(KEY_PROFILES, store.profiles); }

export function initStore() {
  const p = read(KEY_PROFILES);
  store.profiles = p && Array.isArray(p.list) ? p : { active: null, list: [] };
  store.state = null;
  const entry = store.profiles.list.find((x) => x.id === store.profiles.active);
  if (entry) {
    const saved = read(keyState(entry.id));
    store.state = saved && saved.profile ? repairState(saved) : null;
    if (!store.state) {
      store.profiles.list = store.profiles.list.filter((x) => x.id !== entry.id);
      store.profiles.active = null;
      saveProfiles();
    }
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', saveNow);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveNow(); });
  }
  return store.state;
}

export function createProfile({ name, color }) {
  saveNow();
  const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const profile = { id, name: (name || '').trim() || 'Learner', color: color || 'ember', code: learnerCode(), createdAt: Date.now() };
  store.profiles.list.push({ id, name: profile.name, color: profile.color });
  store.profiles.active = id;
  store.state = newState(profile);
  saveProfiles();
  saveNow();
  return store.state;
}

export function switchProfile(id) {
  saveNow();
  const saved = read(keyState(id));
  if (!saved || !saved.profile) return false;
  store.profiles.active = id;
  store.state = repairState(saved);
  saveProfiles();
  return true;
}

export function updateProfile({ name, color }) {
  const p = store.state.profile;
  if (name !== undefined) p.name = name.trim() || 'Learner';
  if (color !== undefined) p.color = color;
  const entry = store.profiles.list.find((x) => x.id === p.id);
  if (entry) { entry.name = p.name; entry.color = p.color; }
  saveProfiles();
  saveNow();
}

/** Remove a learner and all their saved progress from this device. */
export function deleteProfile(id) {
  drop(keyState(id));
  store.profiles.list = store.profiles.list.filter((x) => x.id !== id);
  if (store.profiles.active === id) {
    clearTimeout(timer);
    store.state = null;
    store.profiles.active = null;
    const next = store.profiles.list[0];
    if (next) switchProfile(next.id);
  }
  saveProfiles();
}

/** Start again: keeps the learner and their settings, removes all progress. */
export function resetProgress() {
  const { profile, settings } = store.state;
  store.state = newState(profile);
  store.state.settings = settings;
  store.state.onboarded = true;
  saveNow();
}
