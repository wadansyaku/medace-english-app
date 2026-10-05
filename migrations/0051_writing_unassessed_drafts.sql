-- Input/original drafts and AI suggestions are separate from grades/submissions.
CREATE TABLE writing_input_drafts (
  assignment_id TEXT NOT NULL REFERENCES writing_assignments(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 20),
  student_user_id TEXT NOT NULL REFERENCES users(id),
  revision INTEGER NOT NULL CHECK (revision > 0),
  manual_transcript TEXT NOT NULL CHECK (length(manual_transcript) <= 20000),
  asset_ids_json TEXT NOT NULL CHECK (json_valid(asset_ids_json)),
  last_request_id TEXT NOT NULL UNIQUE,
  payload_sha256 TEXT NOT NULL CHECK (length(payload_sha256) = 64),
  last_saved_by TEXT NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (assignment_id, attempt_no)
);

-- No public grant API or automatic approval. Operator evidence is required
-- before any future live request; minors are deliberately not a supported scope.
CREATE TABLE writing_ai_data_approvals (
  assignment_id TEXT PRIMARY KEY REFERENCES writing_assignments(id) ON DELETE CASCADE,
  data_scope TEXT NOT NULL CHECK (data_scope IN ('SYNTHETIC_ONLY', 'ADULT_CONSENTED')),
  operation_scope TEXT NOT NULL CHECK (operation_scope IN ('OCR', 'WRITING_FEEDBACK', 'BOTH')),
  policy_reference TEXT NOT NULL CHECK (length(trim(policy_reference)) > 0),
  approved_by TEXT NOT NULL REFERENCES users(id),
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE writing_ai_drafts (
  request_id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES writing_assignments(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL CHECK (attempt_no BETWEEN 1 AND 20),
  input_revision INTEGER NOT NULL CHECK (input_revision > 0),
  requested_by TEXT NOT NULL REFERENCES users(id),
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  operation TEXT NOT NULL CHECK (operation IN ('OCR', 'WRITING_FEEDBACK')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'READY', 'UNASSESSED')),
  assessment_status TEXT NOT NULL DEFAULT 'UNASSESSED' CHECK (assessment_status = 'UNASSESSED'),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  reason TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_writing_ai_drafts_assignment ON writing_ai_drafts(assignment_id, attempt_no, created_at);
