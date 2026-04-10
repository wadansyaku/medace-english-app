# Production Baseline Analysis (2026-03-28)

## Scope

- Source of truth: production Cloudflare D1 `medace-db`
- Query date: 2026-03-28
- Query mode: aggregate only, no raw PII extraction
- Query asset: [`../../scripts/analysis/production-baseline.sql`](../../scripts/analysis/production-baseline.sql)

## How To Re-run

```bash
node ./scripts/analysis/run-production-baseline.mjs --database medace-db
```

Reference query pack:

```bash
node node_modules/wrangler/bin/wrangler.js d1 execute medace-db --remote \
  --file=./scripts/analysis/production-baseline.sql \
  --json
```

## Baseline Summary

- Total users: 21
- Role and plan mix:
  - `STUDENT / TOC_FREE`: 15
  - `STUDENT / TOB_PAID`: 4
  - `INSTRUCTOR / TOB_PAID`: 2
- Organizations: 1
  - `Steady Study Demo Academy`
  - active members: 6
  - students: 4
  - staff: 2
- Books: 45
- Declared words: 66,266
- Catalog mix:
  - `LICENSED_PARTNER / BUSINESS_ONLY`: 39 books, 52,667 words
  - `STEADY_STUDY_ORIGINAL / ALL_PLANS`: 6 books, 13,599 words

## Actual Learning Usage

- `learning_histories`: 166 rows
- Distinct learners with history: 5
- Distinct books touched: 4
- Average accuracy from stored history rows: 0.8252
- History status mix:
  - `review`: 117
  - `learning`: 43
  - `graduated`: 6
- `learning_interaction_events` in last 7 days:
  - active users: 1
  - events: 46
- `learning_interaction_events` in last 30 days:
  - active users: 1
  - events: 119
- Interaction mix:
  - `STUDY / (none)`: 114
  - `QUIZ / SPELLING_HINT`: 5

## Daily Activity Pattern

Last 30 days of interaction activity:

- 2026-03-16: 1 active user, 20 events
- 2026-03-17: 1 active user, 33 events
- 2026-03-20: 1 active user, 20 events
- 2026-03-26: 1 active user, 1 event
- 2026-03-27: 1 active user, 45 events

Interpretation:

- Production is not yet a broad live cohort.
- The current dataset reflects focused dogfooding or very limited early usage.
- Product decisions for B2B workflow optimization should not assume representative school operations yet.

## Book Adoption

Top books by distinct learners:

- `DUO3.0` (`LICENSED_PARTNER`): 3 learners, 36 history rows
- `レベル1` (`STEADY_STUDY_ORIGINAL`): 2 learners, 100 history rows
- `レベル4` (`STEADY_STUDY_ORIGINAL`): 1 learner, 20 history rows
- `レベル6` (`STEADY_STUDY_ORIGINAL`): 1 learner, 10 history rows

Interpretation:

- The starter original catalog is actually being used, not just the licensed catalog.
- The licensed business-only catalog exists in production, but operational B2B usage is not yet visible elsewhere.

## AI Usage Reality

- `ai_usage_events` currently contain one live action type:
  - `2026-03 / generateGeminiSentence`: 3 requests, 360 milli-yen estimated
- Plan mix of AI usage:
  - `TOC_FREE / generateGeminiSentence`: 3 requests, 360 milli-yen
- No image generation usage recorded in production.
- No quiz generation, learning-plan generation, instructor follow-up, OCR, or writing evaluation usage recorded in production.

Interpretation:

- Current production AI load is negligible.
- The cost model is still mostly theoretical in live operations.
- Any implementation prioritization based on AI cost should focus first on instrumentation quality, not optimization for scale.

## Word Hint Asset Reality

- Total words: 66,266
- Words with cached examples: 3
- Words with cached images: 0
- Example audit status:
  - `APPROVED`: 1
  - `PENDING`: 1
  - due or never audited after generation: 2
  - `NULL`: 66,264
- Image audit status:
  - generated images: 0
  - all image audit columns are effectively untouched

Interpretation:

- The hint-asset system is implemented but not yet materially exercised in production.
- The next implementation phase should optimize for observability and fallback quality, not bulk cache management.

## Business Workflow Reality

- `commercial_requests`: 0
- `weekly_missions`: 0
- `weekly_mission_assignments`: 0
- `student_instructor_assignments`: 0
- `instructor_notifications`: 0
- `organization_kpi_daily_snapshots`: 0
- `writing_assignments`: 0
- `writing_submissions`: 0
- `writing_ai_evaluations`: 0
- `writing_teacher_reviews`: 0

Interpretation:

- The B2B operating system exists in schema and UI, but production has not validated the operational loops yet.
- Any implementation plan should explicitly separate:
  - core architecture hardening
  - instrumentation hardening
  - B2B feature activation and dogfooding

## Data Integrity Checks

- Users with organization but no active membership: 0
- Business-plan users without organization: 0
- Active memberships with mismatched `organization_id`: 0
- Active memberships with mismatched role: 0
- Books whose `word_count` differs from actual `words` rows: 0
- Learning plans with empty `selected_book_ids`: 0
- Learning plans with missing referenced books: 0

Interpretation:

- On the current dataset, integrity is clean.
- The bigger risk is not corruption in existing rows.
- The bigger risk is that several production pathways are not exercised enough to reveal edge-case failures.

## Recency Markers

- Latest user update: 2026-03-28T03:44:39+09:00
- Latest learning interaction: 2026-03-28T03:44:39+09:00
- Latest AI usage: 2026-03-28T03:43:17+09:00
- Latest learning plan update: 2026-03-26T18:52:17+09:00
- Latest commercial request: none
- Latest mission update: none
- Latest writing assignment update: none

## What This Changes

- Do not treat production as proof that the B2B workflows are working under real use.
- Do treat production as proof that:
  - auth is alive
  - student study flows are alive
  - core catalog data is loaded
  - plan persistence works for a small cohort
  - example generation path has at least minimal real traffic
- The next implementation planning cycle should be driven by "activation and observability" before "scale optimization".
