-- A durable claim permits at most one automatic provider attempt per missing word.
-- Failed or uncertain attempts stay claimed; recovery requires an explicit review.
CREATE TABLE word_example_generation_claims (
  word_id TEXT PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
  claim_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  completed_at INTEGER
);
