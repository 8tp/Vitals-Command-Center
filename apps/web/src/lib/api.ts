import type {
  ApiResponse,
  BriefingRecord,
  ConversationSummary,
  ConversationWithMessages,
} from '@vcc/shared';

const BASE = import.meta.env.VITE_API_BASE ?? '';

class ApiError extends Error {
  constructor(public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function apiGet<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { Accept: 'application/json', ...init?.headers } });
  const json = (await res.json()) as ApiResponse<T>;
  if (!json.ok) throw new ApiError(json.error.code, json.error.error, json.error.details);
  return json.data;
}

export async function apiPost<TBody, TRes>(path: string, body: TBody): Promise<TRes> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<TRes>;
  if (!json.ok) throw new ApiError(json.error.code, json.error.error, json.error.details);
  return json.data;
}

export async function apiPatch<TBody, TRes>(path: string, body: TBody): Promise<TRes> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as ApiResponse<TRes>;
  if (!json.ok) throw new ApiError(json.error.code, json.error.error, json.error.details);
  return json.data;
}

export async function apiDelete(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE', headers: { Accept: 'application/json' } });
  const json = (await res.json()) as ApiResponse<unknown>;
  if (!json.ok) throw new ApiError(json.error.code, json.error.error, json.error.details);
}

// Ask AI history + daily-brief history.
export const listConversations = () => apiGet<ConversationSummary[]>('/api/conversations');
export const getConversation = (id: string) => apiGet<ConversationWithMessages>(`/api/conversations/${id}`);
export const deleteConversation = (id: string) => apiDelete(`/api/conversations/${id}`);
export const listBriefings = () => apiGet<BriefingRecord[]>('/api/insights/briefings');

export function askStream(
  body: {
    question: string;
    conversationId?: string;
    anchorBriefDate?: string;
    context?: { date?: string; includeBriefing?: boolean };
  },
  onToken: (chunk: string) => void,
  signal?: AbortSignal,
  onMeta?: (meta: { conversationId: string | null }) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    fetch(`${BASE}/api/ask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal,
    })
      .then(async (res) => {
        if (!res.ok || !res.body) throw new Error(`ask HTTP ${res.status}`);
        // The server returns the thread id in a header before streaming the body.
        onMeta?.({ conversationId: res.headers.get('X-Conversation-Id') });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split('\n\n');
          buf = lines.pop() ?? '';
          for (const line of lines) {
            const m = /^data:\s*(.*)$/m.exec(line);
            if (!m) continue;
            const payload = m[1]!;
            if (payload === '[DONE]') return resolve();
            try {
              const parsed = JSON.parse(payload) as { text?: string; error?: string };
              if (parsed.error) throw new Error(parsed.error);
              if (parsed.text) onToken(parsed.text);
            } catch (err) {
              reject(err);
              return;
            }
          }
        }
        resolve();
      })
      .catch(reject);
  });
}
