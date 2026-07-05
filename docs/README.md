# Documentation Index

This directory keeps operational docs and historical design notes for Steady Study.

## Current

Use these docs as the current source of truth.

- [Deployment operations runbook](./deployment-ops-runbook.md): GitHub x Cloudflare release flow, release gate naming, rollback, secrets, and drift handling.
- [Material source ledger minimum ops](./material-source-ledger-minimum-ops.md): minimum operational rules for source-ledger-backed official materials.
- [Commercial one-pager](./commercial/steady_study_intro_onepager.md): current business-facing introduction draft.
- [UI mock asset notes](./assets/ui-mocks/README.md): notes for design mock assets.

## Reference

These docs are useful background, but implementation details may have changed. Check code and the current runbook before treating them as release criteria.

- [Implementation plan prep 2026-03-28](./implementation-plan-prep-2026-03-28.md)
- [Parallel workstreams phase 2](./parallel-workstreams-phase2.md)
- [Phase 0 brand, PWA, copy](./phase-0-brand-pwa-copy.md)
- [UI/UX redesign 2026-05-08](./ui-ux-redesign-2026-05-08.md)
- [Grammar practice redesign 2026-05-08](./grammar-practice-redesign-2026-05-08.md)
- [AI grammar generation 2026-05-09](./ai-grammar-generation-2026-05-09.md)
- [ADR: AI cache CBT architecture 2026-05-09](./ADR-ai-cache-cbt-architecture-2026-05-09.md)
- [Adaptive grammar translation plan 2026-05-10](./adaptive-grammar-translation-plan-2026-05-10.md)

## Archive And Analysis

- `docs/analysis/` is for dated investigation output and one-off analysis notes. Treat it as evidence or planning material, not as the release runbook.
- Superseded plans should move under `docs/archive/` when they stop being useful as reference. Until then, keep older dated docs in Reference with their original dates visible.

## Release Gate Naming

- `local-only`: runs entirely against local files, local temp D1, local build output, or local test servers. Examples include migration filename checks, local D1 migration replay, typecheck, unit tests, API integration tests, and local smoke suites.
- `remote-readonly`: reads GitHub, Cloudflare, or remote D1 state but does not mutate production or preview. Examples include `cf:doctor`, remote D1 content QA, source ledger checks, B2B activation integrity checks, and production baseline reports.
- `release`: can advance preview or production through remote migration, Pages deployment, deployed smoke, or rollback bookkeeping. These steps belong in GitHub Actions release workflows, not ad hoc local scripts.

`npm run release:gate:local-only` runs only local-only checks. `npm run release:gate:remote-readonly` runs only remote-readonly checks. `npm run release:gate` and `npm run release:gate:local` run the full pre-release gate from the developer machine without deploying or mutating remote infrastructure.

## One-Off Scripts

- Keep tracked, repeatable scripts under `scripts/` only when they are part of product operations, QA, release, or a reusable content workflow.
- Keep local one-off exploration scripts untracked unless they are reviewed, renamed, documented, and promoted into a repeatable workflow.
- Do not wire one-off scripts into `package.json` until their inputs, outputs, failure mode, and owner are documented.
