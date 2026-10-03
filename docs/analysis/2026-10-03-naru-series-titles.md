# 4原本教材のシリーズ名「Naruシスト」

ユーザー指定の表記を、最新UI版 `37493af533d005668735633d25f0502c69e79ff1` から独立したブランチ `codex/medace-naru-series-20261003` に反映した。対象は最近受け取った4原本Excel教材のみ。既存レベル1〜6教材の系統とは区別する。

| 表示名 | 原本ファイル | 既存教材ID（変更なし） | 学習可能語数 |
| --- | --- | --- | ---: |
| Naruシスト 動詞 | verb_list.xlsx | workbook-verb-5bc0fa2cd6798cad | 353 |
| Naruシスト 名詞 | noun_list_修正版_監査付き_20260411.xlsx | workbook-noun-48fba95c875e3330 | 932 |
| Naruシスト 副詞 | adverb_list.xlsx | workbook-adverb-78d0c45fcee4cbad | 86 |
| Naruシスト 形容詞 | adjective_list.xlsx | workbook-adjective-e17b364a7206f4e6 | 159 |

## 変更と既存データの扱い

`scripts/_shared/original-workbook-import.mjs` の4教材定義を変更した。原本監査JSON・取り込み行・新規取り込みSQLの表示名は新名称になる。教材IDは従来どおり品詞キーと原本SHAから作る。単語ID・source ID・entry IDをタイトルから再作成しない。

既存の追加専用取り込みSQLは引き続き `ON CONFLICT DO NOTHING` とし、既存レコードを上書きしない。既存教材を改名する場合は、原本監査コマンドが別出力する `original-workbooks.titles.sql` を用いる。このSQLは教材IDだけでなく、原本SHA全文・ファイル名・品詞キー・出典台帳・従来の表示名が一致する対象に限定し、`books.title` と `material_source_ledger.book_title` のみを変更する。独自に改名された教材や出典が一致しない教材は変更しない。承認状態・アクセス範囲・更新時刻を含む他の項目は変更しない。

既存の `catalog_source_entries` のpayloadとcontent hashは、取り込み時点のアーカイブとして旧名称を含めて保持する。新規取り込みのpayloadは新名称を含むため、そのpayloadのcontent hashは旧取り込みと異なる。原本ファイルのSHA・意味・例文・原本座標・source/wordの識別子は同じ。名称変更のために既存アーカイブを再書き込みしない。

動画撮影スクリプトは、出典種別と品詞別の教材ID・新名称を組み合わせて4冊を検証する。語数1530のチェックとローカル限定・合成データ限定の制約を維持した。過去の監査文書に記録された当時の名称は履歴として残した。

## 検証

- 4原本の読み取り前後のSHA一致。学習可能1530語（候補1531語、語義未提供1語はアーカイブのみ）を維持。
- 新規SQLの専用validator成功。二重取り込み、原本セル座標・source link、既存学習履歴保持、旧クライアントprojection、外部キーを検証。
- 追加6 unitで、4冊の旧名からの更新・同じ教材ID・原本アーカイブと学習履歴の保持・レベル1〜6保持・pending承認の保持・繰り返し実行・出典不一致と個別改名の除外を確認。
- `verify:fast` 成功（migration replay、到達性、依存境界/循環、型、unit）。最終型・unit 871件・標準build・ローカルAPI統合回帰成功。
- 実Chromeで、旧名の原本教材に回答を保存し、タイトルSQL適用の前後でアプリの59テーブルを比較。2項目の教材名以外の全フィールドが一致し、外部キーも正常。生徒の同じセッションで再訪し、教材IDと保存済み進捗が一致。
- 生徒の教材検索・4冊それぞれの学習と小テスト、講師の教材一覧を320×740、390×844、844×390、768×1024、1366×900で確認。講師プリントの4冊の選択肢と選択済み教材名も確認。計51実画面、ページ例外0、横幅超過0。これは名称表示と幅の確認であり、全ての視覚的な重なりを検出する検証ではない。
- 既存Chrome回帰28件成功（認証7、学習保存8、UI監査13）。

検証は専用port `41858`、D1 `/tmp/medace-naru-series-d1` で実施。元repo・他担当のプレビュー・実生徒データ・本番DBには変更を加えていない。配備・push・mergeは実施していない。教材の本番承認と小テストジェネレーターとの照合は従来どおり未実施。

## 再現と動画への引き継ぎ

```sh
node scripts/audit-original-workbooks.mjs --input-dir /Users/Yodai/Downloads --output-dir output/naru-series/import --local-preview
VITE_STORAGE_MODE=cloudflare npm run meeting:preview -- --port 41858 --dist output/naru-series/preview/dist --state /tmp/medace-naru-series-d1 --import output/naru-series/import/original-workbooks.local-preview.sql
```

同じ原本を旧名称で取り込み済みの**専用ローカルD1**を再利用する場合、新規SQLだけでは旧名が残る。その場合は、同じ原本から生成した別のタイトルSQLを対象の専用stateに適用する。本番DBへ適用する手順ではない。

```sh
WRANGLER_SEND_METRICS=false WRANGLER_LOG_PATH=/tmp/medace-naru-series-d1/rename-wrangler.log node node_modules/wrangler/bin/wrangler.js d1 execute medace-db --local --persist-to /tmp/medace-naru-series-d1 --file output/naru-series/import/original-workbooks.titles.sql
```

差分・ログ・画像・SHAは内部ディスクの引き継ぎフォルダーへ保全する。撮影時は新しい専用originとモジュールを確認する。このD1には、過去の41828撮影用に作った講師担当生徒の専用fixtureは移していない。必要な場合は撮影担当の合成fixture手順で用意する。原本や実生徒データのコピーで代用しない。
