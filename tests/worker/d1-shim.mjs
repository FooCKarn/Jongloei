// A small Cloudflare D1 stand-in on node:sqlite (Node 22+), so Worker code can run in node --test.
// It applies every file in db/migrations, like `wrangler d1 migrations apply`.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

export function makeD1() {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../../db/migrations/', import.meta.url);
  for (const f of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(f, dir), 'utf8'));
  const exec = (sql, args, mode) => {
    const st = db.prepare(sql);
    if (mode === 'first') return st.get(...args) ?? null;
    if (mode === 'all') return { results: st.all(...args) };
    const r = st.run(...args);
    return { meta: { changes: Number(r.changes) } };
  };
  const stmt = (sql, args = []) => ({
    sql, args,
    bind: (...a) => stmt(sql, a),
    first: async () => exec(sql, args, 'first'),
    all: async () => exec(sql, args, 'all'),
    run: async () => exec(sql, args, 'run'),
  });
  return {
    raw: db,
    prepare: sql => stmt(sql),
    // D1 runs a batch as one transaction.
    async batch(list) {
      db.exec('BEGIN');
      try {
        const out = list.map(s => /^\s*SELECT/i.test(s.sql) ? exec(s.sql, s.args, 'all') : exec(s.sql, s.args, 'run'));
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
