# 小テスト保存候補: UI公開版への独立統合 2026-10-03

## 状態と範囲

PR #53の最終UI・一冊版 `e88a7fd75503faf1aeeb6f21c3700ddfc0f62a12` をbaseに、保存候補 `c5ad724e70e3e8c542f580f70759a902a8ebc58c` を新branch `codex/medace-quiz-receipts-integrated-20261003` へcherry-pickした。競合はなく、保存コードの統合commitは `6225bc35442086a17f6e293b520273f67be939c8`。独立cloneは `/tmp/medace-quiz-receipts-integrated-20261003`。元のc5 clone/branchを保持している。

この候補は未公開。push・PR作成・merge・preview/production変更を行っていない。migration0044はローカル合成D1だけへ適用。親の共有QA/build/output、41878、既存保護runtimeと原本は変更していない。検証portは41908、Node22.19.0、使い捨て合成D1。最初の検証はsecurity担当の専用 `node_modules` のsymlinkを読んだ。その後の読取停止を避けるため同一lockから私有 `/tmp` 依存を導入し、共有modulesとpackage/lockを変更していない。

## 保持と保存契約

baseに対するpackage/lock、Naru import・一冊定義、QuizMode→QuizSetupViewの品詞別範囲preset、公開UIレビュー修正、Tailwind4.3.3の設定には変更がない。保存候補はhook・保存サービス・API契約・DB v8・migration0044と検証を追加している。

保存の詳細と保証境界は [最初の実装記録](./2026-10-03-quiz-attempt-receipts.md) を参照。固定attempt ID/全payload、SHA-256、専用receipt、D1履歴/event/CBT/feedbackのatomic保存、同内容再送の重複排除、異内容409、再送時も教材/word/problem/mission認可を維持する。receipt欠落・不一致は保存未確認として同内容の再試行を保持する。IDBの保証は端末内transaction完了に限り、サーバー認可・複数端末・CBT永続化の保証を追加しない。

## 統合候補の検証

| 検証 | 結果 |
| --- | --- |
| verify:fast | 全45 migration replay、到達性、依存境界/循環、型、137 files / 935 unit成功 |
| 小テスト実SQLite | 34/34成功、1.21秒。rollback、lost-response再送、並行更新、内容409、認可、元mission/日時、投影回復 |
| build | 成功 |
| API全回帰 | 成功。合成D1で同内容/並行再送・履歴/event各1・内容409・入力/教材/word/problem/mission認可を確認 |
| 全Chrome + native IDB | **未完了**。登録119 Chromeケースの32成功後、case33 mobile quiz-only progressが3分timeout。残る87 Chrome（33の再確認を含む）と9 IDBは未完了。成功とは扱わない |
| 最終client/native IDB guards | 元c5で実アプリ3・ReactDOM/hook7・native IDB6の16成功を保持。統合後のsourceは同一だが、統合環境での当該browser再実行は保留 |
| 独立semantic review | 別git-archive snapshotで5files/70tests成功（保存34、Naru範囲2、Naru import17、QuizSetup6、controller11）、3.34秒。保存sourceはc5同一、Naru関連sourceはe88同一、重大指摘なし |
| security audit | 成功。既存の文書化xlsx例外1件のみ。旧c5 baseのTailwind系highはこのbaseで解消 |

証拠ログ・source hash・元c5の参考UI画像・統合patchは、このcloneのignored `output/quiz-receipts-integrated-qa/2026-10-03/` に保全する。画像は統合後の実画面証拠ではなく、元c5の再送状態を示す。すべて合成生徒/教材の操作で、外部AIや実生徒データを使用していない。

## ブラウザ検証の環境停止

case33のtimeout後、自分のChromeは終了した。次のworkerはChromeを起動する前にDocuments上の `playwright-core/lib/server/har/harRecorder.js` 同期読取で停止。`lsof`のFD15と`sample`の `node::fs::ReadFileUtf8 → uv_fs_read → kernel read` を保存した。同ファイルのnative `cat` は5692 byteを即取得した。私有依存コピーもDocuments上の型ファイル読取で停止したため終了した。これらは環境の読取問題の証拠であり、case33自体の原因を確定する証拠とは分ける。

親が本人のChromeクラッシュを診断し、新MacChrome開始を保留する指示を出した。自分の検証/コピーだけをSIGINT/SIGTERMで終了し、18:50:27 JSTにPID39720/39868/39724/39851/39852/41545/39872/41990/41992/42331の不在と41908のLISTENなしを確認した。本人Chrome・他担当・保護portは停止していない。

Mac/browserの使用が再開可能になった後、保存した32成功のtitle一覧を参照して残87 Chrome+9 IDBを確認する。既通過の935 unit・34 SQLite・70独立検証・API・build・auditは、source変更や新しい懸念がない限り繰り返さない。全browserを完了するまで公開準備完了とは扱わない。

## 残件と公開前の条件

EnglishPractice全体・XP・Writing・課金はこの保証の対象外。PENDINGの自動回復worker/outbox、receipt保持期限、IDB教材削除後清掃、weaknessの既存並行投影競合、画面終了後のpending queue復元は未実装。これらを解消したとは扱わない。

今後の公開はUI公開と分離した後段の変更として扱う。残browser、外部レビュー・CI・preview・0044適用・配備・実到達の各段階は未実施であり、ローカル成功から本番完了を推定しない。squash後mainへ統合する場合は、このbaseとの差と最終組合せを再確認する。

## 再実行

同じportのAPIとbrowserを順番に実行する。

```sh
npm run verify:fast
node node_modules/vitest/vitest.mjs run tests/quiz-attempt-receipts.test.ts
npm run build
API_TEST_PORT=41908 npm run test:api
PW_TEST_SCREENSHOT_NO_FONTS_READY=1 PLAYWRIGHT_SMOKE_PORT=41908 PLAYWRIGHT_CHROMIUM_CHANNEL=chrome PLAYWRIGHT_VIDEO_MODE=off PLAYWRIGHT_TRACE_MODE=off npm run test:smoke
npm run security:audit
```

標準runnerはそれぞれ使い捨てD1・合成seedを用意して終了時に片付ける。新しい実アプリsuiteは実際の保存200応答を破棄してから同内容を再送する。ReactDOM/hookとnative IDB専用suiteは合成ページで全外部networkを遮断する。
