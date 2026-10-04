-- Internal ownership never appears in the public report projection.
-- Owner/organization deletion removes their reports. Deleting a separate actor
-- retains immutable event content and role while removing the internal actor ID.
CREATE TABLE product_feedback_reports (
 id TEXT PRIMARY KEY, reporter_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, org_id TEXT REFERENCES organizations(id) ON DELETE CASCADE,
 create_fingerprint TEXT NOT NULL, input_json TEXT NOT NULL, revision INTEGER NOT NULL CHECK(revision >= 1),
 status TEXT NOT NULL CHECK(status IN ('NEW','TRIAGED','HANDOFF_PREPARED','FIXED','RETEST_PASS','RETEST_FAIL')),
 priority TEXT CHECK(priority IN ('P0','P1','P2','P3')), acceptance TEXT, fix_revision TEXT,
 created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX product_feedback_updated ON product_feedback_reports(updated_at DESC,id DESC);
CREATE INDEX product_feedback_owner_updated ON product_feedback_reports(reporter_user_id,org_id,updated_at DESC,id DESC);
CREATE TABLE product_feedback_events (
 report_id TEXT NOT NULL REFERENCES product_feedback_reports(id) ON DELETE CASCADE, revision INTEGER NOT NULL,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, actor_role TEXT NOT NULL CHECK(actor_role IN ('INSTRUCTOR','ADMIN')),
 status TEXT NOT NULL, note TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(report_id,revision)
);
CREATE TABLE product_feedback_receipts (
 report_id TEXT NOT NULL REFERENCES product_feedback_reports(id) ON DELETE CASCADE, mutation_id TEXT NOT NULL,
 actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL, fingerprint TEXT NOT NULL, response_json TEXT NOT NULL,
 PRIMARY KEY(report_id,mutation_id)
);
