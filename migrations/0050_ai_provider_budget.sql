-- Global UTC-month application planning budget, not a provider invoice.
-- No user content, asset names, answers, images or person identifiers are stored.
CREATE TABLE ai_provider_budget_months (
  month_key TEXT PRIMARY KEY CHECK (month_key GLOB '[0-9][0-9][0-9][0-9]-[0-1][0-9]'),
  accounted_micro_usd INTEGER NOT NULL DEFAULT 0 CHECK (typeof(accounted_micro_usd) = 'integer' AND accounted_micro_usd >= 0),
  blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0, 1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE ai_provider_budget_reservations (
  request_id TEXT PRIMARY KEY,
  reserve_token TEXT NOT NULL UNIQUE,
  fingerprint TEXT NOT NULL CHECK (length(fingerprint) = 64),
  month_key TEXT NOT NULL REFERENCES ai_provider_budget_months(month_key),
  upper_bound_micro_usd INTEGER NOT NULL CHECK (typeof(upper_bound_micro_usd) = 'integer' AND upper_bound_micro_usd BETWEEN 1 AND 4500000),
  pricing_version TEXT NOT NULL,
  provider TEXT CHECK (provider IN ('OPENAI', 'CLOUDFLARE')),
  model TEXT,
  operation TEXT CHECK (operation IN ('OCR', 'WRITING_FEEDBACK')),
  state TEXT NOT NULL DEFAULT 'RESERVED' CHECK (state IN ('RESERVED', 'SETTLED')),
  charged_micro_usd INTEGER CHECK (charged_micro_usd IS NULL OR (typeof(charged_micro_usd) = 'integer' AND charged_micro_usd BETWEEN 0 AND 9007199254740991)),
  provider_response_id TEXT,
  input_tokens INTEGER,
  cached_input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  settlement_key TEXT,
  outcome TEXT,
  created_at INTEGER NOT NULL,
  settled_at INTEGER,
  CHECK ((provider IS NULL AND model IS NULL AND operation IS NULL) OR (provider IS NOT NULL AND model IS NOT NULL AND operation IS NOT NULL)),
  CHECK ((state = 'RESERVED' AND charged_micro_usd IS NULL AND settlement_key IS NULL AND settled_at IS NULL)
    OR (state = 'SETTLED' AND charged_micro_usd IS NOT NULL AND settlement_key IS NOT NULL AND settled_at IS NOT NULL)),
  CHECK ((provider_response_id IS NULL AND input_tokens IS NULL AND cached_input_tokens IS NULL AND output_tokens IS NULL AND total_tokens IS NULL)
    OR (provider_response_id IS NOT NULL AND typeof(input_tokens) = 'integer' AND input_tokens >= 0
      AND typeof(cached_input_tokens) = 'integer' AND cached_input_tokens BETWEEN 0 AND input_tokens
      AND typeof(output_tokens) = 'integer' AND output_tokens >= 0
      AND typeof(total_tokens) = 'integer' AND total_tokens = input_tokens + output_tokens AND total_tokens <= 9007199254740991))
);
CREATE INDEX idx_ai_provider_reservations_month ON ai_provider_budget_reservations(month_key, state);

CREATE TABLE ai_provider_usage_audit (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  request_id TEXT NOT NULL REFERENCES ai_provider_budget_reservations(request_id),
  fingerprint TEXT NOT NULL,
  month_key TEXT NOT NULL,
  outcome TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  operation TEXT,
  pricing_version TEXT NOT NULL,
  upper_bound_micro_usd INTEGER NOT NULL,
  charged_micro_usd INTEGER,
  provider_response_id TEXT,
  input_tokens INTEGER,
  cached_input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_ai_provider_usage_audit_month ON ai_provider_usage_audit(month_key, sequence);

CREATE TRIGGER ai_provider_reservation_global_guard BEFORE INSERT ON ai_provider_budget_reservations BEGIN SELECT CASE WHEN NEW.state <> 'RESERVED' THEN RAISE(ABORT, 'AI_BUDGET_INVALID_INITIAL_STATE') END; SELECT CASE WHEN (SELECT blocked FROM ai_provider_budget_months WHERE month_key = NEW.month_key) = 1 THEN RAISE(ABORT, 'AI_BUDGET_BLOCKED') END; SELECT CASE WHEN (SELECT accounted_micro_usd FROM ai_provider_budget_months WHERE month_key = NEW.month_key) + NEW.upper_bound_micro_usd > 4500000 THEN RAISE(ABORT, 'AI_BUDGET_EXHAUSTED') END; END;

CREATE TRIGGER ai_provider_reservation_account AFTER INSERT ON ai_provider_budget_reservations BEGIN UPDATE ai_provider_budget_months SET accounted_micro_usd = accounted_micro_usd + NEW.upper_bound_micro_usd WHERE month_key = NEW.month_key; INSERT INTO ai_provider_usage_audit(event_id, request_id, fingerprint, month_key, outcome, provider, model, operation, pricing_version, upper_bound_micro_usd, created_at) VALUES ('reserved:' || NEW.request_id, NEW.request_id, NEW.fingerprint, NEW.month_key, 'RESERVED', NEW.provider, NEW.model, NEW.operation, NEW.pricing_version, NEW.upper_bound_micro_usd, NEW.created_at); END;

CREATE TRIGGER ai_provider_reservation_immutable BEFORE UPDATE ON ai_provider_budget_reservations BEGIN SELECT CASE WHEN OLD.state = 'SETTLED' OR NEW.request_id IS NOT OLD.request_id OR NEW.reserve_token IS NOT OLD.reserve_token OR NEW.fingerprint IS NOT OLD.fingerprint OR NEW.month_key IS NOT OLD.month_key OR NEW.upper_bound_micro_usd IS NOT OLD.upper_bound_micro_usd OR NEW.pricing_version IS NOT OLD.pricing_version OR NEW.provider IS NOT OLD.provider OR NEW.model IS NOT OLD.model OR NEW.operation IS NOT OLD.operation OR NEW.created_at IS NOT OLD.created_at OR NEW.state <> 'SETTLED' THEN RAISE(ABORT, 'AI_BUDGET_IMMUTABLE_RESERVATION') END; END;

CREATE TRIGGER ai_provider_settlement_account AFTER UPDATE ON ai_provider_budget_reservations WHEN OLD.state = 'RESERVED' AND NEW.state = 'SETTLED' BEGIN UPDATE ai_provider_budget_months SET accounted_micro_usd = accounted_micro_usd - OLD.upper_bound_micro_usd + NEW.charged_micro_usd, blocked = CASE WHEN NEW.charged_micro_usd > OLD.upper_bound_micro_usd THEN 1 ELSE blocked END WHERE month_key = NEW.month_key; INSERT INTO ai_provider_usage_audit(event_id, request_id, fingerprint, month_key, outcome, provider, model, operation, pricing_version, upper_bound_micro_usd, charged_micro_usd, provider_response_id, input_tokens, cached_input_tokens, output_tokens, total_tokens, created_at) VALUES ('settled:' || NEW.request_id, NEW.request_id, NEW.fingerprint, NEW.month_key, NEW.outcome, NEW.provider, NEW.model, NEW.operation, NEW.pricing_version, NEW.upper_bound_micro_usd, NEW.charged_micro_usd, NEW.provider_response_id, NEW.input_tokens, NEW.cached_input_tokens, NEW.output_tokens, NEW.total_tokens, NEW.settled_at); END;

CREATE TRIGGER ai_provider_invalid_usage_blocks AFTER INSERT ON ai_provider_usage_audit WHEN NEW.outcome = 'INVALID_USAGE' BEGIN UPDATE ai_provider_budget_months SET blocked = 1 WHERE month_key = NEW.month_key; END;

-- No automatic expiry/release/deletion can manufacture unused budget.
CREATE TRIGGER ai_provider_reservation_no_delete BEFORE DELETE ON ai_provider_budget_reservations BEGIN SELECT RAISE(ABORT, 'AI_BUDGET_HISTORY_REQUIRED'); END;
CREATE TRIGGER ai_provider_audit_no_update BEFORE UPDATE ON ai_provider_usage_audit BEGIN SELECT RAISE(ABORT, 'AI_BUDGET_AUDIT_IMMUTABLE'); END;
CREATE TRIGGER ai_provider_audit_no_delete BEFORE DELETE ON ai_provider_usage_audit BEGIN SELECT RAISE(ABORT, 'AI_BUDGET_AUDIT_REQUIRED'); END;
