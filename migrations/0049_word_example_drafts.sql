-- Offline preparation only. Drafts never change words or participate in learner reads.
-- Human proofreading is input evidence, not permission to publish.
CREATE TABLE word_example_drafts (
  id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
  book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  patch_kind TEXT NOT NULL CHECK (patch_kind IN ('EXAMPLE_PAIR', 'TRANSLATION_ONLY')),
  expected_word TEXT NOT NULL,
  expected_definition TEXT NOT NULL,
  expected_updated_at INTEGER NOT NULL CHECK (expected_updated_at > 0),
  expected_example_sentence TEXT,
  proposed_example_sentence TEXT NOT NULL CHECK (length(trim(proposed_example_sentence)) > 0),
  proposed_example_meaning TEXT NOT NULL CHECK (length(trim(proposed_example_meaning)) > 0),
  input_sha256 TEXT NOT NULL CHECK (length(input_sha256) = 64),
  preparation_evidence_json TEXT NOT NULL,
  review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (review_status = 'PENDING'),
  created_at INTEGER NOT NULL CHECK (created_at > 0)
);

CREATE INDEX idx_word_example_drafts_word ON word_example_drafts(word_id, created_at);
