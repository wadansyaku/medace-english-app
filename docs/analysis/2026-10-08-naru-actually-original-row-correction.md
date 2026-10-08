# Naru actuallyの原本行対応訂正候補

本人の「G80に実際にはと書いてあった。これをもとに色々直して。Excelの方を直して良い。」という指示を受け、取り込み時と同一SHAの原本と本人の提示画像を照合した。実セルはF80=forward/G80=前へ、F81=文副詞/G81=実際には、F82=actually/G82空欄/H82=Actually, I don't like tomatoes.で一致した。G82の同一行の訳は空欄だったが、訳自体は隣接する見出し行に存在した。以前の「原本に訳が存在しなかった」という説明は訂正する。

## Excelと原本の保持

原本 `adverb_list.xlsx` の「副詞一覧」G81の「実際には」をG82へ移し、G81を空欄にした別ファイルを作成した。本人の許可はこの限定した行対応修正の根拠とし、添付画像そのものを新たな権限として扱わない。

| セル | 前 | 後 |
|---|---|---|
| G81 | 実際には | 空欄 |
| G82 | 空欄 | 実際には |

旧SHA256は `78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a`。修正版SHA256は `3688952cc169cb72e3bea169dce3b02f6942c10ab5755b071ff9fbef56525205`。

Spreadsheet skillのArtifact Toolで値を編集し、元のZIP構造へ対象セルだけを保存した。保存後の独立XML照合でも差はG81/G82の2セルだけ。書式・黄色の出題印・英単語・原本例文・数式を保持し、他の9部品はバイト単位で一致した。結合セルはない。原本と編集前バックアップは保持。修正前後の範囲を描画し、保存後に再読した。Microsoft Excelでの再開は未確認。

修正版と比較表はLibraryへ納品済み。修正版 `libfile_d854e2e5a7a48191bc32f65dc478a9dc`、比較 `libfile_010b65f6a3b88191867f990a9d1b2ec5`。

## 語数と既存ID

2026-10-08 12:05:34UTCに本番を5つのSELECTだけで照合した。Naruは1,531語、IDと語番号も各1,531、原本出典entry/linkも各1,531。旧原本の1,530語と0057で公開済みのactually1語を組み合わせた全件対応に不一致はなかった。SELECTの書き込み0、changed_db=false。

actuallyのNaru本文は1件だけで、IDは `workbook-adverb-78d0c45fcee4cbad-1cd1b7394ebb7f13dbc9`、番号1361。ExcelのA4は索引でF82が本文のため、2語として数えない。他の14教材にも同見出しがあるが、別教材の語でありNaruの重複ではない。

修正版を既存parserで読み取った結果も1,531語・actually本文1件・保留0件。動詞353、名詞932、副詞87、形容詞159で、語数や番号を変える必要はない。

ただし通常の再importは新SHAをwordIDへ使うため、副詞87語のIDを変える。既存ID・学習履歴を保持するため、通常の再importや旧SHAの上書きを行わず、訂正原本を追加の出典・訂正台帳で既存actuallyへ結ぶ候補を実装した。旧原本archive、旧payload、0057の辞書補完台帳、既存source linkと638の出題済み印は歴史として保持する。新訂正entryだけが追加され、出典entryは1,532、linkは1,531のまま。台帳件数増は語数増を意味しない。

## 語義と例文訳の区別

原本由来のactuallyの訳は「実際には」。以前にアプリが補った「実は、実際には（予想と違う事実・訂正）」「実際に、本当に（事実の強調）」を原本に存在した訳として扱わない。訂正metadataはpreviousAppDefinition、originalWorkbookDefinition（旧G82空欄）、definition（新G82）を区別する。既存の日本語例文訳は「例文訳のみ：アプリ補完」と表示し、原本H82にある英例文と区別する。

parserは「本文の語義が空欄で、直前の分類見出し行に日本語訳が存在する」場合だけORPHAN_DEFINITION_ON_SECTIONを報告し、セルとsourceKeyを提示する。通常importでは自動で行をずらしたり、辞書補完へ進んだりしない。今回の明示修正版は二セル・原本SHA・他の値/書式・原本英例文・87副詞を照合する限定CLIで受け入れる。

## 候補の検証と公開状態

Excelの保持・実セル・再取り込み解析・既存本番の読み取り照合は完了。独立Wrangler/workerd D1で実四原本の公開済み状態と合成履歴を作り、実修正版Excelから生成したsource/apply SQLを適用した。1,531件のID・番号1361・638印・旧出典/補完/履歴の保持、FK違反0、再実行の同値性を確認した。tracked0059をstageした後の明示applyも、実Excel CLIと同じ結果になった。

D1の式深度100制限で初回preflightが失敗したため、条件を減らさずAND/ORを平衡化した。実workerdでbefore/pending/afterを実行し、独立D1のafter guest guardもvalid=1。101条件の非平衡式が実制限で拒否される対照も確認した。出典・原本行・本文・台帳・承認・linkを後から変更すると永続的に失効し、旗だけの復帰や再applyで承認を回復しない。

全unit206files/2,130件、型、59 migration replay、到達性/依存境界、build、標準合成D1 API、security gateは成功。初回全unitの旧migration件数58の固定assertだけが失敗し、0059を含む59件へ更新した後、全2,130件が成功した。securityの既存xlsxローカルQA例外1件は変更していない。標準全browserはCloudflare240＋IDB9＝249件成功、配備先専用2件はローカルではskip、retry0。旧注記5幅と新しい例文訳だけの補完注記5幅も成功した。

実修正版Excelを適用した専用D1/APIをmockせずMac Chromeで操作し、320/390/844横向き/768tablet/1366PCの5幅で反転・任意の例文訳開示・次語・再読込み・端末ID保持・再学習を確認。page/console error、横はみ出し、検証操作によるbackend mutationは0。原本訳と補完注記が分かれた画像10枚を保存した。hard reloadでは既存の範囲設定stateが初期化されるため、再学習時は副詞/1361を明示選択した。実Safari/iPhone・物理スピーカー・支援技術は未確認。候補SHA・差分と個別証拠は独立deliveryの最終引継ぎを参照する。

今回の新しいpush・PR・merge・本番反映は行わない。基点は公開済みmain `1425152cf323bf1c254f1d67347ec747bb7afb78`。以前の公開禁止の解除とは別に、今回の明示されたローカル候補までという範囲を守る。

## 後続公開で必要な適用順序

通常workflowはmigrationをPages配備より先に実行する。旧コードは以前のアプリ補完本文だけを許可するため、0059内で先に訳を変えると、その間guest APIが503になる。0059はDDL・固定証拠・訂正出典stageだけとし、語義適用を分けた。旧コードを独立42783で起動して、stage後もguest APIが200・1,531語・638印・旧補完本文を返すことを確認済み。

後続の公開承認時は通常PR/CI/preview/production gateを通し、環境ごとに次の順序を実行する。今回この工程は実行していない。

1. 0059でschema/evidence/sourceだけをstageする。訂正台帳0件・既存本文/638印/履歴の保持を確認する。
2. 訂正対応Pagesを配備し、期待するcommitとassetsの到達、旧データを返すguest APIを確認する。
3. 同じ環境で固定proofのbefore preflight eligible=1を確認してから、明示apply.sqlを通常Actionsのreview済み工程で適用する。
4. after guard=1、訂正台帳applied_at>0/失効0、1,531語/638印/ID1361/1,532出典entryとguest取得・本人保存の再送を照合する。0行適用は訂正成功と扱わない。

stageのみなら旧コードへrollback可能。apply後は訂正対応コードをrollbackの下限とし、1425152へのコード単独rollbackは行わない。旧原本/0057/訂正履歴を削除せず、互換コードへのforward fixを優先する。本番bookmarkへの復元は以後の全利用者書込みも巻き戻すため、通常のコードrollbackとは分けて判断する。post-code applyのActions工程・preview/production到達は、後続公開の未実施項目として引き継ぐ。

## 作者への説明案

副詞一覧のactuallyの訳「実際には」が、一行上の見出し行に入っていました。actuallyと同じ行へ訳を移し、英単語・例文・黄色の出題印はそのままにしました。語数は1,531語のままです。こちらの以前の「訳がなかったため補った」という説明は、訳の行位置を正しく捉えていませんでした。アプリも原本の訳と出典へ整合する候補を準備しています。

説明文案のみで、LINEなどへの送信はしていない。

## 本人承認後の公開工程

後続の本人指示「本番アプリと教材データにも適用してよい」により、保存候補18767dfの通常公開を開始した。上の未公開記述は初回保存時点の状態である。訂正以外の機能、権限、AI設定へ範囲を広げない。0059のstageを維持し、Pages配備と既存deployed smokeの後で固定canonical helperをActionsから実行する。

helperはruntime SHAだけに依存せず、当該buildのHTML entry asset集合・各JS/CSS byte SHA256と、訂正対応guest route固有のX-Naru-Source-Correctionを照合する。その後before guardと集計を読み、適用直前にも到達を再確認する。新規applyはSQLのRETURNINGで当該実行が固定訂正IDを1件挿入したことを要求し、0件・失効・after不一致・件数減少は失敗とする。検証済み既適用は書込みせず再検証する。preview/prodのreceiptは個人情報を含めず別artifactへ保存する。

## 公開前レビュー3件の追加受入

PR63のレビューで、失効時の補完訳由来ラベル消失、4出典表のno-op UPDATEによる永久失効、共有preview D1の並行applyを確認した。0059を変更せず追加0060で由来と失効を分け、実変更だけを失効させる。guestの失効gate、訂正履歴、承認境界は維持する。preview workflowは共有D1の固定concurrency group・cancel-in-progress:falseへ変更し、異なるbranchの適用を直列化する。0件applyをAPPLIED扱いするhelper契約は維持し、切替前の旧branch group実行が終了したことを確認してから新workflowを実行する。
