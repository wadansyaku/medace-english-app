# D1 persistent provider planning budget

Local candidate based on `a706cb7cce5e4f0210f3258ef0012927544aff01`. This work adds migration 0050, a server-only store and isolated SQLite tests. No provider generation, secret access, remote D1 operation or deployment was performed.

## Accounting and transaction boundary

The UTC month is shared globally across workers, users, operations and providers. The $5 planning limit retains a $0.50 safety margin, so dispatch admission stops at $4.50 (4,500,000 microUSD). Accounted amounts include both known measured cost and the full upper bounds of unresolved reservations; they are application metering, not a provider invoice.

`reserve` and `reserveWithMetadata` perform month creation and conditional reservation insertion through `D1.batch`. An INSERT trigger repeats the global guard and updates the counter and audit in that write transaction. The decision is never a preflight SELECT followed by an unconditional INSERT. A random admission nonce distinguishes the winning insertion from duplicate acknowledgements; existing request IDs never authorize a second dispatch. Same IDs with changed fingerprints, quotes, months or metadata conflict.

`settleUsage` uses `UPDATE ... WHERE state = 'RESERVED'` as a compare-and-set. Its trigger atomically replaces the held bound with actual measured microUSD and writes response ID, provider, model, operation, approved pricing version and input/cached/output/total tokens to the reservation and audit. The same settlement is idempotent; a changed settlement conflicts. Known usage is metered for refusals, incomplete responses and invalid output as well as success. Any measured cost above its reserved upper bound blocks further dispatch for that month while retaining the true cost.

Unknown, failed and timed-out calls retain their full reservation without expiry. `recordUnknownOutcome` appends an idempotent failure audit with NULL cost/tokens; invalid usage additionally blocks that month. Callers must record invalid usage after rejected settlement and must never substitute zero. The legacy `settle` contract remains available: missing cost holds the reservation, while a supplied cost creates a COST_ONLY audit with unknown tokens represented as NULL.

Cloudflare documents batch execution as a transaction that rolls back the entire sequence on failure: [D1Database batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch). SQLite trigger effects share the enclosing statement/transaction; this candidate tests admission and settlement rollback by deliberately failing audit insertion. Production D1 migration replay and endpoint integration remain the root release gate.

## Integration contract

`createD1AiBudgetStore(DB, { approvedPricingVersions, now? })` returns `AtomicAiBudgetStore` plus `reserveWithMetadata`, `settleUsage`, `recordUnknownOutcome`, `snapshot(monthKey)` and `exportAudit(monthKey, { afterSequence?, limit? })`. Approved pricing versions are copied from trusted server configuration and accept real provider versions; this implementation does not choose or fetch prices. The server computes upper bounds, fingerprints, provider metadata and usage costs before calling the store.

`snapshot` reports GLOBAL/USD scope, limits, unresolved/settled counts, blocked state and `APPLICATION_METERING_NOT_PROVIDER_INVOICE`. If a valid aggregate exceeds JavaScript's safe integer range, the numeric amount is NULL and its exact decimal text plus `precisionExceeded` are retained. Audit pagination is read-only and capped at 500 rows. The root API must authorize global ADMIN access before calling either read method; these low-level methods do not expose a public route themselves.

## Preservation and validation

Migration 0050 creates only three new tables, indexes and triggers. Existing words, books, SRS history, source ledgers, claims, approvals and original content are unchanged. The ledger has no body, transcript, image, asset name, email, display name or user ID field. Server-generated request IDs and content hashes link operational records without retaining source bodies. Reservation identity and audit records cannot be changed or deleted through the added tables.

The focused suite checks global exhaustion, retries/conflicts, malformed quotes and usage, overrun blocking, unknown usage, duplicate and conflicting settlements, audit rollback, exact oversized totals, pagination and original-schema preservation. Eight independent native SQLite worker connections compete for one persisted file; only four $1 reservations succeed, and a fresh worker/store restores the totals and rejects an already admitted request after reopening. All data are synthetic. The worker bundle is a temporary test harness, not an application build.

Full migration count assertions, D1 runtime replay, route authorization, provider adapter integration, application build and complete regression tests are owned by the root release work. No live charge or invoice reconciliation is claimed by these local tests.

Local validation on this candidate: `vitest run tests/ai-provider-budget-d1.test.ts` passed 35/35 tests; `tsc --noEmit` and `git diff --check` passed. Node 22's native SQLite experimental warning is expected in this isolated harness.
