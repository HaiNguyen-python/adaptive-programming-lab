#!/usr/bin/env node
/**
 * Rewrites the PRECACHE list and cache VERSION in sw.js from the files on disk, so every lesson works
 * offline after the first visit. Run after adding or removing files:  npm run build:sw
 * `node tools/build-sw.mjs --check` exits with 1 if sw.js is out of date.
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIRS = ['js', 'css', 'content', 'assets'];
const EXTRA = ['./', 'index.html', 'manifest.webmanifest', 'tools/analysis.mjs', 'tools/research-questions.mjs'];

async function walk(dir) {
  const out = [];
  for (const e of await readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) out.push(...await walk(rel));
    else out.push(rel);
  }
  return out;
}

export async function build() {
  const files = [...EXTRA, ...(await Promise.all(DIRS.map(walk))).flat().sort()];
  const hash = crypto.createHash('sha1');
  for (const f of files) if (f !== './') hash.update(f).update(await readFile(path.join(ROOT, f)).then((b) => b.toString('utf8').replace(/\r\n/g, '\n')));
  const version = `phd-lab-${hash.digest('hex').slice(0, 10)}`;
  const src = (await readFile(path.join(ROOT, 'sw.js'), 'utf8'));
  const next = src
    .replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`)
    .replace(/const PRECACHE = \[[\s\S]*?\];/, `const PRECACHE = ${JSON.stringify(files, null, 2)};`);
  return { src, next };
}

if (process.argv[1]?.endsWith('build-sw.mjs')) {
  const { src, next } = await build();
  if (process.argv.includes('--check')) {
    if (src.replace(/\r\n/g, '\n') !== next.replace(/\r\n/g, '\n')) { console.error('sw.js is out of date. Run: npm run build:sw'); process.exit(1); }
    console.log('sw.js is up to date.');
  } else { await writeFile(path.join(ROOT, 'sw.js'), next); console.log('sw.js updated.'); }
}
