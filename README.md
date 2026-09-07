# Steady Study

塾・教室での英語学習を、教材配布から毎日の復習、講師のフォローまでつなぐアプリです。生徒は「今日やること」を選んですぐに始められ、講師は担当生徒の学習と提出を確認できます。個人学習にも対応します。リポジトリ名は MedAce、画面上の名称は Steady Study です。

## まず読む

- [プロダクトの方針・対象・指標](./project.md)
- [現在の実装計画と残課題](./todo.md)
- [2026-09-07 現状監査・再構築計画](./docs/analysis/rebuild-plan-2026-09-07.md)
- [構成とデータ契約](./docs/architecture.md)
- [全ドキュメントの索引](./docs/README.md)

## ローカルで動かす

Node **22.13以上、23未満** を使います。バージョンは `.node-version` / `.nvmrc`、依存は `package-lock.json` で固定します。
保存の原子性テストで使う組み込みSQLiteは、[Node 22.13からフラグなしで利用できます](https://nodejs.org/en/blog/release/v22.13.0)。

```bash
npm ci
npm run db:migrate:local
npm run cf:preview
```

`cf:preview` はビルド後に Pages Functions とローカルD1を起動します。`npm run dev` はフロントエンド開発用、`npm run preview` は静的アセット確認用です。APIを含む確認には `cf:preview` を使います。ローカル変数は `.dev.vars.example` を参考に `.dev.vars` へ設定します。

教材CSVの投入、AI/R2、各環境の設定は [環境構築](./docs/environment-setup.md) にまとめています。教材や学習DBを削除して初期化する操作は通常の起動手順に含めません。

## 変更を検証する

```bash
npm run verify:fast
npm run security:audit
npm run build
npm run test:api
npm run test:smoke
```

- `verify:fast`: マイグレーション名・一時D1への適用、未使用ソース、依存境界・循環、型、単体テスト。
- `test:api`: 独立したローカルD1で権限・保存・APIの整合性を確認。
- `test:smoke`: CloudflareモードとIDBモードの実ブラウザ検証。必要なブラウザは `node node_modules/playwright/cli.js install chromium` で用意。
- `release:gate:local-only`: 上記のローカル検証をまとめて実行。依存脆弱性照会にはnpmレジストリへ通信する。
- `release:gate:remote-readonly`: GitHub/Cloudflare/remote D1の読み取り検査。
- `release:gate` / `release:gate:local`: ローカル検証とremote-readonly検査を実行する配備前gate。remote migrationや配備は実行しない。各コマンドの `:dry` で実行順を確認できる。

本番配備の条件は、`cf:doctor` の `Summary` が `error=0` で、教材・権利台帳・B2B整合性gateに `release-blocking error` がないことです。Cloudflare native Git auto-deploy は無効のままにし、`Deployments paused` を見ただけで `Resume deployments` を操作しません。正式な配備とrollbackは [運用手順](./docs/deployment-ops-runbook.md) に従います。

## 構成

| 場所 | 責務 |
| --- | --- |
| `components/`, `hooks/` | 画面、操作、取得・保存状態 |
| `services/` | 認証・学習・教室等のクライアント窓口 |
| `shared/`, `contracts/` | 純粋な判定、クライアント/サーバー間の契約 |
| `functions/` | 認可、D1/R2、AIのサーバー処理 |
| `migrations/` | 追加型のDB変更。過去ファイルは変更しない |
| `scripts/`, `tests/` | 運用・品質gate・回帰検証 |

React 19 / Vite / Tailwind、Cloudflare Pages Functions / D1 / R2を使います。Cloudflareが教室運用の正本です。IndexedDBは個人デモ・ローカル学習向けで、完全なオフライン同期を提供するものではありません。

## 不要ファイルの整理

`npm run quality:unused` は本番エントリからのソース到達性、`npm run quality:architecture` は依存方向と循環を確認します。ファイル名や更新日の古さだけで削除しません。

```bash
npm run clean:artifacts
npm run clean:artifacts:apply
```

最初は削除予定の表示だけです。applyは種類まで一致した `dist/`、`_worker.bundle`、`test-results/`、`test-results-rerun/` と小さな再生成キャッシュを削除します。`node_modules`、`.wrangler`、`tmp`、`output`、`.playwright*`、symlinkは保護します。証拠・成果物を残す場合は先に作業外へ保全します。
