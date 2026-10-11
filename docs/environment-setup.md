# 環境構築・設定リファレンス

更新日: 2026-10-11。設定の索引であり、現在の本番稼働を保証する文書ではありません。
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

通常の配備設定は、管理者デモ用パスワード、CI/doctorが参照する互換用のWriting AI mode、内部ジョブ用 secret です。以下は運用手順の例であり、この文書更新で設定を変更したものではありません。

```bash
npx wrangler pages secret put ADMIN_DEMO_PASSWORD --project-name medace-english-app
echo 'hybrid' | npx wrangler pages secret put WRITING_AI_MODE --project-name medace-english-app
echo 'your-internal-job-secret' | npx wrangler pages secret put INTERNAL_JOB_SECRET --project-name medace-english-app
```

`hybrid` は互換設定であり、旧live AIや正式採点を有効化しません。旧providerのkey/model設定を標準セットアップへ追加する必要はありません。AIの境界は下記を確認してください。

preview 環境も使う場合は、`ADMIN_DEMO_PASSWORD` を preview 専用値に分ける前提で `--env preview` 付きで追加してください。

```bash
npx wrangler pages secret put ADMIN_DEMO_PASSWORD --project-name medace-english-app --env preview
echo 'hybrid' | npx wrangler pages secret put WRITING_AI_MODE --project-name medace-english-app --env preview
echo 'your-internal-job-secret' | npx wrangler pages secret put INTERNAL_JOB_SECRET --project-name medace-english-app --env preview
```

### AIの稼働境界

旧Gemini / Workers AIのlive生成は [固定停止ポリシー](../functions/_shared/ai-execution-policy.ts) で拒否します。key、`AI_GRAMMAR_PROVIDER`、model、Gateway、`AI` bindingだけでは再開しません。`wrangler.jsonc` の既存 `AI` bindingは互換設定であり、稼働承認や無料運用の証明ではありません。旧model名を現在利用できるmodelとして推奨しません。

通常の学習はAIなしの標準プラン、静的12問の診断、保存済み例文を使います。文法は [レビュー済みの保存問題](../functions/_shared/ai-actions.ts) を取得し、不足分をクライアントの静的問題で補います。教材は手入力または校正済みCSVから準備し、承認・出典・公開範囲の確認を維持します。旧管理者向け有料例文準備も終了しており、現在は校正済み例文を承認待ちデータとして取り込みます。

作文GPTは別経路です。[capabilities](../functions/_shared/writing-ai-capabilities.ts) と [課題別操作](../functions/_shared/writing-actions/ai-drafts.ts) が、次の条件を確認します。

- `OPENAI_API_KEY`、`OPENAI_WRITING_ENABLED=true`、`OPENAI_WRITING_DATA_POLICY=operator-approved-v1` が揃うこと。
- 講師が現在の担当・課題へアクセスでき、対象課題と操作（`OCR` / `WRITING_FEEDBACK`）ごとの有効なD1承認があること。外部送信対象の同意・運用確認をkey設定で代用しないこと。
- 入力上限と費用見積を満たし、D1の全体予算へ予約できること。月$5はアプリ内の計画枠で、$0.50の安全余裕を除いた$4.50がdispatch枠です。providerの請求額を保証するものではありません。

生成物は未評価の下書きです。正式成績やPDF OCRを有効にする経路ではありません。実行・外部送信・設定変更は [作文GPTの記録](./analysis/2026-10-06-writing-gpt-budget-release.md) の承認境界に従い、runtimeの設定・対象操作・予算を別に確認してください。この文書は現在のruntimeで条件が成立していると断定しません。

公開仕様を根拠にした自由会話Botは準備中で、実生成はOFFです。固定FAQや対話UI・根拠検索の準備を、自然文AI回答の完成とは扱いません。作文GPTの同意・key・月$5枠をBotへ流用せず、provider、送信データ、同意、費用上限をBot専用に確認します。既存Workers AI bindingだけで無料枠や契約・使用量の確認を済ませたことにはなりません。

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

Variables 未設定時の Pages project は `medace-english-app`、Writing AI mode は互換値の `hybrid` です。旧live AIの固定停止や作文GPTの個別条件はこの値で解除しません。D1 の既定値は production が `medace-db`、preview が `medace-db-preview` で、[production workflow](../.github/workflows/deploy-pages.yml) と [preview workflow](../.github/workflows/deploy-pages-preview.yml) で分けています。

`INTERNAL_JOB_SECRET` は GitHub scheduled workflow が内部 endpoint を呼ぶための repository secret であり、同じ値を Pages production / preview secret にも設定してください。`npm run cf:doctor` は GitHub 側の scheduled secret と Pages runtime secret の両方を検査します。

deploy workflow は GitHub の `production` / `preview` environment を参照します。repo-level secret / variable は CI と local doctor の fallback に残しつつ、実運用の deploy では environment-scoped config を優先してください。

ローカルから接続状態を確認する場合は `npm run cf:doctor` を使ってください。`GEMINI_API_KEY` は未設定でも warning 扱いで、GitHub / Cloudflare の接続と Pages / D1 の疎通を先に確認できます。標準学習プランと講師通知はAIなしで運用し、文法は保存済みのレビュー済み問題と静的問題を使います。旧live教材抽出・和訳AI評価・講師文面AI生成はkeyやbindingを追加しても再開しません。

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
- `word-hint-audit.yml`: PR55/main `915f4f7`へ統合済みの退役workflow。scheduleなし、手動実行も説明だけで、有料定期再監査は行いません。[当時の分離候補](./analysis/2026-10-04-paid-generation-only.md)は履歴として保持し、後続のAI固定停止は上記の稼働境界を参照してください。

運用 runbook は [`./docs/deployment-ops-runbook.md`](./deployment-ops-runbook.md) を参照してください。

migration prefix では `0019` だけが順序固定済みの既知例外です。`0019_commercial_request_teaching_format.sql` と `0019_weekly_missions.sql` 以外の重複は `npm run verify:fast` で失敗します。

## 補足

- 初回診断は静的12問で運用し、AI診断を主導線には置かない
- 講師通知は `instructor_notifications` に保存され、生徒ダッシュボードへ表示
- 学習条件は `learning_preferences`、担当割当は `student_instructor_assignments`、割当履歴は `student_instructor_assignment_events` で管理
- 公式教材の公開範囲は `catalog_source` / `access_scope` で制御
