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
- `TOB_PAID`: 固定費1万円/月 + 生徒1人あたり2,000円/月 + 講師1人あたり500円/月 + 導入費60万円

商用プラン定義は [config/subscription.ts](/Users/Yodai/projects/MedAce英単語アプリ/config/subscription.ts) にあります。

## 教材カタログ戦略

- ビジネス版公式教材（原本）: Nanjyo English App のオリジナル単語データベースを `Steady Study Original` として配布
- ビジネス版公式教材（ライセンス）: 現在のライセンス取得済み教材データベースを `LICENSED_PARTNER` として配布
- 個人/ユーザー作成教材: `USER_GENERATED`
- 公開範囲:
  - `ALL_PLANS`: 全プランで利用可
  - `BUSINESS_ONLY`: ビジネス本導入 (`TOB_PAID`) のみ利用可

2026-03-06 時点の方針として、既存の公式教材は `Steady Study Original` を含めて `BUSINESS_ONLY` に寄せます。個人/無料ユーザーは公式教材ではなく、自作教材導線を前提にします。

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

2. 原本教材 + ライセンス教材をまとめてビジネス限定 seed SQL 化

```bash
node scripts/build-seed-sql.mjs \
  --original-csv /Users/Yodai/projects/NanjyoEnglishApp/docs/wordbank_pos_audit/20260208_225334/ORIGINAL_WORDBANK_JHS_HS_FINAL_CONFIRMED.csv \
  --licensed-csv /Users/Yodai/projects/language_database_2_2/output_curated/20260208_225334/MASTER_DATABASE_REFINED.csv \
  ./tmp/d1-seed.sql
```

このスクリプトは入力CSVの形式を自動判定します。`--original-csv` は Nanjyo English App の原本CSVを学年帯別教材へ再編し、`--licensed-csv` は既存の単語帳CSVをそのまま教材化します。`TOEFLテスト英単語3800` はデフォルトで除外され、追加除外は `--exclude-book "書名"` で指定できます。

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
  --original-csv /Users/Yodai/projects/NanjyoEnglishApp/docs/wordbank_pos_audit/20260208_225334/ORIGINAL_WORDBANK_JHS_HS_FINAL_CONFIRMED.csv \
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
