# GPT下書き・永続予算台帳の公開候補

本人の「本番には反映しつつ、GPTによる画像読み取り・個別添削と、実際の利用額を管理する仕組みもつなぐ」という承認に基づく候補。公開済み `b7e0c0c8af6059c775e0298ac192dfbb6144367f` に、検証済みAIなし運用候補 `a706cb7` と追加実装を重ねた。原本repo・既存動画runtime・実生徒データは変更していない。

## 使える範囲と有効化待ち

- AIを使わない標準学習プラン、通知文、保存済み教材・例文、事前準備CSV/問題下書き、安全な未評価表示を公開する。
- 作文の課題文は保存済みテンプレートから作成できる。生徒・担当講師は本文と画像/PDFをD1/R2に未評価の下書きとして保存・再訪できる。提出回数、成績、XP、SRS、正式な返却はこの操作では変わらない。
- 管理者の専用「GPT利用額」画面は月別の計測済み概算と費用未確認の予約保持を分け、取得失敗を0ドルに変えない。従来AIの円表示は参考記録として区別する。
- GPT OCR/コメント下書きのadapter・認可・予算・保存・講師UIを接続したが、通常ソースは初期無効。実API呼出し・キー作成/投入・新しい永続設定・承認行の作成は行っていない。無効時はその状態を表示する。
- GPT結果も常に `UNASSESSED`、人手確認必須。正式採点への変換経路を持たない。通常のlegacy Gemini OCR/evaluationは `fixture/hybrid/live` や既存キーがあっても503。sampleで採点/生成成功を装わない。旧回帰のsampleはテストrunnerの私有コピーだけで使用する。

## 保存と費用

追加migration `0050_ai_provider_budget.sql` と `0051_writing_unassessed_drafts.sql`。旧migration・原本・学習履歴は保持。月はUTC、全利用者で一つのアプリ予算を共有する。

送信前に入力/最大出力tokenから保守的な上限を予約する。月$5は計画上限候補、$0.50を余白として新規送信枠は$4.50。D1 batch/triggerで月合計・予約・監査を同時commitし、別workerの同時処理でも上限を守る。同じrequest/fingerprintの再送は二重送信・二重計上しない。provider response IDの重複決済も拒否する。

応答のinput/cached/output/total tokenと固定単価から概算を記録し、response ID・model・pricing version・結果を監査に残す。本文・画像・氏名は費用台帳に入れない。timeout/処理失敗でusageが不明なら予約全額を保持し、無条件の自動再送はしない。不正usage・予約超過・数値精度超過は新規送信を停止する。

これはOpenAI請求書との照合ではない。税・為替・他アプリ・手動APIを含むprovider側の請求上限は保証しない。月枠や残額を表示することと請求確定を混同しない。

## 外部送信の境界

固定OpenAI Responses endpoint、model `gpt-4.1-mini-2025-04-14`、standard tier、`store:false`、toolsなし、厳密JSON。OCRはPNG/JPEG/WebP最大4件・合計20MB。PDF原本の保存は可能、GPT PDF送信は無効。応答schemaに正式点数を持たない。固定単価はinput $0.40/cached $0.10/output $1.60 per 1M tokensで、単価version更新にはコード変更が必要。

利用には `OPENAI_WRITING_ENABLED=true`、サーバー専用 `OPENAI_API_KEY`、`OPENAI_WRITING_DATA_POLICY=operator-approved-v1`、課題単位の未失効・未撤回ADMIN承認がすべて必要。キー単独では無効。承認scopeは `SYNTHETIC_ONLY` または `ADULT_CONSENTED` のみで、承認作成APIはない。担当範囲・現在の組織・有料Writingの権限を維持する。

未成年scopeは実装しない。年齢・保護者/本人同意・保持/削除・適用法・ZDRとモデル適合性を確定するまで実生徒の氏名や答案を送らない。`store:false` はZDR契約を意味しない。通常abuse monitoring保持と、承認が必要なZDRを区別する。under-13/適用されるデジタル同意年齢未満の個人データはZDR前に処理しない。

一次資料: [固定モデルと料金](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[画像token](https://developers.openai.com/api/docs/guides/images-vision)、[データ保持/ZDR](https://developers.openai.com/api/docs/guides/your-data)、[18歳未満向けAPI指針](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance)。合成テストは外部ネットワークを禁止する。

## 検証・配備記録

- 統合 `verify:fast`: 52 migration、到達性、依存境界/循環、型、184 files / 1667 unit成功。
- 通常source-disabled runtimeの実Chrome: 管理者の失敗→retryと未有効表示、320/390/横844/tablet768/PC1366で横overflowなし。生徒/講師の原本保存、lost response同一request再送、revision=2へ一回だけ更新、再訪復元、GPT/正式提出呼出し0、Escape/focus復帰を確認。
- 初回unit2失敗はdiagnostic fixtureのcapability不足を補って解消。初回browserの通知未投入と不存在selectを検証側で修正し、成功実行を別記録で保持。必須checkと本番認可は維持した。
- 最終build/API/full browser/security/remote-readonly/preview/productionは完了後に個別追記する。ローカル検証を配備成功と記載しない。

## 復旧と次の承認

通常PR、必須verify、preview、main merge、GitHub Actionsのproduction bookmark→追加migration→deploy→live readbackを正規経路とする。新secretやfeature/data policy設定は公開作業に含めない。

旧本番 `b7e0c0c` への単純rollbackは旧Gemini/sample評価経路も復活させる。障害時は新schemaを保持し、`a706cb7` の固定AI停止・sample成績ゲートを維持する復旧候補を正規workflowで検証する。DB復元はbookmark以後の正当な記録も失うので、migration成功だけを理由に行わない。

実API受入前にprovider・送信目的・合成データ・最大費用の実行承認が必要。提案は合成PNG1件と短い合成答案1件、quote合計$0.05以下を確認してから各1回。APIキーは本人のsecret画面入力、または作成/保管/適用を個別に明示承認してもらう。チャットへキーを貼らせず、既存キーの値も読み出さない。
