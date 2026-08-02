CREATE TABLE IF NOT EXISTS note_shares (
  share_id TEXT PRIMARY KEY,
  note_id TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_note_shares_note_id
ON note_shares(note_id);
