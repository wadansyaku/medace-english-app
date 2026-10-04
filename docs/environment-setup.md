# 環境構築・設定リファレンス

更新日: 2026-09-07。設定の索引であり、現在の本番稼働を保証する文書ではありません。
初めての起動は [README](../README.md)、配備は [運用手順](./deployment-ops-runbook.md) を参照してください。
remoteコマンドは対象環境を確認した運用者向けです。

## Storage Mode Policy

- 既定の運用モードは Cloudflare です。`/api/storage`、`/api/writing`、D1、R2 を含む本番相当の挙動確認は `npm run cf:preview` または `npm run test:api` / `npm run test:smoke` を基準にしてください。
- `VITE_STORAGE_MODE=idb` は demo / offline 学習の最小導線向けです。個人学習の session、教材閲覧、学習履歴のローカル検証には使えますが、学校・教室向け workspace の正史ではありません。
- business dashboard、missions、commercial request、announcements、writing は Cloudflare 側を正史とし、新規 business 機能では IndexedDB の並行実装を追加しない方針です。
- frontend からは `services/storage.ts` の巨大 facade へ直接依存を増やさず、`services/session.ts`、`services/dashboard.ts`、`services/workspace.ts`、`services/writing.ts` の薄い adapter を優先してください。

## Cloudflare ローカル確認

`Steady Study` は `/dashboard` や `/study/...` などの URL とアプリ内の画面状態を同期し、直接アクセス・再読み込み・ブラウザの戻る操作に対応します。[ルーティング実装](../hooks/useAppNavigation.ts) と [Pages の rewrite 設定](../public/_redirects) を対応させ、APIと静的ファイルの経路を保った SPA fallback を維持してください。ローカル確認は `wrangler pages dev dist` を基準にします。

1. D1 マイグレーションを適用

```bash
npx wrangler d1 migrations apply medace-db --local
```

2. 原本教材 + ライセンス教材を seed SQL 化

```bash
node scripts/build-seed-sql.mjs \
  --original-access-scope ALL_PLANS \
  --original-csv /path/to/original_wordbank/ORIGINAL_WORDBANK_JHS_HS_FINAL_CONFIRMED.csv \
  --licensed-csv /path/to/licensed_catalog/MASTER_DATABASE_REFINED.csv \
  ./tmp/d1-seed.sql
```

このスクリプトは入力CSVの形式を自動判定します。`--original-csv` はオリジナル単語データベースの原本CSVを学年帯別教材へ再編し、`--licensed-csv` は既存の単語帳CSVをそのまま教材化します。`--original-access-scope` / `--licensed-access-scope` で公開範囲を個別に切り替えられます。`TOEFLテスト英単語3800` はデフォルトで除外され、追加除外は `--exclude-book "書名"` で指定できます。

3. ローカル D1 に投入

```bash
npx wrangler d1 execute medace-db --local --file=./tmp/d1-seed.sql
```

4. Functions を含めて確認

```bash
npm run build
npx wrangler pages dev dist
```

静的レンダリングだけを確認したい場合だけ、別ターミナルで `npm run preview` を使ってください。API は返らないので、セッション復元や `/api/storage` の確認には向きません。

## Cloudflare 本番

作成済みリソース:

- Pages Project: `medace-english-app`
- Production URL: [https://medace-english-app.pages.dev](https://medace-english-app.pages.dev)
- D1 Database: `medace-db`
- D1 Database ID: `1b1c8b71-764c-4593-8a20-32a75b77ab11`

### 本番マイグレーション

```bash
npx wrangler d1 migrations apply medace-db --remote
```

### 本番 seed

remote D1 では `BEGIN TRANSACTION` を含む SQL を使えないため、`--remote` を付けます。

```bash
node scripts/build-seed-sql.mjs --remote \
  --original-access-scope ALL_PLANS \
  --original-csv /path/to/original_wordbank/ORIGINAL_WORDBANK_JHS_HS_FINAL_CONFIRMED.csv \
  --licensed-csv /path/to/licensed_catalog/MASTER_DATABASE_REFINED.csv \
  ./tmp/d1-seed-remote.sql

npx wrangler d1 execute medace-db --remote --file=./tmp/d1-seed-remote.sql
```

### Pages Secrets

最低限、管理者デモ用パスワード、Writing AI mode、内部ジョブ用 secret を設定してください。AI文法問題生成は Cloudflare Workers AI binding を優先し、品質補完用に Gemini key へフォールバックできます。

```bash
npx wrangler pages secret put ADMIN_DEMO_PASSWORD --project-name medace-english-app
echo 'hybrid' | npx wrangler pages secret put WRITING_AI_MODE --project-name medace-english-app
echo 'your-internal-job-secret' | npx wrangler pages secret put INTERNAL_JOB_SECRET --project-name medace-english-app
echo 'AUTO' | npx wrangler pages secret put AI_GRAMMAR_PROVIDER --project-name medace-english-app
echo '@cf/meta/llama-3.1-8b-instruct' | npx wrangler pages secret put CLOUDFLARE_AI_GRAMMAR_MODEL --project-name medace-english-app
echo 'your-gemini-api-key' | npx wrangler pages secret put GEMINI_API_KEY --project-name medace-english-app
```

Workers AI binding は runtime secret ではなく `AI` binding として設定します。`wrangler.jsonc` には `ai.binding = "AI"` を置いていますが、Pages Functions では Cloudflare Dashboard 側でも production / preview の binding を確認してください。AI Gateway を使う場合だけ `CLOUDFLARE_AI_GATEWAY_ID` を追加します。Cloudflare Workers AI の無料 allocation を前提に `AUTO` を既定にしていますが、無料枠超過時は Cloudflare 側の制限または課金に従います。

自由英作文の外部 AI を本番接続する場合は、必要な provider だけ追加してください。

```bash
echo 'your-openai-api-key' | npx wrangler pages secret put OPENAI_API_KEY --project-name medace-english-app
```

preview 環境も使う場合は、`ADMIN_DEMO_PASSWORD` を preview 専用値に分ける前提で `--env preview` 付きで追加してください。

```bash
npx wrangler pages secret put ADMIN_DEMO_PASSWORD --project-name medace-english-app --env preview
echo 'hybrid' | npx wrangler pages secret put WRITING_AI_MODE --project-name medace-english-app --env preview
echo 'your-internal-job-secret' | npx wrangler pages secret put INTERNAL_JOB_SECRET --project-name medace-english-app --env preview
echo 'AUTO' | npx wrangler pages secret put AI_GRAMMAR_PROVIDER --project-name medace-english-app --env preview
echo '@cf/meta/llama-3.1-8b-instruct' | npx wrangler pages secret put CLOUDFLARE_AI_GRAMMAR_MODEL --project-name medace-english-app --env preview
echo 'your-gemini-api-key' | npx wrangler pages secret put GEMINI_API_KEY --project-name medace-english-app --env preview
echo 'your-openai-api-key' | npx wrangler pages secret put OPENAI_API_KEY --project-name medace-english-app --env preview
```

### R2 Buckets

自由英作文の答案原本は R2 を使います。Cloudflare アカウントで R2 を有効化したうえで、次のバケットを用意してください。

- production: `medace-writing-assets`
- preview: `medace-writing-assets-preview`

D1 は production の `medace-db` に加えて preview 専用の `medace-db-preview` を使います。Pages の preview deployment では `wrangler.jsonc` の `env.preview.d1_databases` と `env.preview.r2_buckets` を使うので、GitHub `preview` environment の `CLOUDFLARE_D1_DATABASE` も `medace-db-preview` に揃えてください。

CLI で同期する場合は `npm run cf:sync` を使います。R2 がまだ未有効化のアカウントでは Cloudflare API が `code: 10042` を返すため、その場合は先に Dashboard で R2 を有効化してください。

### GitHub Variables / Secrets

GitHub Actions 側では次を使います。

- Secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `INTERNAL_JOB_SECRET`
- Variables:
  - `CLOUDFLARE_PAGES_PROJECT`
  - `CLOUDFLARE_D1_DATABASE`
  - `WRITING_AI_MODE`

Variables 未設定時の Pages project は `medace-english-app`、Writing AI mode は `hybrid` です。D1 の既定値は production が `medace-db`、preview が `medace-db-preview` で、[production workflow](../.github/workflows/deploy-pages.yml) と [preview workflow](../.github/workflows/deploy-pages-preview.yml) で分けています。

`INTERNAL_JOB_SECRET` は GitHub scheduled workflow が内部 endpoint を呼ぶための repository secret であり、同じ値を Pages production / preview secret にも設定してください。`npm run cf:doctor` は GitHub 側の scheduled secret と Pages runtime secret の両方を検査します。

deploy workflow は GitHub の `production` / `preview` environment を参照します。repo-level secret / variable は CI と local doctor の fallback に残しつつ、実運用の deploy では environment-scoped config を優先してください。

ローカルから接続状態を確認する場合は `npm run cf:doctor` を使ってください。`GEMINI_API_KEY` は未設定でも warning 扱いで、GitHub / Cloudflare の接続と Pages / D1 の疎通を先に確認できます。学習プラン生成は標準ロジックで継続できますが、Geminiに依存する教材抽出、和訳のAI評価、講師フォロー文のAI生成などは利用できません。文法問題生成は provider設定と Workers AI binding により Geminiなしでも継続できるため、必要な機能ごとに接続を確認してください。

GitHub Actions を正史の配信経路にする前提では、Cloudflare の Git 直接連携や `*-git` の mirror Pages project を併用しないでください。preview / production が二重作成され、PR コメントや確認URLが分岐します。
`cf:doctor` はこの状態を release-blocking error として検出します。既に Git 連携が残っている場合は `npm run cf:sync` で Cloudflare native Git auto-deploy を無効化し、不要な mirror project は Cloudflare Dashboard 側で削除してください。
Cloudflare Dashboard で `Deployments paused` / `デプロイを一時停止` と表示される場合は、GitHub Actions 以外の native Git auto-deploy だけが停止していることを確認してください。このプロジェクトではその表示が期待状態です。`Resume deployments` を押すと migration / release gate より前に Cloudflare が直接 deploy する可能性があるため、`npm run cf:doctor` が `error=0` で live `/api/session` の `x-deployment-sha` が最新なら解除しないでください。

設定の反映を自動化したい場合は `npm run cf:sync` を使ってから `npm run cf:doctor` で検証してください。

### One-off scripts

`scripts/` に置く tracked script は、product operations、QA、release、または再利用可能な content workflow に限ります。個別調査用の one-off script は、入力・出力・失敗時の扱い・owner が文書化され、repeatable workflow として昇格するまで `package.json` に接続しません。

### Frontend Environment Variables

フリープランの広告枠を実配信するには、Vite の公開環境変数に AdSense 情報を設定します。

```bash
VITE_ADSENSE_CLIENT_ID=ca-pub-xxxxxxxxxxxxxxxx
VITE_ADSENSE_SLOT_DEFAULT=1234567890
VITE_ADSENSE_SLOT_DASHBOARD_INLINE=1234567890
VITE_ADSENSE_SLOT_DASHBOARD_SECONDARY=1234567890
```

### デプロイ

```bash
npm run release:gate:local
```

この local gate は remote D1 migration と Pages deploy を実行しません。Cloudflare への正式 deploy は GitHub Actions を正規経路とし、次の流れで確認してから Cloudflare へ流します。

- `ci.yml`: 必須 `verify` で PR sentinel を実行。`browser-smoke.yml` は手動実行専用
- `deploy-pages-preview.yml`: preview deploy 前に `npm run release:gate:local` 相当の `security:audit` / `verify:fast` / build / `test:api` / `node scripts/run-smoke-tests.mjs --suite full` / `cf:doctor` / deploy artifact build を実行し、`cf:doctor` の `Summary` が `error=0` の場合だけ preview D1 remote migration / content QA gate / source ledger gate / B2B activation integrity gate / Pages deploy / deployed preview smoke へ進む
- `deploy-pages.yml`: production deploy 前に `npm run release:gate:local` 相当の `security:audit` / `verify:fast` / build / `test:api` / `node scripts/run-smoke-tests.mjs --suite full` / `cf:doctor` / deploy artifact build を実行し、`cf:doctor` の `Summary` が `error=0` の場合だけ D1 recovery bookmark 採取 / remote D1 migration / content QA gate / source ledger gate / B2B activation integrity gate / Pages deploy / deployed production smoke へ進む
- `analytics-snapshots.yml`: 毎日 03:40 JST に本番 `/api/internal/analytics-snapshots/run` を叩き、プロダクト KPI の日次 snapshot を保存
- `word-hint-audit.yml`: 2026-10-04の有料生成廃止の独立候補で有料定期再監査を廃止。scheduleなし、手動実行も説明だけ。公開版e97には未反映。承認・事前準備の境界は[候補の記録](./analysis/2026-10-04-paid-generation-only.md)。

運用 runbook は [`./docs/deployment-ops-runbook.md`](./deployment-ops-runbook.md) を参照してください。

migration prefix では `0019` だけが順序固定済みの既知例外です。`0019_commercial_request_teaching_format.sql` と `0019_weekly_missions.sql` 以外の重複は `npm run verify:fast` で失敗します。

## 補足

- 初回診断は静的12問で運用し、AI診断を主導線には置かない
- 講師通知は `instructor_notifications` に保存され、生徒ダッシュボードへ表示
- 学習条件は `learning_preferences`、担当割当は `student_instructor_assignments`、割当履歴は `student_instructor_assignment_events` で管理
- 公式教材の公開範囲は `catalog_source` / `access_scope` で制御
