# Steady Study

Steady Study は、塾・教室向け運用SaaSを主軸にした英単語学習プラットフォームです。個人学習アプリはサブ導線として残しつつ、講師フォロー、担当割当、教材権限、個別学習プランまでを Cloudflare 上で一体運用します。

## 事業前提

- メイン顧客: 塾・教室・小規模スクール
- サブ顧客: 個人学習ユーザー
- 初回診断: AI生成ではなく、静的な12問バンクで開始レベルを判定
- AIの役割: 例文生成、クイズ生成、学習プラン生成、講師フォロー文面の下書き
- 権限設計: グループ管理者は組織全体、講師は担当生徒と未割当生徒を中心に運用

## 料金モデル

- `TOC_FREE`: 個人フリー。広告付きセルフサーブ
- `TOC_PAID`: 個人有料。広告なし個人拡張
- `TOB_FREE`: 教室導入前の無料トライアル
- `TOB_PAID`: 教室規模に応じた個別見積。導入費と管理・アップデート費は現時点では未定

商用プラン定義は [config/subscription.ts](/Users/Yodai/projects/MedAce英単語アプリ/config/subscription.ts) にあります。

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
npm run build
```

## Cloudflare ローカル確認

1. D1 マイグレーションを適用

```bash
npx wrangler d1 migrations apply medace-db --local
```

2. 原本教材 + ライセンス教材を seed SQL 化

```bash
node scripts/build-seed-sql.mjs \
  --original-access-scope ALL_PLANS \
  --original-csv /path/to/original_wordbank/ORIGINAL_WORDBANK_JHS_HS_FINAL_CONFIRMED.csv \
  --licensed-csv /Users/Yodai/projects/language_database_2_2/output_curated/20260208_225334/MASTER_DATABASE_REFINED.csv \
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
  --licensed-csv /Users/Yodai/projects/language_database_2_2/output_curated/20260208_225334/MASTER_DATABASE_REFINED.csv \
  ./tmp/d1-seed-remote.sql

npx wrangler d1 execute medace-db --remote --file=./tmp/d1-seed-remote.sql
```

### Pages Secrets

最低限、管理者デモ用パスワードは設定してください。AI機能を使うなら Gemini key も必要です。

```bash
echo 'your-admin-password' | npx wrangler pages secret put ADMIN_DEMO_PASSWORD --project-name medace-english-app
echo 'your-gemini-api-key' | npx wrangler pages secret put GEMINI_API_KEY --project-name medace-english-app
```

preview 環境も使う場合は、同じ secret を `--env preview` 付きで追加してください。

```bash
echo 'your-admin-password' | npx wrangler pages secret put ADMIN_DEMO_PASSWORD --project-name medace-english-app --env preview
echo 'your-gemini-api-key' | npx wrangler pages secret put GEMINI_API_KEY --project-name medace-english-app --env preview
```

### GitHub Variables / Secrets

GitHub Actions 側では次を使います。

- Secrets:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
- Variables:
  - `CLOUDFLARE_PAGES_PROJECT`
  - `CLOUDFLARE_D1_DATABASE`

Variables 未設定時は workflow 側で `medace-english-app` / `medace-db` を既定値として使います。

ローカルから接続状態を確認する場合は `npm run cf:doctor` を使ってください。`GEMINI_API_KEY` は未設定でも warning 扱いで、GitHub / Cloudflare の接続と Pages / D1 の疎通を先に確認できます。なお、学習プラン生成は key 未設定時でも標準ロジックで継続でき、AI教材化だけが停止します。

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
npm run build
npx wrangler pages deploy dist --project-name medace-english-app
```

## 補足

- 初回診断は静的12問で運用し、AI診断を主導線には置かない
- 講師通知は `instructor_notifications` に保存され、生徒ダッシュボードへ表示
- 学習条件は `learning_preferences`、担当割当は `student_instructor_assignments` で管理
- 公式教材の公開範囲は `catalog_source` / `access_scope` で制御
