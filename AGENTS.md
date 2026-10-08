# Steady Study の作業規約

このプロジェクトは React / TypeScript / Cloudflare の英語学習アプリです。上位ディレクトリの一般的なPython向け手順より、ここにある実際のコマンドを優先してください。ユーザーとのやり取りは日本語で行います。

## 作業の進め方

- 最初に `git status --short` と現行の `project.md` / `todo.md` / `docs/README.md` を確認する。既存の未コミット変更を今回の成果と混同しない。
- 大きな変更は、調査・実装・検証・レビューを独立したサブタスクへ分け、利用可能なサブエージェントを並行活用する。共有契約を変更する前にファイル所有範囲を調整する。
- 計画だけで終えず、承認された範囲の実装・検証・文書更新まで進める。新しい機能を増やす前に、現在の価値フローと保存の信頼性を確認する。
- UIは実データに対応する状態を表示する。未取得を0に変換せず、空・読込失敗・更新失敗・保存済みを区別する。表示名はSteady Study。強いオレンジのグラデーションは使わない。

## 依存とコード

- Node 22.13以上23未満、`npm ci`。ロックファイルを更新したら監査と全回帰を実行する。
- `components/`・`hooks/` は用途別の `services/` を使う。クライアントから `functions/` へ依存しない。共有の純粋ロジックは `shared/`、APIの型は `contracts/`。
- 認可と入力検証の最終境界はサーバー。クライアントの表示制御で代用しない。
- 回答の再送は同じattempt IDと内容を維持する。request成功とtransaction完了、回答保存と報酬確認を区別する。
- migrationは追加で行い、既存の履歴や過去migrationを書き換えない。

## 検証

- 速い基準: `npm run verify:fast`（migration replay、到達性、依存境界/循環、型、unit）。
- 統合: `npm run build` → `npm run test:api` → `npm run test:smoke`、`npm run security:audit`。
- 画面変更はPC・モバイルの実renderと対象操作を確認する。ブラウザ回帰ファイルを追加したら `scripts/run-smoke-tests.mjs` のsuiteにも登録する。
- API/browserの標準runnerはローカル検証用。buildや同一出力先のsmokeを複数担当で同時実行しない。
- 実装中は検証済みcommitからの差分と依存範囲に応じて高速検証する。機能の区切り・公開する最終候補は全体確認を行い、同一ソースの成功済みbuild・全テストを不必要に重複させない。経過時間だけで検証を有効と判断せず、必須CI・配備gateは維持する。
- 失敗は原因を調べる。契約テストは文書の分冊や妥当なUI変更に合わせるが、必須check・認可・保存の保証を弱めて通さない。

## 整理・配備・証拠

- 2026-10-08に本人が本番反映と以前の公開禁止の解除を指示済み。以降の通常の公開依頼へ旧禁止を再適用しない。新たな明示制約と必須のPR/CI/配備gateは引き続き守る。

- 不要ソースは `quality:unused` と実際の参照から判断する。古い日付だけで削除しない。
- 生成物清掃は `clean:artifacts` の一覧を確認し `clean:artifacts:apply`。`.wrangler`、教材、`tmp`、`output`、ブラウザ記録、symlinkをまとめて削除しない。
- 本番の正本はCloudflare。IDBの検証を本番や教室運用の証拠としない。
- ローカル変更・ローカル検証・preview配備・production配備・利用者到達を別の状態として記録する。今回許可された操作範囲を引き継ぎ、不必要に確認を繰り返さない。
- 正式な配備手順は `docs/deployment-ops-runbook.md`。外部メッセージ送信は明示的な許可がある場合だけ行う。
- 現行方針は `project.md`、未完了作業は `todo.md`、実装証拠は日付付き `docs/analysis/`、運用はrunbookへ置き、重複した「Current」を増やさない。
