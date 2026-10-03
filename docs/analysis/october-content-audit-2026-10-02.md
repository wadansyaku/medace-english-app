# MedAse 原本4冊の監査とローカル取り込み

実施日: 2026-10-02。対象は本人が保有するオリジナル単語帳4冊。原本は変更せず、読み取り前後のSHA-256一致を検査した。既存学習者・講師の個人情報や履歴を開発用に使用していない。本番への書き込み・配備は未実施。

**本人確認により、既存「レベル1〜6」は再編成カタログで、今回のExcel4冊とは別教材である。** 両者の綴りや意味が同じでも、原本の反映済み・未反映を判定しない。比較参考データは `correspondenceScope: UNRELATED_CATALOG_RECOMPOSITION` として保存し、原本対応率の集計から除外する。

## 原本の構造と件数

| 原本 | 本文の列 | 本文候補 | 取り込み可 | 索引の語数（重複除外） | 索引のみ | 本文のみ |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| verb_list.xlsx | 文法分類A=語・構文、B=活用、C=意味、D=例文、E=例文再掲・文法注記 | 353 | 353 | 303 | 28 | 41 |
| noun_list_修正版_監査付き_20260411.xlsx | 各分類シートの5列ブロック=ID、語、意味、例文、注記。末尾は4列の場合もある | 932 | 932 | 975 | 75 | 22 |
| adverb_list.xlsx | 副詞一覧A=索引、F=語・分類、G=意味、H=例文 | 87 | 86 | 94 | 9 | 1 |
| adjective_list.xlsx | 形容詞A=語、B=意味、C=例文。形容詞一覧は別の分類索引 | 159 | 159 | 158 | 9 | 10 |
| 合計 | | 1,531 | **1,530** | | | |

件数は原本の掲載行・語義単位。綴りだけのユニーク語数ではない。動詞索引は「動詞一覧」と「メモ」の計549掲載箇所を保持する。索引のみ/本文のみは単純な正規化綴り比較による原本内部の差分で、教材全体の欠落数ではない。

- 副詞 `actually`: 副詞一覧F82に語と例文があるが、G82の意味が空。学習用wordsには入れず、原セル・候補・保留理由を出典アーカイブに残した。推測で意味を補っていない。
- 同じ綴りの複数掲載: 動詞36グループ、名詞9グループ。`grow`の状態変化と成長、`goal`の目標と得点等を別項目のまま保持した。
- 名詞の原IDは932件、重複0、範囲1〜935。ID10は「国際」、ID599は「娯楽」という分類見出し、ID224は修正ログで明示された除外。番号の連続性だけを欠落判定に使わない。
- 別名・語形: `bike(bicycle)`、`tooth/teeth`、`phone/cell phone/telephone/smartphone` 等を原表記で保持する。別名を単独見出しへ自動展開しない。
- 表記の要確認例: 索引の `confortable` / `unconfortable` と本文の `comfortable` / `uncomfortable`、名詞索引の `tourlist` と本文の `tourist`。動詞本文の `look up tp`、活用の `fitts-fitted-fitted` 等も原文のままで、講師の確認後に新しい版として訂正する。
- 原本4冊に発音専用列・例文和訳専用列は見当たらない。未提供として保持し、英語の例文再掲を和訳として格納しない。

## 名詞の修正監査

修正ログには69変更（修正20、追記48、除外1）があり、宣言された変更後のセル/除外範囲と実セルは **69件すべて一致**。修正コメント69セル、修正ログの非空行74行を保存した。監査表を語彙として読み込まない。セル値・コメント・取得可能な修正色・数式・シート名・座標・結合セルと、修正前/修正後/理由をアーカイブに残す。アーカイブは教材データの追跡用で、原XLSXの完全な代替ではない。

## 出典と既存教材の対応

4原本の正式な反映判定には、まず対応するbook/source namespaceの存在を確認する必要がある。`SOURCE_WORKBOOK_LINEAGE` モードは、正規の読み取りで確認した4品詞ごとのbook IDリストを必須入力とする。異なるnamespaceの語が同じでも、その既存word IDを対応先にしない。

確認済みnamespaceでは、語・意味・原本が提供する例文・出典シート/IDを別々に比べ、出典/内容の一意一致だけを自動対応候補にする。意味や例文が変わった行、同じ出典に複数IDがある行、品詞不明の行は理由と候補IDを残して保留する。原本にない例文和訳は一致条件に加えない。

本番の正規読み取りで、対応namespace候補をタイトルMedAse/MedAce/ナルシスト/Naru、source_contextの原本basename/中学生用名詞教材へ限定した結果、[候補metadata](../../output/content-audit/remote-workbook-namespace-books.json)は0件。現時点で原本に対応するnamespaceを確定できない。別名や別範囲まで含めた全語の未収録は断言せず、本番での原本反映・完全本文照合は未確認とする。

既存レベル1〜6の13,599行との参考的な語彙重なりは、綴り1,386行、綴りと意味の文字列486行。原本の英文例文まで同じ掲載行は0。これは別教材間の語彙重なりであり、4原本の反映率・欠落・品質判定を示さない。参考比較から `coverage` は出力せず、原本の差分CSVには掲載しない。

小テストジェネレーターの収録照合は別の必須項目。本人ログイン後の正規UIから48掲載のメタデータを確認し、[カタログ照合](./october-content-audit-generator-2026-10-02.md)に記録した。本文完全一致と4原本のタイトル対応は未確認。

## 実装

- `scripts/_shared/original-workbook-import.mjs`: 4形状の明示的な解析、全セル/修正ログ保持、出典単位の候補、namespaceを限定した比較、追加専用SQL生成。
- `scripts/audit-original-workbooks.mjs`: 原本読み取り、SHA-256検証、JSON監査・全セルアーカイブ・アプリ用rows・差分CSV・参考語彙CSV・ローカル用SQLの生成。DB接続機能やremoteフラグは持たない。
- `0043_original_workbook_provenance.sql`: wordsに品詞/活用/発音/原本注記を追加。出典版、全シート行、候補本文、wordsへの出典リンクを追加。既存word ID/historyは変更しない。
- `types.ts` / `contracts/storage.ts` / `shared/catalogImport.ts` / D1・IDB窓口: `partOfSpeech`、`inflections`、`pronunciation`、`sourceNote`を保持する。CSV内の引用された改行・二重引用符も保持し、未閉鎖引用符は取り込みを中止する。
- API/IDBの重複判定: 語と意味だけで省略せず、例文・品詞・活用・注記・カテゴリ・出典まで等しい場合に限定する。

4冊には `workbook-{品詞}-{原本SHA先頭16桁}` の独立したbook IDを使い、表示名を「メッドエース オリジナル…（原本監査版）」とする。`source_context`には原本ファイルと `source_revision`、出典台帳の版には原本SHA-256を記録する。レベル教材の分類やIDは変更しない。原本の訂正でハッシュが変われば別の出典版/スナップショットとなり、以前の版を残す。

## 再現と検証

Node 22.13以上23未満を使用する。以下は監査ファイルを生成するだけで、DBへ書き込まない。

```sh
node scripts/audit-original-workbooks.mjs --local-preview \
  --catalog output/content-audit/remote-original-words.json \
  --catalog-scope unrelated
node scripts/validate-original-workbook-import.mjs
node node_modules/vitest/vitest.mjs run tests/originalWorkbookImport.test.ts tests/catalogImport.test.ts tests/catalog-local.test.ts tests/nounWorkbookImport.test.ts
```

正式なnamespace比較では、4キー（verb/noun/adverb/adjective）に確認済みbook IDの配列を置いたJSONを用意し、`--catalog-scope source-lineage --lineage-map path.json --catalog 対象教材本文.json` を指定する。空配列は「正規読取で対応namespaceの不存在を確認した」場合だけ使用する。未確認を空配列で代用しない。

出力は `tmp/october-content-audit/`。`original-workbook-audit.json`、`original-workbook-source-archives.json`、`original-workbook-import-rows.json`、`catalog-differences.csv`、`lexical-overlap-reference.csv`、`original-workbooks.local-preview.sql`、`local-import-validation.json`を保持する。SQLはINSERTと競合時無変更だけで、個別statementの最大サイズは約3.7KB。今回の本番には適用しない。

全migrationをin-memory SQLiteへ適用し、実原本1,530語/4冊の初回と再取り込みを検証した。出典版4件、候補1,531件、wordsリンク1,530件、全シート行3,101件。再取り込みは件数不変。人工sentinelの旧単語、利用者、学習履歴は不変。全ready候補にリンクがあり、意味欠損1件はアーカイブのみ、外部キー検査0件。旧クライアントの列選択も1,531語（既存人工1語を含む）を読めた。重点単体テスト4ファイル25件が成功した。

ローカルD1/API/画面上の4冊表示と活用・出典の実確認は統合担当が別に記録する。SQLiteの成功を本番D1/利用者到達の証拠とはしない。

標準Wranglerのlocal D1 migration runnerも、独立した `/tmp/medace-original-workbook-d1-validation` へ0043まで初回適用（exit 0）、同じ保存先へ再実行（`No migrations to apply!`、exit 0）を確認した。証拠は `tmp/october-content-audit/local-d1-migration-replay.json`。これはschemaの適用/再適用の検証で、4冊のD1/API/実画面の照合は統合担当の記録による。

## 本番切り替えは保留

独立QA後の追加検証では、開始位置がB5等の原本も実際の行・列を保持し、コメント・式・色・値を同じ原本行へ保存する。全record/index/section/archiveへ同じoffsetを適用し、以前のarchiveにoffsetがない場合は0を使う。匿名の複数行・複数列・空行fixtureを全44migration後のSQLiteで再importした。

`qa_source_coverage_rate`は「source_sheetと正の整数source_entry_idを両方持つ収録行の割合」で実測する。名詞932/932=100%、動詞0/353・副詞0/86・形容詞0/159=0%。これら3品詞の原本には数値IDがなく、架空IDは付けない。原本セル座標への対応は別の`summary.sourceCoverage.coordinateCoverageRate`で測り、全4冊100%。SQLiteの出典リンクも1530/1530=100%。数値ID不足は既存の確認用warningであり、それだけで学習を停止しない。

未抽出・要確認等の仮置き文字列はblocking issueとして原本archiveに残し、学習用wordsへ入れない。英語TODO/TBD/N/Aは完全一致、日本語・角括弧付きmarkerは既存QAと同じ部分一致で検査し、mastodon等の正当な語を除外しない。APIでも不正markerや`3oops`/`3.8`等の出典IDを公式保存前に拒否する。単語の分類ラベルは権利・内容承認の証拠にしない。

実4原本の再監査結果は1531本文/1530収録/意味欠損1行を維持。全19sheetは実際に1行目開始のため、今回のoffset修正でrecord・sourceKey・contentHash・book/word ID・索引・69訂正履歴は変わらない。式・色・コメント・値も修正前archiveと一致した。最終15検証の成果物は`tmp/october-content-audit-followup/`、同一性比較は`output/final-verification/followup-original-integrity.json`。

1. 原本4冊のnamespace存在確認と、ジェネレーターの対象4冊の収録照合を完了する。索引差分・欠損・原本の誤記について講師が判断する。
2. 新bookの配布対象、台帳の承認、原ID/既存word IDの対応方針を確定する。別教材のレベル1〜6の履歴を移し替えない。
3. 0043を許可された非本番へ適用し、標準migration runnerの再実行が無変更になること、アプリAPI/画面と旧クライアントを確認する。本番適用は対象・影響・バックアップを示した承認後。
4. rollbackはアプリと教材選択を以前の版へ戻し、追加カラム/出典版と以前のword IDsを残す。破壊的なdown migrationや履歴削除は行わない。訂正は新出典版によるforward fixで検証し、既存学習履歴を保持する。
