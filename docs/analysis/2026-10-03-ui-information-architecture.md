# 生徒ホーム・単語学習の情報設計 — 2026-10-03

本人の最新要望: 「要素が多くごちゃごちゃ」「機能そのものをスマートに」「文法問題の量・質も上げる」。対象は `/tmp/medace-chapter-study-20261003`、開始HEAD `83ca5313717e6574d2d374331c5540d356e0b8f4` に章選択等の進行中差分がある状態。既存差分は統合担当の成果。本担当の変更は本書のみ。

本書はソースからの棚卸しと具体的な実装案である。Chrome、build、network、本番、実利用率の取得は実施していない。表示頻度は用途からの想定であり、利用実績ではない。PC/mobileのbefore/afterは統合担当が記録する。原本・認可・SRS・mission・回答保存の契約は変更対象にしない。

## 判断

ホームの課題は個々のカードの大きさだけでなく、同じ目的に対する入口と説明が複数の階層へ分かれていること。核を **単語を学ぶ / 文法を解く** とし、期日のある提出・課題を優先行動として扱う。記録・教材の管理・設定・任意のゲーム要素は必要時に開く。

「低価値」は利用者が使っていないという意味ではなく、この二つの主行動の前に表示する必要が薄いという判断。機能や保存データは消さず、入口の統合と表示位置の変更を行う。折り畳みを追加するだけでは、見出し・枠・入口・説明の総数が減らない。

## 機能棚卸し

| 機能 | 分類 / 対象role | 想定頻度 | 判断と配置 |
| --- | --- | --- | --- |
| 今日の単語、新出、期限復習 | 核 / 生徒 | 毎回 | 主行動。既存commandを使い、未取得・0・期限前を区別 |
| 教材内の品詞・章選択 | 核の条件 / 生徒 | 教材開始時 | 「学習する」の既存導線内で選ぶ。homeへ大型章カードを追加しない |
| 文法穴埋め・語順 | 核 / 生徒、紙教材は講師 | 毎回〜数回/週 | homeに安定した文法入口。範囲・形式・量は文法画面内で設定 |
| 語彙の小テスト、意味方向、スペル | 確認 / 生徒 | 学習後・数回/週 | 教材の学習内または完了後。home専用3カードの一つとして重ねない |
| 原本の語義・英例文・品詞・発音 | 核の教材 / 生徒 | 各カード | 答え確認時の中心情報。AIの補助と一緒に隠さない |
| 原本の活用・注記・出典 | 根拠 / 生徒、講師 | 必要時 | 「原本の補足」一入口へ集約。注記と出典を失わせない |
| 読み上げ、例文訳表示 | 補助 / 生徒 | 必要時 | 単語/例文に隣接する小操作。訳未収録を生成訳・原本訳と混同しない |
| AI例文・画像ヒント、再生成 | 補助 / 利用条件を満たす生徒/所有者 | 必要時 | 補助操作内へ。自動生成しない。確認中・失敗・非承認は明示 |
| 和訳・長文・英検作文練習 | 応用 / 生徒 | 数回/週〜任意 | 演習画面内で選ぶ。4laneの説明カードをhomeへ並べない |
| Writingの課題・提出・返却 | 必須運用 / 生徒、講師 | 配布・返却時 | 期限/未提出/返却ありをhomeへ残す。任意の英検作文練習と名称・導線を分ける |
| 週次missionと進捗 | 必須運用 / 生徒、講師、管理者 | 課題期間中 | 期日・残作業を短く表示。primaryに選ばれた場合の開始ボタンは一つ |
| 講師通知・フォロー | 条件付き / 生徒、講師 | 通知時 | 未読/行動待ちだけhomeで目立たせる。履歴は課題/通知画面へ |
| 弱点診断・弱点演習 | 補助 / 生徒、講師 | データ蓄積後 | 文法/復習の条件に統合。母数不足を弱点0と表示しない |
| 教材一覧・検索・配布教材/My単語帳 | 管理＋教材開始 / 生徒、講師 | 教材変更時 | 教材入口を一つに統合。初回教材なしは主行動へ昇格 |
| My単語帳作成、文字/PDF/写真取込、削除 | 管理 / 生徒/所有者 | 初回・追加時 | 教材画面へ。開始と削除を同等に目立たせない |
| 学習プラン作成/編集、目標・利用条件 | 設定 / 生徒 | 初回・調整時 | 設定へ集約。プラン作成が学習の必須前提になるような説明を避ける |
| 今日の量、週間記録、定着分布 | 状態＋記録 / 生徒、講師 | home確認・振返り時 | 今日の量はhomeで一回、詳細は記録。自己評価/定着/正答を同一視しない |
| XP・リーグ・ランキング | 任意 / ゲームmode生徒 | 任意 | 記録/ゲームへ。主行動に必要な期日・保存状態より目立たせない |
| companion、やる気board | 任意 / 対応mode生徒 | 任意 | ゲーム/記録に残す。追加「今日を始める」CTAをhomeから除く |
| 再診断、表示密度/文字サイズ、学年・目標 | 設定 / 生徒 | 調整時 | 設定の一箇所へ。CEFR・学年を毎回の大きなbadgeで繰り返さない |
| AI予算・subscription・商用申込 | アカウント / 生徒、管理者 | 必要時 | アカウントへ。必要な利用制限は対象操作時に明示 |
| お知らせ | 条件付き / 全role | 更新時 | 要確認のものを通知へ。重要なacknowledgementの保証は維持 |
| 担当生徒・フォロー・作文添削/返却・プリント | 核の教室運用 / 講師 | 日々〜週次 | 講師workspaceに残す。生徒homeを講師の操作体系へ合わせない |
| 担当割当・講師負荷・cohort・設定/監査 | 組織運用 / 管理者 | 導入・週次・変更時 | 管理者workspaceへ。今回の2画面へ追加しない |
| 教材import・出典/品質・AI監査・費用/商用運用 | システム運用 / system admin | 配信・監査時 | adminの既存境界を維持。学習画面に実装用語や運用チェックを並べない |
| onboarding診断・認証/回復・public案内 | 導入 / 対象role | 初回・再設定時 | 現行の独立導線を維持。home整理のためにログインや回復を増やさない |

根拠は [App](../../App.tsx)、[dashboard command](../../shared/studentDashboardCommand.ts)、[view model](../../hooks/useStudentDashboardViewModel.ts)、[workspace構成](../../config/workspace.ts)、[英語演習](../../components/practice/EnglishPracticeHub.tsx)、[教材カード](../../components/dashboard/BookCard.tsx)、[StudyMode](../../components/StudyMode.tsx)、[原本情報](../../components/study/WordSourceDetails.tsx)、[admin](../../components/AdminPanel.tsx)。機能一覧は主なUI/用途単位で、全API数を数えたものではない。

## 現行JSXの問題箇所

[Dashboard](../../components/Dashboard.tsx) 自体は取得・command・modal・practice分岐を持ち、表示階層は [StudentDashboardSections](../../components/dashboard/StudentDashboardSections.tsx) が組み立てる。現在の通常homeは以下の順序。

1. 挨拶、LEARNING HOME、スローガン。
2. Hero: task見出し、学年/CEFR/リーグ、YOUR NEXT STEP、説明、開始、プラン、3metrics、今日の量とprogress、演習dock。
3. [StudyShortcuts](../../components/dashboard/DashboardStudyShortcuts.tsx): 小テスト、教材、記録の3カード。
4. workspace: 課題/講師/弱点/作文のsection群と、[TaskOverviewRail](../../components/dashboard/DashboardTaskOverviewRail.tsx) の次行動＋reference入口。
5. referenceSections: 計画、教材、記録、やる気、companion、アカウント、お知らせ等。
6. mobileのみprimary/文脈行動/教材の固定ナビ。

TaskOverviewRailには既に `showPrimaryAction=false` が渡るため、「rail内でも必ずprimaryを重複表示している」とはしない。Heroのpracticeがprimaryならpractice dockの開始も既に抑止される。一方、課題や講師通知の詳細sectionは独自の開始CTAを持つため、Heroが同じcommandを選んだときは重複する。

| 重複・無関係な要素 | ソース上の根拠 | 実装する整理 |
| --- | --- | --- |
| 教材入口 | shortcuts、reference rail、mobile、library本体 | 小ナビへ統合。教材本体の開始操作は対象選択として残す |
| 記録入口 | shortcutsとreference rail。今日の量はHeroと記録にも表示 | shortcutの重複カードを除く。homeでは量を一回、記録では履歴を扱う |
| primary開始 | Hero＋primary mission/coach sectionの開始。game companionもtoday command | primaryの実行はHeroへ集約。詳細は期日/条件/履歴の確認へ。別の課題への操作は残す |
| 複数の「次」 | YOUR NEXT STEP、次の学びとサポート、このあとに1つ、課題内の次にやること | primary＋条件付き保留項目に整理。装飾見出しの多重化を除く |
| 文法入口が安定しない | Hero dockは `practiceRecommendation.lane` に従い、文法以外にもなる | 主導線の文法入口を安定させる。おすすめの応用laneは演習内で扱う |
| プランの二重入口・説明 | Heroのプラン操作＋独立Plan section＋rail参照 | 設定一入口へ。標準学習にプラン作成を要求しない |
| 今日の量に対する説明/装飾 | metricsの残り/復習/時間、progress card、鼓舞文、リーグ | 状態を2項目程度に絞り、時間は開始ボタンの短い補足に吸収 |
| スマホだけ異なる機能の露出 | reference account/announcements/companion/motivationにmobile除外条件 | PC/mobileで機能名と到達先を揃える。表示量だけを変える |

## ホームの最小実装案

**初期表示は「今日の主行動」「文法への入口」「必要な課題の状態」「教材/記録/設定の小ナビ」。** Naru専用の大型homeカードは作らない。

- Heroのheaderから英語の装飾ラベル、学年/CEFR/リーグの常設badgeを外す。主見出しは現在のcommandに対応する短い文。理由は一文、primary実行は一つ。
- 状態は「今日 N/G語」と「期限の来た復習 N語」、または課題/提出の期日・未完了を優先する。母数や取得状態は保つ。
- 文法はprimary以外の控えめな一入口にする。primaryが文法の場合は同じ文法ボタンをもう一つ出さない。単語がprimaryでない場合も通常単語学習へ到達できる入口を残す。
- StudyShortcutsの3つの大型カードと、TaskOverviewRailの重複reference群を通常homeから撤去する。代わりに教材/記録/設定の小さな一組を使う。小テストは教材内または学習後に残す。
- urgent/supportingを全種類のカードへ展開せず、未提出・返却・期限・未読フォロー等の実際に行動が必要な項目だけ、タイトル＋期日/状態＋一操作の短い行にする。件数が多い場合は一覧への一入口を残す。
- referenceSectionsを一括で長いページへ積む方式から、選択した教材/記録/設定を一つ表示する方式へ変える。任意game/やる気は記録、プランとaccountは設定へ統合する。
- 固定mobile navは上記の到達先と同じにする。primary開始を固定表示する場合、Heroの同じボタンが見えている間は二重に表示しない。初期表示から2つの開始ボタンを置く必要はない。

実装時の境界: [openDashboardSection](../../components/Dashboard.tsx) は現在mount済みsectionのrefへscrollする。表示するsectionだけmountする設計に変えるなら、選択state→mount→focus/scrollの順を実装し、null refでクリックが無反応にならないようにする。mission OPENEDイベント、既存command、設定modal、通知acknowledgement、対象role/planは維持する。

「課題」がprimaryなら、Heroから作文sectionを開く既存commandを使う。短いhome表示のために別の単語taskへ置き換えない。期限や失敗を省いて「今日も一歩ずつ」だけにする設計は採らない。

## 単語学習の最小実装案

現行Studyは、教材名の行とtask badgeが重なり、裏面に原本補足、全面ヒント開閉、例文の状態/訳/読上げ/再生成、画像の状態/再生成/説明が積まれる。意味を思い出して評価する操作と、教材を増やす操作が同じカード内で競合する。

- headerを「戻る / 教材・選択章 / 進捗」にまとめる。章/新出/期限復習は短い補足にする。book labelと同じ意味のtask badgeを重ねない。
- 表面は英単語、品詞/原本発音、読み上げ、答え確認。巨大な空白や追加の学習説明を核の前に置かない。
- 裏面は語義と、ある場合は原本の英例文。原本例文をAI画像と同じ「難しいときのヒント」の下に一括で隠さない。訳は任意表示、未収録は未収録と示す。
- 原本の活用/注記/出典は「原本の補足」一入口へ。注記を削除しない。意味と例文の間に出典の大型枠を挟まない。
- 例文生成、画像ヒント、再生成、定義編集/問題報告は「補助操作」から対象を選ぶ。原本とAIの区別・監査状態・利用条件を対象操作内で明示する。進行中の操作・失敗・確認待ちは補助を閉じてもカード上の短いstatus/alertでわかるようにし、エラーをメニューの中へ隠さない。
- 保存エラーと同じ回答の再送は評価位置に表示する。裏面の4評価とSRS判定は維持し、編集・保存中のlockを外さない。
- 完了画面は「今回の語数」「保存済み/XP未確認」「同じ章へ戻る」「任意の同章スペル確認」に絞る。一般的な鼓舞文、翌日の説明、弱点説明の3箱を毎回並べる必要はない。章完了や報酬確定を推測しない。

実装時の境界: `showHints` は [controller](../../hooks/useStudyModeController.ts) が原本例文のcontextを読み出す条件にも使う。CSSで画像枠だけ消す、原本例文のJSXだけ移す変更ではcontext未設定のままになりうる。取得/表示契約も確認する。原本があることを理由に生成済み素材の承認gateを迂回しない。

章選択→新出/期限復習→保存→同じ章へ戻る進行中実装は核として維持する。scope、mission、保存receipt、戻り先の契約をUIの整理と同時に弱めない。

## 文法の量・質を上げる作業との接続

homeに追加ボタンを並べることを「問題量の増加」としない。文法入口の先で、対象範囲、実際に使える問題数、1セットの量、継続/復習を一貫して扱う。5問の完了後は同範囲の次の問題へ進め、同じ問題だけを繰り返す場合はその状態を説明する。

文法拡充担当が問題bank・出題・golden setを所有する。確認すべき品質は、正答が一意、許容解答を誤答にしない、語順tokenが成立、英文が自然、解説が対象構文を説明、難度が表示と合うこと。原本訳の補作や未承認AIの公開で問題数だけを増やさない。

英語演習の4laneをhomeで同じ強さに並べる代わりに、文法画面内で穴埋め/語順と範囲を扱い、和訳/長文/作文は演習切替から使えるようにする。Writing課題の提出/返却は別の責務として保持する。

## 受入条件とbefore/after記録

以下はこれからの検証条件であり、本担当が実画面で成功を確認したものではない。

| 対象 | 合成状態・操作 | 受入条件 |
| --- | --- | --- |
| home主行動 | 通常、mission、未提出、返却、通知、教材なし | primary commandと表示が一致。同じcommandの常設primaryCTAは一つ |
| 到達性 | 教材、記録、設定、文法、和訳/長文/作文、ゲーム、通知 | 機能を失わず、入口を一つずつ説明できる。role/plan条件を維持 |
| 表示量 | 同じfixture、1280×800、390×844、844×390、200%zoom | before/afterのスクリーンショット、最初の画面のCTA数/文字数/枠数、全page高を記録。横overflow・被覆なし |
| 操作量 | homeからNaru章選択→開始、homeから文法5問 | click数/開始までの時間を同条件で比較。余計なプラン作成や詳細設定を要求しない |
| 急ぎの状態 | 期限超過/未提出/返却あり/未読通知 | 短縮後も状態・期日・次の行動が読める。低優先表示の下へ埋没しない |
| 取得/保存 | load500、refresh500、保存失敗、commit後応答消失 | 未取得を0にせず、再試行と同じ回答を保持。保存済みと報酬未確認を区別 |
| Study | 表→裏→原本例文/訳→評価→補助→完了 | 意味・例文・評価が中心。補助へ移した編集/報告/生成に到達できる |
| 支援操作 | keyboard、focus、スマホキーボード、読み上げ | 新panelのmount後focus、隠れたカードへのfocus侵入、固定barの干渉を確認 |
| 回帰 | mission/coach/weakness、他教材、章外、同章スペル | UIの簡素化でtask scope・保存・認可・SRS・missionを変えない |

削減目標は、初期homeからStudyShortcutsの3カードと重複reference railを実際に外し、主操作に関係しない常設装飾/説明を減らすこと。単に折り畳みへ移しただけ、fontを小さくしただけ、heroの位置を変えただけでは完了にしない。数値の改善率はbefore測定後に記載する。

同じfixtureと対象SHAで比較し、ローカルUI検証、preview、本番、利用者到達を別に記録する。現時点の本番は公開済み一冊版を維持し、章学習・quiz receipt・情報設計の統合候補を公開済みと数えない。


## 講師ホームの最小整理（実装済み・ローカル）

[講師概要](../../components/dashboard/InstructorDashboardSections.tsx) の初期表示を「対応が必要な生徒」「提出・返却」の2枠にした。[見出し](../../components/InstructorDashboard.tsx) も今日の対応を直接示す文言へ変更した。実画面の改善率や利用頻度の実測ではなく、以下はソース上の重複を根拠にした整理である。

| 旧要素 | 実装での扱い | 根拠・残した到達先 |
| --- | --- | --- |
| 先頭の生徒を扱う大きなフォロー枠＋同じ生徒を含む一覧 | 対応が必要な生徒の行へ統合 | 同じ名前と提案が二重に現れていた。各行から状況確認・通知文作成が可能 |
| 担当数・即時フォロー数・添削数・再提出数の4カード | 関連する2枠の短い数値へ統合 | 状態の数値を保持しながら、対応先と離れた集計枠を除去 |
| 全生徒の先頭4名を初期表示 | 既存判定で即時対応が必要な最大4名のみ | 安定・様子見・再開の記録は生徒一覧に残す。全件への入口を常設し、5名以上なら対応総数を文言に示す |
| 小テスト・課題を準備する枠と2ショートカット | 概要から削除 | 既存「プリント」「英作文」タブで到達できる同じ機能。準備作業を返却待ちと同じ優先度で重複表示しない |
| 提出への返却枠＋集計カード＋英作文ショートカット | 提出・返却の1枠へ統合 | 待ち件数、上位3提出、提出日時、添削・返却への入口をまとめる |

境界は [既存の対応判定](../../shared/retention.ts) と [controller](../../hooks/useInstructorDashboardController.ts) のまま。担当／閲覧可能の表示範囲切替を維持し、選択行の詳細操作は検索とfilterを解除して該当生徒を選ぶ。通知操作は既存composerを開く。権限・取得・送信APIを変更していない。STUDENTS／WRITING／WORKSHEETS／CATALOGの実機能も変更していない。

生徒、課題、提出queueの取得確認は個別に扱う。未取得を0件にせず、初回読込・未取得・確認済み空を区別する。上部の既存error／再取得経路を保持した。SAFE判定の生徒でも課題期限超過なら対応一覧に含め、超過ラベルをリスクラベルより優先表示する。取得済みのmission期限を明示し、提出日時が不正・未取得なら「提出日時未取得」と表示する。Writing queueには期限フィールドがないため、提出日時を期限と見せない。

検証: [sectionsテスト](../../tests/instructor-dashboard-sections.test.tsx)、既存controller・resourceテストの3ファイル25件成功。対応生徒の重複除去、安定生徒の一覧経路、SAFE＋期限超過、部分取得、4名上限と全件経路、行の詳細／composer呼び出しと表示scope維持、初回読込／未取得／確認済み0を確認した。変更した講師2コンポーネントとsectionsテストを入口にした依存グラフのfocused TypeScript確認、差分空白チェックも成功。

Chromeを使用しておらず、PC／mobile／zoomの実描画、keyboard focus、before／afterの高さ・操作時間は未検証。公開・データ変更・migrationはなく、ローカル統合候補のみ。親担当のブラウザ検証とコードレビュー後に公開判断へ進める。


## 新ホーム構造に合わせたsmoke契約の更新（テスト編集のみ）

旧mobile quick nav、常設の全reference内容、右railの幅を前提にしたsmokeを更新した。初期表示はhero主CTAと教材／記録のcompact nav、参考情報は選んだ1panelのみ、急ぎのtaskは閉じたsummaryにも状態・期限を残す契約を扱う。新skipは追加せず、学習・文法・教材quiz、mission進捗、講師通知経由学習、印刷・生徒一覧への既存到達保証を維持した。

更新範囲は [student](../../tests/smoke/student.smoke.spec.ts)、[mobile](../../tests/smoke/mobile.smoke.spec.ts)、[dashboard recovery](../../tests/smoke/dashboard-recovery.smoke.spec.ts)、[organization](../../tests/smoke/organization.smoke.spec.ts)、[UI audit](../../tests/smoke/ui-audit.smoke.spec.ts)、[共有helper](../../tests/smoke/smoke-support.ts)。[Study reliability](../../tests/smoke/study-reliability.smoke.spec.ts) と [quiz receipts](../../tests/smoke/quiz-receipts.smoke.spec.ts) はfixture準備時の教材入口だけを変更し、保存失敗、再試行、attempt、receiptの検証を変更していない。grammar isolation・IDB・Study保存hook・quiz controllerは他担当の所有として変更していない。

追加した観点は、初期参考panel未mount、選択panelのfocus、教材から記録へ切替時の前内容unmount、Escape／閉じる後の入口focus復帰、その他menu自身のEscape、その他から開いたpanelを閉じた後のsummary復帰。missionは取得した期日と一致するsummaryを閉じた状態でも表示し、heroから開始した既存の進捗変化を確認する。weaknessは信号がない時の参考入口と、学習後のsupport details入口を分けて操作する。講師概要は2枠・scope切替を確認し、印刷と生徒一覧への到達を残す。

その他menuを閉じてから選択panelを開く場合、復帰先が閉じたdetails内のhidden buttonになる危険をソースで発見し、親のUI担当へ報告した。教材／記録は元のbutton、その他はmenu summaryへ復帰する期待をテストに残す。

この担当はテストを実行していない。8ファイルのTypeScript構文parseと差分空白チェックのみ成功。標準Playwright runner、実描画・focus結果、API fixtureの回帰は親担当が統合候補で実行する。構文成功をbrowser成功や公開済みと扱わない。


## 講師の重複route入口の追加整理

親のafter実画面確認で、Layout上段の5作業入口と講師本文の5ボタンが重複していることが判明した。2枠化だけでは操作数が減らないため、[InstructorDashboard](../../components/InstructorDashboard.tsx) の本文「講師の作業」navと専用VIEWS配列・icon importを削除した。巨大なborder付きheaderも、見出し・教室名・1行説明・更新・最終取得へ圧縮した。未取得／更新中／取得エラー／再試行の処理は保持する。

削除前に [workspace config](../../config/workspace.ts)、[App](../../App.tsx)、[Layout](../../components/Layout.tsx)、[role route guard](../../hooks/useAppNavigation.ts) を確認した。講師のOVERVIEW／STUDENTS／WRITING／WORKSHEETS／CATALOGをLayoutが全て持ち、workspace-tab操作も本文onChangeViewも同じsetInstructorWorkspaceViewに到達する。group-adminは別配列・別setterであり変更しない。学習中のLayout側ホームへ戻る経路も変更しない。

[teacher UI smoke](../../tests/smoke/ui-audit.smoke.spec.ts) の本文label依存2操作をworkspace-tabへ置き換え、重複navがないこと、5ビュー全てへの到達とactive state、更新操作の表示を確認する内容にした。保存・通知・教材・印刷の既存実操作assertを変更していない。InstructorDashboardと当該smokeを入口にしたfocused TypeScript確認と差分空白チェックは成功。実ブラウザ・操作数の再測定・buildは親担当のfreeze後に実施する。
