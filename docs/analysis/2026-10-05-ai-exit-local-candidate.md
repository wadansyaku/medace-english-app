# Gemini停止・事前準備・AIなし運用のローカル統合候補

2026-10-05。公開済み本番SHA `b7e0c0c8af6059c775e0298ac192dfbb6144367f` を基準に、独立branch `codex/medace-ai-exit-local-20261005` へ保存する非公開候補。本番/preview配備、remote migration、push、merge、鍵取得/設定、契約、課金、実AI生成、実生徒データ送信は行っていない。既存ゲスト版・動画・原本repo・保護runtimeを保持する。

## 統合した動作

| 確認した問題 | 候補の動作 | 保存・権限の境界 |
| --- | --- | --- |
| Writingのサンプルが実評価として確定する | e615746安全候補をf558daeへ統合。サンプル/不明を画面・サーバーで区別し、確定/返却/印刷/学習反映を拒否 | 答案原本、入力、成功したuploadを保持。過去DB集計を自動修復したとはしない |
| 設定に鍵が残ると旧AI処理が再開する | `ai-execution-policy` がコード固定のDISABLED boundaryを使用。旧Gemini/Workers AI入口とWriting liveを停止 | env/binding/キーだけでは再開しない。新しいlive endpoint/SDK実装なし |
| プランや講師通知のためにAIを呼ぶ | 全4プランで既存標準builder、純粋な介入テンプレートと手編集を使用 | 本人教材・ACTIVE組織・担当範囲・保存成功確認を保持。下書きだけでは通知しない |
| AI停止で承認済み文法問題も失う | 承認済みcacheを部分返却し、不足を既存static演習で補う | 未承認問題は出さない。provider/有料予算を呼ばない |
| 管理画面が生成ボタン・費用見積もりを表示する | CSV取込と保存済み例文/欠損/非公開の確認へ変更。旧prepareBookExamplesは権限確認後410 | claimや結果不明の処理を消さず、公式教材の承認/出典gateを保持 |
| 事前作成例文を原本へ直接流し込む | 0049別表にPENDING下書き。対象ID/原文/更新時刻/空欄を照合したSQL artifactだけを生成 | learner readは別表を参照しない。原本七表、words、SRS IDs/履歴/receipt、ledger不変。昇格APIなし |

詳細は[Writing安全](./2026-10-05-writing-ai-safety.md)、[AIなしプラン・通知](./2026-10-05-ai-free-plans-notifications.md)、[校正済み事前準備](./2026-10-05-prepared-content-offline-drafts.md)を参照する。過去の個別検証数は各候補の証拠であり、この統合版の最終gateとは分ける。

## OCR/個別評価と月$5の候補境界

- `createDisabledAiProviderBoundary()` は常に未評価で、production policyの接続先である。`createSyntheticMockAiProviderBoundary()` はrouteへ接続しない。テストコードから合成fixtureとmock driverを明示注入する場合だけ実行できる。
- OCR/添削のruntime schemaはunknown field、score/rubric混入、不正JSON、型/サイズ/範囲を拒否する。正常な結果もDRAFT/UNASSESSED、人手確認必須。拒否・失敗・timeout・不明費用は未評価で、自動retry/provider切替をしない。
- 月$5は計画枠。整数USD micro単位で10%を残し、dispatch上限は$4.50。原子的な同時予約、request ID再送拒否、不明費用の予約保持、確認費用の精算、upper bound超過時の月全体停止をmockで検証する。
- 予算storeはprocess-local mockのみ。D1永続化、多Worker、restart後の費用上限、実請求との照合は未実装。実サービスの単価/容量/費用保証と表現しない。
- `gpt-6-luna` は候補名だけで、正規API model ID・提供状況・価格を採用していない。旧Google SDKと過去usage互換の型/単価定義は依存に残るが、通常の本候補経路からlive呼出しへ到達しない。
- 標準API/browser runnerは、私有一時FunctionsのWriting adapter/facadeだけにnetwork-free providerを注入する。これは解析・保存・認可の回帰用で、live可用性や本候補で実答案を採点できる証拠ではない。production facadeは注入を受け取らない。

[OpenAI Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs)に従いrefusalを通常のschema結果と区別する。[Cloudflare料金](https://developers.cloudflare.com/workers-ai/platform/pricing/)の無料枠を無制限/月USD枠とみなさず、[利用制限](https://developers.cloudflare.com/workers-ai/platform/limits/)上、local推論も実AI呼出しとして扱うため今回はmockのみで検証する。

## ローカル検証

最終統合sourceの型・unit・migration replay・到達性/依存境界・build・API・ブラウザー・audit結果を、完了後ここへ記録する。実ブラウザー証拠は合成アカウント/データのみ。Browser plugin not availableのため既存Playwright runner/Chromeを使用する。320/390/横向き/tablet/desktopのrender、keyboard/閉じる、失敗/retry、保存/再訪を対象とする。

## 未接続の条件とrollback

live OCR/個別評価を将来使うには、未成年データの同意/保持/外部送信条件、人手確認責任、公式model ID/単価/画像上限、operation別上限quote、global永続費用予約、usage照合、処理claim/lease、不明予約の回復を具体化する必要がある。現在の候補ではキーだけを追加しても有効にならない。

今回の作業はローカルbranchとpatch/bundleの保全まで。既存本番SHAを使い続ける場合は本候補を適用しない。将来コードを戻す場合は既存ゲスト0048や教材/SRSを削除しない。0049を適用後も追加表は残し、公開承認や成績確定の安全境界を保つ。過去のclaim・サンプル由来集計は別の人手確認/修復作業として残す。
