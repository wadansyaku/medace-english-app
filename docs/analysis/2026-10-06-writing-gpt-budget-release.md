# GPT下書き・永続予算台帳の公開候補

本人の「本番には反映しつつ、GPTによる画像読み取り・個別添削と、実際の利用額を管理する仕組みもつなぐ」という承認に基づく候補。公開済み `b7e0c0c8af6059c775e0298ac192dfbb6144367f` に、検証済みAIなし運用候補 `a706cb7` と追加実装を重ねた。原本repo・既存動画runtime・実生徒データは変更していない。

## 使える範囲と有効化待ち

- AIを使わない標準学習プラン、通知文、保存済み教材・例文、事前準備CSV/問題下書き、安全な未評価表示を公開する。
- 作文の課題文は保存済みテンプレートから作成できる。生徒・担当講師は本文と画像/PDFをD1/R2に未評価の下書きとして保存・再訪できる。提出回数、成績、XP、SRS、正式な返却はこの操作では変わらない。
- 管理者の専用「GPT利用額」画面は月別の計測済み概算と費用未確認の予約保持を分け、取得失敗を0ドルに変えない。従来AIの円表示は参考記録として区別する。
- GPT OCR/コメント下書きのadapter・認可・予算・保存・講師UIを接続したが、通常ソースは初期無効。実API呼出し・キー作成/投入・新しい永続設定・承認行の作成は行っていない。無効時はその状態を表示する。
- GPT結果も常に `UNASSESSED`、人手確認必須。正式採点への変換経路を持たない。通常のlegacy Gemini OCR/evaluationは `fixture/hybrid/live` や既存キーがあっても503。sampleで採点/生成成功を装わない。旧回帰のsampleはテストrunnerの私有コピーだけで使用する。

## 保存と費用

追加migration `0050_ai_provider_budget.sql`、`0051_writing_unassessed_drafts.sql`、`0052_writing_draft_attachment_retirement.sql`、`0053_writing_draft_actor_retention.sql`、`0054_writing_ai_draft_recovery.sql`。旧migration・原本・学習履歴は保持。月はUTC、全利用者で一つのアプリ予算を共有する。

添付の置換はrevision/CASによる保存準備のcommit後にuploadへ進む。古い未提出原本はrow/objectを保持したままdraftの有効添付・upload quotaから退役する。競合する古いrevisionやDB失敗では退役しない。正常保存、PUT成功応答の喪失、手入力の編集、再取得、期限切れURL、別ファイルの再選択を区別して回復する。期限内の完了済み同一body PUTはchecksum/byte size一致時だけwrite-free204を返し、原本・etag・timestampを再書込しない。

送信前に入力/最大出力tokenから保守的な上限を予約する。月$5は計画上限候補、$0.50を余白として新規送信枠は$4.50。D1 batch/triggerで月合計・予約・監査を同時commitし、別workerの同時処理でも上限を守る。同じrequest/fingerprintの再送は二重送信・二重計上しない。provider response IDの重複決済も拒否する。

応答のinput/cached/output/total tokenと固定単価から概算を記録し、response ID・model・pricing version・結果を監査に残す。本文・画像・氏名は費用台帳に入れない。timeout/処理失敗でusageが不明なら予約全額を保持し、無条件の自動再送はしない。不正usage・予約超過・数値精度超過は新規送信を停止する。

これはOpenAI請求書との照合ではない。税・為替・他アプリ・手動APIを含むprovider側の請求上限は保証しない。月枠や残額を表示することと請求確定を混同しない。

## PR57の公開前レビュー修正

停止した画像/PDF教材化やAI予算を有料プランの利用可能機能として案内しない。[全4プランの表示修正](./2026-10-06-subscription-feature-copy.md)で手入力・CSV・保存済み教材・標準プランの導線と価格/権限の不変を確認する。

GPT処理の回復は、送信証跡と予算予約を分ける。[0054の回復契約](./2026-10-06-writing-ai-draft-recovery.md)で、送信前と証明できる同じ要求だけをlease/CASに基づき明示再開し、送信後不明の要求は再送しない。GETは保存済み応答と利用額の精算のみ回復する。入力版・操作が同じ新IDはcanonical claimとaliasで一つの処理へ結び、応答喪失で二重課金を誘発しない。遅れて届いた既知usageも同tokenで保存・精算し、不明と表示した結果を勝手に評価へ戻さない。既存のPENDING/READY/重複rowは消さず、証跡がない旧処理は不明として終端する。

画面は『結果を再確認』（GET）と『同じリクエストを再開』（送信前と確認済みの場合の同ID POST）を分ける。元caller IDとcanonical GET IDを保持し、入力版/課題/操作が違う応答を採用しない。PENDING中の連打で新しい処理を作らない。結果不明時も本文と添付を保持し、日本語で次の操作を示す。

[遅延Writing処理](./2026-10-06-writing-side-effect-submission-binding.md)は元submissionIdと元activityAtへ固定し、その後の提出を使わない。証跡が足りないlegacy jobは履歴を消さず手動確認へ残す。[操作者削除](./2026-10-06-writing-draft-actor-retention.md)は追加0053で3 actor参照だけをSET NULLにし、答案・GPT下書き・承認証跡を保持する。削除されたADMINの承認は現行role JOINにより外部送信に使えない。

## 外部送信の境界

固定OpenAI Responses endpoint、model `gpt-4.1-mini-2025-04-14`、standard tier、`store:false`、toolsなし、厳密JSON。OCRはPNG/JPEG/WebP最大4件・合計20MB。PDF原本の保存は可能、GPT PDF送信は無効。応答schemaに正式点数を持たない。固定単価はinput $0.40/cached $0.10/output $1.60 per 1M tokensで、単価version更新にはコード変更が必要。

利用には `OPENAI_WRITING_ENABLED=true`、サーバー専用 `OPENAI_API_KEY`、`OPENAI_WRITING_DATA_POLICY=operator-approved-v1`、課題単位の未失効・未撤回ADMIN承認がすべて必要。キー単独では無効。承認scopeは `SYNTHETIC_ONLY` または `ADULT_CONSENTED` のみで、承認作成APIはない。担当範囲・現在の組織・有料Writingの権限を維持する。

未成年scopeは実装しない。年齢・保護者/本人同意・保持/削除・適用法・ZDRとモデル適合性を確定するまで実生徒の氏名や答案を送らない。`store:false` はZDR契約を意味しない。通常abuse monitoring保持と、承認が必要なZDRを区別する。under-13/適用されるデジタル同意年齢未満の個人データはZDR前に処理しない。

一次資料: [固定モデルと料金](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[画像token](https://developers.openai.com/api/docs/guides/images-vision)、[データ保持/ZDR](https://developers.openai.com/api/docs/guides/your-data)、[18歳未満向けAPI指針](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)。合成テストは外部ネットワークを禁止する。

## 検証・配備記録

- 初回最終gate: 53 migration、audit、到達性、依存境界/循環、型、184 files / 1707 unit、build成功。その後のAPI失敗は完了済み同一PUT再送の旧期待値が原因。新契約に合わせつつ、row/checksum/etag/timestamp不変の検証を追加し、API全回帰成功。追加の再取得回復8unitを含む最終gateは実行結果を下記へ追記する。
- 通常source-disabled runtimeの実Chrome: 管理者の失敗→retryと未有効表示、320/390/横844/tablet768/PC1366で横overflowなし。生徒/講師の原本保存、lost response同一request再送、revision=2へ一回だけ更新、再訪復元、GPT/正式提出呼出し0、Escape/focus復帰を確認。
- 初回unit2失敗はdiagnostic fixtureのcapability不足を補って解消。初回browserの通知未投入と不存在selectを検証側で修正し、成功実行を別記録で保持。必須checkと本番認可は維持した。
- 独立レビューで保存済み本文の復元、upload応答喪失後の手入力変更・期限切れ・再取得、原本置換のquotaとCASを確認した。未確認PUTを再prepareより先に確認し、成功済み原本を保持する追加修正を受入。`8016b39`の読み取りレビューで残るblockingなし。対象7files/97unitと型成功。
- 最終appソース `e1829d2` は53 migration、audit、到達性・依存境界、型、184 files / 1715 unit、API全回帰成功。full browserはCloud176件とIDB9件成功、旧Writing1件は復元中のdisabled file inputへテストが入力して失敗した。操作可能になる待機を2箇所追加し、Cloud正規buildで当該1件のみ成功。合計Cloud177＋IDB9＝186 unique成功、deployed-only2件はローカル対象外。成功済みappソースを変えて全suiteを無駄に再走していない。
- 配備用buildと最新remote-readonly、通常ソースGPT無効の4実Chrome受入を個別に完了させてからPRへ進む。必須CI/previewのfull suiteとproduction gateは維持する。配備SHA・URL・bookmark・公開後readbackの正本はこのbranchからのPR概要とGitHub Actions summary、本人Macの最終HANDOFFとする。ローカル検証を配備成功と記載しない。
- 中間候補7d379ebは[CI](https://github.com/wadansyaku/medace-english-app/actions/runs/37357925288)と[Preview](https://github.com/wadansyaku/medace-english-app/actions/runs/37357925403)が成功。185files/1722unit、全Cloud177+IDB9、remote0050–0052、配備後4browserを確認した。0050のCASE内END分割は等価WHERE/MAXで修復し、予算/CAS/監査の保証を維持した。公開前レビュー修正を含む最終候補は同じ必須gateで再確認し、結果を[PR57](https://github.com/wadansyaku/medace-english-app/pull/57)とMacのHANDOFFへ記録する。

## 復旧と次の承認

通常PR、必須verify、preview、main merge、GitHub Actionsのproduction bookmark→追加migration→deploy→live readbackを正規経路とする。新secretやfeature/data policy設定は公開作業に含めない。

旧本番 `b7e0c0c` への単純rollbackは旧Gemini/sample評価経路も復活させる。障害時は新schemaを保持し、`a706cb7` の固定AI停止・sample成績ゲートを維持する復旧候補を正規workflowで検証する。DB復元はbookmark以後の正当な記録も失うので、migration成功だけを理由に行わない。

実API受入前にprovider・送信目的・合成データ・最大費用の実行承認が必要。提案は合成PNG1件と短い合成答案1件、quote合計$0.05以下を確認してから各1回。APIキーは本人のsecret画面入力、または作成/保管/適用を個別に明示承認してもらう。チャットへキーを貼らせず、既存キーの値も読み出さない。
