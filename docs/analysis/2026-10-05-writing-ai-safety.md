# 英作文のサンプル評価を実評価と区別する非公開候補

2026-10-05。独立branch `codex/medace-writing-safety-20261005`、基点は登録なしNaru候補 `13e1ee34cfc84bfdc4c55e4f4804a74073bf436c`。今回の範囲は英作文hybrid/sampleの誤表示・誤確定の防止と、AI学習プラン502時の既存標準ロジックへの明示的な切替。push、merge、配備、remote migration、課金・設定変更は実施していない。

## 確認した問題と修正

| 問題 | 修正後の動作 |
| --- | --- |
| hybridのGemini評価失敗が固定サンプルを返す際、provenanceが誤ってliveになる | `hybrid-fallback`に修正。過去の`live`＋`fixture-*`モデルもサンプルと判定 |
| 固定OCR本文・固定評価が通常提出として保存され、成績・返却・学習記録へ進める | 実本文と実評価を確認できなければ503で提出確定を止める。sample OCRは評価APIを呼ぶ前に拒否。保存する評価は実処理分だけ |
| 過去のsample/処理元不明の評価を講師が確定できる | 承認、修正依頼、完了、確定済み再送、公式feedback印刷をサーバーでも拒否。古いside-effect jobの再試行にも同じ境界を適用 |
| 生徒に固定スコア・修正文を本物の成績として見せる | `サンプル／実際の答案を評価していません`を明示。スコア・固定本文・修正文を除いた投影にし、原本と講師コメントを保持 |
| 講師画面で固定スコア・信頼度と通常の確定操作が並ぶ | 主警告を表示し、sampleの数値を隠し、比較サンプルは任意の参考表示に分離。確定操作を無効化 |
| AI障害後の再送が同じファイルを再アップロードして枠を消費する | 同じ課題・attempt・File参照で成功済みassetを再利用。ファイル変更・対象変更・終了でcacheを破棄 |
| 生徒の提出エラーが画面外のnoticeだけになる | ダイアログ内のalertへfocus、入力とファイルを同じ画面内に保持、再試行操作を明示。送信中の連打・入力変更・閉じるを防ぐ |
| 手入力本文を「おおまかな補助」と案内するが、実処理ではその本文が評価対象になる | 原本と同じ英文を入力する案内とラベルへ修正 |
| AIプラン502で既存標準プランに切り替わらない | 502も既存標準ロジックへ切替。保存成功後に`AIが利用できないため、標準の学習プランを作成しました`と通知 |
| テンプレート課題をAI生成済みと表示する | 講師・生徒に`テンプレート課題（AI生成なし）`を表示。課題自体の配布は維持 |

## 設定の読取証拠

秘密ではないGitHub variableを、値だけを返す通常の正規GETで確認した。両方とも`hybrid`だった。

```sh
gh api repos/wadansyaku/medace-english-app/environments/production/variables/WRITING_AI_MODE --jq .value
gh api repos/wadansyaku/medace-english-app/actions/variables/WRITING_AI_MODE --jq .value
```

これはGitHubの設定値の確認であり、Pagesで現在動くruntimeの値を直接確認した証拠ではない。キー・秘密一覧・実生徒データを取得していない。設定同期や有料AI呼出しも行っていない。

## 検証環境と結果

Mac、Node 22.19、Chrome、Playwright。Browser pluginは利用できないため（`Browser plugin not available`）、既存のPlaywright runnerを使用。原本repoと既存runtimeを保持し、`/tmp/medace-writing-safety-20261005`、専用port 42355、専用の合成D1/R2で確認した。

| 確認 | 結果 | 範囲 |
| --- | --- | --- |
| 型 | PASS | `tsc --noEmit` |
| 到達性・依存境界/循環 | PASS | `quality:unused`、`quality:architecture` |
| 影響範囲unit | PASS | Writing認可/保存CAS/返却投影/副作用/AI adapter/UI/retry/print/upload、学習プラン、local provider隔離。14 files、140 cases |
| build・diff whitespace | PASS | Vite build、`git diff --check` |
| 実ReactDOM・Chrome | PASS | Writing recovery 19 cases。320/390/844横向き/768/1440、sample/旧誤live、keyboard、失敗/retry/保持/確定不可 |
| 実HTTP・D1/R2・Chrome | PASS | 限定3 cases：スマホ提出、スマホ返却、講師の修正依頼→再提出→返却→完了 |

最終unitの初回は、build/型との並列中に一時Functions全ファイル比較が5秒で時間切れになった。このI/O比較だけを15秒へ調整し、同じ14 files/140 casesの再確認が4.24秒で成功した。比較内容は維持している。

ReactDOM画面検証は実componentとCSSをrenderし、アプリserviceだけを合成応答へ置換した。390/1440のAI失敗でdraft保持、1 upload／2 finalize、page error 0、横溢れ0、overlayなしを確認。障害を意図的に注入したconsole errorは期待値として区別している。原本assetの保持はサーバー/SSRで検証し、画面fixtureのasset配列は空なので、画像自体の描画成功とは扱わない。

実HTTPの正常系では、local runnerが一時コピーしたFunctionsだけにネットワークを使わないprovider応答を注入する。実adapterのparser・プラン認可・使用量記録・D1保存・revision/CAS・学習副作用を通るが、Geminiの可用性や採点品質を確認する試験ではない。元FunctionsのSDK import、設定、秘密は変更しない。provider隔離の4 casesで元Functionsの全ファイル保持、変更が一時コピーの2ファイルだけ、キーのglobal混入なし、外部fetchなし、403/429維持を確認した。

## 再現コマンド

```sh
node node_modules/vitest/vitest.mjs run tests/writing-ai-adapter.test.ts tests/writing-security-boundaries.test.ts tests/writing-state-cas.test.ts tests/writing-released-feedback.test.tsx tests/writing-side-effect-safety.test.ts tests/writing-assessment-ui-safety.test.tsx tests/writing-student-acquisition.test.tsx tests/writing-ops-controller-recovery.test.ts tests/learning-plan-service.test.ts tests/learningPlan.test.ts tests/writing-upload-security.test.ts tests/writing-print-security.test.ts tests/writing-request-validation.test.ts tests/local-wrangler-writing-provider.test.mjs
WRANGLER_SEND_METRICS=false node scripts/start-smoke-server.mjs --port 42355
PLAYWRIGHT_BASE_URL=http://127.0.0.1:42355 PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome node node_modules/playwright/cli.js test --config playwright.smoke.config.ts tests/smoke/writing.smoke.spec.ts tests/smoke/mobile.smoke.spec.ts --grep 'group admin and business student|business student can use the mobile writing submit flow|business student can read returned feedback' --workers=1
PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome node node_modules/playwright/cli.js test --config playwright.smoke.config.ts tests/smoke/writing-ops-recovery.smoke.spec.ts --workers=1
```

保存証拠は `medace-writing-safety-delivery-20261005` のhandoff、patch、bundle、source archive、QA記録、PC/スマホの画像。合成providerを使う42355を実AI動作の撮影用と混同しない。

## 影響と残る確認

- AIが実本文・実評価を返せない場合、これまで固定サンプルで成功していた提出は未確定になり、画面内の再試行へ進む。課題テンプレートの作成・配布は可能。
- 新しい手動採点の保存・受付queueを追加していない。原本の手動確認を講師に依頼する案内であり、その依頼が送達/保存済みとは表示しない。
- 草稿保持は同じ画面内のメモリー。ブラウザーを閉じた後の復元は未実装。アップロード応答喪失・失敗した部分uploadの枠回復は今回の成功済みcache保証に含めない。
- 過去のDB行や既に反映された成績・mission/KPI集計は自動訂正していない。実生徒データを読む/訂正する別途の監査は未実施。
- 今回は依頼された限定検証。full API/full browser/全unit、実iOS、正規preview、実Gemini、Pages runtimeのモード読取は未実施。公開前の必須CI・release gateは維持する。migrationと依存lock変更なし。
