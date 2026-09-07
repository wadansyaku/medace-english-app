# Documentation Index

This directory keeps operational docs and historical design notes for Steady Study.

## Current

目的別に正本を分けます。過去の分析結果は現在の本番状態を示しません。

- [Product charter](../project.md): 対象、価値、原則、観測する指標。
- [Current backlog](../todo.md): 今回と次期の作業、受入条件、配備前の未完了事項。
- [Rebuild audit and plan 2026-09-07](./analysis/rebuild-plan-2026-09-07.md): 課題・実装・削除根拠・検証記録。
- [Architecture](./architecture.md): 依存方向、取得/行動/保存の契約と未完の境界。
- [Environment setup](./environment-setup.md): ローカル教材投入、AI/R2、環境変数と設定の詳細。
- [Deployment operations runbook](./deployment-ops-runbook.md): release gate、preview/prod、rollback。
- [Material source ledger minimum ops](./material-source-ledger-minimum-ops.md): 公式教材の承認・権利台帳。
- [Brand and PWA principles](./phase-0-brand-pwa-copy.md): 正式名称、色、学習ホームの方針。

## Reference

- [Repository audit 2026-07-11](./analysis/repository-audit-and-improvement-plan-2026-07-11.md)
- [Writing security review 2026-07-10](./analysis/security-review-2026-07-10.md)
- [Current-state review 2026-07-06](./analysis/current-state-improvement-plan-2026-07-06.md)
- [Previous backlog](./archive/todo-through-2026-07-11.md)
- [Previous journal](./archive/journal-through-2026-04-26.md)
- [Commercial one-pager draft](./commercial/steady_study_intro_onepager.md)
- [Historical UI mock asset notes](./assets/ui-mocks/README.md)

These docs are useful background, but implementation details may have changed. Check code and the current runbook before treating them as release criteria.

- [Implementation plan prep 2026-03-28](./implementation-plan-prep-2026-03-28.md)
- [Parallel workstreams phase 2](./parallel-workstreams-phase2.md)
- [UI/UX redesign 2026-05-08](./ui-ux-redesign-2026-05-08.md)
- [Grammar practice redesign 2026-05-08](./grammar-practice-redesign-2026-05-08.md)
- [AI grammar generation 2026-05-09](./ai-grammar-generation-2026-05-09.md)
- [ADR: AI cache CBT architecture 2026-05-09](./ADR-ai-cache-cbt-architecture-2026-05-09.md)
- [Adaptive grammar translation plan 2026-05-10](./adaptive-grammar-translation-plan-2026-05-10.md)

## Archive And Analysis

- `docs/analysis/` is for dated investigation output and one-off analysis notes. Treat it as evidence or planning material, not as the release runbook.
- Superseded plans should move under `docs/archive/` when they stop being useful as reference. Until then, keep older dated docs in Reference with their original dates visible.

## Release Gate Naming

- `local-only`: does not access application remote state; the npm vulnerability audit queries the npm registry. Other checks run entirely against local files, local temp D1, local build output, or local test servers. Examples include migration filename checks, local D1 migration replay, typecheck, unit tests, API integration tests, and local smoke suites.
- `remote-readonly`: reads GitHub, Cloudflare, or remote D1 state but does not mutate production or preview. Examples include `cf:doctor`, remote D1 content QA, source ledger checks, B2B activation integrity checks, and production baseline reports.
- `release`: can advance preview or production through remote migration, Pages deployment, deployed smoke, or rollback bookkeeping. These steps belong in GitHub Actions release workflows, not ad hoc local scripts.

`npm run release:gate:local-only` runs only local-only checks. `npm run release:gate:remote-readonly` runs only remote-readonly checks. `npm run release:gate` and `npm run release:gate:local` run the full pre-release gate from the developer machine without deploying or mutating remote infrastructure.

## One-Off Scripts

- Keep tracked, repeatable scripts under `scripts/` only when they are part of product operations, QA, release, or a reusable content workflow.
- Keep local one-off exploration scripts untracked unless they are reviewed, renamed, documented, and promoted into a repeatable workflow.
- Do not wire one-off scripts into `package.json` until their inputs, outputs, failure mode, and owner are documented.

## Source And Local Artifact Hygiene

- `npm run quality:architecture` enforces client/server/shared import boundaries and rejects cycles in production code. The source of truth for rules is `scripts/check-architecture.mjs`; focused fixtures verify illegal imports, legal shared helpers, and cycles. This check is in `verify:fast` and the local release gate.
- PR sentinel runs once in the required CI `verify` job. `browser-smoke.yml` is manual only; preview/production keep their own full release verification. CI uses cancellation for superseded PR work without cancelling production release runs.

- `npm run quality:unused` fails when a production TypeScript/JavaScript source is unreachable from the Vite or Pages Functions entry graph, including relative imports, the `@/` alias, literal and bounded template dynamic imports, `import.meta.glob`, and `new URL(..., import.meta.url)` Worker references. CSS, public assets, tests, and operational scripts are intentionally outside that graph.
- `npm run clean:artifacts` is always a dry run. Use `npm run clean:artifacts:apply` only after reviewing the printed list.
- Cleanup is deliberately narrow: only the type-checked exact names `dist/`, `_worker.bundle`, `test-results/`, and `test-results-rerun/`, plus `.DS_Store`, Python bytecode, and `__pycache__`, are regenerable targets. Similar names and symlinks are preserved. `node_modules`, `.wrangler`, `tmp`, `output`, and `.playwright*` remain outside the cleanup boundary because they can contain active local state, recovery evidence, or user artifacts.
- Local workbook correction helpers and the files under `output/spreadsheet/` are not production source and are not cleanup targets. Preserve them together until they are explicitly promoted to a documented repeatable workflow or archived outside the repo.
