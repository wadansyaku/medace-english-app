ALTER TABLE words
  ADD COLUMN example_generated_at INTEGER;

ALTER TABLE words
  ADD COLUMN example_audit_status TEXT;

ALTER TABLE words
  ADD COLUMN example_audit_note TEXT;

ALTER TABLE words
  ADD COLUMN example_audited_at INTEGER;

ALTER TABLE words
  ADD COLUMN example_image_key TEXT;

ALTER TABLE words
  ADD COLUMN example_image_content_type TEXT;

ALTER TABLE words
  ADD COLUMN example_image_generated_at INTEGER;

ALTER TABLE words
  ADD COLUMN example_image_audit_status TEXT;

ALTER TABLE words
  ADD COLUMN example_image_audit_note TEXT;

ALTER TABLE words
  ADD COLUMN example_image_audited_at INTEGER;

UPDATE words
SET example_generated_at = updated_at
WHERE example_generated_at IS NULL
  AND example_sentence IS NOT NULL
  AND TRIM(example_sentence) != ''
  AND example_meaning IS NOT NULL
  AND TRIM(example_meaning) != '';

CREATE INDEX IF NOT EXISTS idx_words_example_audit_due
  ON words(example_generated_at, example_audited_at);

CREATE INDEX IF NOT EXISTS idx_words_image_audit_due
  ON words(example_image_generated_at, example_image_audited_at);
