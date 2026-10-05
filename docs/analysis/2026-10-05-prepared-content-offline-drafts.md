# 校正済み教材と例文の事前準備候補

2026-10-05。本番 `b7e0c0c8af6059c775e0298ac192dfbb6144367f` から分けたローカル候補。本番配備、remote migration、provider有効化、API生成、課金、secret値の読出し、実生徒データの外部送信は行わない。

## 変更

- 管理者の「AI教材生成」を撤去し、既存のCSV取込だけを使う。例文・和訳・品詞・原本注記・出典列に対応する既存parser/保存境界は保持する。公式教材は従来の `BUSINESS_ONLY` と承認待ち台帳で保存する。CSV取込は権利確認や公開承認の代わりにはならない。
- 例文一覧は保存済み・訳欠損・非公開の状態を確認するだけにする。有料準備ボタンや費用見積もり、外部AI呼出しをなくす。取得失敗を0件と表示せず、再取得を用意する。
- 旧 `prepareBookExamples` はADMIN・教材write権限の確認後HTTP410を返す。キーが残っていても生成せず、過去の `word_example_generation_claims` や結果不明のclaimを保持する。
- 追加migration `0049_word_example_drafts.sql` は例文の下書き用の別表だけを作る。既存の `words.example_sentence` / `example_meaning` / audit列、books、原本七表、source ledger、SRS ID・履歴・receiptを変更しない。生徒のread経路はこの表を参照しない。
- `build-reviewed-word-examples-sql.mjs` は、GPT Work等で事前に作り人手で校正した単語例文のJSONから、レビュー用SQLとmanifestをローカルに作る。DB接続・network・実行・`--remote`・公開承認を持たない。

## 新しい教材と既存語の補完を分ける

新しい教材は既存のCSV取込を使う。通常のCSVを既存Naruの補完に流用すると、別book/word IDを作る可能性がある。既存教材の例文・和訳補完は以下の下書きpackageを使い、安定した既存IDを明記する。

GPT Workや人手での作成は準備工程であり、アプリが自動で外部へ送信する機能ではない。原文、権利・用途、正確な語義と例文の対応を確認する。個人情報・答案・実生徒データをこのpackageに含めない。

```json
{
  "version": 1,
  "sourceFile": "private/prepared-examples-reviewed.json",
  "preparedWith": "GPT_WORK",
  "reviewReference": "private/proofreading-log-20261005.md",
  "rows": [
    {
      "wordId": "existing-word-id",
      "bookId": "existing-book-id",
      "patchKind": "EXAMPLE_PAIR",
      "expectedWord": "source",
      "expectedDefinition": "出典",
      "expectedUpdatedAt": 1791158400000,
      "exampleSentence": "Please check the source.",
      "exampleMeaning": "出典を確認してください。"
    }
  ]
}
```

これは形式例で、校正・承認済みの実教材ではない。`preparedWith` は `MANUAL` / `GPT_WORK`。`reviewReference` は校正記録への参照で、公開権限を付与しない。承認を要求する追加フィールドは拒否する。1packageは最大500語、同じword IDの重複は拒否する。

`EXAMPLE_PAIR` は英例文と和訳の両方がDBで空の語だけを対象とする。片方だけ既存値がある場合は上書きせずスキップする。原本英文に和訳だけを追加したい場合は `patchKind: "TRANSLATION_ONLY"` と `expectedExampleSentence` に原本の全文を指定する。この形式に `exampleSentence` は指定できない。

両形式とも、word ID・book ID・原単語・原語義・`updated_at` が一致し、対象列が空の場合だけ別表へINSERTする。NULL/空欄を含む元のwords値はそのまま保持する。期待値は正本snapshotから転記し、語義を別の語へ使い回さない。対象不一致・古いsnapshotはエラーによる巻戻しではなく0行INSERTとなるため、反映後のID/件数照合が必要。

```sh
node scripts/build-reviewed-word-examples-sql.mjs \
  --input /private/path/prepared-examples-reviewed.json \
  --output /private/path/pending-examples.sql
```

このコマンドはSQLと `.manifest.json` を新規作成するだけで、DBは変更しない。既存出力を上書きせず、出力権限は0600とする。manifestは `execution: NOT_EXECUTED` / `reviewStatus: PENDING` / `publicationApproval: NOT_GRANTED` を明記する。`inputSha256` は検証・正規化後のpackageのSHA256。draft IDは行の内容と準備証跡から決まり、同じ下書きの再送は `ON CONFLICT(id) DO NOTHING` で保存済み証跡を変えない。

## まだ実施しない工程

0049のremote適用、下書きSQLの実DB実行、管理者による下書きread API、公開承認・昇格は今回に含めない。実行の際は運用担当者が [配備runbook](../deployment-ops-runbook.md) のbackup・対象DB・migration・投入前後の照合を行う。生徒向けデータへの昇格は、原本と追加例文の区別、既存の権利/品質ゲート、人手承認、対象snapshot競合・同じ操作の再送、receiptを別工程で設計・検証する。準備済みという申告だけでは公開しない。

下書き表は `PENDING` のみを受け付ける。今回の候補には公開状態へ変える経路がない。旧有料claimを解放・再課金しない。月$5候補やOCR/添削provider境界は別担当の候補であり、この教材準備はAPI費用を発生させない。

## 検証と引継ぎ

限定unitではCSVの連打・変更ロック・読込/保存失敗・遅延/unmount・runtime write gate、旧例文APIのrole/教材権限/410と無書込、下書きの対象/空欄/snapshot guard・再送・SQL引用・PENDING固定を確認する。SQLite上で原本・全words列・book/word/SRS ID・source ledger・claim・履歴/receipt・生徒projectionが完全一致し、FK違反0であることを確認する。型と `git diff --check` も対象にする。

管理者画面の既存5幅smoke（320/390/844横向き/768/1366）は保存状況取得→失敗→再取得→欠損展開→Escape/focus復帰→連打でも生成0へ更新した。新specではないためsuite登録は既存のまま。単独担当はunitに限定し、統合担当が同一ソースでbuild・画面render・migration replay・全gateを行う。Browser pluginはこの担当のsession一覧にないため、実renderは既存Playwright runnerを使う。

Rollbackはコード候補のrevertで行う。本番Naru/ゲスト0048とその保存記録を巻き戻さない。将来0049が適用されても追加表を残し、コードrevert時に原本や学習記録を削除しない。公開済みデータは変更していない。

単独候補の実行結果: Node 22.19.0、関連7files / 106unit成功、`tsc --noEmit`・両scriptのsyntax check・`git diff --check` 成功。0049追加に伴いcomplete-schema契約のmigration数を50へ更新し、0049の存在も確認する。build/実browser/remote反映は未実施。
