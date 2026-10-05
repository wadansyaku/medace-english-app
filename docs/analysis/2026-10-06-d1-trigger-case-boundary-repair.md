# D1 trigger CASE boundary repair

Candidate base: `a17a0caa63b94d39282825bded6c23536e7cbd51`. The second ordinary preview workflow passed local regression, doctor and build checks but failed again at remote migration 0050. Putting each trigger on one line was insufficient. Root confirmed 0050 remains unregistered and the preview schema has no `ai_provider_%` objects; production is unchanged.

## Read-only remote comparison

Root isolated a direct parser comparison on the preview D1 REST query path using EXPLAIN rather than executing CREATE. A single-line trigger containing `SELECT CASE WHEN NEW.name IS NULL THEN RAISE(...) END; SELECT 1;` returned error 7500. The otherwise equivalent trigger using `SELECT RAISE(...) WHERE NEW.name IS NULL; SELECT 1;` succeeded, returning 15 EXPLAIN opcodes with `rows_written = 0`, `changes = 0` and `changed_db = false`. A minimal `SELECT 1` trigger also succeeded. The subsequent schema query found no probe trigger or budget objects, and no 0050 ledger registration.

Evidence files are `/tmp/medace-ai-exit-release-evidence-20261006/d1-explain-singleline.stderr`, `d1-explain-singleline-no-case.json`, `d1-explain-singleline-minimal.json` and `d1-explain-schema-after.json`. This is direct evidence that the remote path handles the CASE/END form differently in the controlled probe. It supports the CASE END boundary hypothesis; ordinary CREATE and complete migration success still require the preview gate.

## Minimal equivalent change

The three reservation admission guards and one identity/immutability guard now use `SELECT RAISE(ABORT, 'same_error') WHERE same_predicate` instead of `SELECT CASE WHEN same_predicate THEN RAISE(...) END`. Both forms raise only when the identical predicate is true; false or NULL predicates do not raise. Error codes and every predicate remain unchanged.

The settlement trigger now assigns `blocked = MAX(blocked, NEW.charged_micro_usd > OLD.upper_bound_micro_usd)`. For the schema's non-NULL 0/1 blocked flag and non-NULL settlement cost/bound, this is equivalent to the prior CASE: an overrun blocks, an existing blocked month remains blocked, and an unblocked month with cost at or below its bound stays unblocked. Each trigger keeps uppercase BEGIN/END on one physical LF-only line, with exactly one END keyword and no CASE expression.

The counter update and audit INSERT remain in the same trigger transaction. Reservation nonce/identity, CAS settlement, uncertainty holds, global $4.50 admission, overrun blocking, usage metadata, immutable history and schema preservation are unchanged. Only unregistered candidate migration 0050, its parser tests and this evidence record are changed; no old migration, existing application data or production schema is changed.

## Local validation and release boundary

The focused suite passed 45/45 tests, including complete migration plus ledger append replay, direct SQL admission guards, blocked-state equivalence at below/equal/above-bound values and JavaScript's largest safe integer. Existing tests cover multi-connection reservation competition, duplicate/conflicting settlement, unknown usage retention and audit rollback. `tsc --noEmit` and `git diff --check` passed. This subtask performed no remote write, provider generation or deployment. Root must run the ordinary preview migration gate before claiming complete remote acceptance or proceeding to production.
