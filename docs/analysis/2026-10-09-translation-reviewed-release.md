# 和訳改善版の公開受入範囲

2026-10-09、本人が和訳候補3e5cae11397b41ccff29a0d582204b863cd7a918のGitHub・preview・本番公開を承認。現在main1b59c484と元base00c06edは同一tree。独立公開branchへ承認済みpatchを適用し、最初の公開候補939e516では実行コード/テスト/設定を同じ内容で保持した。PR65の公開レビューで確認された和訳候補数と実生成数の不一致だけを追加修正する。旧ローカル限定記録は作成時の履歴である。

## 変更

専用Hubと教材quizの日本語並び替えの自然な別順を誤答保存する問題を修正。20問/参考訳20/許容別訳40/既知意味誤り21を保持し、16問へ意味確認済み別順20を登録。未登録順/未知訳は未採点で、入力を保ち点数/誤答履歴/receiptを作らない。同じ未知入力の再提出では判定が変わらないことを説明する。英語の許容順/同形chipは保持。

保存retryは同じID/内容の確認が完了するまで待機表示とロックを保持。D1の3読取は100bind上限内で対象者を省略せず分割し、認可済みUID/教材条件/NULL/期間/集計/優先順を保持する。320pxの判定バーはみ出しと日本語chipの縦詰まりも修正。

## 公開レビューで確認した出題数の修正

PR65のP2指摘を再現。例文欠落、訳欠落、対象語不在、複数文、分割不能や同形chipを含む教材を和訳候補へ数える一方、生成が拒否していた。JA_ORDER/INPUTの候補判定と実生成を同じ純粋ヘルパーへ統一。0候補では開始を無効にして「和訳の練習」と理由を表示し、学習済み0件はカード学習/全範囲を案内する。番号入力のlabelを入力欄へ対応付けた。scope除去の現行UI経路、他5モード、原本・fallback拒否・保存条件は保持する。

関連88unitと実Chrome320/1366px・両和訳モード4件で、0候補、混在教材1問、他方向への切替、開始前の保存要求0件を確認。修正後の正確なSHAで全11工程と正式CI/previewを改めて実行し、追加修正前の成功結果を代用しない。

## 検証と公開

同じ実行コードのローカル全11工程成功。212files/2333unit、API全統合、Cloud263＋IDB9＝272browser、flaky/retry0、5幅・20viewport画像、保存応答200、横はみ出し/pageerror0。初回の実不具合と接続断による不完了を成功扱いせず、修正後の正確なSHAで完了した。

公開には正式CI、preview配備のfull回帰/専用banner・noindex・合成demo/D1/Writing確認、main統合、本番配備と配備後の公開到達を必須とする。GitHub PR/Actionsと独立公開引継ぎへ各SHA/URL/実測結果を保存する。本番へ実生徒の答案や履歴を作らず、公開UI/asset/SHAとread-only教材/件数を照合。合成回答・保存retry・大人数集計は隔離D1とpreviewで検証する。

本番のNaru1531語/出題印638/既存ID/原本/履歴を保持し、source/承認gateを弱めない。停止中provider・課金AI・secret・認可範囲・新たな素材の追加公開は変更しない。通常workflowの既適用Naru訂正helperはread-only照合とskipを確認する。

## 限界

登録された有限表現を比較する方式。未登録の自然な別訳も未採点になり、自由和訳全体の意味評価は保証しない。A1/A2/B1/B2は文脈・語彙ヒント込みの学習目安であり、実測校正/試験尺度合わせ/ヒントなし難度は未検証。外部教員承認、cloud question/version/raw-answer追跡、過去誤採点影響、実授業効果、実Safari/iPhoneは次段階。


追加回帰で、既存の遅延採点harness教材に例文がなくJA開始条件を満たさない3件を確認。合成の3語へ対象語を含む全文例文と日本語訳だけを追加し、遅延採点の別セッション遮断、未採点時の入力保持/保存除外/再試行のassertionを保持した。対象3browserは実Chromeで成功。アプリ実行コードはcacde36と同一で、最終commitの全gateで確認する。失敗した前候補の全gateは成功として扱わない。


画面全体の追加確認で、和訳候補0の上部QuizHeaderだけ希望出題数を表示する箇所を確認。SETUPのJA0候補は上部も「和訳の練習」とし、内側の理由/開始無効化と一致させる。実hook unitと既存4browserで全画面に架空の問数見出しが残らないことを確認する。先行fb979bcの全11工程2356unit/Cloud267+IDB9成功は保持し、見出し修正後SHAを最終公開gateで確認する。先行cacde36は共通の旧fixtureに由来する5件失敗であり、合成3語の例文追加後の対象5件はassertionを維持して成功した。


## 2026-10-09 最終候補の本番受入完了

本人の本番反映・旧公開禁止の継続解除指示に従い、PR65を通常squash mergeした。source `fefe1e5c7d319819f22fe616e8a2504140a82a20` とmain `4955b54d370ef62fb14502031a405e83acc4d677` は同一tree。最終候補にP2の出題候補と実生成の一致、JA0件の画面全体の見出し修正を含む。

- 全11工程:212files/2356unit、Cloud267＋IDB9＝276browser、retry/flaky0、preview専用2skip、全API統合/型/architecture/migration/security/build成功。
- 正式CI:[37929027043](https://github.com/wadansyaku/medace-english-app/actions/runs/37929027043)。正式preview:[37929026017](https://github.com/wadansyaku/medace-english-app/actions/runs/37929026017)、追加native15ケース成功。preview metadata SHAはPR merge ref `6651f0b1e5cc9c8915825c9b7a32efdf2af61f01`。
- main CI:[37932941462](https://github.com/wadansyaku/medace-english-app/actions/runs/37932941462)、production:[37932941548](https://github.com/wadansyaku/medace-english-app/actions/runs/37932941548)成功。公開URL:https://medace-english-app.pages.dev 。immutable:https://4db1c4df.medace-english-app.pages.dev 。既適用Naru helperはALREADY_APPLIED_VERIFIED。
- 公開導線5件はGET/HEADだけ、認証5幅10画像は送信せずfocus/閉じる/入力の可視性を確認。和訳の実本番static assetを5幅25画像で確認し、全APIはlocalhost42930合成D1へ隔離。未知0保存・登録済み1保存ずつ・save200・overflow/pageerror0を確認。本番backend保存の検証と混同しない。
- 本番のNaru1531語/638印、catalog全内容とID/番号hash、既存265履歴・84study receipt・1quiz receiptのキーをread-onlyで保持照合。原本/語義/出典/履歴・認可・教材承認gate・停止中provider/課金設定を維持。回答本文は読まず、raw catalog/キーはMac内のみで、Git/Libraryへ転送しない。

旧公開禁止は通常の公開依頼へ再適用しない。未登録の自然な訳は有限bank比較では未採点。実Safari/iPhone、外部講師承認、CEFR実測校正、過去誤採点影響と実教室効果は未検証。以前のローカル限定/未配備記録は作成時点の履歴。

公開後のこの文書記録は独立local receipt branchに保全し、配備済みアプリsourceを変更しない。実配備の判定正本は独立evidenceのpublication/published-acceptance.json。
