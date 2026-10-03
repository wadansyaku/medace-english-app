# Naruシスト 一冊化と公開の検証記録


公開後追記: 通常TOC_FREEの実操作で、投入値PUBLICが現行access scope enum外のためNaru非表示となる問題を確認した。元の配備・原本照合は成功しているが、一般生徒の利用可能性は未達。[修復候補と影響](./2026-10-03-smart-ui-and-grammar.md)に記録。その後、本人の全プラン開放の明示承認に基づき12:46 UTCに一冊だけALL_PLANSへ修復した。7table全列保持、本番無料生徒の閲覧/学習開始、公開コードの合成4プラン認証HTTPを確認。[修復完了と確認範囲](./2026-10-03-smart-ui-and-grammar.md)を参照。以下のPUBLICは当初公開時の履歴であり、現在値はALL_PLANS。

## 現在の状態

2026-10-03に公開完了。PR #53の最終候補 `e88a7fd75503faf1aeeb6f21c3700ddfc0f62a12` をmain `4c4690a62ea0b595c10a536a5ccb313e870d3c7a`へsquashし、[production workflow 37113034090](https://github.com/wadansyaku/medace-english-app/actions/runs/37113034090)が全工程成功。[公開先](https://medace-english-app.pages.dev)の実SHA・HTML参照JS/CSS・PWAを確認した。本番の「Naruシスト」一冊1530語はPUBLIC/approvedで、四原本と七表の全行・不変フィールド照合も成功した。

本人の四原本を「Naruシスト」一冊にする依頼を受け、先行する四冊の名称変更を置き換える。原本バイト、教材SQL、教材全行のJSON、DBバックアップ、合成アカウントのcookieは公開Gitへ追加しない。

## 教材と既存保存の保全

| 項目 | 確認結果 |
| --- | --- |
| 教材ID / 表示名 | `naru-shisto-original-v1` / `Naruシスト` |
| 学習できる語数 | 1530語。動詞353、名詞932、副詞86、形容詞159 |
| 出典行 / 単語へのリンク | 1531行 / 1530リンク |
| 原本アーカイブ | 四ファイルのSHA、シート・索引・修正ログ、3101行の値・セル座標・式・注釈・書式 |
| 保留 | 副詞 `actually`、`adverb:副詞一覧:R82C6`。欠訳を補作せず出典だけ保存 |
| 原本の番号と新しい番号 | 出典payloadには原番号を残す。学習番号は1〜1530の連番 |
| 品詞ごとの範囲 | 動詞1〜353、名詞354〜1285、副詞1286〜1371、形容詞1372〜1530 |
| ID | 四原本のSHAと座標から生成する既存snapshot方式のword/source/entry IDを保持 |
| 重複 | 同綴りの別義・別品詞を統合しない。重複headword差分83を台帳に記録 |
| QA指標 | 必須空欄・sentinelは0。数値出典ID率0.6092、座標対応率1、日英例文対率0を正直に記録 |
| 提供範囲 | 今回本人が公開を依頼した新規オリジナル一冊のみPUBLIC。既存ライセンス教材・プラン・認可は変更しない |

本番のread-only preflightで、四snapshot book、word ID prefix、11のbook参照表、learning planのJSON参照はすべて0件、外部キー違反0件だった。既存のレベル1〜6教材、ユーザー、学習履歴、receipt、課題、planを移動する必要はない。四冊が既にあるDBはこのimporterの対象外とし、衝突で停止する。

`scripts/import-naru-workbooks.mjs` は非公開SQLを生成するだけで、DB書込みは行わない。stageはpending/needs_review。SQLは既存の同一行だけを再使用し、内容衝突をNOT NULL違反として拒否する。既存日時、通報状態、承認判断は上書きしない。部分投入から同じsnapshotで再開できる。

公開承認の前に七表の全行・不変フィールドをread-backする。承認SQL自身でも同じファイルの中で全行と件数を再assertし、最後に七表の件数を再確認する。read-back後の定義・原本・座標・台帳欠落・追加行の変更を承認しない。確認が失敗した実行では以前の成功proofと承認SQLを削除する。verifyで元stage SQLやmanifestを上書きせず、同じSHAをpreviewとproductionで使う。

## 公開手順と復旧

アプリとschemaは[既存runbook](../deployment-ops-runbook.md)のGitHub Actionsから配備する。今回の非公開原本の教材file importだけは、本依頼に基づく一回の運用として記録する。Actionsへ原本やSQLをアップロードする仕組みを追加しない。

1. Local gate、独立レビュー、合成D1で一冊の実操作を完了する。
2. PRの必須CIとpreview workflowを完了し、0043・候補アプリが配備されたことを確認する。
3. Previewの復旧bookmark・教材backupを保存し、固定SHAのstage SQLを投入する。全原本read-backから承認SQLを生成・投入し、`--expect-approved` read-backを必須とする。
4. Previewの教材QA・台帳・B2B整合性と実画面を確認する。
5. 必須checksとreviewを満たしてmergeし、production workflowのmigration・配備・公開smokeを完了する。
6. 本番の直前bookmarkと参照件数を再確認し、previewと同じstageを投入する。同じread-back・承認・承認済み確認とremote gateを行う。
7. 公開URLのSHAとHTML参照assets、本番の一冊/1530語/1531出典/保留一件/外部キーを確認し、配備済み状態に更新する。

教材backupは資格情報表を含めず、books/words/material_source_ledgerをprivate localへexportした。全DBの復旧起点はCloudflare D1 Time Travel bookmarkとして保存する。ローカル保存はmode600、Gitの対象外。投入直前にもbookmarkを再採取する。

D1のfile importはSQLにBEGIN/COMMITを入れず、一文100,000bytes以下を生成時に検査する。remote file importはRETURNING行を返さないため、直後の `--expect-approved` 全七表read-backを成功の正本にする。[公式import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)、[制限](https://developers.cloudflare.com/d1/platform/limits/)。

不具合時は新一冊の台帳だけをneeds_reviewとして選択を止め、既存安定アプリへ戻す。追加schemaは保持できる。利用開始後のbook/wordをDELETEしない。全DBのTime Travel復元はbookmark後の正当な学習記録も戻すため最後の手段とする。[Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/)。

## 公開前の確認

- `verify:fast`: 135ファイル/893unit成功。型、44 migration replay、到達性、依存境界と循環確認を含む。
- Build・API回帰成功。Chrome指定の全ブラウザー回帰105件・IDB3件成功、preview専用の2件はlocalではskip。最初の実行はMacにPlaywright標準Chromiumが無い起動エラーであり、UI成功として扱わない。
- 専用local D1 `41878`: 一冊の1530語と全原本読戻し・承認済みを確認。320/390/844横向き/tablet768/desktop1366でauthを含む56シーン、学習保存・reload保持、品詞5presetの候補数、講師カタログ・印刷教材selectを確認。横幅overflowとpage errorは0。
- `cf:doctor`: ok53/warn1/error0。warnはこの新branchの配備がまだ無いこと。
- 公開前security監査で、Tailwind3が依存するbracesの新勧告を検出。Tailwind/PostCSS 4.3.3へ更新し、監査例外追加なしで成功。Chrome/WebKitの5幅×3画面で文字・位置・色・focusを比較し、writing/worksheet22件と統合後の全回帰も成功。[移行と対応ブラウザー](../tailwind-v4-build-security.md)、[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)。
- 最終画像で生徒320px・講師390pxの教材ボタン名の途中改行を確認。ラベルを一行に保ち、カード内幅が足りない場合だけボタンを縦に折り返す。講師のモバイル内余白も調整する。既存suiteへ生徒320/390pxの文字矩形・44px操作領域・keyboard・教材遷移の回帰を追加した。
- PRの追加レビュー3件を実装と規約で再確認。動画QAは旧四冊条件を一冊「Naruシスト」1530語の厳密条件へ直し、正常ケースと61の拒否ケースを合成ファイルで検証する。既存の映像・音声・字幕・HTML/module/hash検査を維持する。録画自体の再収録・実decodeとは別の検証である。
- ログイン後ヘッダーは既存の正式表示名 `Steady Study` と `BRAND.productLabel` に統一。教材名「Naruシスト」はそのまま保持する。生徒320/390pxと講師・組織管理者の5幅、計12件の実ブラウザー操作で表示名・ナビゲーション・ラベル・keyboardを確認した。
- ローカルpreviewのserver非正常終了を親processへ伝え、spawn errorを含め一時projectのcleanupを行う。実OS child processを使って終了0/17、予期しないSIGINT/SIGTERM/SIGKILL、spawn ENOENT、利用者からのSIGINT/SIGTERM停止を確認する。利用者が所有するD1 stateは削除しない。

実生徒での新教材学習は未検証。合成D1の成功を本番本人の学習成功とは呼ばない。公開URLの非認証確認と、本番DBの集計・全原本照合を別に記録する。

## 最終配備と保存確認

- 最終候補の型・44 migration replay・到達性・境界・136ファイル/901unit、build・API成功。表示名を含む実ブラウザー12件、起動process新規8件、動画QA正常1＋拒否61ケース成功。
- 最終CIは37112126600、previewは37112126601で成功。previewとmainは候補と同じsource tree `aac816471f8dd020ae6d8c8e08f70bfddfabdd0a`。両配備workflowの必須全回帰を維持し、107Chrome・3IDB成功。preview配備後4件・production配備後5件も成功した。
- 最終localと最終previewで各56シーン・5幅の保存/reloadが成功、字体読込待ち・横overflow・page errorの条件も確認。previewは `https://debd4ecf.medace-english-app.pages.dev`、runtime SHAはGitHub仮mergeの `5e914c2c842c9a67c8f6087be45ebac93f63e95d`。
- 本番投入はpreviewと同じstage SHA `ebab88aa10b0f2617ce2ce91f72208f9a506c01012766fec183c8571f4e33b52`。投入前の新ID・四snapshot・原本word prefix・11参照表・plan参照は0。投入と承認の各直前にfresh Time Travel bookmarkを採取した。
- 承認後は一冊/1530語/四原本/1531出典/保留一件を再照合。新教材のContent QA、全教材台帳、B2B整合性gateが成功。既存の品質・導入warningを0へ見せず、原本のcoverage・重複も保持した。
- 投入前後の既存件数は同一: users13、learning histories197、study receipts2、interaction events244、plan books4、weekly missions0、既存books58・words65711。FK違反0。実生徒の行やcookieを検証fixture・公開artifactへ使わず、本番に検証用ユーザーを作成していない。
- 追加のローカル教材exportは自動承認レビューで拒否されたため未実行。既存のprivate backupを保持し、直前のCloudflare Time Travel bookmarkを復旧起点にする安全な代替で完了した。

## Notion企画との照合

本人指定のNotion企画は、別担当がMacネイティブNotionのMedAseゲストworkspaceから閲覧した。Notionへの編集・コメント・共有変更は行っていない。企画ページは語彙DBではなく、最新1530レコード・多義語/異品詞の保持・actually保留を変更する根拠は無かった。4月の名詞添付と今回のファイルは名称と表示サイズが対応するが、添付バイトを再取得しておらずSHA同一性は未確認。

原本の英例文は動詞353・名詞932・副詞86・形容詞159、計1530語すべてにあり、そのまま保存した。日本語例文訳は0。日英例文対率0を「英例文も0」と解釈しない。分類は動詞29群、名詞10分類/29小分類/25section、副詞6群を保持し、形容詞に原本にない分類を補作しない。

一冊内の四品詞と順序・範囲は「品詞ごとの章」に整合する。現行の品詞presetは小テスト用であり、SRSの章選択・用法別単位・単語直下の例文常時表示・例文の収録語相互参照・例文和訳の拡充は未完として後続計画へ置く。番号は参照を助ける方針に合うが、参照機能が完成したとは呼ばない。追加生成は原本・生成由来・レビュー状態を区別し、原本の例文や欠訳を無断で置き換えない。

## 全体改善との関係

[包括監査と改善計画](./2026-10-03-medace-improvement-plan.md)は確定した破綻とコード上の候補を区別する。今回のUI/auth、取得失敗・保存通知、講師導線、worksheet競合、ナビゲーション・横向きの修正は公開済み。次の保存基盤P1として小テストの同一回答再送receipt・履歴/event原子確定を独立branchで実装し、最終UI/一冊/Tailwind4へ統合した。保存HEADは `83ca5313717e6574d2d374331c5540d356e0b8f4`、935unit・34SQLite・API/build/audit・独立70/semantic成功。独立レビュー対象16ファイルは最終HEADとSHA256一致。ブラウザー32件成功後にMacの同期依存読取待ちで残87Chrome＋9IDBを保留し、全自分processを終了した。公開gate未完のままPR #53へ混ぜず、未公開quizや未実装EnglishPractice/XP/Writingを公開済み・修正済みと数えない。
