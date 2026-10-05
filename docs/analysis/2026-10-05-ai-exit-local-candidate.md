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
| 個人単語帳が停止中のAI抽出へ進み、狭い画面では保存失敗も見えない | 手入力CSV/.csvを本人単語帳へ保存。失敗は入力を保持し、open+error時にalertへfocusして画面内へ表示 | PDF/画像はbytes読出し前に停止。作成権限・価格・quota、本人所有の保存境界を保持 |
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

Node 22.19.0。最終アプリsourceは `6ca9a016f944d585e5275a78312e25feb5707189`。320×568の実画像で個人取込の保存エラーが上に隠れる問題を確認し、このcommitでopen+error時のfocusを追加した。後続差分は本analysis/todo文書だけである。

- `verify:fast`: migration名・50 migrationの新規local replay・到達性・依存境界/循環・型・177files/1527unit、全成功。
- Cloudflare mode buildと合成D1の全API回帰が成功。旧管理者準備410、許可済み事業生徒の抽出503・費用記録0、無料生徒標準plan200、講師actionの生徒403も実HTTPで確認。
- 最終全smokeはCloudflare形式172成功/1ブラウザー終了/配備専用2skip、IDB9成功。中断したWritingの再提出→返却→8幅/200% zoomは、同じアプリsource・新規合成D1で3回連続成功した。中断原因は断定しない。全実行のexit1と失敗詳細も保全し、初回から全コマンド成功とは表現しない。成功確認済みuniqueはCloud173＋IDB9＝182。合成アカウント/データだけを使用。通常runnerのWritingはnetwork-free synthetic provider注入なので、実AI可用性の証拠としない。
- 注入なしのsource-disabled runtime（専用42425、新規合成D1）で追加4成功。個人CSVと標準planの320×568/1366×900、失敗保持・再取得・retry・連打1保存・実保存/再訪・AI通信0を確認。個人取込はalertのfocus/viewport内表示も確認する。この4ケースは全smokeにも含まれ、uniqueへ重複加算しない。
- 管理者例文5幅、通知/plan 320/390/PC、Writing sample/不明の確定拒否、keyboard/閉じる、保存境界の実renderと画像を保全。Browser plugin not availableのため既存Playwright/Chromeを使用。
- `security:audit` 成功。既存のxlsx高severity例外1件は継続（npmの修正版がなく、ローカル教材QAに限定）。依存/lock変更なし。
- 独立読み取りレビュー3回でblocking指摘なし。個人importの一覧更新失敗catchは実refreshの例外吸収契約では到達しない、という非blocking指摘を記録。実画面は既存の一覧更新失敗表示と保存成功通知を区別する。最後の320 focus修正も独立レビュー済み。

初回unitはlocalhost sandbox制約6件と診断fixture不足2件で失敗。localhost権限の安全な許可と私有Writing fixtureの整合修正後、全1527成功。追加API停止検証の最初の抽出fixtureは既存の利用権限を持たなかったため、権限がある合成事業生徒へ変更した。権限/価格を緩めていない。これらを必須checkのskipやgate変更で通していない。

## 未接続の条件とrollback

live OCR/個別評価を将来使うには、未成年データの同意/保持/外部送信条件、人手確認責任、公式model ID/単価/画像上限、operation別上限quote、global永続費用予約、usage照合、処理claim/lease、不明予約の回復を具体化する必要がある。現在の候補ではキーだけを追加しても有効にならない。

今回の作業はローカルbranchとpatch/bundleの保全まで。既存本番SHAを使い続ける場合は本候補を適用しない。将来コードを戻す場合は既存ゲスト0048や教材/SRSを削除しない。0049を適用後も追加表は残し、公開承認や成績確定の安全境界を保つ。過去のclaim・サンプル由来集計は別の人手確認/修復作業として残す。
