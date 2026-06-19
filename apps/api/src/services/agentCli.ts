import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openaiCompatConfigured, runOllama, runOpenAiCompat } from './aiProviders.js';

/**
 * Run an on-box AI agent non-interactively and return its final text.
 *
 * Supports four providers, tried in a configurable fallback chain:
 *   - `claude`        → `claude -p` CLI (Claude Code), tools locked down
 *   - `codex`         → `codex exec -s read-only` CLI
 *   - `ollama`        → local Ollama HTTP server (fully on-box, no cloud)
 *   - `openai-compat` → any OpenAI-compatible HTTP server (LocalAI / LM Studio)
 *
 * The CLI providers call a cloud model (orchestration is local); the HTTP
 * providers can keep ALL inference on-box. The chain is driven by env
 * `AI_PROVIDERS` (comma list, default `claude,codex` — current behavior). PATH
 * is set so CLI binaries + their `env node` shebangs resolve under launchd
 * (which has a minimal env).
 */
export type AiProvider = 'claude' | 'codex' | 'ollama' | 'openai-compat';
/** Kept for back-compat with callers that type the returned tag narrowly. */
export type AgentCli = 'claude' | 'codex';

// PATH the CLI providers (claude/codex) are spawned with. Derived from $HOME so
// it's portable, with common install dirs; override via AI_CLI_PATH if your
// binaries live elsewhere. (launchd has a minimal PATH, hence the explicit dirs.)
const PATH_PREFIX =
  process.env.AI_CLI_PATH ??
  `${process.env.HOME ?? ''}/.local/bin:/opt/homebrew/bin:/opt/homebrew/opt/node@22/bin`;
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 240_000);

function spawnCapture(
  bin: string,
  args: string[],
  prompt: string,
  outFile?: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, PATH: `${PATH_PREFIX}:${process.env.PATH ?? ''}` };
    const child = spawn(bin, args, { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString()));
    child.stderr.on('data', (d) => (stderr += d.toString()));
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${bin} timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    child.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      let out = stdout.trim();
      if (outFile) {
        try {
          out = readFileSync(outFile, 'utf8').trim();
        } catch {
          /* fall back to stdout */
        }
      }
      if (code === 0 && out) resolve(out);
      else reject(new Error(`${bin} exited ${code}: ${(stderr || stdout).slice(-300)}`));
    });
    child.stdin.write(prompt);
    child.stdin.end();
  });
}

async function runClaude(prompt: string, model?: string): Promise<string> {
  // SECURITY: `/ask` feeds untrusted free text to `claude -p`. Lock it to a
  // pure text completion — no tools at all — so a prompt can never make Claude
  // Code run Bash/Read/Write/WebFetch and exfiltrate .env/tokens. We pass an
  // empty allowlist AND an explicit deny of the dangerous tools, and keep the
  // permission mode at "default" (anything not explicitly allowed is denied —
  // NOT "bypassPermissions", which would auto-approve).
  const args = [
    '-p',
    '--output-format',
    'text',
    '--permission-mode',
    'default',
    '--allowed-tools',
    '',
    '--disallowed-tools',
    'Bash Read Write Edit WebFetch WebSearch Glob Grep Task',
  ];
  if (model) args.push('--model', model);
  const out = await spawnCapture('claude', args, prompt);
  if (/not logged in|please run \/login|invalid api key/i.test(out)) {
    throw new Error('claude not logged in (run `claude` → /login on the Mini)');
  }
  return out;
}

async function runCodex(prompt: string, model?: string): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'vcc-ai-'));
  const outFile = join(dir, 'out.md');
  const args = ['exec', '--skip-git-repo-check', '-s', 'read-only', '-o', outFile];
  if (model) args.push('-m', model);
  args.push('-'); // prompt on stdin
  try {
    return await spawnCapture('codex', args, prompt, outFile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const VALID_PROVIDERS: readonly AiProvider[] = ['claude', 'codex', 'ollama', 'openai-compat'];

function isProvider(value: string): value is AiProvider {
  return (VALID_PROVIDERS as readonly string[]).includes(value);
}

/**
 * Resolve the ordered fallback chain of providers to try.
 *
 * Base order comes from `AI_PROVIDERS` (comma list, default `claude,codex` to
 * preserve current behavior). A per-call `opts.cli` (from BRIEF_CLI/ASK_CLI or
 * legacy AI_CLI) is prepended so it takes priority while still allowing the rest
 * of the chain to act as fallback. Unknown/empty entries are dropped, dupes are
 * removed, and the `openai-compat` provider is skipped unless configured.
 */
function resolveProviders(preferred?: string): AiProvider[] {
  const fromEnv = (process.env.AI_PROVIDERS ?? 'claude,codex')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const candidates: string[] = [];
  const legacy = preferred ?? process.env.AI_CLI;
  if (legacy) candidates.push(legacy.trim().toLowerCase());
  candidates.push(...fromEnv);

  const ordered: AiProvider[] = [];
  for (const c of candidates) {
    if (!isProvider(c)) continue;
    if (ordered.includes(c)) continue;
    // openai-compat is only usable when a server URL is configured.
    if (c === 'openai-compat' && !openaiCompatConfigured()) continue;
    ordered.push(c);
  }
  // Never end up with nothing to try (e.g. AI_PROVIDERS was all junk).
  if (ordered.length === 0) ordered.push('claude', 'codex');
  return ordered;
}

async function runProvider(provider: AiProvider, prompt: string, model?: string): Promise<string> {
  switch (provider) {
    case 'claude':
      return runClaude(prompt, model);
    case 'codex':
      return runCodex(prompt, model);
    case 'ollama':
      return runOllama(prompt, model, TIMEOUT_MS);
    case 'openai-compat':
      return runOpenAiCompat(prompt, model, TIMEOUT_MS);
  }
}

/**
 * Run providers in fallback order; on any failure (spawn/HTTP error, empty
 * output, not-installed, connection-refused) fall to the next. Throws only when
 * every provider in the chain fails.
 *
 * The returned `cli` carries the provider name that produced the text. Its
 * declared type stays `AgentCli` for back-compat; at runtime it may be any
 * configured provider (e.g. `ollama`) and is used only as a label.
 */
export async function runAgent(
  prompt: string,
  opts?: { cli?: string; model?: string },
): Promise<{ text: string; cli: AgentCli }> {
  const order = resolveProviders(opts?.cli);
  let lastErr: unknown;
  for (const provider of order) {
    try {
      const text = await runProvider(provider, prompt, opts?.model);
      if (text) return { text, cli: provider as AgentCli };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(
    `all AI providers failed (${order.join(', ')}): ${(lastErr as Error)?.message ?? 'unknown'}`,
  );
}
