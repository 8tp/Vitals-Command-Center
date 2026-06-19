import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { Response } from 'express';
import type { OAuthServerProvider, AuthorizationParams } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { InvalidGrantError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';

/**
 * Minimal single-user OAuth 2.1 authorization server for the MCP endpoint.
 *
 * The human approval gate is HTTP Basic auth on /authorize (handled in http.ts);
 * by the time authorize() runs here, the operator has already proven identity, so
 * we auto-issue the code. claude.ai dynamically registers, runs PKCE
 * authorize→token, and calls /mcp with the bearer token. PKCE is validated by the
 * SDK token handler using the challenge we return from challengeForAuthorizationCode.
 *
 * Clients + tokens persist to disk so server restarts don't disconnect claude.ai.
 */

const ACCESS_TTL_SEC = 3600;
/**
 * Dynamic client registration is open per the OAuth/MCP spec, and every client is
 * persisted to disk — on a public endpoint that's an unbounded-growth / DoS
 * surface. Cap the number of stored clients; when full, evict clients that have
 * no live access OR refresh tokens before accepting a new registration. claude.ai
 * re-registers freely, so as long as it holds tokens it is never evicted.
 */
const MAX_CLIENTS = 25;

interface StoredCode {
  clientId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  expiresAt: number; // epoch sec
}
interface Persisted {
  clients: Record<string, OAuthClientInformationFull>;
  tokens: Record<string, { clientId: string; scopes: string[]; expiresAt: number }>;
  refresh: Record<string, { clientId: string; scopes: string[] }>;
}

function tok(): string {
  return randomBytes(32).toString('hex');
}

export class FileOAuthProvider implements OAuthServerProvider {
  private data: Persisted;
  private codes = new Map<string, StoredCode>(); // ephemeral

  constructor(private readonly file: string) {
    this.data = existsSync(file)
      ? (JSON.parse(readFileSync(file, 'utf8')) as Persisted)
      : { clients: {}, tokens: {}, refresh: {} };
  }

  private save(): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  /** Set of client_ids that currently hold a live access or refresh token. */
  private clientsWithTokens(): Set<string> {
    const live = new Set<string>();
    const now = nowSec();
    for (const t of Object.values(this.data.tokens)) {
      if (t.expiresAt >= now) live.add(t.clientId);
    }
    for (const r of Object.values(this.data.refresh)) live.add(r.clientId);
    return live;
  }

  /**
   * Keep the persisted client store bounded. Called before each registration:
   * if at/over the cap, drop clients with no live tokens (oldest client_issued_at
   * first). claude.ai keeps tokens, so it survives; abandoned/abusive clients go.
   */
  private evictIfFull(): void {
    const ids = Object.keys(this.data.clients);
    if (ids.length < MAX_CLIENTS) return;
    const live = this.clientsWithTokens();
    const evictable = ids
      .filter((id) => !live.has(id))
      .sort(
        (a, b) =>
          (this.data.clients[a]?.client_id_issued_at ?? 0) -
          (this.data.clients[b]?.client_id_issued_at ?? 0),
      );
    // Free at least one slot for the incoming registration.
    const need = ids.length - MAX_CLIENTS + 1;
    for (const id of evictable.slice(0, need)) delete this.data.clients[id];
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: async (id: string) => this.data.clients[id],
      registerClient: async (client: OAuthClientInformationFull) => {
        this.evictIfFull();
        this.data.clients[client.client_id] = client;
        this.save();
        return client;
      },
    };
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const code = tok();
    this.codes.set(code, {
      clientId: client.client_id,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? [],
      expiresAt: nowSec() + 600,
    });
    const url = new URL(params.redirectUri);
    url.searchParams.set('code', code);
    if (params.state) url.searchParams.set('state', params.state);
    res.redirect(url.toString());
  }

  async challengeForAuthorizationCode(
    _client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const entry = this.codes.get(authorizationCode);
    if (!entry || entry.expiresAt < nowSec()) throw new InvalidGrantError('invalid or expired code');
    return entry.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<OAuthTokens> {
    const entry = this.codes.get(authorizationCode);
    if (!entry || entry.clientId !== client.client_id || entry.expiresAt < nowSec()) {
      throw new InvalidGrantError('invalid or expired code');
    }
    this.codes.delete(authorizationCode);
    return this.issue(client.client_id, entry.scopes);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
  ): Promise<OAuthTokens> {
    const entry = this.data.refresh[refreshToken];
    if (!entry || entry.clientId !== client.client_id) {
      throw new InvalidGrantError('invalid refresh token');
    }
    return this.issue(client.client_id, scopes?.length ? scopes : entry.scopes);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const entry = this.data.tokens[token];
    if (!entry || entry.expiresAt < nowSec()) throw new InvalidTokenError('token expired or invalid');
    return { token, clientId: entry.clientId, scopes: entry.scopes, expiresAt: entry.expiresAt };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: { token: string },
  ): Promise<void> {
    delete this.data.tokens[request.token];
    delete this.data.refresh[request.token];
    this.save();
  }

  private issue(clientId: string, scopes: string[]): OAuthTokens {
    const accessToken = tok();
    const refreshToken = tok();
    const expiresAt = nowSec() + ACCESS_TTL_SEC;
    this.data.tokens[accessToken] = { clientId, scopes, expiresAt };
    this.data.refresh[refreshToken] = { clientId, scopes };
    this.save();
    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refreshToken,
      scope: scopes.join(' '),
    };
  }
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}
