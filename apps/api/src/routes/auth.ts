import type { FastifyPluginAsync } from 'fastify';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WhoopClient } from '../services/whoop.js';
import { FitbitClient, googleReauthNeeded } from '../services/fitbit.js';
import { StravaClient } from '../services/strava.js';

// apps/api/src/routes → up 4 = repo root.
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

/**
 * WHOOP OAuth routes.
 *
 * Flow:
 *   1. GET /api/auth/whoop/authorize → generate state, redirect to WHOOP.
 *   2. User approves in browser at developer.whoop.com.
 *   3. WHOOP redirects to /api/auth/whoop/callback?code=...&state=...
 *   4. We validate state, exchange code for tokens (WhoopClient persists them),
 *      redirect to WHOOP_POST_AUTH_REDIRECT.
 *
 * State store is in-memory (this is a single-user self-hosted app; no need for Redis).
 * TTL keeps the store from growing if users abandon the flow.
 */
const STATE_TTL_MS = 10 * 60_000;
const states = new Map<string, number>();

function newState(): string {
  const s = randomBytes(16).toString('hex');
  states.set(s, Date.now() + STATE_TTL_MS);
  // Opportunistic cleanup — prevents unbounded growth.
  for (const [k, exp] of states) if (exp < Date.now()) states.delete(k);
  return s;
}

function consumeState(state: string): boolean {
  const exp = states.get(state);
  if (!exp) return false;
  states.delete(state);
  return exp >= Date.now();
}

export const registerAuthRoutes: FastifyPluginAsync = async (app) => {
  app.get('/auth/whoop/authorize', async (_req, reply) => {
    if (!process.env.WHOOP_CLIENT_ID) {
      return reply.status(500).send({
        ok: false,
        error: { error: 'WHOOP_CLIENT_ID not configured', code: 'MISCONFIGURED' },
      });
    }
    const client = new WhoopClient();
    const state = newState();
    return reply.redirect(client.authorizeUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/whoop/callback',
    async (req, reply) => {
      const { code, state, error } = req.query;
      if (error) {
        return reply.status(400).send({ ok: false, error: { error, code: 'WHOOP_DENIED' } });
      }
      if (!code || !state || !consumeState(state)) {
        return reply.status(400).send({
          ok: false,
          error: { error: 'invalid or expired state', code: 'INVALID_STATE' },
        });
      }
      try {
        const client = new WhoopClient();
        await client.exchangeCode(code);
        const dest = process.env.WHOOP_POST_AUTH_REDIRECT ?? 'http://localhost:5173/?connected=whoop';
        return reply.redirect(dest);
      } catch (err) {
        app.log.error({ err }, 'whoop callback failed');
        return reply
          .status(502)
          .send({ ok: false, error: { error: (err as Error).message, code: 'WHOOP_EXCHANGE' } });
      }
    },
  );

  app.get('/auth/whoop/status', async () => {
    const connected = !!process.env.WHOOP_CLIENT_ID && hasStoredTokens();
    return { ok: true, data: { connected } };
  });

  // --- Fitbit Air via Google Health API (Google OAuth 2.0) ----------------
  // Mirror of the WHOOP flow. Redirect URI must match the one registered in
  // Google Cloud Console exactly: http://localhost:3001/api/auth/google/callback
  app.get('/auth/google/authorize', async (_req, reply) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return reply.status(500).send({
        ok: false,
        error: { error: 'GOOGLE_CLIENT_ID not configured', code: 'MISCONFIGURED' },
      });
    }
    const client = new FitbitClient();
    const state = newState();
    return reply.redirect(client.authorizeUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/google/callback',
    async (req, reply) => {
      const { code, state, error } = req.query;
      if (error) {
        return reply.status(400).send({ ok: false, error: { error, code: 'GOOGLE_DENIED' } });
      }
      if (!code || !state || !consumeState(state)) {
        return reply.status(400).send({
          ok: false,
          error: { error: 'invalid or expired state', code: 'INVALID_STATE' },
        });
      }
      try {
        const client = new FitbitClient();
        await client.exchangeCode(code);
        const dest =
          process.env.GOOGLE_POST_AUTH_REDIRECT ?? 'http://localhost:5173/?connected=fitbit';
        return reply.redirect(dest);
      } catch (err) {
        app.log.error({ err }, 'google callback failed');
        return reply
          .status(502)
          .send({ ok: false, error: { error: (err as Error).message, code: 'GOOGLE_EXCHANGE' } });
      }
    },
  );

  app.get('/auth/google/status', async () => {
    const connected = !!process.env.GOOGLE_CLIENT_ID && new FitbitClient().hasTokens();
    // True when a token refresh hit invalid_grant — the user must re-authorize.
    const reauthNeeded = googleReauthNeeded();
    return { ok: true, data: { connected, reauthNeeded } };
  });

  // --- Strava (Strava OAuth 2.0) ------------------------------------------
  // Mirror of the WHOOP flow. The Authorization Callback Domain registered in
  // the Strava API settings must be `localhost` so this redirect URI is allowed:
  // http://localhost:3001/api/auth/strava/callback
  app.get('/auth/strava/authorize', async (_req, reply) => {
    if (!process.env.STRAVA_CLIENT_ID) {
      return reply.status(500).send({
        ok: false,
        error: { error: 'STRAVA_CLIENT_ID not configured', code: 'MISCONFIGURED' },
      });
    }
    const client = new StravaClient();
    const state = newState();
    return reply.redirect(client.authorizeUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/auth/strava/callback',
    async (req, reply) => {
      const { code, state, error } = req.query;
      if (error) {
        return reply.status(400).send({ ok: false, error: { error, code: 'STRAVA_DENIED' } });
      }
      if (!code || !state || !consumeState(state)) {
        return reply.status(400).send({
          ok: false,
          error: { error: 'invalid or expired state', code: 'INVALID_STATE' },
        });
      }
      try {
        const client = new StravaClient();
        await client.exchangeCode(code);
        const dest =
          process.env.STRAVA_POST_AUTH_REDIRECT ?? 'http://localhost:5173/?connected=strava';
        return reply.redirect(dest);
      } catch (err) {
        app.log.error({ err }, 'strava callback failed');
        return reply
          .status(502)
          .send({ ok: false, error: { error: (err as Error).message, code: 'STRAVA_EXCHANGE' } });
      }
    },
  );

  app.get('/auth/strava/status', async () => {
    const connected = !!process.env.STRAVA_CLIENT_ID && new StravaClient().hasTokens();
    return { ok: true, data: { connected } };
  });
};

function hasStoredTokens(): boolean {
  try {
    const raw = process.env.WHOOP_TOKEN_FILE ?? './data/.whoop-tokens.json';
    const abs = isAbsolute(raw) ? raw : resolve(REPO_ROOT, raw);
    return existsSync(abs);
  } catch {
    return false;
  }
}
