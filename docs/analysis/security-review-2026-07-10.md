# Security Review: Writing Student Boundary

Date: 2026-07-10

Scope: local repository state matching `origin/main` tree at `97127cb` before this batch

Method: repository review, role/access-path tracing, API contract review, local tests, and browser smoke. No production write, remote migration, deploy, or secret mutation was performed.

## Executive Summary

The highest-impact release blockers found in this review were in the Writing workflow:

1. Student-facing submission responses included every AI provider evaluation and the teacher-only `privateMemo` after return. The finalize response also included all evaluations before teacher approval.
2. Staff access followed the student's current organization membership but did not independently require the Writing assignment to belong to that organization. After a student transfer, staff in the new organization could therefore reach an older organization's assignment if they knew its identifier.
3. Printable Writing HTML interpolated stored student, teacher, prompt, and AI text without output encoding.

This batch fixes those issues as one vertical slice: server-side response projection, assignment-organization authorization, safe printable HTML, server-enforced completion state transitions, student UI simplification, and regression coverage. The teacher review flow continues to receive all provider evaluations and the private memo. The 2026-07-11 follow-ups also close learner delivery of unaudited generated hints across Cloudflare and IndexedDB paths, stale Writing issue/review races, and upload-token/body concurrency gaps.

## Findings

### SS-WRITING-001 — P0 — Fixed in this batch

**Risk:** Student API responses exposed internal AI comparison output and teacher-private review notes. This violated the product promise that only the teacher-selected feedback is returned to the learner, and made a UI-only concealment insufficient.

**Root cause:** The same `WritingSubmissionDetailResponse` and raw `readSubmissionContext` result were used for student receipts, returned student feedback, and staff review views.

**Evidence:** The fixed boundary is centralized in `projectWritingDetailForViewer` in `functions/_shared/writing-actions/access.ts`; exact allowlist and staff-preservation regressions are in the `writing student response security boundaries` suite in `tests/writing-security-boundaries.test.ts`.

**Remediation:**

- Added explicit student receipt and released-feedback response contracts with field allowlists.
- Project student finalize responses to zero evaluations and no teacher review, OCR metadata, internal processing state, or submitter identifier.
- Project returned student detail to exactly the teacher-selected evaluation's learner-facing fields.
- Remove provider/provenance, internal scoring, cost/latency, evaluator IDs, reviewer IDs, `privateMemo`, and raw side-effect errors from the student response by construction.
- Keep the staff response unchanged with all evaluations and the full review.
- Removed provider comparison controls from the student feedback UI.

**Release criterion:** API regression tests must prove pre-return denial, an empty finalize receipt, one selected evaluation after return, no `privateMemo` key for students, and full data retention for staff.

### SS-WRITING-002 — P0 — Fixed in this batch

**Risk:** A staff user could authorize against a student's current organization without proving that the assignment itself belonged to that organization. A student transfer could therefore make an old assignment reachable across organization boundaries.

**Root cause:** `ensureAssignmentAccess` validated the visible student ID but not the assignment's owning organization for non-student roles.

**Evidence:** `ensureAssignmentAccess` in `functions/_shared/writing-actions/access.ts` requires both student visibility and assignment organization ownership. Writing mutations authorize before business-state checks, while the `writing assignment tenant boundary after a student transfer` tests preserve student self-history and deny new-organization staff.

**Remediation:**

- Non-student Writing access now requires both a visible student and an exact assignment-organization match.
- Student self-history semantics remain unchanged.
- Authorization denials use the same generic 403 message and do not disclose tenant details. Missing identifiers can still return 404 before authorization; opaque identifiers keep this residual existence-oracle risk low but not zero.

**Release criterion:** Regression tests must prove that staff from another organization are denied even when the target student is currently visible to them.

### SS-WRITING-003 — P0 — Fixed in this batch

**Risk:** Writing assignment and returned-feedback print builders interpolated student, teacher, prompt, AI, and review text into blob/srcDoc HTML without escaping. Stored `<script>`, SVG handlers, or image handlers could execute when staff or students opened printable output.

**Root cause:** Printable HTML used template-string interpolation without a shared output-encoding boundary. The student feedback print also displayed internal provider identity.

**Evidence:** The shared encoder is `escapeHtmlText` in `utils/html.ts`; returned-feedback output uses it in `utils/writing.ts`, and assignment output uses it in `components/WritingPrintLauncher.tsx`.

**Remediation:**

- Added a shared text-node HTML encoder and applied it to every dynamic printable value.
- Kept only the static QR SVG builder output as trusted markup; the visible marker string is escaped.
- Replaced the feedback provider badge with the fixed learner-facing label `講師確認済み`.
- Added hostile-string regression tests for scripts, images, SVG handlers, ampersands, and quotes.

**Release criterion:** Printable HTML tests must contain escaped text, no executable injected elements/handlers, no AI provider identity in student feedback, and a valid static QR SVG in assignment output.

### SS-WRITING-004 — P1 — Fixed in this batch

**Risk:** The completion API accepted any assignment status. A client could move DRAFT, ISSUED, SUBMITTED, REVIEW_READY, or REVISION_REQUESTED directly to COMPLETED, leaving the student UI with a feedback-visible status but no released review.

**Root cause:** The RETURNED-only condition existed in the React controller but not in the server mutation.

**Evidence:** `handleCompleteWritingAssignment` and `setAssignmentCompleted` enforce the server transition and idempotent terminal-state branch. The `writing assignment completion state machine` tests exercise actual handlers and prove invalid transitions are write-free.

**Remediation:** The server now authorizes first, treats COMPLETED as an idempotent no-op, permits only RETURNED to transition, and rejects every other state with 409 before writes or side effects.

**Release criterion:** Actual-handler tests must prove every invalid state performs no write/side effect and a repeated COMPLETED request remains write-free.

### SS-WRITING-005 — P1 — Fixed in the 2026-07-11 follow-up

**Risk:** Reissuing an assignment could rewind a later state, and a teacher could return feedback for a submission that was no longer the assignment's latest attempt. Concurrent state changes could still emit product events or side effects after losing the race.

**Remediation:** Assignment issue now allows only DRAFT-to-ISSUED with a conditional update and treats an exact ISSUED retry as read-only. Teacher return requires the latest submission and commits review plus assignment state in one D1 batch guarded by REVIEW_READY and latest-submission predicates. Lost races return 409 before events or side effects.

**Evidence:** `handleIssueWritingAssignment` and `applyTeacherReview` in `functions/_shared/writing-actions/mutations.ts`, plus `commitTeacherReviewDecision` in `mutation-state.ts`, implement the boundary. The issue and teacher-review state-machine suites in `tests/writing-security-boundaries.test.ts` cover rewind, stale submission, exact retry, and lost-CAS behavior.

### SS-WRITING-006 — P1 — Immediate concurrency boundary fixed; residual hardening open

**Risk:** Two requests could consume one upload token concurrently, and the server could read an oversized or mismatched body before establishing ownership of the token. File metadata alone did not prove the bytes written to R2 matched the reservation.

**Remediation:** The upload handler rejects invalid Content-Length/MIME metadata first, reserves the token with a conditional D1 update before body read or R2 write, enforces bounded reads and reserved-versus-actual size, verifies SHA-256 when supplied, and finalizes only the owning reservation. Aggregate policy caps the submission at 20 MB with one PDF or at most four images. A retry releases the reservation only for failures before a lost owning finalize CAS.

**Evidence:** `handleWritingAssetUpload` and `handleCreateWritingUploadUrl` in `functions/_shared/writing-actions/mutations.ts`, `shared/writingUploadPolicy.ts`, and `tests/writing-upload-security.test.ts` cover early rejection, bounded chunked bodies, one-winner concurrency, checksum/size policy, retry, and finalize-CAS behavior.

**Residual risk:** A worker crash after reservation can strand a token; checksum remains optional for callers; and declared PDF/image MIME is not checked against magic bytes. Reservation leases/recovery, mandatory digest policy, and signature sniffing remain P1 follow-up work.

### SS-WRITING-007 — P1 — Open

**Risk:** Submission finalize performs OCR/provider evaluation before claiming the assignment attempt. Two concurrent finalizes can therefore duplicate provider cost even though the unique submission commit later rejects one. Product-event recording after the canonical commit can also fail the request after the submission is already durable.

**Required follow-up:** Claim `(assignment_id, attempt_no)` before OCR/AI work with a resumable processing state, and move post-commit analytics/side effects to a non-fatal outbox or best-effort response path.

### SS-CONTENT-001 — P0 — Fixed in the 2026-07-11 follow-up

**Risk:** Generated example sentences and images are stored with `PENDING` audit status but are returned immediately by generation/cache paths, and the image endpoint does not require an approved audit status. Learners may therefore receive unaudited generated content.

**Root cause:** Generation correctly persisted `PENDING`, but learner projection was not centralized. Cloud word reads, the image route, generation responses, IndexedDB book reads, and direct local daily-session reads therefore applied different visibility rules. Unknown audit output also fell through to approval.

**Remediation:** `shared/wordHintAssets.ts` now provides one approved-only, freshness-aware learner projector. Cloud word projection, image delivery, local catalog reads, local generation responses, and direct IndexedDB session reads all use the same fail-closed contract. Source-authored example text without generation provenance remains visible; images never receive that exception, and generated assets require a current `APPROVED` audit. Pending, failed, review-required, unknown, stale, and provenance-missing generated assets retain their stored internal payload but return a content-free learner state. The audit parser approves only the exact `APPROVED` decision.

`forceRefresh` now requires the same book-write boundary as editing the book: a user-owned book's owner or a global admin. Read access to shared official content is not enough. Initial generation for a missing asset remains available, but persistence is conditional on the asset-specific state observed before the provider call. A lost race returns 409 instead of replacing the winner; generated images use a unique R2 key, a losing object is removed, and a successfully superseded object is cleaned up best-effort. Audit-result writes also compare the exact generated timestamp and payload/key that was reviewed, so an old approval cannot attach to content replaced while the audit provider was running. Lost audit CAS results are not counted as completed or approved work. Study Mode exposes existing-asset regeneration only to a detected book owner.

Staff worksheet history and catalog fallback now apply this same projector before snapshot or print construction; pending, failed, review-required, and stale approved text therefore cannot escape through the instructor worksheet surface.

**Release criterion:** `tests/wordHintAssets.test.ts`, `tests/word-hint-assets.test.ts`, `tests/indexeddb-word-hints.test.ts`, `tests/dailySession.test.ts`, and `tests/organization-worksheet-word-hints.test.ts` must prove generated, cached, failed, unknown, stale, source-authored, unauthorized refresh, lost-race, and worksheet projection behavior without exposing or overwriting held content.

**Liveness follow-up:** IndexedDB mode has no audit runner or approval-sync path, so locally generated `PENDING` content is safely hidden but can remain hidden forever. Cloud audit visibility also needs a capacity contract: the current 12/day schedule covers the 14 production assets but does not safely bound bulk intake. Disable or synchronize local generation, cap bulk generation, expose backlog/last-success health, and reserve provider budget before treating the hint lifecycle as complete.

### SS-SRS-001 — P1 — Open

**Risk:** Cloud SRS save is not idempotent and the quiz retry path can duplicate history. Local IndexedDB history also starts a transaction before asynchronous reads, which can close the transaction and leave partial persistence.

**Evidence:** `handleSaveSrsHistory` in `functions/_shared/storage-learning-actions.ts` still performs canonical history followed by event, weakness, and mission/KPI writes without a study-attempt key. Local `saveSrsHistory` in `services/storage/learning-history.ts` opens its history transaction before asynchronous work and updates other stores separately. Local status remains `learning` below the graduation threshold, while Cloud `normalizeHistoryStatus` introduces `review` after interval 3.

**Required follow-up:** Add a client attempt identifier with a database uniqueness constraint, make the cloud write atomic, open IndexedDB transactions only after prerequisite reads, and align local/cloud SRS status thresholds.

### SS-IMPORT-001 — P1 — Open

**Risk:** Official content import deletes existing words before a sequence of independent book, ledger, and 200-row batch writes. A later batch failure can leave old content removed and a partial new catalog visible.

**Evidence:** `handleBatchImportWords` in `functions/_shared/storage-book-actions.ts` performs DELETE, book upsert, ledger upsert, and multiple batches without a staging/swap transaction. Duplicate filtering is only exact word+definition, while `(book_id, word_number)` remains a non-unique index in `migrations/0001_initial_schema.sql`. Generic normalization in `shared/catalogImport.ts` skips blank rows and substitutes row numbers instead of aborting.

**Required follow-up:** Enumerate mutation endpoints, validate source/review status server-side, add negative contract tests, and include the result in the release gate.

### SS-AUTH-001 — P1 — Open

**Risk:** Sign-up bypasses the email-auth rate-limit call and has no maximum length for email, password, or display name. Rotating email values can create accounts from one IP without reaching the login limiter, and a near-request-limit password reaches PBKDF2 before field-level rejection.

**Evidence:** The sign-up branch in `handleEmailAuth` returns before `assertAuthAttemptAllowed`; it performs string conversion and a minimum-only password check before `hashPassword`. `hashPassword` in `functions/_shared/auth.ts` therefore still receives an unbounded password, and `handleProfileUpdate` still accepts an unbounded display name.

**Required follow-up:** Complete a focused auth threat review and add automated negative tests before expanding public self-service access.

## Operational Boundary

- This review did not modify production or preview state.
- No deploy, remote migration, `cf:sync`, commit, push, or pull request was performed.
- The pre-change remote-readonly gate was used only to observe configuration/content integrity.
- The local revised-workbook helper and `output/spreadsheet/` artifacts remain preserved outside production source and automatic cleanup; the reusable parser was moved to `scripts/_shared` without changing its bytes.
