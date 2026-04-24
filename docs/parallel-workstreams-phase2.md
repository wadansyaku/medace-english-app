# Parallel Workstreams Phase 2

## Goal
- Keep the main product track centered on `B2B activation + Cloudflare-first stability`.
- Separate the current `workbook import` risk from the larger `storage / B2B refactor` track.
- Keep shared contracts stable while each thread moves a different layer of the app forward.

## Current Hotspots
- The files that currently dominate change risk are:
  - `types.ts`
  - `contracts/storage.ts`
  - `services/storage.ts`
  - `services/storage/organization-read-model.ts`
  - `functions/_shared/storage-mission-actions.ts`
  - `functions/_shared/storage-dashboard-actions.ts`
  - `functions/_shared/writing-actions/*`
- `components/dashboard/BusinessAdminDashboardSections.tsx` is no longer the main hotspot. It should not be treated as the default split target ahead of the storage and read-model layers.

## Branch Model
- Create an integration base branch from the current working state:
  - `codex/phase2-integration`
- Create topic branches from that exact commit:
  - `codex/workbook-import-guardrails`
  - `codex/storage-read-model-thread-b`
  - `codex/b2b-activation-thread-c`
- Do not branch one topic branch from another topic branch.
- Rebase topic branches only onto `codex/phase2-integration`, never directly onto a partially merged topic branch.

## Shared Contracts
- These files are effectively locked because multiple threads depend on them:
  - `types.ts`
  - `contracts/storage.ts`
  - `shared/learningHistory.ts`
  - `functions/_shared/writing-ai-adapter.ts`
- If one thread must touch a locked file:
  - keep the diff minimal
  - merge that change first into `codex/phase2-integration`
  - rebase the other threads immediately afterward

## Thread A
- Branch: `codex/workbook-import-guardrails`
- Purpose: close the current noun workbook import track safely before deeper refactors continue.
- Current status: release-ready after final verification; server-side guardrails now fail only on unreviewed workbook mismatches.
- Primary files:
  - `components/AdminPanel.tsx`
  - `components/admin/AdminContentImportView.tsx`
  - `utils/nounWorkbookImport.js`
  - `tests/nounWorkbookImport.test.ts`
  - `functions/_shared/catalog-import.ts`
  - `functions/_shared/storage-book-actions.ts`
  - `functions/_shared/word-hint-assets.ts`
  - `shared/wordHintAssets.ts`
  - `hooks/useStudyModeController.ts`
  - `migrations/0028_word_catalog_metadata.sql`
- Allowed secondary files:
  - `contracts/storage.ts`
  - `types.ts`
  - `services/storage.ts`
  - `scripts/analyze-noun-workbook.mjs`
- Explicitly avoid:
  - B2B dashboard copy changes
  - writing workflow refactors unrelated to example hints
  - deploy workflow edits
- Exit criteria:
  - workbook import is explicitly presented as a noun workbook path, not a generic XLSX promise
  - import stops or warns hard on significant `index/import` mismatches
  - known source-workbook alias / duplicate exceptions are tracked in code as reviewed exceptions, not silently ignored
  - parser and D1 round-trip coverage exist for workbook-derived rows
  - example hint contract is consistent across cache hit, study UI, and audit logic
- Required checks before merge:
  - `npm run verify:fast`
  - `npm run test:api`
  - `npm run build`
  - `npm run test:smoke`

## Thread B
- Branch: `codex/storage-read-model-thread-b`
- Purpose: split `services/storage.ts` and `organization-read-model` internals while preserving public method names.
- Primary files:
  - `services/storage.ts`
  - `services/storage/*`
  - `functions/_shared/storage-support.ts`
  - storage-focused unit tests
- Allowed secondary files:
  - `contracts/storage.ts`
  - `types.ts`
  - `utils/quiz.ts`
- Explicitly avoid:
  - `components/AdminPanel.tsx`
  - `functions/_shared/writing-actions.ts`
  - deploy workflows
- Exit criteria:
  - `services/storage.ts` becomes thinner and delegates to read-model or domain modules
  - `organization-read-model` and related helpers stop accumulating unrelated responsibilities
  - no public storage API rename
- Required checks before merge:
  - `npm run verify:fast`
  - `npm run test:api`
  - focused storage unit coverage

## Thread C
- Branch: `codex/b2b-activation-thread-c`
- Purpose: continue the main business loop after storage boundaries are safer.
- Primary files:
  - `components/dashboard/businessAdmin/*`
  - `functions/_shared/storage-dashboard-actions.ts`
  - `functions/_shared/product-kpi.ts`
  - activation-related smoke and API tests
- Allowed secondary files:
  - `components/dashboard/InstructorDashboardSections.tsx`
  - `hooks/useBusinessAdminDashboardController.ts`
  - `services/workspace.ts`
- Explicitly avoid:
  - workbook parser work
  - broad storage facade rewrites
  - deploy workflows unless release-ready
- Exit criteria:
  - cohort -> assignment -> mission -> notification -> writing loop has tighter empty states, CTA surfaces, and analytics coverage
  - smoke paths for business workflows stay green
- Required checks before merge:
  - `npm run verify:fast`
  - `npm run test:api`
  - `npm run test:smoke`

## Merge Order
- Default order:
  1. `codex/workbook-import-guardrails`
  2. `codex/storage-read-model-thread-b`
  3. `codex/b2b-activation-thread-c`
- Reasoning:
  - Thread A closes the highest immediate correctness risk in the dirty worktree.
  - Thread B reduces the main structural drag without changing public APIs.
  - Thread C should build on safer contracts and thinner storage boundaries.
- Override this order only if a locked shared contract changes first.

## Daily Operating Rule
- At the start of each thread session:
  - run `git diff --stat`
  - restate the files that thread is allowed to touch
  - confirm whether a locked contract changed on the integration branch
- At the end of each thread session:
  - record what changed
  - record what test suite was run
  - note any intentional contract change

## Final Integration Gate
- Before merging `codex/phase2-integration` back to the main delivery branch, run:
  - `npm run verify:fast`
  - `npm run test:api`
  - `npm run build`
  - `npm run test:smoke`
