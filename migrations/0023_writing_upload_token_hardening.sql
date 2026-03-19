ALTER TABLE writing_submission_assets
  ADD COLUMN upload_expires_at INTEGER;

ALTER TABLE writing_submission_assets
  ADD COLUMN upload_consumed_at INTEGER;

ALTER TABLE writing_submission_assets
  ADD COLUMN uploaded_etag TEXT;

UPDATE writing_submission_assets
SET upload_expires_at = created_at + (15 * 60 * 1000)
WHERE upload_token IS NOT NULL
  AND upload_expires_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_writing_assets_upload_token_active
  ON writing_submission_assets(upload_token, upload_expires_at, upload_consumed_at);
