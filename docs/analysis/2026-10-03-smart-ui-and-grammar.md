# ホーム整理・章別学習・文法問題の非公開候補（2026-10-03）

本人の「要素が多くごちゃごちゃする」「文法問題の量と品質も上げたい」という指示に基づく候補。元repo、既存dirty、公開版、実生徒データを保持し、独立branch `codex/medace-chapter-study-20261003` / `/tmp/medace-chapter-study-20261003` で実装した。本変更はまだ公開していない。

## 実装の範囲と削減理由

| 画面 | 確認した重複・問題 | 今回の実装 |
|---|---|---|
| 生徒ホーム | 大きなhero、今日の進捗、3集計、文法案内、3shortcut、rail CTA、全reference、mobile launcherが重なる | 主操作はhero一つ。今日/期限が来た復習は短い行へ統合。3shortcutとmobile launcherを削除。教材・記録は一つのnav、低頻度機能はその他。選択したreferenceだけをmount |
| 課題 | heroと別cardの実行入口が重なる | 詳細はsummaryから開く。期限・期限超過・状態は閉じたsummaryにも表示。heroの期限metricも保持 |
| カード学習 | 語義より原本補足と大きいヒント案内が目立つ。例文も一括補助扱い | 語義と登録済み例文を中心へ。補足/出典と追加ヒントを補助へ移動。背面全体をscrollでき長い語義も確認可能。生成待ち/hold/失敗と回答保存エラーは見える位置へ |
| 講師ホーム | 先頭生徒hero・集計4枚・同じ生徒一覧・準備shortcut・提出一覧が重なる | 対応が必要な生徒、提出・返却の2領域へ。全生徒・印刷・教材は既存tab。未取得と0、期限超過と安全な生徒を区別 |
| Naru学習 | 一冊全体だけで進め方が不明 | 教材内の学習入口に章/新出/期限が来た復習を追加。ホームcardは増やさない。10語ずつで保存・スペル5問・戻るにも章範囲を維持 |
| 文法 | 文脈のないfallbackが複数正答・不自然な英文・単元不一致を生成する | 独自64本文を26単元へ追加。1問→理由→次問、固有の誤答理由と別語順を対応。語彙が取得できなくても独立して学べる |

全機能の利用頻度は実利用計測ではなく、実コードの役割と重複から判断した。[要素棚卸し](./2026-10-03-ui-information-architecture.md)にkeep/merge/主導線から移す理由を記録している。保存未確定・失敗・期日を情報量削減の対象にはしていない。

## データ・移行・公開への影響

- 章範囲は既存 `word_number` と履歴を利用する。今回のUI/章統計/文法bankの追加migrationはない。
- 統合元には非公開の小テストreceipt候補 `6225bc3` が含まれる。将来公開時にはその追加migration `0044` と既存必須CI・preview検証が必要。今回のUIだけ公開済みと数えない。
- 既存の範囲なしSRS選択を維持。章範囲/新 `BOOK_DUE_ONLY` はカード学習の有効な履歴だけで新出と復習を数える。取得失敗を0表示へ変換しない。
- 認可・教材品質・権利承認のserver gateを維持。mission/daily/smartに章範囲を混ぜた要求は拒否。
- 文法の本文固有IDは端末内の記録のみ。serverには既存の単元/level/答案記録を送り、実在しない単語/教材IDを作らない。Cloudで本文IDの永続化・全端末同一問題履歴を保証していない。
- 新bankは64の独立本文（穴埋め/語順の二形式）。独立reviewは64受入・保留0。C2の追加は0。旧Quiz/印刷fallbackへの接続・全旧問題の品質修復まで完了とは数えない。[内容監査](./2026-10-03-grammar-content-expansion.md)、[独立レビュー](./2026-10-03-grammar-content-review.md)を参照。
- Naru原本1530件の和訳未登録を補完したとはしない。原本英例文を表示し、実際の和訳がある場合だけ訳ボタンを出す。語義を例文和訳と呼ばない。

## 公開後に見つけた一冊のaccess scope不整合

旧import generatorと既存投入SQLは `access_scope='PUBLIC'`。現行enumは `ALL_PLANS` / `BUSINESS_ONLY` のため、一般TOC_FREEではNaruが非表示になる。公開workflow/HTML/全原本照合の成功だけで通常生徒の利用を証明していなかった。

2026-10-03 11:59 UTCに本番の当該一冊のmetadataとledger承認状態だけをread-onlyで再確認した。`access_scope=PUBLIC`、1530語、rights/reviewはapproved、revisionは上記原本一致。D1結果はrows_read=2 / rows_written=0 / changed_db=false。現行client/server共通のアクセス判定は、この値でTOC_FREE・TOC_PAID・TOB_FREEを拒否しTOB_PAIDのみ許す（admin/作成者の既存別権限は維持）。期待値ALL_PLANSへの変更はこれら三プランへの利用対象拡大であり、一般生徒の利用まで含めた「一冊公開済み」という既報は訂正した。これは修復前の読取記録。下記の本人承認後の別操作で修復を完了した。

今回generatorの新規出力を `ALL_PLANS` へ修正した。実SQLiteの承認済みbookからclient/serverの実アクセス判定を通し、TOC_FREE true、BUSINESS_ONLY free false・TOB_PAID trueを確認。既存PUBLIC行に新stage/approval/readbackを当てると引き続きfail closedであり、一般aliasや既存教材を開くmigrationは追加していない。

本人が一般無料・有料・法人無料にも当該一冊を開放すると明示承認したため、helper commit `606a8846c1db3d9811053d6b8cee564aaf4e804b` から厳密な7table preflightと衝突チェックを行い、2026-10-03 12:46 UTCに本番の当該一冊の `access_scope` だけを `ALL_PLANS` に変更した。更新直前bookmarkと一列だけのguard付きrollbackを保存。直後の7table全列比較はscope以外完全一致、既存教材・学習履歴・receipt・interaction件数は保持、FK0。旧private SQL/manifestは上書きしていない。

本番TOC_FREEの実画面は対象一覧/1530語取得/10語session/表面・裏面を確認し、回答保存0、横溢れ0、pageerror0。残り3プランの本番資格情報は使用していない。公開e88コードと検証済み修復後教材を使った合成ローカル4プラン認証HTTPは全成功し、BUSINESS_ONLYはTOB_PAIDのみ許可、未承認は全プラン拒否。

出典を見せなくてよいという本人指示は非公開UI候補のNaru生徒画面だけに反映。内部原本のシート/ID/座標/監査情報は保持し、活用・学習用注記は表示する。他教材の出典は維持。原本4点・document properties・承認ledgerに明示必須creditは見つからなかった。本番のUI表示変更や候補deployはしていない。

## 検証状況

- 従来receipt候補は同一sourceの935unit・34SQLite・独立70と126local browser成功を再利用。preview限定の2skipは新規skipではない。
- 統合候補: migration再生、到達性、依存境界、型、最終143files/1069unit、build、local API回帰成功。追加修復helper後の最終runは1063成功とsandbox内HTTP6件EPERM、許可された同一sourceの該当6件再実行で6成功。sandbox内のlocalhost待受EPERMは許可されたlocal実行で解消。
- UI最終差分: setupのinvalid選択解除を抑止、長い語義も背面scroll対象、回答評価の文字色を可読性向上。追加38focused成功、build成功。
- 実操作で見つけた日目標40語/一回20語の混同は、目標残数と一回上限を別の文に修正。章のスペル5問は選択範囲を表示し、終了・条件変更は章選択へ戻す。部分取得5語を別章へclampする設定画面を出さない。保存待ち・失敗は同じattemptを保持し、退出を拒否。終了確認は共通ModalOverlayでfocus/Escapeを対応。
- 参考panelの再選択時にfocusが漏れる分岐を修正。英作文の未取得は読込中/未取得で表示し、初回失敗と取得後の空を区別。取得専用errorは成功retryで解除し、提出noticeとdraftは保持。
- これら最終差分後の `verify:fast` は145files/1082unit、migration再生、到達性、依存境界、型の全工程成功。最終Cloud buildも成功。
- 出典表示の差分後は146files/1085unit・型・Cloud build成功。原本を表示で改変しないこと、他教材の出典を隠さないことも検証。
- 同一初期fixtureのbefore/afterは14場面28画像。320/390/横向き/tablet/desktop・keyboard・失敗/retry・章保存/再訪・講師5tab・作文再試行を実確認。PC生徒ホームは3753→952px、全体操作27→11。この比較はed11952版。最終候補39373c7のNaru表面/通常裏面/補足展開/教材一覧16画像は別に撮り直し、5サイズで横溢れ0、出典非表示・補足表示、1530語の取得内容が前後同一を確認した。撮影は裏返しアニメーション終了を待つ。
- Chrome再crashの報告で一度中断し、親の更新確認後に154.0.8037.98・一台/worker1で再開した。中断logは履歴として保持。runnerも中断exit130/143で次suiteを起動しないよう修正し、型/関連20unit成功。
- 新しい導線に対して旧常時表示・旧文言を期待するsmokeを整えた。アプリをtestの旧挙動へ戻さず、保存未確認時の退出拒否、原本表示を含む現在地、その他の入口、作文の過去結果への入口を検証する。
- 凍結アプリsourceの最終全回帰はCloud119登録、114成功/3旧期待値・タイミング差/2既存preview-only skip。アプリruntime不変で失敗3件だけ再確認し全成功（商用/作文2件、その後demoの戻り1件）。Cloud unique117＋IDB9＝126 local browser成功。新skipは0。preview限定2件は将来の配備gateで必要。
- 型・146files/1085unit・到達性・306source依存境界・Cloud build成功。backend不変のAPI回帰と145files/1082unit verify:fastのmigration再生も有効。最終私有UI確認は5幅、pageerror0、回答保存0。専用Chrome・41938/41978は正常終了し非待受。更新後の検証中に新crashは確認しなかったが、Mac全体の長期安定性の証明とはしない。

UI候補の本番merge/push/配備・外部通知・課金・実生徒データの変更を行っていない。本番データ修復は承認されたNaru一冊のaccess_scopeのみ。
