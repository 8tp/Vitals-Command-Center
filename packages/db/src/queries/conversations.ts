import type { Database } from 'better-sqlite3';
import type {
  Conversation,
  ConversationMessage,
  ConversationSummary,
  ConversationWithMessages,
} from '@vcc/shared';
import { randomUUID } from 'node:crypto';

interface ConvRow {
  id: string;
  title: string;
  anchor_brief_id: string | null;
  anchor_date: string | null;
  created_at: string;
  updated_at: string;
}

interface MsgRow {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

function toConversation(r: ConvRow): Conversation {
  return {
    id: r.id,
    title: r.title,
    anchorBriefId: r.anchor_brief_id,
    anchorDate: r.anchor_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toMessage(r: MsgRow): ConversationMessage {
  return {
    id: r.id,
    conversationId: r.conversation_id,
    role: r.role,
    content: r.content,
    createdAt: r.created_at,
  };
}

export function create(
  db: Database,
  input: { title: string; anchorBriefId?: string | null; anchorDate?: string | null },
): Conversation {
  const id = `conv_${randomUUID()}`;
  db.prepare(
    `INSERT INTO conversations (id, title, anchor_brief_id, anchor_date, created_at, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
  ).run(id, input.title.slice(0, 120), input.anchorBriefId ?? null, input.anchorDate ?? null);
  return meta(db, id)!;
}

export function meta(db: Database, id: string): Conversation | null {
  const row = db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConvRow | undefined;
  return row ? toConversation(row) : null;
}

export function addMessage(
  db: Database,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
): ConversationMessage {
  const id = `msg_${randomUUID()}`;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO conversation_messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
    ).run(id, conversationId, role, content);
    db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`).run(conversationId);
  })();
  const row = db.prepare('SELECT * FROM conversation_messages WHERE id = ?').get(id) as MsgRow;
  return toMessage(row);
}

export function messages(db: Database, conversationId: string): ConversationMessage[] {
  const rows = db
    .prepare('SELECT * FROM conversation_messages WHERE conversation_id = ? ORDER BY created_at ASC, id ASC')
    .all(conversationId) as MsgRow[];
  return rows.map(toMessage);
}

export function get(db: Database, id: string): ConversationWithMessages | null {
  const c = meta(db, id);
  if (!c) return null;
  return { ...c, messages: messages(db, id) };
}

export function list(db: Database, limit = 30): ConversationSummary[] {
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.anchor_date, c.updated_at,
              (SELECT COUNT(*) FROM conversation_messages m WHERE m.conversation_id = c.id) AS message_count
         FROM conversations c
        ORDER BY c.updated_at DESC
        LIMIT ?`,
    )
    .all(limit) as Array<{
    id: string;
    title: string;
    anchor_date: string | null;
    updated_at: string;
    message_count: number;
  }>;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    anchorDate: r.anchor_date,
    updatedAt: r.updated_at,
    messageCount: r.message_count,
  }));
}

export function remove(db: Database, id: string): void {
  db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
}
