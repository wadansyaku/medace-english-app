# 公式教材importの承認・QA・原本ID境界の修正

クラウド独立QAで、`catalogSource=STEADY_STUDY_ORIGINAL` を指定するだけで新規教材の権利とレビューを承認済みにし、`definition=未抽出` でもQA件数を0で記録して学習者の `getWords` へ返す経路が再現された。加えて原本ID `3oops` / `3.8` が `parseInt` により3へ変換されていた。以下はローカルコードと匿名fixtureだけの修正であり、本番データや承認状態は変更していない。

## 保存と公開の条件

新規の公式API importは分類名にかかわらず `rights_status=pending` / `review_status=needs_review` となる。既存台帳の権利判断は、catalog分類・source file・source contextが同じ場合だけ保持する。sourceが変わった場合はpendingへ戻し、既存blocked判断は保持する。内容をimportした場合のレビューは常にneeds_reviewへ戻す。これは以前の判断の保持であり、新しい内容の権利承認ではない。

所有者のない公式importに `USER_GENERATED` を指定する経路も保存前に400で拒否する。これによって個人教材向けの台帳対象外扱いを公式教材へ適用できない。個人importの所有者と分類は従来どおりサーバーが固定する。

共有normalizerは未抽出・要確認・未設定・TODO・TBD・N/A等を、NFKCと既存content QAと同じsubstringルールで調べる。公式importに必須空欄、marker、不正IDなどのwarningが残る場合は全体を保存前に拒否する。すべてのbookを検査してから最初のDELETE/INSERTを実行するため、不正入力が既存教材や学習履歴を破壊しない。

`inspectCatalogImportContent` は実際の受入行から必須空欄行、sentinel行、sentinel値件数を計測する。台帳ではsource sheet＋正の安全な整数IDのcoverage、例文ペアcoverage、重複headwordも実測する。原本IDは正の安全な整数だけを受け付け、途中までの数字を取り出さない。省略された任意IDは捏造しない。

## 担当変更

- `functions/_shared/storage-book-actions.ts`: 承認の自動付与を廃止、QA保存前検査、実測台帳、source変更時の権利再確認、official USER_GENERATED拒否。
- `shared/catalogImport.ts`: 共有QA helper、marker除外、原本IDの厳密検証。
- `contracts/storage.ts`: issue unionへ `BLOCKED_CONTENT_MARKER` / `INVALID_SOURCE_ENTRY_ID` の2値だけ追加。request/payload形は不変。
- `tests/catalogImport.test.ts`: CSVとrowの不正ID、marker、QA件数の回帰。
- `tests/catalog-import-approval.test.ts`: 全44 migrationsを適用したisolated SQLiteで13回帰。pending公開停止、明示台帳承認、拒否時の教材・台帳・users・history不変、再importレビューreset、source変更、blocked保持、coverage、prod flag、分類迂回拒否を確認。

## 検証と引継ぎ

同梱4テストファイル49件が成功。型検査も成功した。匿名SQLiteはメモリ内だけで動作し、元アプリのD1を開かない。runtimeからcanonicalへ5ファイルを同期し、同期前のcanonicalが直前snapshotまたは自分の修正だけであることをSHA256で確認した。

- [Vitestの実行結果](../../output/content-audit/import-hardening-vitest-20261002.json)
- [検証・同期・file hash一覧](../../output/content-audit/import-hardening-validation-20261002.json)

全repo回帰、標準API/browser runnerの匿名fixture承認整合、原本parserのready・source coverage修正、クラウドLibrary再梱包はroot担当。以前のクラウドtarはこの修正前のsnapshotであり、最終版へ更新が必要。本番切替・実利用者変更・依存更新・専用preview dist変更は行っていない。
