> 履歴資料（2026-09-07に整理）。現行の計画と検証状態は [再構築計画](./rebuild-plan-2026-09-07.md) を参照。この文書の完了・本番数値は記録当時のものです。

# Repository Audit And Large Improvement Plan

Date: 2026-07-11

Scope: `Steady Study` frontend, Cloudflare Pages Functions, D1 contracts, learner content, B2B operations, tests, release flow, documentation, and local artifact hygiene.

## 日本語要約

- 教材数、D1 整合性、release gate は強い一方、本番利用は過去30日で1人、B2Bの課題配布・mission・通知・Writing返却はすべて0です。現在の最大課題は機能不足ではなく、既存機能が実運用ループになっていないことです。
- 今回は、共有教材改ざん可能性、XP改ざんと数値DoS、未監査AIヒントの配信、Writingの学生データ過剰公開・組織境界・HTML注入・状態競合、不自然な文法例文を優先して閉じます。
- 到達不能な本番ソース14件は削除し、テスト/運用専用2件は `scripts/_shared` へ移動します。再発防止の source reachability gate を CI 経路へ追加し、ローカル成果物は列挙制の dry-run-first cleanup にします。`output`、`tmp`、`.wrangler`、`.playwright*` の作業状態/復旧証跡は保護します。
- 次の大規模フェーズは、「講師割当→週間mission→通知→Writing提出→講師返却」を1組織で実際に回し、その後にSRS・認証・インポート・AI費用の原子性と冪等性を強化する順序です。

## Executive Verdict

The repository has a strong release and data-integrity foundation, but product operation and several trust boundaries lag behind the amount of implemented functionality.

- The catalog and organization data are internally consistent. All 57 books match their declared word counts, plan references are valid, and active organization memberships have no detected role or organization mismatch.
- The B2B value loop is not operating in production. The paid demo organization has active members, but instructor assignments, weekly missions, notifications, Writing assignments, and Writing submissions are all zero.
- Several APIs trusted authenticated clients too much. A retired word-cache action allowed a learner with read access to overwrite shared official examples, and the XP action accepted client-authoritative numeric input with an unbounded level loop.
- Generated hint assets were stored as pending review but could still reach learners through cloud and local storage paths. The audit parser also treated unknown model statuses as approved.
- Writing response projection, organization ownership, printable HTML, state transitions, and upload handling had important gaps. This batch closes the response/tenant/HTML boundaries, DRAFT-to-ISSUED and latest-submission review CAS, completion CAS, and upload-token reservation with bounded body verification.
- Learner grammar fallback content contained unnatural or invalid sentences, while a golden test preserved some of those errors. Test green was therefore not equivalent to learning-quality green.
- The repository accumulated unreachable components, re-export shims, build output, test traces, and one-off tooling in production-looking locations. A permanent reachability gate and narrow cleanup policy are required, not periodic manual deletion.

The correct strategy is not to add more surface area. It is to make one real B2B loop work, remove unsafe client authority, enforce approval and atomicity at the server boundary, and reduce large orchestration modules only after those contracts are stable.

## Evidence Snapshot

The production baseline was read on 2026-07-11 in remote read-only mode. No production mutation was performed.

| Area | Current evidence | Interpretation |
|---|---:|---|
| Users | 2 instructors, 12 students | Enough accounts exist to dogfood both learner and staff paths. |
| Paid demo organization | 7 active members: 5 students, 2 staff | Membership setup exists, but operational work has not started. |
| Catalog | 57 books, 65,709 words | Catalog breadth is not the current bottleneck. |
| Catalog integrity | 57/57 declared word counts match | Current catalog counts and plan references are healthy. |
| Generated examples | 14 present, 14 approved, 0 pending | Strict approved-only delivery can be enabled without hiding current production examples. |
| Generated images | 0 | Image generation is not providing current learner value. |
| Learning activity | 0 active learners in 7 days; 1 in 30 days | Adoption and reactivation are the critical product problem. |
| Learning history | 195 rows, 6 learners, 5 books | Historical usage exists but is shallow and stale. |
| Instructor assignments | 0 | The B2B responsibility model is not being exercised. |
| Weekly missions | 0 | The intended teacher-to-learner operating loop is not running. |
| Notifications | 0 | Reactivation tooling has no production proof. |
| Writing | 0 assignments, submissions, evaluations, or reviews | Writing is code-complete relative to usage, not product-proven. |
| Product events | 222 | Telemetry exists, but client-authoritative events still need trust classification and rate controls. |
| KPI snapshots | 92, current through 2026-07-11 | Snapshot automation is healthier than the underlying product activity. |

## Critical Findings

### P0 — Fix Or Contain Before Release

1. **Shared official content mutation — Fixed in this batch**
   - The authenticated `updateWordCache` action required only book read access and could overwrite an official word's shared example and translation.
   - There was no production caller. The safe fix is complete removal from contracts, registry, backend, Cloudflare/IndexedDB adapters, and tests.
   - The remaining `generateWordHintAsset` path now requires book write ownership for `forceRefresh`. A learner may request a missing hint, but cannot replace an existing shared official asset or reset its approved audit state. Asset-specific conditional writes reject generation races, images use unique R2 keys so a losing request cannot overwrite the winning object, and audit-result CAS prevents an old approval from being attached to a concurrently replaced payload.

2. **Client-authoritative XP and numeric denial of service — Immediate containment fixed**
   - Non-finite JSON numbers could reach an unbounded level-up loop, while finite negative or large values could alter ranking state.
   - Immediate containment is finite-number validation, a small positive integer award limit, closed-form level calculation, and compare-and-swap persistence.
   - Residual risk: repeated valid requests can still inflate XP. Full resolution requires a unique learning-attempt receipt and server-awarded XP in the same atomic write.

3. **Unapproved generated hint delivery — Fixed in this batch**
   - New examples and images were persisted as `PENDING`, but cloud word projection, image delivery, and IndexedDB fallback could return them immediately.
   - Unknown audit status values were interpreted as approved.
   - Learner delivery must require a current `APPROVED` audit for every generated asset; pending, failed, review-required, and stale assets must return a safe learner state without the content.
   - Existing-asset regeneration is shown only to a book owner in Study Mode; the API independently enforces the same write boundary.
   - Staff worksheet snapshots and printable fallback content now use the same learner-safe projection, so an alternate read/print path cannot expose held generated text.

4. **Writing student-data exposure and cross-organization access — Fixed in this batch**
   - Student responses exposed provider comparisons, OCR/provenance, and teacher-private data.
   - Staff visibility followed the student's current organization without independently checking assignment ownership.
   - The implemented response allowlists and assignment-organization check are the correct server-side boundary; UI hiding is not sufficient.

5. **Stored HTML injection in printable Writing output — Fixed in this batch**
   - Student, teacher, prompt, and generated text were interpolated into printable HTML.
   - Every dynamic text node now requires shared HTML escaping; only static builder markup can bypass escaping.

6. **Grammar fallback quality contract was wrong — Fixed in this batch**
   - Rendered practice included unnatural sentences and invalid progressive constructions.
   - The existing golden set asserted some bad output as correct, so it protected regressions in the wrong direction.
   - Generation rules, fallback vocabulary context, and golden tests must be corrected together.

7. **Unreachable production source and local artifact drift — Fixed in this batch**
   - Fourteen tracked source files had no importer or runtime entry path, including replaced UI components and re-export shims.
   - A source-reachability gate must fail before such files accumulate again.

8. **Expired demo-user cleanup could break login — Fixed in this batch**
   - A retained password-reset token could reference an expired demo user through `created_by`, while the cleanup path deleted that user directly.
   - Runtime cleanup now clears creator references and deletes expired demo users in one D1 batch. Migration `0041` preserves existing tokens and indexes while changing the creator foreign key to `ON DELETE SET NULL`.

### P1 — Contract And Operations Findings

1. **Writing state CAS — Fixed in this batch**
   - Assignment issue now permits only DRAFT-to-ISSUED with `changes === 1`; exact ISSUED retries are read-only.
   - Teacher return requires the assignment's latest submission and commits review plus assignment state in one D1 batch. Completion permits only RETURNED-to-COMPLETED. Lost races return 409 before product events or side effects.

2. **Writing upload reservation and memory bounds — Immediate concurrency boundary fixed; residual hardening open**
   - Upload-token consumption is reserved with a conditional D1 write before reading the request body or writing R2; concurrent reuse returns 409.
   - Content-Length and MIME checks, bounded body reads, reserved-versus-actual size, aggregate 20 MB/count policy, and optional SHA-256 verification now fail closed. Retry-safe reservation release is limited to failures before the owning finalize CAS.
   - Residual risk: a worker crash after reservation can strand the token, checksum is not mandatory for every client, and declared MIME is not verified against file magic bytes. Add reservation leases/recovery, mandatory digest policy, and PDF/image signature sniffing.

3. **Writing finalize claim and post-commit response — Open**
   - Finalize can start expensive OCR/evaluation work without first claiming the assignment attempt, so concurrent requests can duplicate provider cost before the unique submission commit rejects one result.
   - Claim `(assignment_id, attempt_no)` before AI work, make the claim resumable, and move post-commit analytics/side effects to a non-fatal outbox so a telemetry failure cannot turn a committed submission into a client-visible 500.

4. **IndexedDB generated-hint audit liveness — Open**
   - The local learner projector correctly hides `PENDING` payloads, but IndexedDB mode has no audit runner or approval-sync path. Local generation can therefore remain safely hidden forever.
   - Disable local generation until cloud audit is available, or add an explicit sync/review lifecycle with timeout and recovery messaging.

5. **Generated-hint audit capacity, authority, and AI cost reservation — Open**
   - Approved learner visibility expires after 14 days, while the scheduled audit currently processes 12 assets per day. This is enough for the current 14 production assets, but not a durable capacity contract for bulk generation or future adoption.
   - Missing-asset generation is intentionally available to a reader as a pending proposal, but the ownership and cost policy is not explicit, and concurrent cache misses can both incur provider cost before one conditional write loses.
   - Cap bulk intake to audited capacity, reserve AI budget before provider work, expose backlog and last-success health with an alert/SLO, and add a role matrix plus backlog/load regression before materially expanding generation.

6. **SRS attempt idempotency and atomicity — Open**
   - History, event, weakness, mission, KPI, and XP writes can partially succeed or duplicate on retry.
   - Claim a unique `clientAttemptId`, batch canonical writes in D1, and move rebuildable projections to an outbox.

7. **Authentication abuse and reset atomicity — Open**
   - Signup bypasses the existing login limiter and previously had no field-length limits. Rate-limit updates can lose increments under concurrency.
   - Password-reset token consumption, password update, and session invalidation are separate writes.
   - Use atomic limiter increments, IP plus identity buckets, bounded fields, and a hash-first D1 batch/CAS reset.

8. **Catalog import partial replacement — Open**
   - Official import deletes existing rows before all new batches and ledger updates succeed.
   - Use a versioned staging import, validate the entire set, then perform an atomic activation/swap. Add uniqueness for `(book_id, word_number)` after data cleanup.

9. **B2B multi-write operations — Open**
   - Mission replacement, cohort assignment, membership movement, provisioning, and activation setup span several independent writes.
   - Batch same-database core changes; use an operation id and replayable saga for longer activation workflows.

10. **AI budget and review tenancy — Open**
   - Budget checks occur before provider calls without a reservation, so concurrent requests can overspend.
   - Organization staff can approve shared official AI rows without a global curator boundary.
   - Reserve budget before calls, settle afterward, cap concurrency, and separate global official review from tenant-owned content review.

11. **Leaderboard and telemetry privacy — Open**
   - Global leaderboard responses expose user identifiers and display names across organizations.
   - Client events can inflate KPI state without per-user rate or idempotency controls.
   - Scope leaderboards to organization or opt-in pseudonyms; mark client events non-authoritative and add event ids/rate limits.

12. **B2B activation is an operational blocker, not a schema blocker — Open**
   - Production already has paid members and the required feature surfaces, but every action in the intended value loop is zero.
   - A guided admin runbook and a named owner must complete one real assignment-to-review loop before additional B2B feature work is considered complete.

### P2 — Structural Improvement After Contract Stabilization

1. Split the 1,700-line `EnglishPracticeHub`, 1,400-line AI action module, large worksheet launcher, quiz controller, dashboard view model, and storage read models by stable domain contracts.
2. Introduce server-owned command/result types before moving more business logic into React hooks.
3. Keep learner home to one primary action, one contextual secondary action, and progressive disclosure on mobile.
4. Add accessibility coverage for icon-only controls, keyboard card interaction, focus states, and the 640-767 px breakpoint.
5. Turn PMF reporting into an evidence surface that explicitly distinguishes insufficient data from poor performance.

## Cleanup Decision Ledger

### Deleted From Tracked Production Source

- Replaced commercial, grammar, metric-rail, and workspace components with no importers.
- Obsolete server and local re-export shims with no consumers.
- Obsolete domain type re-export shims with no consumers.
- The unsafe, unused `updateWordCache` action and its local/cloud adapter surface.

Every deletion requires all of the following evidence:

1. no static, type-only, re-export, alias, literal/bounded-template dynamic, `import.meta.glob`, or Worker importer;
2. no Vite or Pages Functions entrypoint role;
3. no package export or implicit route convention;
4. typecheck, build, unit, API, and smoke coverage appropriate to the surface.

### Moved, Not Deleted

- Test/operations-only mobile-flow configuration and noun-workbook parsing were moved under `scripts/_shared` so they are not mistaken for browser production source.
- The local revised noun-workbook helper and spreadsheet outputs are preserved together as user artifacts. They are not part of the production build or automatic cleanup.

### Safe Local Cleanup

Automatic cleanup is intentionally limited to:

- exact-name and expected-kind `dist/` and `_worker.bundle` file;
- exact-name and expected-kind `test-results/` and `test-results-rerun/`;
- `.DS_Store` outside protected areas;
- Python bytecode and `__pycache__` outside protected areas.

Similar names, wrong-kind entries, and symlinks are preserved. The cleanup tool must never traverse or delete `node_modules`, `.wrangler`, `tmp`, `output`, or `.playwright*`. Those paths can contain local D1 state, recovery evidence, browser evidence, or user-generated artifacts.

## Implementation Program

### Phase 0 — Current Safety And Hygiene Batch

Goal: make the current release candidate trustworthy before expanding features.

- Complete Writing student-response projection, organization authorization, printable HTML escaping, and completion-state enforcement.
- Remove unreachable source and unsafe unused mutation endpoints.
- Add production source reachability and safe artifact cleanup tooling.
- Fail closed on non-finite request numbers and bound XP updates.
- Gate generated hints on approval in Cloudflare and IndexedDB paths.
- Apply the same generated-hint projection to staff worksheet and print paths; make generation and audit writes payload-specific CAS operations.
- Make expired demo cleanup compatible with retained reset-token provenance and add migration/API regressions.
- Replace invalid grammar fallback content and the golden tests that preserved it.
- Add Writing state/latest-submission CAS.

Exit criteria:

- `quality:unused`, migration replay, typecheck, unit, build, API, full smoke, and security audit are green.
- No generated hint content is visible while pending, failed, review-required, or stale.
- Retired actions return 404 and cannot be reached through any client adapter.
- Invalid or stale Writing state transitions perform no write or side effect.

### Phase 1 — Prove One B2B Value Loop

Goal: turn existing features into one observable production workflow.

1. Select one paid demo cohort and assign each student to an instructor.
2. Create and assign one weekly mission.
3. Send one in-app notification and verify open/read/retry state.
4. Issue one Writing assignment, submit it, review it, and return feedback.
5. Record the loop with server-authoritative product events and a timestamped KPI snapshot.
6. Add an admin next-action surface that always points to the weakest incomplete step.

Exit criteria:

- assignment rows, missions, notifications, Writing assignments, submissions, and reviews are all greater than zero;
- `ops:b2b-activation:d1 --require-active-b2b-loop` is green;
- the loop can be repeated without manual SQL.

### Phase 2 — Atomic Learning, Writing, And Auth

Goal: make retry and concurrency safe.

- Add unique learning-attempt receipts and server-awarded XP.
- Batch SRS canonical writes and queue rebuildable projections.
- Keep Writing state/upload concurrency regressions in the release gate while adding attempt receipts to the remaining learning mutations.
- Claim Writing finalize attempts before OCR/AI work and make committed submissions independent of analytics delivery failures.
- Add upload-reservation lease recovery, mandatory checksums, and PDF/image magic-byte verification.
- Either disable IndexedDB hint generation or add an auditable approval-sync lifecycle so safe `PENDING` content does not become permanent dead state.
- Bound bulk hint generation to sustainable audit capacity, publish backlog/last-success health, and reserve AI budget before provider calls.
- Make signup/login/recovery rate limiting atomic.
- Batch password-reset consumption, password update, and session invalidation.

Exit criteria:

- duplicate/replayed attempts are write-free;
- concurrency tests prove exactly-once canonical state;
- duplicate Writing finalize requests do not duplicate provider cost, and committed responses survive analytics failure;
- interrupted uploads and local generated-hint review states have an explicit recovery path;
- interrupted operations are resumable or compensatable.

### Phase 3 — Catalog, AI, And Privacy Governance

Goal: prevent partial catalog state, uncontrolled spend, and cross-tenant disclosure.

- Ship versioned catalog staging and atomic activation.
- Add source-ledger evidence and warning-free approval criteria for official releases.
- Reserve AI budget before provider calls and enforce tenant/global curator roles.
- Scope leaderboards and remove raw user ids from cross-user responses.
- Rate-limit and deduplicate non-authoritative client telemetry.

### Phase 4 — Learner UX And Architecture

Goal: reduce cognitive load after correctness contracts are stable.

- Make learner home a command surface with one primary task.
- Make quiz setup one-tap by default and hide advanced controls.
- Split English practice, quiz, worksheet, dashboard, and storage hotspots along tested domain boundaries.
- Add mobile breakpoint, accessibility, and bundle budgets to CI.

### Phase 5 — PMF And Operating Cadence

Goal: make the product measurable rather than merely feature-complete.

- Add insufficient-data gates to PMF summaries.
- Track activation, time-to-first-assignment, time-to-first-return, weekly active learners, and instructor workload.
- Run a weekly evidence review using production baseline before and after each operational experiment.
- Do not interpret code-complete or snapshot freshness as customer value.

## Verification And Stop Rules

The canonical order for this program is:

1. targeted negative regression tests;
2. `npm run quality:unused`;
3. `npm run typecheck`;
4. `npm run test:unit`;
5. migration replay;
6. `npm run build`;
7. `npm run test:api`;
8. full local browser smoke;
9. `npm run security:audit`;
10. remote-readonly Cloudflare, content, source-ledger, and B2B integrity checks;
11. preview browser QA before any production release.

Stop release when any of the following is true:

- the worktree contains unexplained generated or one-off source;
- production source reachability fails;
- an authorization or approval check exists only in React;
- a remote gate cannot distinguish an environment/auth failure from a product failure;
- a B2B workflow is declared complete without a real assignment-to-return loop;
- learner content tests validate structure while allowing unnatural or invalid language.
