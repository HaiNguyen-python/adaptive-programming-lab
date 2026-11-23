#!/usr/bin/env node
/**
 * Pool the JSON exports of many participants into analysis-ready files.
 *
 *   node tools/merge-exports.mjs <folder-or-files...> [--out results]
 *
 * Writes into the output folder (default ./results):
 *   participants.csv   one row per learner (study, pid, condition, counts, data-quality flags)
 *   decisions.csv      every help decision with probabilities, outcomes and condition
 *   checks.csv         every unaided check with confidence, result, memory stage and gap in days
 *   help-seeking.csv   one row per learner: help-seeking features (RQ1), prior performance, later outcomes
 *   episodes.csv       one row per learner and lesson: short-term signals and delayed outcomes (RQ3)
 *   unit-tests.csv     one row per learner and unit: pre-, post- and one-week test scores
 *   report.md          descriptive summary per condition and a data-quality section
 *   research-questions.md  monitoring analyses for RQ1 to RQ4 (contrasts, proxies, off-policy values, fairness)
 *   summary.json       the same summary as data
 * Only the "Download (JSON)" files from Settings are read. Participant names are never in them.
 */
import { readFile, readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool, summarise, reportMarkdown, pooledDecisionsCsv, pooledChecksCsv, participantsCsv, learnersCsv, episodesCsv, testsCsv, researchQuestions } from './analysis.mjs';
import { researchQuestionsMarkdown } from './research-questions.mjs';

const args = process.argv.slice(2);
const outAt = args.indexOf('--out');
const out = outAt >= 0 ? args.splice(outAt, 2)[1] : 'results';
if (!args.length) { console.error('Usage: node tools/merge-exports.mjs <folder-or-files...> [--out results]'); process.exit(1); }

const files = [];
for (const a of args) {
  const info = await stat(a);
  if (info.isDirectory()) files.push(...(await readdir(a)).filter((f) => f.endsWith('.json')).map((f) => path.join(a, f)));
  else files.push(a);
}

const exportsList = [];
for (const f of files) {
  try { exportsList.push(JSON.parse(await readFile(f, 'utf8'))); } catch (e) { console.error(`Skipped ${f}: ${e.message}`); }
}

const data = pool(exportsList);
const summary = summarise(data);
await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'participants.csv'), participantsCsv(data));
await writeFile(path.join(out, 'decisions.csv'), pooledDecisionsCsv(data));
await writeFile(path.join(out, 'checks.csv'), pooledChecksCsv(data));
await writeFile(path.join(out, 'report.md'), reportMarkdown(summary, data));
const rq = researchQuestions(data);
await writeFile(path.join(out, 'help-seeking.csv'), learnersCsv(data));
await writeFile(path.join(out, 'episodes.csv'), episodesCsv(data));
await writeFile(path.join(out, 'unit-tests.csv'), testsCsv(data));
await writeFile(path.join(out, 'research-questions.md'), researchQuestionsMarkdown(rq));
await writeFile(path.join(out, 'summary.json'), JSON.stringify({ ...summary, researchQuestions: rq }, null, 2));
console.log(`Read ${exportsList.length} of ${files.length} files: ${data.participants.length} participants, ${data.decisions.length} decisions, ${data.checks.length} unaided checks.\nWritten to ${out}/`);
