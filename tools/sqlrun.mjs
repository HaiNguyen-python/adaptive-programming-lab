/**
 * Runs SQL lesson snippets against the course database with Node's built-in SQLite,
 * for the content verifier. Every run starts from a fresh copy of the database.
 */
import { DatabaseSync } from 'node:sqlite';
import { flattenCells, sqlCell } from '../js/engine/content.js';

/** Split a script into statements, respecting quotes and -- comments. */
export function splitSql(sql) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) {
      cur += ch;
      if (ch === quote) {
        if (sql[i + 1] === quote) cur += sql[++i];
        else quote = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '-' && sql[i + 1] === '-') {
      while (i < sql.length && sql[i] !== '\n') i++;
      cur += '\n';
      continue;
    }
    if (ch === ';') {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/**
 * Returns { out, result: { columns, values, cells } | null, err, msg, artefact }.
 * result is the rows of the last statement that returned any; cells holds the display text.
 * artefact is true when a decimal value has a long tail such as 4.449999999999999:
 * lessons must round such values.
 */
export function runSql(seed, sql, { verify } = {}) {
  const res = { out: '', result: null, err: null, msg: '', artefact: false };
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(seed);
    const statements = splitSql(sql);
    if (verify) statements.push(...splitSql(verify));
    for (const s of statements) {
      const st = db.prepare(s);
      st.setReadBigInts(true);
      const cols = st.columns().map((c) => c.name);
      if (!cols.length) { st.run(); continue; }
      st.setReturnArrays(true);
      const values = [];
      const cells = [];
      for (const row of st.all()) {
        const vals = [];
        const texts = [];
        for (const v of Array.from(row)) {
          if (typeof v === 'bigint') { vals.push(Number(v)); texts.push(String(v)); continue; }
          const isReal = typeof v === 'number';
          if (isReal && /\.\d{7,}/.test(String(v))) res.artefact = true;
          vals.push(v);
          texts.push(sqlCell(v, isReal));
        }
        values.push(vals);
        cells.push(texts);
      }
      res.result = { columns: cols, values, cells };
    }
    res.out = res.result ? flattenCells(res.result.cells) : '';
  } catch (e) {
    res.err = 'SqlError';
    res.msg = (e && e.message) || String(e);
  } finally {
    db.close();
  }
  return res;
}
