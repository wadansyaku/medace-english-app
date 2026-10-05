# Writing GPT 下書きの回復候補 — 2026-10-06

対象は PR57 の `discussion_r4187132717`。基点 `7d379eb65fa4d6904d7447ec45c91c35e161631b` の独立 branch `codex/writing-ai-recovery-20261006` に保存する。claim 後の一時的な DB 失敗で PENDING が永久に残り、新しい要求 ID で二重送信できる問題を修復した。公開・実 provider 有効化の証拠ではない。

## 永続状態と再送境界

0054 は下書き本体とは別の execution、入力版ごとの canonical claim、caller ID の alias を追加する。新規 claim は本体・canonical・PREPARING checkpoint を同じ D1 batch で確定する。budget ID、UTC 月、quote、content fingerprint は初回の値を維持する。

| 記録 | 回復操作 |
| --- | --- |
| PREPARING | GET は確認だけ。明示的な同 ID POST が期限切れ lease の nonce を CAS 取得し、現在の入力・認可・承認・予約を再検証する。予約の重複応答だけでは送信を許可しない。 |
| DISPATCHING | 送信前に永続化する。応答喪失も送信済みの可能性として扱い、再送しない。期限切れは UNASSESSED / RESULT_UNAVAILABLE とし、未知費用の予約全額を保持する。 |
| RESPONSE_STORED | 厳密検証した response / usage を保存済み。GET または同 ID POST が冪等精算と最終 UPDATE を回復し、provider は呼び出さない。 |
| FINISHED / LEGACY_UNKNOWN | 旧 READY と全重複行を保持する。旧 PENDING は送信前だった証明がないため再送せず、未評価の取得不能状態にする。 |

送信 fence で lease を送信時刻から60秒へ更新する。固定 provider timeout は25秒で、fence / 認可の ack 後にも最低30秒の処理余裕を要求する。予算の blocked / $4.50 dispatch 枠と current ADMIN approval は fence の原子条件に含める。ack 後に担当・組織を再認可し、最後の D1 読取で approval、予算、nonce / phase / lease を同時に再照合してから、設定・承認期限・UTC 月・処理余裕を同期確認する。失効・月跨ぎ・予算停止は送信ゼロ、旧予約保持で終える。

遅れて届いた同 token の検証済み応答は、先に UNASSESSED で終わっていても durable checkpoint として保存し、既知の usage だけを冪等精算できる。画面の終端と `result_json` を READY に戻さない。checkpoint 自体を保存できないときは結果を捏造せず、未知費用の全額保持を続ける。

同じ assignment / attempt / input revision / operation は、別 ID・別の認可済み講師でも一つの canonical 処理を共有する。同 ID の payload / actor 変更は409。POST は元 caller ID、GET は canonical IDを使い分ける。alias 応答を失っても元 ID の GET で回収できる。応答は `inputDraftRevision` と `recoveryAction` を返す。0053 の actor SET NULL 後も fingerprint は維持する。

## ローカル検証

- 対象 unit 3ファイル141件成功（Writing 71件、budget / provider 70件）。SQLite 実 SQL と transaction rollback に、commit 前失敗・commit 後 ack 喪失・async lease 競合を注入した。provider は private mock、全 fetch は禁止。
- claim / reserve / dispatch fence / response checkpoint / settlement / final UPDATE の失敗、旧 worker nonce、月跨ぎ、別 ID / 講師、actor cleanup、旧重複 / READY 保全を確認した。
- 遅延 known usage の before / after settlement 失敗→GET回復、unknown audit との競合、別処理の invalid usage / quote 超過による停止、fence 待ち中の承認撤回・期限切れ・ADMIN cleanup・担当変更・最終 eligibility 失効を確認した。
- typecheck、source 到達性、依存境界 / 循環、migration filename、差分 whitespace が成功。
- isolated temporary native local D1 に全55 migrations（0053→0054を含む）を Wrangler で適用成功。最初の sandbox localhost `listen EPERM` は、承認された local-only 再実行で解消した。root 所有0053は検証用の untracked copy で、この commit には含めない。

実 OpenAI / Gemini 呼出、secret 読み出し・設定、承認行・feature flag の実変更、remote 書込・公開は実施していない。full build / API / browser は統合担当の最終 gate に残る。rollback は GPT を無効のままにし、budget / usage と新しい回復表を削除しない。旧送信処理を有効な状態に戻す rollback は二重送信防止を失うため採用しない。
