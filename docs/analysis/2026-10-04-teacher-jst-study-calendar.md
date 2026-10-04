# 2026-10-04 講師の直近7日学習日数

基点はローカル候補607f366。公開・push・merge・実データ操作は行っていない。費用廃止・FAQ試作とは別のcommitで保持する。

既存の画面ラベル「直近7日の学習」に合わせ、今日を含む日本時間の7暦日とする。開始は6日前00:00 JST、終了は問い合わせ時点（両端を含む）。未来時刻は数えない。10/4 12:00 JSTの場合、9/28 00:00から10/4 12:00まで。旧実装のnow−6日では9/28朝が除外され、同日午後へ時刻が進むだけでも日数が減っていた。

学習イベントのSTUDYを日本時間の日付へ変換して重複を除く。SRSの単語別最終履歴が上書きされても、保存済みイベントから過去の学習日を保持する。イベントのない旧履歴はSTUDYの最終日を補完し、同日のイベントと二重計上しない。既に上書きされ、イベントも残っていない旧学習日は復元できない。

両方の入力に既存の教材条件を適用する。本人の個人教材、または権利・審査・必須内容QAを満たす公式教材だけを対象にする。別人の教材、未承認教材、QUIZは対象外。組織・講師担当の生徒フィルターは既存のまま。組織KPIやlastActive、総学習数、再活性判定の定義は変更していない。組織KPIにも最終履歴を読む箇所があり、その日数保持を直した証拠とはしない。

検証: Node22.19.0、production SQLを全47migration適用済みの独立in-memory SQLiteで実行。新規13テストと関連read-model/visibility/retention/atomic SRSを合わせ5files41tests成功。型、architecture（318 production sources）、diff whitespaceも成功。

対象ケース: 6日前00:00・朝を包含、7日前末尾を除外、現在時刻を包含、現在+1ms・翌日を除外、同日重複・UTC/JST日付差・最大7日、同語の別日SRS回答、時間経過とJST日付切替、旧履歴補完と未来除外、QUIZ/別人教材/未承認/QA不備の除外、実SQLで講師担当と別組織の隔離。既に検証した607の全回帰は再実行していない。画面要素やDB schemaは変更していない。

再現: `npm run test:unit -- tests/organization-study-calendar.test.ts tests/organization-student-read-model.test.ts tests/student-visibility.test.ts tests/retention.test.ts tests/study-attempt-receipts.test.ts`、`npm run typecheck`、`npm run quality:architecture`。公開時の正式release gateは必要。
