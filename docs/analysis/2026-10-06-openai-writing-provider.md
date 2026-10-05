# OpenAI OCR・添削 provider の独立候補

2026-10-06。基準 `a706cb7cce5e4f0210f3258ef0012927544aff01` を保持した独立 branch。新規 `functions/_shared/openai-writing-provider.ts`、対象 unit とこの記録だけを所有する。既存 adapter/callsite・認可・types/contracts・migration・画面は統合担当が管理する。

## 公式仕様と固定値

[GPT-4.1 mini の公式モデル資料](https://developers.openai.com/api/docs/models/gpt-4.1-mini) を確認し、vision 入力・Responses API・Structured Outputs 対応の `gpt-4.1-mini-2025-04-14` snapshot を固定した。標準価格は 100万 tokens 当たり入力 $0.40、cached input $0.10、出力 $1.60。`gpt-6-luna` を推定採用していない。料金 version は `openai-gpt-4.1-mini-usd-2026-10-06`。

[公式 vision の現行 sizing/cost 規則](https://developers.openai.com/api/docs/guides/images-vision) は、この snapshot に patch budget 6144、multiplier 1.62 を記載する。旧1536規則を使わず、dispatch quote は `ceil(6144 * 1.62) + 1` = 9955 tokens/image を使う。画像サイズを実測した実請求保証ではなく、予約用の保守的な bound である。

[Responses の作成仕様](https://developers.openai.com/api/reference/resources/responses/methods/create) と [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs) に沿い、固定 `https://api.openai.com/v1/responses` へ一回だけ POST。`store:false`、非 streaming/foreground、標準 service tier、tools 無し、redirect error、truncation disabled を指定する。strict JSON schema は additionalProperties false、runtime でも既存 Candidate draft validator を通す。refusal は通常 schema の外にあるため別に処理する。

## 入力・結果・費用

- `OpenAiWritingRequest`: OCR は `payload:{assets:[{mimeType,base64Data}],promptText}`、添削は `payload:{transcript,promptText}`。操作は `OCR` / `WRITING_FEEDBACK`。外部 URL・氏名 metadata・unknown key を受け付けない。認可済み assignment の同意確認は統合担当のサーバー gate が担う。
- 画像は JPEG/PNG/WebP、1〜4枚、総20MB。PDF はページ数・vision/text 費用を確実に bound できる画像化工程が無いためこの provider の live 対象外。ファイル原本と手入力導線を保持して未評価にする。入力 MIME は元 upload/R2 gate と合わせて確認する。ここは画像デコーダや PDF 変換器ではない。
- prompt は4000 chars/UTF8 12000 bytes、答案は12000 chars/UTF8 24000 bytes。出力 cap は OCR6144、feedback8192 tokens。返答本文の読み取りは20万 bytesまで、body読み取りも含めて既定25秒timeout。
- `quoteOpenAiWritingRequest` は JSON escaped user text のUTF8 bytes＋固定 instructions/schema bytes＋4096 framing余裕＋image bound＋output capを標準 uncached 価格で予約計算する。quoteとdispatchには同じ内容 snapshot/fingerprint を使うこと。cache割引を予約枠から先取りしない。
- `createOpenAiWritingProvider({apiKey?,fetchImpl?,timeoutMs?})` はcallerから key が無ければ fetch しない。値を environment から読む処理、SDK dependency、ログ、リクエスト本文保存は持たない。feature flag/同意/認可/原子予約は外側の責務。これだけで本番機能を有効にしない。
- valid JSON も `DRAFT / evaluationStatus:UNASSESSED / requiresHumanReview:true`。score/rubric/overallScore 等が混入すれば拒否。confidence は OCR の可読性であり成績ではない。空OCR・無効JSONからサンプル答案やサンプル点数を作らない。
- input/output/cached/total tokens は非負 safe integer、cached<=input、total=input+outputを要求。実response IDと固定modelを検証し、meteringに返す。整数microUSDは `ceil(((input-cached)*400000 + cached*100000 + output*1600000)/1000000)`、BigIntで端数を最後に切り上げる。これは response usage による推定額であり、税/契約/請求書との一致を保証しない。
- refusal/incomplete/invalid draft もusageが既知ならmeteringを返す。timeout/HTTP error/不明usageは自動retryもfallbackもせず、外側の予約は全額保持する。usage bound超過は既知usageを返して未評価にする。統合担当が費用 overrun/月 blockを永続化する。

## 合成検証と未実施

全 fetch を注入した合成 unit だけ。実キー無し・実APIへの送信無し。新規32件＋既存provider/budget46件の78件成功、型チェック成功。snapshot/endpoint/storage/tools/redirect、画像、draft、score拒否、refusal/incomplete、usage厳格性、料金端数、bound超過、HTTP429/transport/timeout/late completion、body上限、PDF/unknown入力拒否を検証した。build/full browserはroot統合sourceで単独実行する。

[OpenAI データ制御](https://developers.openai.com/api/docs/guides/your-data) によれば `store:false` は Zero Data Retention の契約と同義ではなく、abuse monitoring 等の保持条件がある。root側の同意/保持説明・未成年条件を最終確認する。実API testにはキーの安全な設定、利用枠と価格照合、外部送信してよい合成素材、永続予約/unknown回復、利用 gate の承認が必要。この担当はキー取得設定・実API test・生成・課金・実生徒送信・remote変更・配備を行っていない。

rollback は統合側の接続を停止し、この新規3ファイル差分を revertする。既存教材・SRS IDs・guest版・本番migrationを変更しない。
