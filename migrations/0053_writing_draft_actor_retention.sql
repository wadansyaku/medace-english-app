-- Preserve originals, requests and approval evidence after an actor account
-- expires. An approval without its current ADMIN still fails the server JOIN.
PRAGMA defer_foreign_keys = ON;

CREATE TABLE writing_input_drafts_next (
  assignment_id TEXT NOT NULL REFERENCES writing_assignments(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 20),
  student_user_id TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  manual_transcript TEXT NOT NULL CHECK (length(manual_transcript) <= 20000),
  asset_ids_json TEXT NOT NULL CHECK (json_valid(asset_ids_json)),
  last_request_id TEXT NOT NULL UNIQUE,
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  last_saved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, attempt_no)
);
INSERT INTO writing_input_drafts_next SELECT * FROM writing_input_drafts;
DROP TABLE writing_input_drafts;
ALTER TABLE writing_input_drafts_next RENAME TO writing_input_drafts;

CREATE TABLE writing_ai_data_approvals_next (
  assignment_id TEXT PRIMARY KEY REFERENCES writing_assignments(id) ON DELETE CASCADE,
  data_scope TEXT NOT NULL CHECK (data_scope IN ('SYNTHETIC_ONLY', 'ADULT_CONSENTED')),
  operation_scope TEXT NOT NULL CHECK (operation_scope IN ('OCR', 'WRITING_FEEDBACK', 'BOTH')),
  policy_reference TEXT NOT NULL CHECK (length(trim(policy_reference)) > 0),
  approved_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);
INSERT INTO writing_ai_data_approvals_next SELECT * FROM writing_ai_data_approvals;
DROP TABLE writing_ai_data_approvals;
ALTER TABLE writing_ai_data_approvals_next RENAME TO writing_ai_data_approvals;

CREATE TABLE writing_ai_drafts_next (
  request_id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES writing_assignments(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 20),
  input_revision INTEGER NOT NULL CHECK (input_revision > 0),
  requested_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  operation TEXT NOT NULL CHECK (operation IN ('OCR', 'WRITING_FEEDBACK')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'READY', 'UNASSESSED')),
  assessment_status TEXT NOT NULL DEFAULT 'UNASSESSED' CHECK (assessment_status = 'UNASSESSED'),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO writing_ai_drafts_next SELECT * FROM writing_ai_drafts;
DROP TABLE writing_ai_drafts;
ALTER TABLE writing_ai_drafts_next RENAME TO writing_ai_drafts;
CREATE INDEX idx_writing_ai_drafts_assignment ON writing_ai_drafts(assignment_id, attempt_no, created_at);

PRAGMA defer_foreign_keys = OFF;
