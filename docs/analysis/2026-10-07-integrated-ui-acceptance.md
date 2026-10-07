# 確認したUI/UXの破綻と受入範囲

対象はMedAce / Steady Study。初回公開済み182ba3d、公開後レビュー4件、単語優先・生徒入口の統合候補896a4a03、未接続の長期復習候補0ae54239を区別する。元repo、動画担当runtime41812、本番、生徒実データを変更しない独立clone/branch・専用port・合成D1で検証した。

| 優先 | 実再現・問題 | 修正・現在の受入 |
|---|---|---|
| P0 | ログイン/登録を押すと一括説明が展開し、PCでemail y2208/page2951、390pxでemail y2703/page4047 | 初回公開182で入力中心に分離。任意説明/閉じる/戻る/Escape/focus、email PC420.7/mobile328.5。導入の説明は残す |
| P1 | 通常生徒の主操作が、単語残数より文法の弱点推薦を優先する | 明示plan→開始済み教材の既存順→承認済み利用可能Naru。配布課題・重要講師対応を保持。文法/和訳は選択する副操作 |
| P1 | 学習と単語小テストの回答がスマホ/横向きの画面外へ出る | 重複ナビ・製品副題・不要な反復説明を削減。通常フローの回答領域、低い画面では入力/操作を横配置。16px以上の操作ラベルと元の入力文字サイズを維持 |
| P1 | 長い語義を固定小領域に入れると欠ける/読めない。初期の分割は短すぎる断片を生む | 全文を意味の境界でページ化、computed font/line-heightから容量計算。324文字12ページ、短い2語義36文字は1ページ、70文字2語義は全語義境界で2ページ。切捨て・自動縮小なし |
| P1 | 例文・訳・補足が常時大きく並び、保存操作と競合する | 必要時の目的別パネル。全文/原本/補完区別/現単語の一致を維持、Escape/focus復帰、保存中は操作不可、次語に前の答え/例文を残さない |
| P1 | 親画面の更新で学習が2語目から1語目へ戻る | 公開後4件のmemo化でqueue/currentword/retryを保持。実PC/320/390の保存・戻る・再訪を照合 |
| P1 | 旧Naru章quizの副詞1372が抜け、形容詞へ混入 | 既知旧章の完全一致に限定して範囲補正。実pool境界・回答receipt・戻る確認、任意rangeと認可は保持 |
| P1 | 原本変更/削除/REPLACE後に出題印を再点灯できる | 追加0058の永続失効台帳と17trigger。過去annotations保持、初回既存原本/語/履歴/承認は無変更。再承認なく復活しない |
| P1 | 原本分類manifestの不足・誤座標でもSQL生成を許す | 標準importの637分類/座標/語義を出力前検証、held補完1と区別。malformed exit1/artifacts0、正常SQL byte同一 |
| P1 | 通常入口の下に生徒以外の複数役割カードが並ぶ | root DOMから除去。個人/所属ともSTUDENT共通。teacher/school-admin/service-admin/student専用と旧9URL、back/reload/keyboardを保持 |
| P1 | TOB_FREE/GROUP_ADMINの正規本人がworkspace全体を開けない | 任意Writing2取得の正規403を全体errorへ伝播していた。sessionの既存TOB_PAID条件で取得、freeは基本画面成功。有料取得失敗はerror維持。実signup→正規所属→本人専用login/reload、Writing明示GET403/自己昇格403維持 |
| P1 | 実ADMIN390pxで14日グラフがページを786pxへ押す。第一修正後も長いemail/3列統計が453〜457pxへ押す。全回帰の教材/AI利用データがある状態で324pxの残はみ出し | 親min-width/grid、全文email/所属名折返し、狭幅統計再配置。14日全内容は内部keyboard横scrollを維持。親の全対象grid・カードと、長い教材名/AI action/costの折返しを統一。データがある状態を5幅回帰へ加える。source896a4a03の標準5幅PASS、実ADMIN通常/表示onlyfixtureの2case・10幅sceneでもdocument/body overflow0、全文、14列、フォーカス/ArrowRight/Leftを確認 |
| P2 | root390見出しの最後が単字「ら」、320体験CTAが「登録不要」の途中で折れる | 見出し「今日の単語学習」、CTA意味単位のatomic inline-block。全5幅見出し1行、CTA320/390自然な2行・他幅1行、aria名/フォーカス/5point hit維持 |

## 初期監査で既に修正した導線

`docs/analysis/2026-10-02-ui-ux-audit.md` の実再現とsource別ログを維持する。以下も初期修正に含まれ、今回の標準fullへ登録済みの回帰で再確認する。初期当時の失敗/測定と現在の最終受入を混同しない。

| 優先 | 確認した問題 | 修正・検証 |
|---|---|---|
| P1 | auth401/送信時の画面差替えで入力・位置を失う | 認証初期化と送信を分離、入力保持、連打防止、focus/URL戻る・進む。合成401/遅延と実loginを区別 |
| P1 | 診断保存失敗が結果画面に出ない、quiz取得errorが空教材になる | 結果・条件を保持しerror/empty/loadingを区別、対象別retry。保存成功後だけ完了フラグ |
| P1 | 文法5問のID衝突で未回答問題まで判定する | 設問固有ID、元word/book・保存契約保持。修正前ReactDOM赤→回帰成功 |
| P1 | 講師固定ヘッダーがmobile約428pxを占め、本文操作を隠す | 自然scroll/任意説明化。横向き固定解除、teacher幅/keyboard回帰 |
| P1 | nested印刷Escapeが親子同時closeしbody scroll不可、答案切替に古い応答を表示する | 最上位dialogのclose/focus復帰、対象ID/取得世代とcleanup一致、個別再取得。A→B逆順応答を合成回帰 |
| P2 | 作文の重複説明でselect y4066.5/page7071、未取得が0件表示、完了後の詳細が古い | 重複を減らしタブ/フォーム先行、unknown/error分離、同IDの確定応答で詳細更新。取得失敗/再取得と5幅の計測 |
| P2 | import/scanner送信中に変更・close・二重送信、ラベル未結合、印刷の成功を失敗扱い | 入力保持/操作lock/error focus、label/id/keyboard結合、native印刷リンクとBlob寿命。mock/実UI/OS印刷未実行を区別 |

## 実操作とテストの区別

通常Functions＋元の1531語＋合成D1で、主操作、登録、診断延期、学習保存、再訪、同uid所属付与、専用本人ログイン、担当生徒、他tenant403を操作した。Native coreの既存6は2037dec、学校管理者修正は118690e、最終レイアウト2は2682bbbfで採取。97 served asset checksは3source manifestへ全照合。最後の896aでは実ADMIN通常応答と表示専用合成応答を各5幅で追加2ケース受入、18served資産を新manifestへ照合した。旧nativeケースのsourceは書き換えない。追加Admin通常/表示onlyfixtureは896a4a03で2case・10幅sceneを実行、18資産hash全照合。通常snapshotは実200/教材6/AI行0、表示onlyfixtureは18fields/既存rows保持。ケース/Chrome context終了後に残ったown NodeはPID確認SIGTERM/exit143をcleanupとして記録し、検証結果と区分した。空/503/長文fixtures、controller failure injections、各readiness harnessは合成テストであり、本番障害・実学習者での証明とは扱わない。

標準回帰は通常90秒/retry0を維持し、旧文法主操作・旧正解文言・任意例文なしfixture・旧sticky selectorの期待を新契約へ調整した。保存/receipt/同attempt/次語の非露出/戻るのassertは維持。追加例文は通常batchImportWordsで保存する。環境失敗の推測でアプリ修正は追加しない。初回全11失敗、missing bundled browserの誤起動、第一Admin追加target失敗、exec-server切断による0case中断を証拠として保持し、最後の標準全回帰の結果で判定する。896aの第一全回帰はAdmin全幅を通過したが、4画像下書き保存の15秒status待ちが失敗（Cloud187/IDB9成功）。4PUT204/最終POST200は記録され、同ソース・同assert/90秒/retry0の単独実行は49.9秒でPASS。原因は未確定のまま、第一失敗ログと単独結果を保持して同条件の全回帰を再実行した。最後は同case21.9秒で成功し、Cloud188＋IDB9成功/2preview skip/exit0。app・assert・90秒/15秒expect・retry0は変更していない。

## 明示する限界と次段階

実Chromeの320/390/844横/768/1366、低高320x480等、keyboard/focus/back/reload/遅延/失敗/retry/保存を対象とする。全画面の無スクロールは約束しない。管理一覧/全履歴/グラフの内部scroll、極端な拡大や長い補足は安全に読める余地を残す。横向きroot CTAのhitは通常scroll後の確認であり初期一画面の合格ではない。

実Safari/iOS、物理IME/software keyboard/screen reader、実Chrome200%/400%zoomは未検証。DPR2やCSS reflowを実zoomの代用に数えない。未確認条件を全対応済みとして宣言しない。

呼称「所属生徒」は任意質問未回答に対する暫定採用。実ユーザーdisplayName/role enum/plan/既存所属権限を変更しない。所属付与は既存ADMIN正規経路を維持。7/28日想起、長期復習の本番再参加/日cap/公平性、全原本例文訳、紙/QR/OCR、教室試行は別段階。長期復習の純粋契約75unit/60合成条件は実装済みだがCloud/IDB/due/home/mission/SRS保存へ未接続。原本全1530既存例文の訳が完成したとは扱わない（実補完はactually1のみ）。

公開後4件のpush/PR作成は自動承認レビューが当初の公開禁止を理由に拒否したため未実行。本人の明示許可待ちで、統合候補・SRS候補もローカル保全のみ。

## 最終ローカル受入（2026-10-07）

アプリ受入source `896a4a031138e8fa85d8544cf5202a3a4220e8b2`、branch `codex/medace-student-entry-20261007`。型/199files2045unit/build成功。標準全browserはCloud188PASS＋preview専用2SKIP、IDB9PASS、90秒/retry0/worker1、command exit0。構成/到達性、API・認可と保存、58migration、security例外1件は証拠sourceを区別し保持する。実nativeはsourceごとの7core＋2layout（97資産hash照合）を保持し、最終Adminの通常応答/表示onlyfixture 2case・10幅scene・18資産hash照合を追加。詳細は[確認問題と受入](./2026-10-07-integrated-ui-acceptance.md)。

根本のrole/RBAC/tenant/plan/原本/保存を維持。TOB_FREEの正規GROUP_ADMINをWriting任意取得403で全体errorにするUI不具合と、Admin mobile横はみ出しを追加修正。最終通常入口は生徒のみ、CTA「登録不要」は途中折れを避ける。実Safari/iOS/IME/実zoomは未検証。公開は未実行、最初の公開禁止によりpush/PRが自動レビューで拒否されたため明示許可待ち。長期復習0ae54239は独立の未接続契約であり、B1の本番再参加は未実装。
