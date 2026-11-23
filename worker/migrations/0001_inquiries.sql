-- One row per message sent from the /work-with-us/ form.
CREATE TABLE IF NOT EXISTS inquiries (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  org TEXT,
  message TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS inquiries_created ON inquiries (created_at);
