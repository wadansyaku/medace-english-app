# 2026-10-04 本番FAQ・製品改善と有料単語生成廃止

## 状態と承認

実装済み・最終gate/公開待ち。本人から本番開発、PR/merge/deployまでの明示承認を受けている。最終検証、preview、main merge、production deploy、利用者到達は別の状態として記録する。本記録の作成時点では公開済みとはしない。

統合候補は有料生成廃止a650438と講師JST日数修正60ddb39に、本番用FAQ/製品feedback loopを重ねた。localhostのProductWorkbench試作を公開へ流用せず、認証・サーバー認可・D1保存を持つ専用経路を実装した。[独立有料生成候補](./2026-10-04-paid-generation-only.md)は分離時点の歴史的証拠として保持する。

## FAQから改善・再テストまで

FAQは実装根拠・版・未知を示す固定情報を返す。回答できない質問は未回答として操作報告を保存できる。報告は試した版、画面、再現手順、期待/実際、影響を記録する。管理者が優先度と受入条件を決め、手動引継ぎを準備し、修正版・コミットと変更内容を記録する。その版で条件を再現し、再テスト成功/失敗と結果を履歴に残す。失敗時は修正と再テストへ戻る。

匿名化した操作手順には氏名・答案・個人の学習本文を入れないよう案内する。ログインした利用者の内部所有情報は認可に必要だが、報告の表示・手動exportへ所有者IDや組織IDを含めない。自由記述の内容まで自動で匿名化した保証とはしない。JSON保存/コピーは本人が内容を確認して手動で渡すための操作であり、外部アプリへの自動送信・受領ではない。

## 権限と保存

講師はACTIVE組織への有効な所属が必要で、現在の組織に属する自分の報告だけを一覧・取得・作成し、対象版の再テストを記録できる。他人や別組織の報告を取得できない。ADMINは全報告を扱い、優先度・受入条件・手動引継ぎ・修正版を管理する。生徒や未認証利用者にこの報告APIを開かない。認可はサーバーが最終境界となる。

ユーザーのINSTRUCTORロールに加え、所属ロールもINSTRUCTOR/GROUP_ADMINに限定する。所属だけSTUDENTへ変わった不整合時も全操作を拒否し、保存行を増やさない。GROUP_ADMINの組織管理画面にも同じ報告入口を配置し、通常講師と同じ本人範囲・入力保持・ログアウト分離を適用する。

D1に報告、revision付き対応履歴、操作receiptを保存する。同じ作成ID/内容は重複報告を作らず、同じ操作ID/内容の再送は保存済み応答へ戻す。異なる内容でのID再使用は409。expectedRevisionによるCASで古い変更を409にし、現在の内容を再取得する。履歴は以前のeventを保持し、保存失敗・未取得・保存済みをUIで区別する。完全な履歴を取得してからexportし、一覧はpaginationで取得する。サーバー上の状態遷移を保存したことと、外部の担当者へ届いたことを混同しない。

## 学習と費用

単語学習は想起練習、既存SRSと保存済み例文を中心にする。保存済み例文を常時表示し、承認済みの保存画像をpanelで読む。単語/語義編集は生成内容の承認を無効化する。学習中の有料画像・追加例文生成、個人教材の例文準備操作、旧生成API、有料定期再監査を廃止する。

管理者の事前準備だけを残し、欠損を読み、最大10件・概算上限1.2円を明示確認して実行する。生成結果は承認待ちで保存する。0046 durable claimは重複・並行実行を抑止し、結果不明時は自動再試行を止める。人手承認、claim回復、和訳欠損の運用整備は残る。合成fixtureの欠損数を本番教材の欠損件数として扱わない。

講師の日数は閲覧可能な教材/学習eventとJST7暦日で集計する。日数表示を初回コホートの継続率とはしない。将来は母数・観測期間を固定し、継続率、再テスト成績、遅延後の定着を測定する。現在は効果未測定で、他製品への優位性も未実証。

2026-10-04のproduction read-only集計では、`created_by IS NULL`かつ`catalog_source != USER_GENERATED`の在庫46冊67214語に、英例文欠損65670語、asset承認条件を満たす英例文1544語、そのうち和訳欠損1530語、英例文の承認待ち0語があった。COUNT/SUMだけを取得し、変更行0・書込行0。これは教材自体の権利・公開範囲まで満たす生徒配布数ではなく、個人教材を除いた在庫とasset条件の集計。大量の自動生成・課金は行っていない。保存済み例文の学習効果を全教材に一般化せず、欠損整備は承認・費用確認を伴う後続運用とする。

## 移行・削除互換とrollback

0046は単語の生成claim table、0047はfeedback reports/events/receiptsを追加するmigration。過去migrationや既存学習データを書き換えず、migration→新APIの順に配備する。

0046のword削除はclaimをcascade削除する。0047の報告者/所属組織削除は報告と付随履歴/receiptをcascade削除する。別の操作担当者を削除する場合は内部actor IDだけをNULLにし、immutableな履歴内容とroleを保持する。内部IDは表示・exportへ投影しない。

rollbackは追加0046/0047 schemaを残したコード復旧を優先する。旧コードは追加tableを利用せず共存できる。新APIが稼働したままDBだけを0046/0047前へ戻さない。DB復元はbookmark後の正当な保存も戻すため、影響書込停止・互換コード・復元・schema/API確認・再開を正規runbookに従って行う。e97へのコード復旧は古い有料生成入口を戻すため、費用停止の維持を別途確認する。

## 最終gateと公開工程

正規手順は[deployment runbook](../deployment-ops-runbook.md)を維持する。最終候補でlocalの型/unit/API/build/full browser/audit/migration/境界を確認し、doctorと教材QA/台帳/B2B整合性をread-onlyで確認する。PR必須verifyとpreview deployment、0046/0047適用、main mergeによるproduction workflow、SHA付き公開版受入へ進む。既存キーを使用し、新キー作成や無断外部送信を追加しない。

## 検証結果・公開証拠

本ファイルはmerge前の記録。後続の公開状態、SHA、URLとbookmarkは[PR55](https://github.com/wadansyaku/medace-english-app/pull/55)と同PRの必須workflow結果で追跡する。公開結果を未確認のまま成功と記さない。

- 統合実装b5861b8992408d826200ef24c7da9578ea6f8fd8: Node22で全local release gate成功。1254unit、型、API統合、build、48migration replay、audit、到達性・依存境界が成功。
- Chrome全回帰: Cloud144成功/2preview限定skip、IDB9成功。入力済textareaのaccessible nameと更新文言の期待値を修正した実装で、報告→修正→再テスト失敗→再修正→成功を確認した。
- 最終差分: スクロール中のheaderをdialog上端へ固定し、FAQ/reportのsummaryに44px以上のtouch領域を確保。独立cloneでbuildと対象Chrome9件成功。320/390/横向き844/768/1366px、Tab/Shift+Tab/Escape、実D1保存/再訪、triage→実JSON download→再テスト一周、応答消失/同内容再送、旧receiptで新版を保持、未認証/生徒拒否を確認。最終候補の全回帰はPR必須CI/preview workflowで再確認する。
- read-only doctor/教材QA/台帳/B2B gate: b586のlocal release gateで全成功。
- PR55のb586必須verify/preview: 成功。最終差分のchecksは再実行し、通過したHEADを指定してmergeする。
- e2e3e3bの必須verify/preview: 全成功。追加レビュー前のCloud144成功/2skip・IDB9・deployed4成功。runtimeのPR merge-ref SHAは1316ea3a48e1fdb3523c675bacf562303e5c350d、URLは https://e6024a8d.medace-english-app.pages.dev 。匿名session204でSHA一致、home200/noindexを独立確認した。
- PRレビュー3件の対応: 所属ロールによる拒否、GROUP_ADMIN入口、fix/retestの下書き分離を修正。下書きはstatus/revision単位とし、中間工程を見逃して同じstatus/SHAへ戻っても古い入力を混ぜない。triageの入力は独立に保持する。独立cloneでverify:fast（1255unit、型・境界・migration）、build、API統合、Chrome対象12件が成功。実D1の同工程競合/再送、postcommit応答消失/同ID再送、工程入力の空欄、GROUP_ADMINの保存/再訪/logout分離も確認。追加修正を含むHEADのCI/previewはPR55で再確認する。
- 可読性の実画面修正: 組織管理パネルの白い説明・補助操作・バッジを暗色/クリームへ変更。背景色と操作は維持した。独立build、1366px/390pxの実Chromeで本文contrast4.84:1を実測し、報告入口・dialog、横overflowなし、画面errorなしを確認。レビュー修正版5c2aea8のCI/previewも成功し、このclass差分を含む最終HEADで必須gateを再実行する。
- main SHA・production run/URL・0046/0047・recovery bookmark・公開版受入: merge後の正規production workflowとSHA付き受入で記録する。
- 継続率・再テスト成績・遅延定着・優位性: 未測定/未実証。
