-- Persisted Ask AI conversations so the user can revisit prior chats and ask
-- follow-ups. A conversation may be ANCHORED to a daily brief (anchor_brief_id)
-- when it started as "discuss this brief" — the brief is then fed as context.
CREATE TABLE IF NOT EXISTS conversations (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  anchor_brief_id TEXT,            -- briefings.id this thread follows up on (nullable)
  anchor_date     TEXT,            -- the anchored brief's civil date, for display
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_conv_updated ON conversations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conv_msg ON conversation_messages(conversation_id, created_at);
