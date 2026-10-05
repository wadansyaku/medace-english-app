-- Separate dispatch proof from application status. Existing rows are preserved;
-- an old PENDING row cannot prove that no provider call happened.
CREATE TABLE writing_ai_draft_execution (
  request_id TEXT PRIMARY KEY REFERENCES writing_ai_drafts(request_id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('PREPARING','DISPATCHING','RESPONSE_STORED','FINISHED','LEGACY_UNKNOWN')),
  lease_token TEXT,
  lease_expires_at INTEGER NOT NULL DEFAULT 0,
  budget_request_id TEXT UNIQUE,
  content_fingerprint TEXT CHECK (content_fingerprint IS NULL OR length(content_fingerprint)=64),
  reservation_month TEXT,
  quote_json TEXT CHECK (quote_json IS NULL OR json_valid(quote_json)),
  provider_response_json TEXT CHECK (provider_response_json IS NULL OR json_valid(provider_response_json)),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
INSERT INTO writing_ai_draft_execution(request_id,phase,created_at,updated_at)
  SELECT request_id,'FINISHED',created_at,updated_at FROM writing_ai_drafts WHERE status<>'PENDING';
INSERT INTO writing_ai_draft_execution(request_id,phase,created_at,updated_at)
  SELECT request_id,'LEGACY_UNKNOWN',created_at,updated_at FROM writing_ai_drafts WHERE status='PENDING';

-- New request IDs and different assigned teachers share one dispatch identity
-- for this saved input version. Preserve all legacy duplicate rows/results.
CREATE TABLE writing_ai_draft_canonical_claims (
  assignment_id TEXT NOT NULL REFERENCES writing_assignments(id) ON DELETE CASCADE,
  attempt_no INTEGER NOT NULL,
  input_revision INTEGER NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('OCR','WRITING_FEEDBACK')),
  request_id TEXT NOT NULL UNIQUE REFERENCES writing_ai_drafts(request_id) ON DELETE CASCADE,
  PRIMARY KEY(assignment_id,attempt_no,input_revision,operation)
);
INSERT INTO writing_ai_draft_canonical_claims(assignment_id,attempt_no,input_revision,operation,request_id)
  SELECT d.assignment_id,d.attempt_no,d.input_revision,d.operation,d.request_id FROM writing_ai_drafts d
  WHERE d.request_id=(SELECT c.request_id FROM writing_ai_drafts c
    WHERE c.assignment_id=d.assignment_id AND c.attempt_no=d.attempt_no
      AND c.input_revision=d.input_revision AND c.operation=d.operation
    ORDER BY (c.status='READY') DESC,(c.status='UNASSESSED') DESC,c.created_at,c.request_id LIMIT 1);

-- Lost canonical-response acknowledgements remain findable by the caller's ID.
CREATE TABLE writing_ai_draft_request_aliases (
  alias_request_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES writing_ai_drafts(request_id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL CHECK (length(fingerprint)=64),
  created_at INTEGER NOT NULL
);
