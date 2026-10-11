-- Bot-only metadata. No prompts, answers, user IDs, IPs, or personal records.
-- Retain the complete maximum reservation after uncertain/completed outcomes.
CREATE TABLE IF NOT EXISTS bot_product_support_requests (
  actor_hash TEXT NOT NULL CHECK(length(actor_hash)=64),
  request_key TEXT NOT NULL CHECK(length(request_key)=64),
  request_hash TEXT NOT NULL CHECK(length(request_hash)=64),
  dispatch_token TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('GUEST','STUDENT','INSTRUCTOR','GROUP_ADMIN','ADMIN')),
  target_version TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('RESERVED','COMPLETED','UNKNOWN')),
  operation TEXT NOT NULL CHECK(operation IN ('PUBLIC_KB','GENERATION')),
  day_key TEXT NOT NULL,
  month_key TEXT NOT NULL,
  reserved_micro_usd INTEGER NOT NULL CHECK(typeof(reserved_micro_usd)='integer' AND reserved_micro_usd>=0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY(actor_hash,request_key)
);
CREATE INDEX IF NOT EXISTS idx_bot_support_month ON bot_product_support_requests(month_key);
CREATE INDEX IF NOT EXISTS idx_bot_support_day_actor ON bot_product_support_requests(day_key,actor_hash);
CREATE INDEX IF NOT EXISTS idx_bot_support_recent_actor ON bot_product_support_requests(actor_hash,created_at);
CREATE INDEX IF NOT EXISTS idx_bot_support_state ON bot_product_support_requests(state);
