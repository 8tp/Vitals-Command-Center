#!/usr/bin/env node
import { config as loadEnv } from 'dotenv';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, randomUUID, randomBytes } from 'node:crypto';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
loadEnv({ path: resolve(REPO_ROOT, '.env') });

import express, { type Request, type Response, type NextFunction } from 'express';
import { rateLimit } from 'express-rate-limit';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { requireBearerAuth } from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import { openDb } from '@vcc/db';
import { buildServer } from './server.js';
import { FileOAuthProvider } from './oauthProvider.js';

const PORT = Number(process.env.MCP_HTTP_PORT ?? 8787);
const PUBLIC_URL = process.env.MCP_PUBLIC_URL ?? `http://localhost:${PORT}`;
const AUTH_USER = process.env.MCP_AUTH_USER ?? '';
const AUTH_PASS = process.env.MCP_AUTH_PASSWORD ?? '';
const OAUTH_FILE = resolveRepo(process.env.MCP_OAUTH_FILE ?? './data/.mcp-oauth.json');

if (!AUTH_USER || !AUTH_PASS) {
  process.stderr.write(
    '[vcc-mcp-http] refusing to start: set MCP_AUTH_USER and MCP_AUTH_PASSWORD in .env\n',
  );
  process.exit(1);
}

// Public endpoint: open the DB read-only so the internet-facing server can never
// write. Write tools (save_briefing / log_habit_entry) are dropped from this
// server's tool list (see buildServer({ readonly: true }) below); the local
// stdio server (index.ts) keeps full write access.
const db = openDb({ readonly: true, migrate: false });
const provider = new FileOAuthProvider(OAUTH_FILE);
const app = express();
app.set('trust proxy', 'loopback'); // behind Tailscale Funnel (proxies from 127.0.0.1)
// Lightweight request log (method/path/status only — never headers/bodies).
app.use((req, res, next) => {
  const t = Date.now();
  const hasAuth = req.headers.authorization ? 'auth' : 'noauth';
  res.on('finish', () =>
    process.stderr.write(
      `[vcc-mcp-http] ${req.method} ${req.originalUrl} [${hasAuth}] -> ${res.statusCode} ${Date.now() - t}ms\n`,
    ),
  );
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// --- Human approval gate: HTML login page on /authorize ---------------------
// claude.ai opens /authorize in a browser popup. HTTP Basic auth does NOT
// reliably prompt inside that popup, so we render a real password page. On
// success we set a short-lived approval cookie and re-enter /authorize, which
// the OAuth router then handles (issuing the code). Every other OAuth endpoint
// is public by spec (codes are PKCE-bound + single-use).
const approvals = new Map<string, number>(); // cookie token -> expiry(ms)
function issueApproval(): string {
  const t = randomBytes(16).toString('hex');
  approvals.set(t, Date.now() + 600_000);
  return t;
}
function isApproved(req: Request): boolean {
  const m = /(?:^|;\s*)vcc_appr=([a-f0-9]+)/.exec(req.headers.cookie ?? '');
  if (!m || !m[1]) return false;
  const exp = approvals.get(m[1]);
  return !!exp && exp > Date.now();
}
function loginPage(fields: Record<string, unknown>, error?: string): string {
  const hidden = Object.entries(fields)
    .filter(([k]) => k !== '__user' && k !== '__password')
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(String(v))}">`)
    .join('');
  return `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1">
<body style="font-family:system-ui;max-width:340px;margin:14vh auto;padding:0 16px">
<h2>Vitals MCP</h2>${error ? `<p style="color:#c0392b">${esc(error)}</p>` : ''}
<form method="POST" action="/authorize">${hidden}
<input name="__user" placeholder="Username" autocapitalize="off" autocorrect="off" style="width:100%;padding:10px;margin:6px 0;box-sizing:border-box">
<input name="__password" type="password" placeholder="Password" style="width:100%;padding:10px;margin:6px 0;box-sizing:border-box">
<button style="width:100%;padding:10px;margin-top:8px">Authorize</button></form>`;
}

// --- Brute-force protection for the single-password gate --------------------
// The /authorize password page is internet-facing (Tailscale Funnel) and guards
// a single credential, so unlimited POSTs are brute-forceable. Track FAILED
// attempts per IP and lock the IP out for 15 min after 5 failures. A successful
// auth clears the counter, so legitimate retries aren't penalized.
const MAX_FAILS = 5;
const LOCKOUT_MS = 15 * 60_000;
interface FailState {
  count: number;
  resetAt: number; // window/lockout expiry (ms)
}
const failsByIp = new Map<string, FailState>();
function clientIp(req: Request): string {
  return req.ip ?? req.socket.remoteAddress ?? 'unknown';
}
function isLockedOut(ip: string): boolean {
  const s = failsByIp.get(ip);
  if (!s) return false;
  if (s.resetAt <= Date.now()) {
    failsByIp.delete(ip);
    return false;
  }
  return s.count >= MAX_FAILS;
}
function recordFail(ip: string): void {
  const now = Date.now();
  const s = failsByIp.get(ip);
  if (!s || s.resetAt <= now) {
    failsByIp.set(ip, { count: 1, resetAt: now + LOCKOUT_MS });
    return;
  }
  s.count += 1;
  s.resetAt = now + LOCKOUT_MS; // sliding window: keep extending while attacking
}
// Opportunistically prune expired entries so the map can't grow unbounded.
function pruneFails(): void {
  const now = Date.now();
  for (const [ip, s] of failsByIp) if (s.resetAt <= now) failsByIp.delete(ip);
}

app.get('/authorize', (req: Request, res: Response, next: NextFunction) => {
  if (isApproved(req)) {
    next();
    return;
  }
  res.type('html').send(loginPage(req.query as Record<string, unknown>));
});
app.post('/authorize', (req: Request, res: Response) => {
  pruneFails();
  const ip = clientIp(req);
  if (isLockedOut(ip)) {
    res
      .status(429)
      .type('html')
      .send(loginPage(req.body as Record<string, unknown>, 'Too many attempts. Try again in 15 minutes.'));
    return;
  }
  const body = req.body as Record<string, unknown>;
  if (!safeEq(String(body.__user ?? ''), AUTH_USER) || !safeEq(String(body.__password ?? ''), AUTH_PASS)) {
    recordFail(ip);
    res.status(401).type('html').send(loginPage(body, 'Incorrect username or password'));
    return;
  }
  failsByIp.delete(ip); // success clears the counter
  res.set(
    'Set-Cookie',
    `vcc_appr=${issueApproval()}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=600`,
  );
  const { __user, __password, ...rest } = body;
  void __user;
  void __password;
  res.redirect(`/authorize?${new URLSearchParams(rest as Record<string, string>).toString()}`);
});

// --- OAuth 2.1 endpoints (metadata, register, authorize, token, revoke) -----
// Coarse IP rate limit on the unauthenticated, write-ish OAuth endpoints to blunt
// abuse on the public Funnel. /register persists a client to disk on success, so
// it's the main DoS surface; the password-gate limiter above is the finer guard.
const oauthLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 60,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(['/register', '/authorize', '/token'], oauthLimiter);

app.use(
  mcpAuthRouter({
    provider,
    issuerUrl: new URL(PUBLIC_URL),
    resourceServerUrl: new URL(`${PUBLIC_URL}/mcp`),
    resourceName: 'Vitals Command Center',
    scopesSupported: ['vitals:read'],
  }),
);

// --- Protected MCP endpoint (Streamable HTTP with session management) -------
// The 401 MUST advertise where the OAuth metadata lives, or clients (claude.ai)
// can't discover how to authenticate and never reach /register.
const RESOURCE_METADATA_URL = `${PUBLIC_URL.replace(/\/$/, '')}/.well-known/oauth-protected-resource/mcp`;
const bearer = requireBearerAuth({ verifier: provider, resourceMetadataUrl: RESOURCE_METADATA_URL });
const transports: Record<string, StreamableHTTPServerTransport> = {};

app.post('/mcp', bearer, async (req: Request, res: Response) => {
  try {
    const sid = req.headers['mcp-session-id'] as string | undefined;
    let transport = sid ? transports[sid] : undefined;

    if (!transport && isInitializeRequest(req.body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          transports[id] = transport as StreamableHTTPServerTransport;
        },
      });
      transport.onclose = () => {
        if (transport?.sessionId) delete transports[transport.sessionId];
      };
      await buildServer(db, { readonly: true }).connect(transport);
    } else if (!transport) {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'No valid session ID' },
        id: null,
      });
      return;
    }
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    process.stderr.write(`[vcc-mcp-http] request error: ${(err as Error).message}\n`);
    if (!res.headersSent) res.status(500).json({ error: 'internal_error' });
  }
});

// GET = server→client SSE stream; DELETE = end session. Both need a live session.
const bySession = async (req: Request, res: Response): Promise<void> => {
  const sid = req.headers['mcp-session-id'] as string | undefined;
  const transport = sid ? transports[sid] : undefined;
  if (!transport) {
    res.status(400).send('Invalid or missing session ID');
    return;
  }
  await transport.handleRequest(req, res);
};
app.get('/mcp', bearer, bySession);
app.delete('/mcp', bearer, bySession);

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Bind loopback only — Tailscale Funnel proxies from 127.0.0.1, so this blocks
// direct LAN access while keeping the public Funnel path working.
app.listen(PORT, '127.0.0.1', () => {
  process.stderr.write(`[vcc-mcp-http] listening on 127.0.0.1:${PORT} (public via Funnel: ${PUBLIC_URL})\n`);
});

function resolveRepo(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}
function safeEq(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string,
  );
}
