import Database, { type Database as Db } from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

let singleton: Db | null = null;

export interface OpenDbOptions {
  /** Absolute or CWD-relative path to vitals.db. Defaults to env DB_PATH or ./data/vitals.db. */
  path?: string;
  /** Run pending migrations automatically. Default: true. */
  migrate?: boolean;
  /** Override where migrations live (for tests). */
  migrationsDir?: string;
  /** Open read-only (for MCP server read paths). */
  readonly?: boolean;
}

export function openDb(opts: OpenDbOptions = {}): Db {
  if (singleton && !opts.path) return singleton;

  const raw = opts.path ?? process.env.DB_PATH ?? './data/vitals.db';
  // When the path is repo-relative, resolve against the repo root — not the
  // workspace cwd — so `npm run --workspace packages/db` doesn't land the DB
  // inside packages/db/data/.
  const dbPath = resolve(isAbsoluteLike(raw) ? raw : join(repoRoot(), raw));
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath, opts.readonly ? { readonly: true, fileMustExist: true } : {});
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('synchronous = NORMAL');

  if (opts.migrate !== false && !opts.readonly) {
    applyMigrations(db, opts.migrationsDir);
  }

  if (!opts.path) singleton = db;
  return db;
}

export function closeDb(): void {
  singleton?.close();
  singleton = null;
}

/**
 * Apply any migrations that haven't yet been run. Tracked in _migrations.
 * Idempotent; safe to call on every boot.
 */
export function applyMigrations(db: Db, overrideDir?: string): string[] {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);

  const dir = overrideDir ?? resolveMigrationsDir();
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const applied = new Set(
    db.prepare<[], { name: string }>('SELECT name FROM _migrations').all().map((r) => r.name),
  );

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = readFileSync(join(dir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, datetime(\'now\'))').run(file);
    })();
    ran.push(file);
  }
  return ran;
}

function resolveMigrationsDir(): string {
  // When running from dist/ it sits at dist/migrations. From src/ (tsx) it sits at src/migrations.
  const candidates = [join(__dirname, 'migrations'), join(__dirname, '..', 'src', 'migrations')];
  for (const p of candidates) if (existsSync(p)) return p;
  throw new Error(`Could not locate migrations directory. Tried: ${candidates.join(', ')}`);
}

function isAbsoluteLike(p: string): boolean {
  return p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p);
}

let cachedRoot: string | null = null;
/**
 * Walk up from __dirname looking for the monorepo root (package.json with a
 * `workspaces` field). Caches the result. Avoids cwd-relative gotchas when the
 * migrate CLI runs via `npm run --workspace packages/db`.
 */
function repoRoot(): string {
  if (cachedRoot) return cachedRoot;
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) {
      try {
        const json = JSON.parse(readFileSync(pkg, 'utf8')) as { workspaces?: unknown };
        if (json.workspaces) {
          cachedRoot = dir;
          return dir;
        }
      } catch {
        // ignore malformed package.json; keep walking
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  cachedRoot = process.cwd();
  return cachedRoot;
}
