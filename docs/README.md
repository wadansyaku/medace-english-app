2026-10-08 現行: PR61のUIと[A8 初回自動発音](./analysis/2026-10-08-first-visible-word-pronunciation.md)は本番受入済み。PR62/main `1425152`、production37753211999成功、配備先244 browser回帰成功。旧公開禁止は今後も再適用しない。[actuallyの原本行対応訂正](./analysis/2026-10-08-naru-actually-original-row-correction.md)は修正版Excel納品済み・アプリはローカル候補。旧出典・ID・履歴を保持し、後続公開時のstage/配備/apply順序を文書化した。

# Documentation Index

This directory keeps operational docs and historical design notes for Steady Study.

## Current

- [Naru actuallyの訳の行ずれと原本対応訂正](./analysis/2026-10-08-naru-actually-original-row-correction.md): 修正版Excelの二セル限定編集、出典追加・既存ID/1,531語/638印/履歴保持、限定parser検出、実D1受入と後続公開の段階適用。今回アプリ候補は未公開。

- [統合UI・無料作文表示の最終受入と公開工程](./analysis/2026-10-08-integrated-ui-release.md): 本人許可後のremote-readonly/原本436/0058 beforeとPR61初回CI/preview成功。無料組織の導入完了P1を追加修正し2083unit・型・関連7browser成功、更新版配備へ進行中。公開禁止は解除済み。

- [統合UIの確認問題と最終ローカル受入](./analysis/2026-10-07-integrated-ui-acceptance.md): 単語/生徒共通入口/同uid/RBAC/無料学校管理者/5幅、検証sourceと未公開・未検証を区別。
- [単語学習を優先するおすすめ候補](./analysis/2026-10-07-vocabulary-first-candidate.md): 通常ホームの単語/続き/復習を優先し、文法・和訳を副操作へ。明示教材・配布課題・保存を保持。公開判断は別工程。
- [Steady Study全体改善計画](./analysis/2026-10-07-steady-study-improvement-plan.md): 現行コード・実操作・本番集計から評価。実施済み、候補、未検証の学習効果と将来計画を分ける。

- [Naru公開後レビューの修正候補](./analysis/2026-10-07-naru-postrelease-review.md): 公開済み182ba3dと追加候補を分離。学習sessionの再描画、旧quiz章、原本変更時の出題失効、標準import分類gate。

- [GPT下書き・永続予算台帳の公開候補](./analysis/2026-10-06-writing-gpt-budget-release.md): 本人の公開承認。未評価原本の永続保存、OpenAI adapter、D1 global月枠とusage、管理者表示。GPTは初期無効、外部実送信/キー設定は別の実行承認が必要。

- [Gemini停止・AIなし運用のローカル候補](./analysis/2026-10-05-ai-exit-local-candidate.md): b7e0c0c基準の非公開候補。Writing安全、標準プラン/通知、事前準備下書き、disabled provider、合成mock予算と未接続条件。

- [登録不要Naru版の公開候補](./analysis/2026-10-05-guest-public-release.md): 本人承認に基づくゲスト版の通常PR/CI・0048・配備と、AI送信なしの公開gate。

- [英作文サンプル評価の安全な分離](./analysis/2026-10-05-writing-ai-safety.md): 非公開候補。実評価とサンプル/不明の区別、確定と学習記録の境界、画面内draft保持・upload再利用、AIプラン502の標準切替。

- [登録なしNaru基本学習とカード表示改善](./analysis/2026-10-05-guest-naru-basic-learning.md): 非公開候補。匿名学習・端末記録・本人への保存境界、0048、回転と評価表示。

- [本番FAQ・製品改善と有料単語生成廃止](./analysis/2026-10-04-production-feedback-loop.md): 実装済み・最終gate/公開待ち。権限・D1保存・費用・移行と検証欄。

目的別に正本を分けます。過去の分析結果は現在の本番状態を示しません。

- [Product charter](../project.md): 対象、価値、原則、観測する指標。
- [登録前の学習と任意診断](./analysis/2026-10-03-value-first-onboarding.md): 固定UI版から分けた非公開Start版、端末記録と本人への引継ぎ、0045の移行境界。
- [Naruシスト一冊化・公開検証](./analysis/2026-10-03-naru-one-book-release.md): 原本保持、投入ガード、preview・本番の状態。
- [包括UI・保存基盤改善計画](./analysis/2026-10-03-medace-improvement-plan.md): 確定した破綻と追加候補、優先順位・受入条件。
- [Current backlog](../todo.md): 今回と次期の作業、受入条件、配備前の未完了事項。
- [Rebuild audit and plan 2026-09-07](./analysis/rebuild-plan-2026-09-07.md): 課題・実装・削除根拠・検証記録。
- [Production rebuild release 2026-09-07](./analysis/production-rebuild-release-2026-09-07.md): PR、migration、プレビュー・本番の実確認を段階別に記録。
- [Quiz receipt candidate 2026-10-03](./analysis/2026-10-03-quiz-attempt-receipts.md): 小テスト保存再送の独立候補、合成データ検証、Cloudflare/IDBの保証境界。
- [Quiz receipt integration 2026-10-03](./analysis/2026-10-03-quiz-attempt-receipts-integration.md): UI・一冊公開版へ重ねた未公開候補、統合回帰と配備前の境界。
- [Architecture](./architecture.md): 依存方向、取得/行動/保存の契約と未完の境界。
- [Environment setup](./environment-setup.md): ローカル教材投入、AI/R2、環境変数と設定の詳細。
- [Deployment operations runbook](./deployment-ops-runbook.md): release gate、preview/prod、rollback。
- [Material source ledger minimum ops](./material-source-ledger-minimum-ops.md): 公式教材の承認・権利台帳。
- [Brand and PWA principles](./phase-0-brand-pwa-copy.md): 正式名称、色、学習ホームの方針。

## Reference

- [有料単語生成廃止の独立候補 2026-10-04](./analysis/2026-10-04-paid-generation-only.md): 本番統合前の分離・検証の歴史的証拠。

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

- [2026-10-03 ホーム整理・章別学習・文法追加の非公開候補](./analysis/2026-10-03-smart-ui-and-grammar.md)

- [2026-10-07 Naru愛知県高校入試出題済み表示](./analysis/2026-10-07-naru-aichi-exam-annotations.md) — 原本色/座標監査、元注記637語とactuallyの別台帳補完（最終1531語/638印）、章範囲・表示・保存・公開境界。
