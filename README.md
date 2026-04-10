# Steady Study

Steady Study は、塾・教室向け運用SaaSを主軸にした英単語学習プラットフォームです。個人学習アプリはサブ導線として残しつつ、講師フォロー、担当割当、教材権限、個別学習プランまでを Cloudflare 上で一体運用します。

## 事業前提

- メイン顧客: 塾・教室・小規模スクール
- サブ顧客: 個人学習ユーザー
- 初回診断: AI生成ではなく、静的な12問バンクで開始レベルを判定
- AIの役割: 例文生成、クイズ生成、学習プラン生成、講師フォロー文面の下書き
- 権限設計: グループ管理者は組織全体、講師は同一 cohort または直接担当している生徒を運用

## 料金モデル

- `TOC_FREE`: 個人フリー。広告付きセルフサーブ
- `TOC_PAID`: 個人有料。広告なし個人拡張
- `TOB_FREE`: 教室導入前の無料トライアル
- `TOB_PAID`: 教室規模に応じた個別見積。導入費と管理・アップデート費は現時点では未定

商用プラン定義は [`./config/subscription.ts`](./config/subscription.ts) にあります。

## 教材カタログ戦略

- 公式スターター教材（原本）: オリジナル単語データベースを `Steady Study Original` として配布
- ビジネス版公式教材（ライセンス）: 現在のライセンス取得済み教材データベースを `LICENSED_PARTNER` として配布
- 個人/ユーザー作成教材: `USER_GENERATED`
- 公開範囲:
  - `ALL_PLANS`: 全プランで利用可
  - `BUSINESS_ONLY`: ビジネス本導入 (`TOB_PAID`) のみ利用可

2026-03-06 時点の実装方針として、ライセンス教材は `BUSINESS_ONLY` を維持しつつ、`Steady Study Original` は個人フリーを含むスターター導線として `ALL_PLANS` でも投入できるようにします。

## 技術構成

- Frontend: Vite / React 19
- Backend: Cloudflare Pages Functions
- Database: Cloudflare D1 (`medace-db`)
- Offline fallback: IndexedDB
- AI: Gemini API を Functions 経由で利用

秘密情報はクライアントに埋め込まず、認証・教材データ・学習履歴・AI呼び出しは `/api/*` 経由で処理します。Supabase 前提の構成は廃止済みです。

## 開発コマンド

```bash
npm install
npm run typecheck
npm run test:unit
npm run build
npm run test:api
npm run test:smoke
npm run cf:doctor
npm run cf:sync
npm run cf:preview
```

- 推奨ローカル実行: `npm run cf:preview`
  - `vite build` 後に `wrangler pages dev dist` を起動し、Pages Functions と D1 を含めて確認します。
- `npm run preview` は静的アセット確認専用です。
  - `/api/session` などの Functions は起動しないため、認証や教材 API の検証には使えません。
- `npm run test:smoke` は Playwright で `wrangler pages dev dist` を自前起動し、D1 migration 適用後の demo login / onboarding / 組織運用導線まで確認します。
- `npm run cf:doctor` は GitHub secrets / variables と Cloudflare Pages / D1 / Pages secrets の整合を確認します。
- `npm run cf:sync` は `wrangler.jsonc` を基準に GitHub variables、Cloudflare Pages secrets、R2 バケットを同期します。R2 がアカウントで未有効化の場合はここで停止します。

## Storage Mode Policy

- 既定の運用モードは Cloudflare です。`/api/storage`、`/api/writing`、D1、R2 を含む本番相当の挙動確認は `npm run cf:preview` または `npm run test:api` / `npm run test:smoke` を基準にしてください。
- `VITE_STORAGE_MODE=idb` は demo / offline 学習の最小導線向けです。個人学習の session、教材閲覧、学習履歴のローカル検証には使えますが、学校・教室向け workspace の正史ではありません。
- business dashboard、missions、commercial request、announcements、writing は Cloudflare 側を正史とし、新規 business 機能では IndexedDB の並行実装を追加しない方針です。
- frontend からは `services/storage.ts` の巨大 facade へ直接依存を増やさず、`services/session.ts`、`services/dashboard.ts`、`services/workspace.ts`、`services/writing.ts` の薄い adapter を優先してください。

## Cloudflare ローカル確認

`Steady Study` はブラウザ URL ルーティングではなく、アプリ内の view state で画面を切り替えます。そのため Pages 向けの SPA fallback rewrite は不要で、ローカル確認も `wrangler pages dev dist` を基準にします。

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

最低限、管理者デモ用パスワードは設定してください。AI機能を使うなら Gemini key も必要です。

```bash
echo 'your-admin-password' | npx wrangler pages secret put ADMIN_DEMO_PASSWORD --project-name medace-english-app
echo 'your-gemini-api-key' | npx wrangler pages secret put GEMINI_API_KEY --project-name medace-english-app
echo 'your-internal-job-secret' | npx wrangler pages secret put INTERNAL_JOB_SECRET --project-name medace-english-app
```

自由英作文の外部 AI を本番接続する場合は、必要な provider だけ追加してください。

```bash
echo 'your-openai-api-key' | npx wrangler pages secret put OPENAI_API_KEY --project-name medace-english-app
```

preview 環境も使う場合は、`ADMIN_DEMO_PASSWORD` を preview 専用値に分ける前提で `--env preview` 付きで追加してください。

```bash
echo 'your-admin-password' | npx wrangler pages secret put ADMIN_DEMO_PASSWORD --project-name medace-english-app --env preview
echo 'your-gemini-api-key' | npx wrangler pages secret put GEMINI_API_KEY --project-name medace-english-app --env preview
echo 'your-openai-api-key' | npx wrangler pages secret put OPENAI_API_KEY --project-name medace-english-app --env preview
echo 'your-internal-job-secret' | npx wrangler pages secret put INTERNAL_JOB_SECRET --project-name medace-english-app --env preview
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

Variables 未設定時は workflow 側で `medace-english-app` / `medace-db` を既定値として使います。

deploy workflow は GitHub の `production` / `preview` environment を参照します。repo-level secret / variable は CI と local doctor の fallback に残しつつ、実運用の deploy では environment-scoped config を優先してください。

ローカルから接続状態を確認する場合は `npm run cf:doctor` を使ってください。`GEMINI_API_KEY` は未設定でも warning 扱いで、GitHub / Cloudflare の接続と Pages / D1 の疎通を先に確認できます。なお、学習プラン生成は key 未設定時でも標準ロジックで継続でき、AI教材化だけが停止します。

GitHub Actions を正史の配信経路にする前提では、Cloudflare の Git 直接連携や `*-git` の mirror Pages project を併用しないでください。preview / production が二重作成され、PR コメントや確認URLが分岐します。

設定の反映を自動化したい場合は `npm run cf:sync` を使ってから `npm run cf:doctor` で検証してください。

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
npm run typecheck
npm run test:unit
npm run test:api
npm run cf:doctor
npm run build
npx wrangler pages deploy dist --project-name medace-english-app
```

GitHub Actions では次の流れで確認してから Cloudflare へ流します。

- `browser-smoke.yml`: PR 向け。Playwright smoke を実行
- `deploy-pages-preview.yml`: preview deploy 前に `typecheck` / `test:unit` / `test:api` / `test:smoke` / `cf:doctor`、その後に preview D1 remote migration / Pages deploy / deployed preview smoke
- `deploy-pages.yml`: production deploy 前に `typecheck` / `test:unit` / `test:api` / `test:smoke` / `cf:doctor`、その後に D1 recovery bookmark 採取 / remote D1 migration / Pages deploy / deployed production smoke
- `word-hint-audit.yml`: 毎日 03:30 JST に本番 `/api/internal/word-hint-audits/run` を叩き、保存済みの例文・画像ヒントを小さなバッチで再監査

運用 runbook は [`./docs/deployment-ops-runbook.md`](./docs/deployment-ops-runbook.md) を参照してください。

migration prefix では `0019` だけが順序固定済みの既知例外です。`0019_commercial_request_teaching_format.sql` と `0019_weekly_missions.sql` 以外の重複は `npm run verify:fast` で失敗します。

## 補足

- 初回診断は静的12問で運用し、AI診断を主導線には置かない
- 講師通知は `instructor_notifications` に保存され、生徒ダッシュボードへ表示
- 学習条件は `learning_preferences`、担当割当は `student_instructor_assignments`、割当履歴は `student_instructor_assignment_events` で管理
- 公式教材の公開範囲は `catalog_source` / `access_scope` で制御
