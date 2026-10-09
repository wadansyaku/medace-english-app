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

2026-10-09 17:44 UTCの親側本人承認で、今回My単語帳候補の公開を通常gateから進める。残る独立再確認が通るまでmain統合しない。恒久ルールの保存は親が扱い、ここでは今回の配備範囲だけを記録する。保存/復旧条件は [My単語帳の公開工程](./analysis/2026-10-09-personal-wordbook-production-release.md) を参照する。

Gate naming:

- `local-only`: local files、一時 D1、local build output、local test server だけで完結する確認。migration filename check、local D1 migration replay、production source reachability、typecheck、unit tests、API integration tests、local smoke suites が該当します。
- `remote-readonly`: GitHub、Cloudflare、remote D1 を読みますが、preview / production を変更しない確認。`cf:doctor`、remote D1 content QA、source ledger gate、B2B activation integrity gate、production baseline report が該当します。
- `release`: preview / production の remote migration、Pages deploy、deployed smoke、rollback bookmark 採取など、remote state を進める手順。GitHub Actions の release workflow を正規経路にします。

1. local では `npm run release:gate:local:dry` で順序を確認し、release 前に `npm run release:gate:local` を通す。この gate は local-only checks と remote-readonly checks を直列で確認します。remote migration と Pages deploy は実行しません。
2. PR で `CI` と preview deployment を通す。deploy workflow は local gate と同じ意味の `security:audit` / `verify:fast` / build / `test:api` / `node scripts/run-smoke-tests.mjs --suite full` / `cf:doctor` / content QA gate / source ledger gate / B2B activation integrity gate / deploy artifact build を個別 step で確認します。
3. `Deploy Pages Preview` が preview DB migration、content QA gate、source ledger gate、B2B activation integrity gate、deployed smoke まで通ったことを確認する。
4. `main` へ merge すると `Deploy Pages` が production bookmark を採取し、remote migration と Pages deploy を実行する。
5. job summary に記録された production bookmark を DB rollback の起点として保存する。

`verify:fast` は `quality:unused` と `quality:architecture`（依存境界と循環）を含みます。Vite の `index.tsx` または Pages Functions の `functions/api/[[path]].ts` から static internal import（relative import と `@/` alias）、re-export、type import、literal・同一ディレクトリ内 template dynamic import、`import.meta.glob`、`new URL(..., import.meta.url)` Worker 参照で到達しない production JS/TS source は release candidate に残しません。CSS / public assets はこの JS/TS graph の対象外です。local artifact cleanup は deploy gate と分離し、`clean:artifacts` の dry-run を確認してから `clean:artifacts:apply` を使います。cleanup は列挙済みの `dist/`、`_worker.bundle` file、`test-results/`、`test-results-rerun/` と保護領域外の小さなキャッシュだけを対象とし、symlink は追跡しません。`node_modules`、`.wrangler`、`tmp`、`output`、`.playwright*` は対象にしません。

## Production Baseline

- 公開CIのContent QA証拠は `--summary-only` を指定し、教材名・単語・語義・例文・識別子を含めない集計だけを保存します。`--compact` 単独は整形の省略であり、秘匿化ではありません。品質判定は同じsummaryを用います。
- production baselineの標準runnerは組織名・教材名も含みます。公開資料へ流用せず、配備前後の保存確認には個人値を含まないCOUNT集計を使います。

- 大きな product / B2B /教材判断の前後では、`npm run ops:production-baseline:d1 -- --remote --database medace-db --output tmp/production-baseline.json` を実行して read-only baseline を保存します。
- baseline runner は user mix、organization mix、catalog / hint coverage、learning activity、writing / mission / notification、integrity、recency marker をまとめて出力し、D1 query failure や schema drift は non-zero exit にします。
- baseline は観測 report です。activation gap を release-blocking にする日は、`ops:b2b-activation:d1` に `--max-activation-warning-orgs 0` や `--require-active-b2b-loop` を付けて明示的に harden します。

## Smoke Suites

- PR の sentinel は必須 `CI / verify` が担当します。`browser-smoke.yml` は `workflow_dispatch` のみで、手動の sentinel/full 追加確認に使います。preview/prod の full gate は配備候補ごとに維持します。
- ローカル API/smoke step は Cloudflare credential を受け取りません。GitHub token は必要なdoctor stepへ限定します。
- 2026-09-07追加: dashboard取得失敗の回復、Study読込失敗、連打、保存済み応答の喪失、XP未確認を実画面で検証します。

- `sentinel`: PR の高速回帰。public / student の代表フローだけを短く確認します。
- `full`: release 必須。public / student / organization / commercial / writing / mobile と local IDB fallback を確認します。
- deployed smoke: preview / production の公開 URL に `PLAYWRIGHT_BASE_URL` を向け、`scripts/run-smoke-tests.mjs --suite sentinel --grep ...` 経由で asset / PWA / 公開URLの代表フローを確認します。

## B2B Storage/API Contract Checklist

- SRS は0042の `study_attempt_receipts` と履歴・interaction eventを同一D1 batchでcommitします。配備はmigration→新APIの順に行います。旧クライアントの識別子なし呼び出しは互換経路であり、再送dedupを保証しません。
- 同じ利用者/attempt IDの同内容再送で履歴を増やさず、異なる内容は409。認可・教材と単語の対応、mission本人/教材の整合性を確認します。サーバーreceiptの追加をquiz/XP/Writing全体の原子性と混同しません。
- mission達成は丸めた割合でなく、一意語数と必須目標の厳密な条件で判断します。並行更新はCASと再読込で処理し、完了/アーカイブは古い要求で戻しません。

- `tests/storage-action-contract.test.ts` で storage action の role gate と payload parse を確認します。
- Writing の生徒向け提出確定レスポンスは AI 評価を含めず、返却後 detail は講師が選んだ評価 1 件だけを含めます。`privateMemo` はキー自体を生徒レスポンスへ出しません。講師・管理者向け review detail は全評価と private memo を維持します。
- Writing の講師・管理者アクセスは、担当生徒の可視性に加えて assignment の `organizationId` が現在の組織と一致することを必須にします。転籍後も生徒本人の履歴ポリシーは変えません。
- Writing の印刷 HTML は動的 text を必ず `escapeHtmlText` へ通し、学生向け返却物へ AI provider、内部評価指標、非公開メモを出しません。QR SVG は静的 builder 出力だけを markup として扱います。
- Writing の完了 API は RETURNED からだけ遷移し、COMPLETED の再送は write-free な no-op、その他の状態は 409 にします。UI の状態判定だけを認可・状態機械の根拠にしません。
- 生徒は自分の mission を `OPENED` できますが、`MANUAL_COMPLETE` は講師・管理者だけが使います。
- commercial provision は admin 操作として扱い、status / target plan / organization role / linked user の payload validation を維持します。
- organization assignment、cohort、mission 作成は Cloudflare/D1 正史で確認します。B2B acceptance は `cf:preview` または full smoke を基準にし、IDB fallback の画面確認だけで release 判定しません。

## Rollback

### Code rollback

- Cloudflare Pages Dashboard の deployment history から直前の安定 deployment に戻します。
- preview deployment は rollback target ではなく、検証用 URL として扱います。

### DB rollback

- 0041/0042は旧APIと共存する追加・互換migrationです。まず新スキーマを残してコードだけを安定版へ戻す方法を優先します。旧APIへ戻すとSRSの再送重複抑止は失われるため、保存動作を再確認します。
- 0042より前へDBを復元するとreceipt tableがなくなります。新APIが稼働したままDBだけを復元してはいけません。影響する書き込みを停止し、互換コードへ切り替えたうえで復元・schema/API整合性確認・書き込み再開の順に行います。
- DB復元はbookmark以後の正当な書き込みも巻き戻します。復元時点と影響範囲を記録し、移行成功を個別の学習記録の回復成功と混同しません。

- production deploy job summary の `Recovery Bookmark` を使います。
- 例:

```bash
npx wrangler d1 time-travel restore medace-db --bookmark=<bookmark>
```

- restore 実行後は undo 用 bookmark も返るので、その値も必ず控えてください。

## Secrets and Drift

- `npm run cf:doctor` は repo-level fallback に加えて GitHub environment secrets / variables と preview DB binding を検査します。
- remote-readonly gate では `cf:doctor` の `Summary` が `error=0` であることを必須条件にします。`warn` は deferred key など明示的に延期できる項目として残せますが、`error` が 1 件でもある場合は preview / production deploy を止めます。
- remote-readonly gate では remote D1 content QA も必須条件にします。必須語義の空欄、`[未抽出]` などの sentinel、空教材がある場合は `content:qa:gate` が release-blocking error として preview / production deploy を止めます。
- remote-readonly gate では source ledger も必須条件にします。公式/配信教材の ledger 行が欠けている、content QA blocker が残っている、または Today Focus に使える承認済み教材が1冊もない場合は `content:source-ledger:d1` が preview / production deploy を止めます。重複 headword や source coverage 不足は warning として出力し、教材更新直後など warning-free を要求する release では `--max-warning-books 0` を付けて厳格化します。
- remote-readonly gate では B2B activation integrity も必須条件にします。`ops:b2b-activation:d1` は organization membership、cohort membership、担当割当、mission、通知、writing assignment/submission/review の参照整合性を release-blocking error として扱います。cohort 未作成、担当割当なし、mission なし、通知なし、作文未配布、B2B product event の telemetry 不整合は warning として出力し、導入完了 release では `--max-activation-warning-orgs 0`、`--max-product-event-warning-rows 0`、`--require-active-b2b-loop` を付けて、初回作文の講師返却まで到達した組織があることを厳格化します。
- Cloudflare native Git auto-deploy、`*-git` mirror Pages project、Pages project 設定の検査不能は二重 deploy や migration 前 deploy の原因になるため、通常の `cf:doctor` で release-blocking error として扱います。`npm run cf:sync` で auto-deploy を無効化し、不要な mirror project は Cloudflare Dashboard で削除してください。
- Cloudflare Dashboard の `Deployments paused` / `デプロイを一時停止` は、この repo では GitHub Actions 以外の native Git auto-deploy を止めている表示です。Pages project 自体の公開停止ではありません。`npm run cf:doctor` が `error=0` で、live `/api/session` の `x-deployment-sha` が最新 deploy SHA と一致する場合は、`Resume deployments` を押さずそのまま維持します。
- `npm run cf:doctor:strict` は deferred AI key も release 条件に含める日の診断用です。通常の local release gate と deploy workflow は `cf:doctor` を正本にします。
- `INTERNAL_JOB_SECRET` は GitHub scheduled workflow の repository secret と、Pages production / preview の runtime secret の両方に必要です。前者が無いと `analytics-snapshots.yml` が落ち、後者が無いと内部 endpoint が 503 を返します。2026-10-04の有料生成廃止の独立候補では有料 `word-hint-audit.yml` と監査endpointを停止しています（公開版e97には未反映）。
- Pages の required secrets は `ADMIN_DEMO_PASSWORD`, `WRITING_AI_MODE`, `INTERNAL_JOB_SECRET` です。`GEMINI_API_KEY` と `OPENAI_API_KEY` は外部 AI を有効化するまで deferred warning として扱います。
- service admin の本番操作デモを開ける日は、Pages runtime secret `ENABLE_ADMIN_DEMO=true` と GitHub production environment variable `VITE_ENABLE_ADMIN_DEMO=true` を両方設定し、deploy workflow で再 build します。解除するときは両方を `false` に戻して再 deploy してください。
- `npm run cf:sync` は GitHub environment vars/secrets と preview DB の存在を揃えます。
- preview 用 `ADMIN_DEMO_PASSWORD` を本番と分ける場合は、local で `ADMIN_DEMO_PASSWORD_PREVIEW` をセットしてから `npm run cf:sync` を実行します。


## 配備切替の待機とローカル実行障害の診断

2026-09-07の本番配備では、production aliasの切替直後に旧HTMLが参照するファイルだけが新しい配備で見つからず、HTML fallbackになる状態を検知した。外部URLもローカルと同じreadiness待機を使い、APIの期待SHA、HTMLから参照するJS/CSS、PWA manifest/iconの整合が揃うまで最大180秒待つ。期限超過・サーバー停止は失敗として扱い、その後に実画面テストを通常どおり実行する。画面テスト自体の再試行回数は増やさない。

Wranglerの内部ログはローカル検証用の一時ディレクトリへ保存し、異常終了時に末尾最大256KiBから固定の分類だけを出力する。分類は `PROXY_CONNECTION_LOST`、`RUNTIME_CRASH`、`SQLITE_BUSY`、`UNKNOWN`。不明・読取不能を成功や0件に変えない。秘密値・本文・生の例外を公開artifactへコピーせず、一時ログは終了処理で削除する。利用者が要求した正常停止には障害診断を出さない。

初回停止・単発再実行・実本番配備・独立live受入を分けた証拠は[本番リリース記録](./analysis/production-rebuild-release-2026-09-07.md)を参照する。


## Naru原本行対応訂正の配備と復旧

2026-10-08の本人承認で、本番アプリと教材のactually原本訂正を通常PR/CI/preview/productionから反映する。0059は出典stageのみ。配備先のdeployed smoke後、scripts/apply-naru-source-correction.mjsが期待SHA、build assetのbyte一致、訂正対応route marker、固定原本proofを確認してから明示applyし、after guard/1531語/638印/ID1361/学習集計とguest表示を再検証する。既適用は検証済みskipとし、0件applyや失効を成功に変えない。preview/prod receiptはActions artifactとして保存する。

両環境でmigration前にD1 Time Travel bookmarkを取得する。stageのみなら旧1425152へコードrollback可能。apply後のコードrollback下限は訂正対応コードであり、旧APIへ単独rollbackしない。まず同じ訂正契約を保つforward fixまたは訂正対応配備へ戻す。出典・訂正台帳・旧補完を削除して復旧しない。DB bookmark restoreはその後の正当な学習保存も戻すため、影響を確認した障害復旧として判断し、通常のコードrollbackに混ぜない。

公開前review対応の0060は、0059の記録を残して補完由来保持と出典no-op更新を修復する。preview全workflowは共有D1単位で直列化し、進行中のapplyをcancelしない。切替時は旧branch単位groupの実行終了を先に確認する。新規applyの0件RETURNINGは引き続きFAIL、適用前から有効な既適用状態だけをwriteなしで受け入れる。
