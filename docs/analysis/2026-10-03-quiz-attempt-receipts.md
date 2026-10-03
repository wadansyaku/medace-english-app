# 小テスト保存再試行: ローカル実装候補 2026-10-03

この記録は最初の独立候補c5の実装・検証を示す。UI公開版e88a7fdへ重ねた候補の現在状態は [独立統合記録](./2026-10-03-quiz-attempt-receipts-integration.md) を参照。

## 範囲と状態

`b90a9f0bc9dafdab0c57806f5078a86eb121bd00`から独立clone/branch `codex/medace-quiz-attempt-receipts`で実装。課題S1の小テスト保存を対象とし、原本・本番・既存runtimeを変更していない。専用41888、使い捨てD1、合成生徒・教材で検証。外部AI、実生徒データ、料金・XP仕様変更を含まない。配備・push・mergeは未実施。

## 修正

- クライアントは最初の解答時にUUIDを作り、単語・教材・正誤・問題形式・応答時間・mission・意図・生成問題・文法scope・完全feedbackを固定する。再試行は同じID/内容で送り、同期refで連打を止める。
- 保存応答のattempt ID・word・book・確定日時を照合し、成功は一度だけscoreへ反映。欠落・不一致receiptでは未確認の解答を保持して同内容で再試行する。和訳「次へ」も同期消費し、二重クリックによる未回答問題の飛ばしを防ぐ。画面離脱や教材変更後の古い保存応答・timerは新しいテストに反映しない。
- `0044_quiz_attempt_receipts.sql`は小テスト専用receiptを追加。利用者+attempt IDに一意性を置き、SRS0042と混同しない。SHA-256はキー順に依存しない固定JSONから算出し、配列順・feedback内の全内容は保持する。
- D1はreceipt・履歴・QUIZ event・指定CBT learner/word/problem/scope・和訳feedbackを同じbatchで確定する。履歴とCBTの全計算入力をreceipt INSERT時に照合し、競合なら最新状態から再計算。すべての書込を今回のcommit tokenによる勝者条件で制御する。
- 同じID/同内容は元のreceiptを返す。別内容は409。再送にも本人session・教材承認/利用権・word所属・生成問題/mode/scope・明示mission所有/教材一致を確認する。空/NULL/不正IDのlegacy迂回を拒否する。
- explicit-ID APIは200とreceiptを返す。IDなし旧クライアントは204と従来引数を保持し、要求ごとに内部IDを採番する。旧クライアントの複数要求は重複排除できない。
- weakness/missionは確定後の派生投影。失敗をPENDING/failed_atに残し、同じ解答の再送で再構築する。元のreceipt日時・missionを使い、元が未割当なら新しいmissionへ転用しない。保存済みの回答を未保存とは返さない。
- 終了確認文は「保存済みの解答は記録に残る」と実際の保存動作に合わせた。

## IDBの保証と差

DB v8へ追加upgradeし、既存storeを再作成しない。履歴・event・小テストreceiptを同じnative readwrite transactionで保存し、request成功ではなくtransaction完了を待つ。別接続での同ID再送と異ID並行保存を確認。全データ初期化は新receiptもclearする。

IDB receiptはこの端末/ブラウザ内の保存確認に限る。サーバー認可やCloudflare本番運用の証拠ではない。生成問題/scope/feedbackはfingerprintに含めるが、IDBに既存のないCBT/feedback永続化能力を追加しない。教材削除後に孤立した履歴/event/SRS・quiz receiptを残す既存課題はP2へ継続する。

## 検証

| 検証 | 結果 |
| --- | --- |
| 全migration replay、到達性/依存境界、型、unit | 最終sourceで `verify:fast` 成功。全45 migration、134 files / 905 unit成功 |
| 実SQLite canonical保存 | 34成功。8書込地点rollback/同ID復旧、同ID・異ID並行、別単語のlearner/scope競合、別生徒のproblem競合、SRS維持、内容409、feedbackキー順、投影失敗、元mission/日付、認可、入力境界 |
| API全回帰 | 最終成功。lost-response相当+5並行再送、receipt/history/event各1、異内容409、他生徒mission拒否、word/problem拒否、教材承認取消時の再送403、空/NULL/不正ID拒否 |
| Chrome native IDB | 6/6成功。応答消失→閉/reopen、別接続並行、24異ID、11内容変更、4中断地点rollback、legacy/namespace、投影失敗、v7保持、実reset後の旧ID新規保存 |
| Chrome 実アプリ | 3/3成功。390/1280pxで実際の保存200応答を破棄→同内容再試行→次解答別ID、連打、遅延応答後離脱 |
| 独立ReactDOM/hook回帰 | 7/7成功。異選択肢同tick、全payload固定再試行、和訳次への同tick連打、保存/タイマー/採点の古い応答、欠落/不一致/不正receipt後の再試行 |
| build | 最終sourceで成功 |
| 標準full smoke | Cloudflare 114 + IDB 9 = 123成功。その後追加したreceipt応答照合を含む最終sourceで実アプリ3 + hook7 + native IDB6 = 16ケースを再実行し全成功 |
| security audit | base lock由来のTailwind系highで不合格。package/lock/許可リストは変更せず、親の別security commit `2b93982c10a1c4453f78d72d44296c8eba1701fc` 統合を配備前の条件とする |

証拠ログ・UI画像・差分patchは、このcloneのignored `output/quiz-receipts-qa/2026-10-03/` に保全する。画像とデータは合成教材/生徒のみ。security修正版へ統合した後、組合せに対するrelease gateを再実行する必要がある。

## 残る境界

S2 EnglishPractice全体は既存receipt/delegationのままで、この実装の重複排除保証に含めない。XP授与・AI採点課金・Writing claim/leaseは変更していない。

PENDINGの自動回復worker/outbox、receipt保持期限、IDB教材削除後清掃、weaknessの既存read→DELETE→INSERT並行投影競合は未実装。COMPLETEは投影処理成功の印であり、投影の競合修復保証ではない。pending payloadは現在のテスト画面のメモリに保持し、画面を閉じた後の送信queue復元は保証しない。

## 再実行

Node22、依存を用意した独立cloneで:

```sh
npm run verify:fast
npm run build
API_TEST_PORT=41888 npm run test:api
PLAYWRIGHT_SMOKE_PORT=41888 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome npm run test:smoke
npm run security:audit
```

APIとbrowserは同じ専用portを順番に利用する。標準runnerは使い捨てD1を作り終了時に片付ける。IDB/ReactDOM専用suiteは合成ページで全networkを遮断する。ローカル検証をpreview/production配備と混同しない。

Macの検証ではGoogle Chromeを使用。標準suiteの既存スクリーンショットが外部font待ちで停止する環境では、`PW_TEST_SCREENSHOT_NO_FONTS_READY=1` と `PLAYWRIGHT_VIDEO_MODE=off PLAYWRIGHT_TRACE_MODE=off` を併用した。新しい実アプリsuiteは外部font CSSを空応答とし、アプリAPIの保存/再試行を実際に通す。
