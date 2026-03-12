# Parallel Workstreams Phase 2

## Goal
- Run three large implementation threads in parallel without repeatedly colliding on the same files.
- Keep shared contracts stable while each thread moves a different layer of the app forward.
- Merge each thread into a single integration branch with predictable validation gates.

## Branch Model
- Create an integration base branch from the current working state:
  - `codex/phase2-integration`
- Create three topic branches from that exact commit:
  - `codex/mobile-ui-thread-a`
  - `codex/storage-read-model-thread-b`
  - `codex/writing-backend-thread-c`
- Do not branch one thread from another thread.
- Rebase each topic branch only onto `codex/phase2-integration`, never directly onto a partially merged topic branch.

## Shared Contracts
- These files are effectively locked. Change them only with explicit coordination because every thread depends on them:
  - `types.ts`
  - `contracts/`
  - `shared/learningHistory.ts`
  - `config/mobileFlow.js`
  - `functions/_shared/writing-ai-adapter.ts`
- If one thread must touch a locked file:
  - keep the diff minimal
  - merge that change first into `codex/phase2-integration`
  - rebase the other two threads immediately afterward

## Thread A
- Branch: `codex/mobile-ui-thread-a`
- Purpose: finish controller-driven decomposition of student mobile screens.
- Primary files:
  - `components/Onboarding.tsx`
  - `components/onboarding/*`
  - `hooks/useOnboardingController.ts`
  - `components/Dashboard.tsx`
  - `components/dashboard/*`
  - `hooks/useStudentDashboardController.ts`
- Allowed secondary files:
  - `App.tsx`
  - `components/auth/*`
  - `components/mobile/*`
- Explicitly avoid:
  - `services/storage.ts`
  - `functions/_shared/writing-actions.ts`
  - Cloudflare workflows or scripts
- Exit criteria:
  - `Onboarding` split into profile/test/result sections
  - dashboard orchestration reduced, with sections receiving props instead of running side effects
  - all existing mobile smoke selectors preserved
- Required checks before merge:
  - `npm run typecheck`
  - `npm run test:smoke`
  - `npm run test:ios-simulator`

## Thread B
- Branch: `codex/storage-read-model-thread-b`
- Purpose: split `services/storage.ts` internals while preserving public method names.
- Primary files:
  - `services/storage.ts`
  - `services/storage/*`
  - `shared/learningHistory.ts`
  - `tests/quiz-utils.test.ts`
  - any new storage-focused unit tests
- Allowed secondary files:
  - `utils/quiz.ts`
  - `functions/_shared/storage-support.ts`
- Explicitly avoid:
  - `components/`
  - `functions/_shared/writing-actions.ts`
  - deploy workflows
- Exit criteria:
  - `auth-session`, `learning-history`, `dashboard-read-model`, `organization-read-model`, `writing-read-model` extracted
  - `STUDY` semantics enforced through shared helper usage only
  - no public storage API rename
- Required checks before merge:
  - `npm run typecheck`
  - `npm run test:unit`
  - `npm run test:api`

## Thread C
- Branch: `codex/writing-backend-thread-c`
- Purpose: split `writing-actions` and batch student-first read paths.
- Primary files:
  - `functions/_shared/writing-actions.ts`
  - `functions/_shared/writing-actions/*`
  - `functions/api/writing/*`
  - writing-related API tests
- Allowed secondary files:
  - `contracts/writing.ts`
  - `functions/_shared/types.ts`
  - D1 migrations only if strictly necessary
- Explicitly avoid:
  - `components/QuizMode.tsx`
  - `components/Onboarding.tsx`
  - `services/storage.ts`
- Exit criteria:
  - `readSubmissionDetail` helper family separated from HTTP orchestration
  - assignment list/detail paths use batch or join reads for latest submissions
  - no external API break
- Required checks before merge:
  - `npm run typecheck`
  - `npm run test:unit`
  - `npm run test:api`

## Merge Order
- Default order:
  1. `codex/mobile-ui-thread-a`
  2. `codex/storage-read-model-thread-b`
  3. `codex/writing-backend-thread-c`
- Reasoning:
  - Thread A is user-visible and now has strong smoke coverage.
  - Thread B is mostly internal and should preserve public APIs, so it can follow once the mobile surface is stable.
  - Thread C carries the highest backend regression risk and may require the most re-test time, so merge it last.
- Override this order only if one thread changes a locked shared contract first.

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
  - `npm run typecheck`
  - `npm run test:unit`
  - `npm run build`
  - `npm run test:api`
  - `npm run test:smoke`
  - `npm run test:ios-simulator:doctor`
  - `npm run test:ios-simulator`
