import { request } from 'undici';

/**
 * Local / self-hosted AI provider backends for the on-box agent runner.
 *
 * These are HTTP providers that keep ALL inference on-box (or on the user's own
 * LAN): no cloud round-trip, fully private. They complement the CLI providers
 * (`claude`, `codex`) in agentCli.ts. A self-hoster can run fully-local by
 * setting `AI_PROVIDERS=ollama` (or `openai-compat`).
 *
 * - `ollama`        → Ollama's native /api/chat (default http://127.0.0.1:11434)
 * - `openai-compat` → any OpenAI-compatible /v1/chat/completions server
 *                     (LocalAI, LM Studio, vLLM, text-generation-webui, …)
 *
 * Each backend throws on failure (connection refused, HTTP error, empty body)
 * so the caller's fallback chain can move on to the next provider.
 */

/** True if the OpenAI-compatible backend is configured (URL present). */
export function openaiCompatConfigured(): boolean {
  return Boolean(process.env.OPENAI_COMPAT_URL);
}

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

/**
 * Send a single-user-message chat completion to a local Ollama server and
 * return the assistant text. Connection-refused (Ollama not running) surfaces
 * as a thrown error so the fallback chain proceeds.
 */
export async function runOllama(prompt: string, model?: string, timeoutMs?: number): Promise<string> {
  const base = stripTrailingSlash(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434');
  const useModel = model ?? process.env.OLLAMA_MODEL ?? 'llama3.1';
  let res: Awaited<ReturnType<typeof request>>;
  try {
    res = await request(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: useModel,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch (err) {
    // ECONNREFUSED / DNS / socket errors → Ollama not reachable.
    throw new Error(`ollama unreachable at ${base}: ${(err as Error).message}`);
  }

  const raw = await res.body.text();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`ollama HTTP ${res.statusCode}: ${raw.slice(0, 300)}`);
  }
  let parsed: { message?: { content?: string }; error?: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`ollama returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (parsed.error) throw new Error(`ollama error: ${parsed.error}`);
  const text = (parsed.message?.content ?? '').trim();
  if (!text) throw new Error('ollama returned empty content');
  return text;
}

/**
 * Send a single-user-message chat completion to any OpenAI-compatible server
 * (`/v1/chat/completions`) and return the assistant text. The Authorization
 * header is only sent when OPENAI_COMPAT_KEY is set (local servers often need
 * no auth).
 */
export async function runOpenAiCompat(
  prompt: string,
  model?: string,
  timeoutMs?: number,
): Promise<string> {
  const baseRaw = process.env.OPENAI_COMPAT_URL;
  if (!baseRaw) throw new Error('OPENAI_COMPAT_URL is not set');
  const base = stripTrailingSlash(baseRaw);
  const useModel = model ?? process.env.OPENAI_COMPAT_MODEL ?? '';

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.OPENAI_COMPAT_KEY) {
    headers.authorization = `Bearer ${process.env.OPENAI_COMPAT_KEY}`;
  }

  let res: Awaited<ReturnType<typeof request>>;
  try {
    res = await request(`${base}/v1/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: useModel,
        stream: false,
        messages: [{ role: 'user', content: prompt }],
      }),
      headersTimeout: timeoutMs,
      bodyTimeout: timeoutMs,
    });
  } catch (err) {
    throw new Error(`openai-compat unreachable at ${base}: ${(err as Error).message}`);
  }

  const raw = await res.body.text();
  if (res.statusCode < 200 || res.statusCode >= 300) {
    throw new Error(`openai-compat HTTP ${res.statusCode}: ${raw.slice(0, 300)}`);
  }
  let parsed: {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string } | string;
  };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`openai-compat returned non-JSON: ${raw.slice(0, 200)}`);
  }
  if (parsed.error) {
    const msg = typeof parsed.error === 'string' ? parsed.error : parsed.error.message;
    throw new Error(`openai-compat error: ${msg ?? 'unknown'}`);
  }
  const text = (parsed.choices?.[0]?.message?.content ?? '').trim();
  if (!text) throw new Error('openai-compat returned empty content');
  return text;
}
