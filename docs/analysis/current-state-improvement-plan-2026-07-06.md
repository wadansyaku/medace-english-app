> 履歴資料（2026-09-07に整理）。現行の計画と検証状態は [再構築計画](./rebuild-plan-2026-09-07.md) を参照。この文書の完了・本番数値は記録当時のものです。

# Steady Study Current-State Review And Improvement Plan

Date: 2026-07-06 JST

## Executive Summary

Steady Study is technically healthier than an early prototype: the fast verification gate passes, production Cloudflare settings are aligned, D1 schema replay succeeds, and the app already has broad test coverage. The main issue is not that the product cannot run. The main issue is that the product has more surface area than active operational proof.

The product should be treated as a B2B-first school/cram-school SaaS, not only as a learner vocabulary app. From that lens, the biggest gaps are:

1. The B2B value loop is not active in production: commercial request, provisioning, cohort, instructor assignment, mission, notification, writing submission, and writing review are not yet one continuous loop.
2. PMF instrumentation exists, but PMF judgment is still weak because pricing, contract status, revenue, and minimum sample-size gates are not wired into the funnel.
3. Learner UX has been simplified, but first-viewport choice overload can reappear through Hero CTA, task rail, reference rail, mobile nav, and English practice lanes.
4. Release trust is strong locally and in current production, but CI/deploy workflows still have fail-open or drift-prone edges.
5. Data integrity is mostly clean today, but several important write paths are non-atomic or have double sources of truth.

## Verification Snapshot

Current production and local checks performed during this review:

- `npm run verify:fast`: passed. Migration name check, local D1 migration replay, TypeScript, and 100 Vitest files / 496 tests passed.
- `npm run security:audit`: passed with one documented `xlsx` exception.
- `npm run build`: passed. Largest relevant chunks include `index` about 286 KB, `Dashboard` about 220 KB, `BusinessAdminDashboard` about 98 KB, and `EnglishPracticeHub` about 86 KB.
- `npm run cf:doctor`: passed with `ok=54 warn=0 error=0`.
- Live `/api/session`: returned `204` with `x-deployment-sha=fe31a76fc79072d53596a67bb6a25ec320e168fa`, matching local `HEAD`.
- Production baseline, B2B activation, and source ledger read-only checks completed against remote `medace-db`.
- `npm run content:qa` without an input failed because the script requires `--input`; this is a command ergonomics issue, not evidence of content failure.

Production data highlights from the remote baseline:

- Users: 1 admin, 1 instructor, 5 `TOB_PAID` students, 4 `TOC_FREE` students.
- Active B2B organization: `Steady Study Demo Academy`, 6 active members, 5 students.
- Catalog: 39 licensed partner books, 6 original books, 12 user-generated books, 65,709 declared words.
- Learning activity: 0 active users in 7 days; 2 active users and 60 events in 30 days.
- B2B operations: 0 cohorts, 0 instructor assignments, 0 mission assignments, 0 notifications, 0 writing assignments/submissions/reviews.
- Content/source: 45 official books have ledger rows and are Today-selectable, but all 45 have source ledger warning metrics.
- Hint assets: 14 words have examples, 0 have images.

## 10-Sided Problem Inventory

### 1. Strategy, PMF, And Business Model

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P0 | B2B is the stated core business, but price, setup fee, maintenance fee, seat tiers, and gross margin are still not decision-grade. | Define provisional pricing, AI budget, gross margin, and minimum contract terms. |
| 2 | P0 | PMF scoring uses product signals but not revenue, contract status, renewal intent, or paid pilot state. | Add MRR, expected MRR, contract status, renewal risk, and paid pilot flags to the PMF model. |
| 3 | P0 | Current production sample is too small for PMF claims. | Add minimum sample gates: organization count, active student count, active week count, and completed B2B loop count. |
| 4 | P0 | Activation funnel starts too late, after an organization exists. | Connect `form_open -> commercial_request -> contacted -> approved -> provisioned -> active_loop`. |
| 5 | P0 | B2B value loop is not proven in production. | Dogfood one organization through assignment, mission, notification, writing submission, and review. |
| 6 | P1 | Commercial request queue does not include expected MRR, lost reason, status timestamps, or owner/SLA. | Add minimal CRM fields and admin surfaces for sales follow-up. |
| 7 | P1 | Public commercial events can be noisy because anonymous form-open events are not strongly deduped. | Add anonymous visitor id, dedupe window, bot filtering, and IP-rate correction. |
| 8 | P1 | PMF dashboard can get stale if analytics snapshots fail. | Show last updated time, stale warning, and manual snapshot rerun action. |
| 9 | P2 | Segment PMF score is based on custom weights not tied to revenue or classroom success. | Include MRR, retention weeks, writing review completion, and contract stage per segment. |
| 10 | P2 | PMF dashboard explains signals but does not always drive the next operational action. | Add drill-down from weakest gap to the exact organization, request, or workspace action. |

### 2. B2B Operations And Admin Workflow

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P0 | Commercial requests are not connected to provisioning and onboarding operations. | On `PROVISIONED`, create/attach organization, cohort, owner, and runbook state. |
| 2 | P0 | First notification is treated as done when saved to DB. | Track delivery, read state, retry, and follow-up task state. |
| 3 | P0 | Runbook notification completion is organization-count based. | Require notification linked to target student, instructor, and first mission. |
| 4 | P1 | Mission creation and assignment are separate, leaving orphan risk. | Add `createAndAssignWeeklyMission` with rollback or cleanup. |
| 5 | P1 | New mission assignment silently archives existing active missions. | Require archive reason, replacement confirmation, and visible audit trail. |
| 6 | P1 | Writing workflow is not automatically preselected from runbook target student/mission. | Deep-link runbook action into writing creation with target preselected. |
| 7 | P1 | Writing side-effect failures are warnings without admin retry UI. | Add failed side-effect queue, retry action, and alert state. |
| 8 | P1 | B2B activation gate is warning-only by default. | For B2B release work, require strict activation flags or explicit exception. |
| 9 | P2 | Admin activation funnel is aggregate-first. | Add action-level drill-down and direct navigation to stuck workspaces. |
| 10 | P2 | Anonymous commercial request submitter cannot return to status. | Add receipt id, email confirmation link, and limited status view. |

### 3. Learner UX And Mobile PWA Flow

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P0 | Dashboard has multiple primary-feeling actions: Hero CTA, current task, reference rail, and mobile nav. | First viewport should expose one primary action plus one contextual secondary action. |
| 2 | P0 | Mobile Hero still carries brand, grade, settings, title, copy, CTA, progress, and metrics. | Mobile Hero should reduce to one task line, one CTA, and progress. |
| 3 | P0 | `allTasks` mixes today, weakness, practice, plan, library, progress, announcements, companion, motivation, and account. | Keep only `primaryTask` and urgent tasks visible by default. |
| 4 | P1 | Bottom quick nav labels are very short and can lose meaning. | Keep one persistent primary CTA; move secondary actions into a sheet. |
| 5 | P1 | Quiz setup still shows range, direction, grammar scope, and count together. | Default to one-tap standard start; put presets and details behind progressive disclosure. |
| 6 | P1 | Quiz running state can show source, grammar, explanation, feedback, improved translation, and next drill around the answer. | During answering, show only the problem; after answering, expand details only on demand. |
| 7 | P1 | Onboarding first step has too many cards and explanations. | Mobile first: grade, current feeling, start. Move rationale into later detail. |
| 8 | P1 | Onboarding result emphasizes analysis before next action. | Put “start with this level” first; move analysis into details. |
| 9 | P1 | Study card back side mixes meaning, edit/report, examples, image generation, and hints. | Back side should prioritize meaning and rating; move hints to a separate sheet. |
| 10 | P2 | Warm orange visual treatment remains dominant in places despite the avoid-heavy-orange preference. | Use orange mainly for CTA and progress; move learner home toward white/slate with semantic accents. |

### 4. Frontend Architecture And State Management

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P0 | Dashboard start behavior is split across `App`, `Dashboard`, and `StudentDashboardSections`. | Introduce a typed `DashboardCommand` dispatcher. |
| 2 | P0 | `useStudentDashboardViewModel` owns data shaping, prioritization, plan policy, subscription logic, copy, and Hero model. | Split into selectors, `primaryTaskPolicy`, and copy/model builders. |
| 3 | P0 | Dashboard UI state exposes many setters, making transitions hard to audit. | Move modal/form/notice state into a reducer. |
| 4 | P0 | `StudentDashboardSections` mixes section layout, mission mutation, DOM scrolling, and mobile nav generation. | Add a section registry and command dispatcher hook. |
| 5 | P0 | Quiz session transitions are spread across multiple states. | Add `quizSessionReducer` for setup, ready, running, and result states. |
| 6 | P0 | Quiz controller handles question generation, AI feedback, persistence, scoring, and analytics. | Split question factory, attempt service, and analytics recording. |
| 7 | P1 | `App` owns routing, access, announcements, workspace view, and task-start handling. | Create route/screen registry and workspace navigation hook. |
| 8 | P1 | `useStudentDashboardMutations` couples service calls, AI work, validation, and setter updates. | Move to dashboard action services returning typed command results. |
| 9 | P1 | `services/storage.ts` is still the largest facade and centralizes many domain implementations. | Continue decomposing IndexedDB implementation into session/catalog/learning/dashboard adapters. |
| 10 | P2 | Hero component prop list mirrors view-model internals. | Pass a `DashboardHeroModel` and small command object. |

### 5. Data Model, D1, And Storage Integrity

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P0 | Official catalog import deletes words before reinsert and is not atomic. | Use staging tables or validated swap; avoid destructive partial imports. |
| 2 | P0 | `learning_plans.selected_book_ids` and `learning_plan_books` are double truth. | Make `learning_plan_books` authoritative and deprecate legacy JSON. |
| 3 | P1 | Password reset issue/confirm flows use several separate statements. | Use D1 batch and verify `changes` per step; add compensation paths. |
| 4 | P1 | Organization membership is split between `users` shadow columns and `organization_memberships`. | Make membership authoritative; use shadow columns only as derived/cache data. |
| 5 | P1 | B2B/product event drift can pass release gates as warnings. | Standardize strict flags for B2B-first releases. |
| 6 | P2 | Duplicate migration prefix `0019` is a historical exception. | Add migration README explaining the exception and keep future duplicates blocked. |
| 7 | P2 | Core enum columns are often plain text. | Add validation queries now and CHECK constraints in rebuild migrations where practical. |
| 8 | P2 | Writing review selected evaluation is not fully DB-enforced to belong to the same submission. | Use composite uniqueness or guarded write SQL. |
| 9 | P2 | Material source ledger migration relies on fixed book ids and inner joins. | Validate expected ledger counts and sync ledger from seed artifacts. |
| 10 | P2 | `(book_id, word_number)` is indexed but not unique. | Reject duplicate numbers on import and add uniqueness when safe. |

### 6. AI, Content Quality, And Material Governance

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P0 | AI grammar generation does not immediately return learner-facing items. | If review-first is intentional, gate review queue, approval, and reuse path. |
| 2 | P0 | AI quiz output validation is thin. | Validate input word ids, options, correct answer membership, duplicates, and empty values. |
| 3 | P1 | Ledger spec and seeded evidence granularity do not fully match. | Add machine-verifiable input hash, transform log, source proof, and review artifact. |
| 4 | P1 | Source coverage, example coverage, and duplicate warnings remain non-blocking for approved books. | For approved material releases, enforce warning-free or require explicit exception. |
| 5 | P1 | Content QA blocking checks are narrower than the report. | Add thresholds for examples, source coverage, duplicates, and category gaps. |
| 6 | P1 | Grammar golden sets validate structure more than natural language quality. | Add rubric for natural Japanese, capitalization, grammar, and usage. |
| 7 | P1 | Grammar fallback estimates part of speech from rough definition patterns. | Store/use part-of-speech and usage metadata in material data. |
| 8 | P1 | Writing scoring relies heavily on local heuristic scoring. | Ask LLM for rubric scores and evidence; keep heuristic as sanity check. |
| 9 | P1 | Eiken writing seed source is slug-checked rather than ledgered. | Ledger writing prompt policy, source inspiration, imitation avoidance, and reviewer. |
| 10 | P2 | Live writing prompt generation validates schema more than educational constraints. | Post-validate exam category, word count, prohibited topics, form, and guidance. |

### 7. Security, Auth, And Abuse Controls

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P1 | Writing file upload can write to R2 with a temporary URL path rather than full session ownership check. | Require session and assignment ownership at upload, or signed token with user/assignment/expiry. |
| 2 | P1 | Legacy sessions can skip `token_hash` verification. | Expire legacy sessions and require token hash. |
| 3 | P1 | Signup lacks strong rate limit and password max length. | Add IP/email signup limits, max password length, and email confirmation path. |
| 4 | P2 | Mutation requests rely on same-site behavior without CSRF token. | Add CSRF token for cookie-backed mutation APIs. |
| 5 | P2 | Password reset confirmation has no dedicated attempt limit. | Add IP and token-prefix rate limits. |
| 6 | P2 | Password recovery can block a target email if abused. | Separate public-form write limits from auth-failure counters. |
| 7 | P2 | Internal job secret is plain shared secret with no replay defense. | Add HMAC signature, timestamp, nonce, and rotation plan. |
| 8 | P2 | Reset URL is built from request origin. | Use fixed `APP_PUBLIC_ORIGIN` for reset URLs. |
| 9 | P3 | Public/authenticated product event can accept client-reported cost/AI flags. | Derive cost and AI usage server-side; isolate public events. |
| 10 | P3 | HSTS/COOP/COEP are missing and CSP `connect-src https:` is broad. | Add production HSTS and narrow connect-src allowlist. |

### 8. CI, Release, And Cloudflare Operations

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P0 | CI can skip `cf:doctor` when credentials are absent. | Add required credentialed doctor job or fail-closed protected-branch mode. |
| 2 | P0 | Pages runtime metadata/secrets are updated before deploy success, causing drift on later failure. | Move metadata update after successful deploy or add rollback/restore. |
| 3 | P1 | Local release gate uses `CF_D1_DATABASE`, while docs and doctor use `CLOUDFLARE_D1_DATABASE`. | Standardize on `CLOUDFLARE_D1_DATABASE`; keep old name as deprecated alias. |
| 4 | P1 | Production smoke focuses on project alias and can suffer alias lag. | Smoke deployment URL first, then retry project alias until `x-deployment-sha` matches. |
| 5 | P1 | Deployed smoke `--grep` only guards zero tests, not the expected set. | Use dedicated deployed smoke specs or assert expected test count. |
| 6 | P1 | CI alone does not include content QA, source ledger, or B2B activation gates. | Make preview deploy gate required, or add trusted PR remote read-only gates. |
| 7 | P1 | Fork PR preview deploy is disabled, leaving full release gates absent for external changes. | Require maintainer-approved preview or mark fork PRs as not release-ready. |
| 8 | P2 | Some `cf:doctor` inventory failures degrade to warnings in Actions. | Add deploy-mode doctor where inventory-not-readable is an error. |
| 9 | P2 | Post-deploy Pages secret inspection uses `|| true`. | Fail if required secrets are missing. |
| 10 | P2 | `db:migrate:remote` targets production DB without preview/production separation. | Add explicit preview and production scripts with confirmation. |

### 9. Accessibility, PWA, Performance, And Mobile Quality

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P1 | PWA has manifest but no service worker/offline app shell. | Add service worker, offline fallback, cache strategy, and update notification. |
| 2 | P1 | 640-767px width can miss mobile UI behavior. | Align breakpoint with CSS/container queries or use `max-width: 767px`. |
| 3 | P1 | Some icon-only controls lack accessible labels. | Add `aria-label` to audio, edit, save, cancel, close, and similar controls. |
| 4 | P1 | Mobile/accessibility smoke coverage is narrow. | Add WebKit, Android-like, landscape, 640-767px, and axe coverage. |
| 5 | P2 | Manifest is minimal for install quality. | Add `id`, `display_override`, screenshots, shortcuts, and categories. |
| 6 | P2 | PWA smoke verifies only minimum manifest behavior. | Verify service worker registration, offline start, and manifest completeness. |
| 7 | P2 | Hashed asset cache policy is undefined. | Set immutable cache for `/assets/*`; keep index/manifest short-lived. |
| 8 | P2 | Focus ring can be too subtle on mixed backgrounds. | Use stronger solid outline/ring and test major backgrounds. |
| 9 | P2 | Clickable study card behavior is not expressed as keyboard interaction. | Use button semantics or `role=button`, `tabIndex`, Enter/Space handling. |
| 10 | P2 | No bundle/performance budget in CI. | Add bundle-size budget and analysis report to CI. |

### 10. Developer Experience, Documentation, And Task Management

| # | Priority | Problem | Improvement |
|---|---|---|---|
| 1 | P0 | `main` is dirty with untracked `scripts/create-revised-noun-workbook.py`. | Decide adopt/discard/move to one-off tools and keep main clean before release work. |
| 2 | P0 | `release:gate:local` includes remote D1 and Cloudflare work despite “local” name. | Split into `local-only`, `remote-readonly`, and `release` gates. |
| 3 | P0 | CI `cf:doctor` skip conflicts with docs requiring doctor. | Separate static doctor from credentialed doctor and require both where appropriate. |
| 4 | P1 | README mixes development, secrets, deploy, production, and operations. | Make README the shortest path; move secrets/deploy/ops to runbooks. |
| 5 | P1 | Docs are date-heavy and do not clearly mark current truth. | Add `docs/README.md` with current/archive/reference index. |
| 6 | P1 | Task-management docs include stale branch-era plans. | Add one active task board; archive completed plans. |
| 7 | P1 | `tmp/` has many local generated artifacts and no cleanup policy. | Add `tmp:clean`, retention policy, and artifact destination rules. |
| 8 | P1 | `npm test` is easy to mistake for release readiness. | Rename or document `test:local`, `test:release`, and `release:gate` boundaries. |
| 9 | P2 | No lint/format scripts. | Add `lint`, `format:check`, and `quality` scripts. |
| 10 | P2 | Release hygiene tests rely on brittle README/workflow string matching. | Parse YAML and use smaller structured documentation snapshots. |

## Improvement Plan

### Phase 0: Stop Drift And Make Evidence Reliable

Target: 1-2 days.

1. Decide what to do with `scripts/create-revised-noun-workbook.py` and return the worktree to clean before release work.
2. Rename/split release gates into local-only, remote-readonly, and release/deploy paths.
3. Make `cf:doctor` behavior fail-closed for protected branches and deploy workflows.
4. Standardize D1 env naming on `CLOUDFLARE_D1_DATABASE`.
5. Add a current analysis index under `docs/` so the active plan is clear.

Verification:

- `git status --short --branch`
- `npm run verify:fast`
- `npm run security:audit`
- `npm run release:gate:local:dry`

### Phase 1: Prove The B2B Value Loop

Target: 1-2 weeks.

1. Build a guided runbook action path for one demo organization.
2. Connect commercial request provisioning to organization/cohort/assignment setup.
3. Add one-click `createAndAssignWeeklyMission`.
4. Add first notification delivery/read/retry state.
5. Wire writing assignment preselection from runbook target.
6. Complete one production dogfood pass: assignment -> mission -> notification -> writing submission -> review.

Verification:

- `npm run ops:b2b-activation:d1 -- --remote --database medace-db --require-active-b2b-loop`
- Admin dashboard weakest-gap drill-down shows no unresolved setup blocker for demo org.
- Product KPI snapshot shows value-loop completion.

### Phase 2: Simplify Learner First Viewport

Target: 1 week.

1. Introduce `DashboardCommand` and centralize start/open/scroll actions.
2. Reduce mobile Hero to one task, one CTA, and progress.
3. Hide secondary/reference sections by default on mobile.
4. Make quiz setup one-tap by default with optional presets.
5. Reduce quiz running text until answer is submitted.

Verification:

- Targeted unit tests for primary task policy and Dashboard command dispatch.
- Mobile smoke at 320, 390, 430, 640, and 767 px.
- Manual screenshot review for first viewport.

### Phase 3: Harden Data And Security Hot Paths

Target: 2-3 weeks.

1. Make catalog import staging-based or otherwise non-destructive on partial failure.
2. Make `learning_plan_books` the authoritative plan-book relation.
3. Require token-hash sessions and expire legacy sessions.
4. Add signup and password reset rate limits.
5. Add upload ownership validation for writing assets.
6. Add fixed public origin for password reset URLs.

Verification:

- D1 migration replay.
- Auth/security tests.
- Writing upload negative tests.
- Production smoke for `/api/session` and admin auth path.

### Phase 4: Turn PMF Dashboard Into A Business Control Surface

Target: 2-3 weeks.

1. Add provisional pricing and contract/MRR fields.
2. Add insufficient-data gates to PMF summary.
3. Extend commercial funnel to request/contact/approval/provisioning/active-loop.
4. Add stale snapshot warning and manual rerun operation.
5. Add segment PMF fields for revenue, retention weeks, and value-loop completion.

Verification:

- Product KPI tests.
- Admin dashboard visual check.
- Remote baseline before/after.

### Phase 5: Improve Content Governance And PWA Quality

Target: ongoing, after Phases 0-2.

1. Enforce stricter source ledger warnings for approved official material.
2. Add AI output validators for generated quiz and writing prompt outputs.
3. Add grammar/writing golden rubrics for naturalness and educational quality.
4. Add service worker/offline fallback and PWA smoke checks.
5. Add accessibility labels, keyboard card behavior, stronger focus ring, and bundle budget.

Verification:

- Content QA gate with stricter thresholds.
- AI contract tests.
- PWA/offline smoke.
- Accessibility smoke with axe or equivalent.

## Recommended Next Three Tickets

1. **Release/ops clarity:** clean worktree decision, split gate naming, and fail-closed `cf:doctor`.
2. **B2B dogfood loop:** create one guided admin action path from commercial/provisioning to first writing review.
3. **Learner command boundary:** add `DashboardCommand` before changing UI, then simplify the mobile first viewport.

These three tickets reduce operational risk, prove the business loop, and create a safer foundation for UI simplification.
