import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

// The README promises "deterministic seed → reviewable diffs". This proves it:
// seeding twice into fresh DBs must produce byte-identical consensus rows
// (everything except the per-run synced_at timestamp).

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const seedScript = join(repoRoot, 'scripts', 'seed_demo_data.ts');
const created: string[] = [];

function seedInto(): string {
  const dbPath = join(tmpdir(), `vitals-seed-${randomUUID()}.db`);
  created.push(dbPath);
  execFileSync(process.execPath, ['--import', 'tsx', seedScript, '10'], {
    cwd: repoRoot,
    // Explicit DB_PATH wins: dotenv.config() never overrides an existing env var.
    env: { ...process.env, DB_PATH: dbPath },
    stdio: 'ignore',
  });
  return dbPath;
}

function dailyRows(dbPath: string): Record<string, unknown>[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const rows = db.prepare('SELECT * FROM daily_summary ORDER BY date').all() as Record<
      string,
      unknown
    >[];
    // synced_at is stamped at write time and is expected to differ between runs.
    for (const r of rows) delete r.synced_at;
    return rows;
  } finally {
    db.close();
  }
}

after(() => {
  for (const p of created) {
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        rmSync(p + suffix);
      } catch {
        /* best effort */
      }
    }
  }
});

describe('demo seed determinism', () => {
  it('produces identical consensus rows across two independent runs', () => {
    const a = dailyRows(seedInto());
    const b = dailyRows(seedInto());
    assert.ok(a.length > 0, 'seed produced no daily rows');
    assert.deepEqual(a, b);
  });
});
