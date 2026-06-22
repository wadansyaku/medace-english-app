# GitHub x Cloudflare Deployment Runbook

## Topology

- GitHub Actions を唯一の deploy 経路として扱い、Cloudflare native Git auto-deploy は無効化したまま維持します。
- `production` environment は `medace-db` を、`preview` environment は `medace-db-preview` を使います。
- preview URL は公開のまま運用しますが、preview banner と `noindex` marker を必ず表示します。
- service admin の本番専用入口は `/admin-access` です。この URL 自体を secret とみなさず、`ADMIN_DEMO_PASSWORD` と `ENABLE_ADMIN_DEMO` / `VITE_ENABLE_ADMIN_DEMO` の明示設定で保護します。production では `ENABLE_DESTRUCTIVE_ADMIN_ACTIONS` を有効にしない限り、破壊的管理操作は閉じたままにします。

## GitHub Settings

- `main` は PR 必須、required checks 必須、conversation resolution 必須の ruleset で保護します。
- deploy workflow は GitHub `production` / `preview` environment を参照し、Cloudflare credential と D1 名も environment-scoped config を優先します。
- `.github/CODEOWNERS`, `wrangler.jsonc`, `migrations/`, `scripts/cf-*.mjs` は owner review 前提で扱います。

## Release Flow

1. local では `npm run release:gate:local:dry` で順序を確認し、release 前に `npm run release:gate:local` を通す。この gate は migration filename check / local D1 migration replay / npm security audit / typecheck / unit tests / build / API integration tests / full smoke suite / `cf:doctor` / remote D1 content QA / source ledger gate / B2B activation integrity gate / deploy artifact build を直列で確認します。
2. PR で `CI` と preview deployment を通す。deploy workflow は local gate と同じ意味の `security:audit` / `verify:fast` / build / `test:api` / `node scripts/run-smoke-tests.mjs --suite full` / `cf:doctor` / content QA gate / source ledger gate / B2B activation integrity gate / deploy artifact build を個別 step で確認します。
3. `Deploy Pages Preview` が preview DB migration、content QA gate、source ledger gate、B2B activation integrity gate、deployed smoke まで通ったことを確認する。
4. `main` へ merge すると `Deploy Pages` が production bookmark を採取し、remote migration と Pages deploy を実行する。
5. job summary に記録された production bookmark を DB rollback の起点として保存する。

## Production Baseline

- 大きな product / B2B /教材判断の前後では、`npm run ops:production-baseline:d1 -- --remote --database medace-db --output tmp/production-baseline.json` を実行して read-only baseline を保存します。
- baseline runner は user mix、organization mix、catalog / hint coverage、learning activity、writing / mission / notification、integrity、recency marker をまとめて出力し、D1 query failure や schema drift は non-zero exit にします。
- baseline は観測 report です。activation gap を release-blocking にする日は、`ops:b2b-activation:d1` に `--max-activation-warning-orgs 0` や `--require-active-b2b-loop` を付けて明示的に harden します。

## Smoke Suites

- `sentinel`: PR の高速回帰。public / student の代表フローだけを短く確認します。
- `full`: release 必須。public / student / organization / commercial / writing / mobile と local IDB fallback を確認します。
- deployed smoke: preview / production の公開 URL に `PLAYWRIGHT_BASE_URL` を向け、`scripts/run-smoke-tests.mjs --suite sentinel --grep ...` 経由で asset / PWA / 公開URLの代表フローを確認します。

## B2B Storage/API Contract Checklist

- `tests/storage-action-contract.test.ts` で storage action の role gate と payload parse を確認します。
- 生徒は自分の mission を `OPENED` できますが、`MANUAL_COMPLETE` は講師・管理者だけが使います。
- commercial provision は admin 操作として扱い、status / target plan / organization role / linked user の payload validation を維持します。
- organization assignment、cohort、mission 作成は Cloudflare/D1 正史で確認します。B2B acceptance は `cf:preview` または full smoke を基準にし、IDB fallback の画面確認だけで release 判定しません。

## Rollback

### Code rollback

- Cloudflare Pages Dashboard の deployment history から直前の安定 deployment に戻します。
- preview deployment は rollback target ではなく、検証用 URL として扱います。

### DB rollback

- production deploy job summary の `Recovery Bookmark` を使います。
- 例:

```bash
npx wrangler d1 time-travel restore medace-db --bookmark=<bookmark>
```

- restore 実行後は undo 用 bookmark も返るので、その値も必ず控えてください。

## Secrets and Drift

- `npm run cf:doctor` は repo-level fallback に加えて GitHub environment secrets / variables と preview DB binding を検査します。
- release gate では `cf:doctor` の `Summary` が `error=0` であることを必須条件にします。`warn` は deferred key など明示的に延期できる項目として残せますが、`error` が 1 件でもある場合は preview / production deploy を止めます。
- release gate では remote D1 content QA も必須条件にします。必須語義の空欄、`[未抽出]` などの sentinel、空教材がある場合は `content:qa:gate` が release-blocking error として preview / production deploy を止めます。
- release gate では source ledger も必須条件にします。公式/配信教材の ledger 行が欠けている、content QA blocker が残っている、または Today Focus に使える承認済み教材が1冊もない場合は `content:source-ledger:d1` が preview / production deploy を止めます。重複 headword や source coverage 不足は warning として出力し、教材更新直後など warning-free を要求する release では `--max-warning-books 0` を付けて厳格化します。
- release gate では B2B activation integrity も必須条件にします。`ops:b2b-activation:d1` は organization membership、cohort membership、担当割当、mission、通知、writing assignment/submission/review の参照整合性を release-blocking error として扱います。cohort 未作成、担当割当なし、mission なし、通知なし、作文未配布、B2B product event の telemetry 不整合は warning として出力し、導入完了 release では `--max-activation-warning-orgs 0`、`--max-product-event-warning-rows 0`、`--require-active-b2b-loop` を付けて厳格化します。
- Cloudflare native Git auto-deploy、`*-git` mirror Pages project、Pages project 設定の検査不能は二重 deploy や migration 前 deploy の原因になるため、通常の `cf:doctor` で release-blocking error として扱います。`npm run cf:sync` で auto-deploy を無効化し、不要な mirror project は Cloudflare Dashboard で削除してください。
- `npm run cf:doctor:strict` は deferred AI key も release 条件に含める日の診断用です。通常の local release gate と deploy workflow は `cf:doctor` を正本にします。
- `INTERNAL_JOB_SECRET` は GitHub scheduled workflow の repository secret と、Pages production / preview の runtime secret の両方に必要です。前者が無いと `analytics-snapshots.yml` / `word-hint-audit.yml` が落ち、後者が無いと内部 endpoint が 503 を返します。
- Pages の required secrets は `ADMIN_DEMO_PASSWORD`, `WRITING_AI_MODE`, `INTERNAL_JOB_SECRET` です。`GEMINI_API_KEY` と `OPENAI_API_KEY` は外部 AI を有効化するまで deferred warning として扱います。
- service admin の本番操作デモを開ける日は、Pages runtime secret `ENABLE_ADMIN_DEMO=true` と GitHub production environment variable `VITE_ENABLE_ADMIN_DEMO=true` を両方設定し、deploy workflow で再 build します。解除するときは両方を `false` に戻して再 deploy してください。
- `npm run cf:sync` は GitHub environment vars/secrets と preview DB の存在を揃えます。
- preview 用 `ADMIN_DEMO_PASSWORD` を本番と分ける場合は、local で `ADMIN_DEMO_PASSWORD_PREVIEW` をセットしてから `npm run cf:sync` を実行します。
