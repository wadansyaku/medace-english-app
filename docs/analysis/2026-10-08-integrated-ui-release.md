# 2026-10-08 統合UI・公開後修正の公開候補

本人の直接指示により公開禁止を解除し、以降も過去の禁止を通常の公開依頼へ再適用しない。公開先は本人の既存公開repo `wadansyaku/medace-english-app`、配備経路は既存GitHub Actions。元repo・前回保全版・動画用runtime41812を保持した独立cloneで作業した。

## 最終追加修正

無料の学校管理者で未取得の作文を「0件」「返却率0%」と表示し、対象外画面から403を取得する問題を解消。対象外/環境不可/取得中/失敗/取得済みを別状態として伝播し、対象外では作文処理をmountしない。有料から無料への切替中の古い応答も最新状態を上書きしない。対象外作文の画面はクラス作成へ誘導しない。実画像で判明したheroとnoticeの説明重複も解消し、対象外では説明を一度だけ表示する。共通ナビによる戻りと移動を維持する。有料で本当に取得した0件は維持する。

最終実装・browser source `6a625f6bf7bd273121beff00a27260d73400f056`。基準実装dbe52beから対象外heroの重複を解消し、全体型/unit/build/browserを改めて確認。専用runtimeであることをrunnerが明示し、新規合成accountのprovision試験を公開URLでは起動しない。

## 実操作

- 320/390/844横向き/768tablet/1366desktop: 無料対象外の表示、0件の誤表示なし、横溢れなし、作文APIの追加要求なし。明示的な禁止API要求は引き続き403。
- 対象外Writingの全画面高は320pxで1600→688、390pxで1493→844、横向き844pxで987→578。説明は一度だけ表示、共通ナビは維持。
- キーボード: 5幅で共通ナビのShift+Tab/Tab/Enter、作文→割当→作文の往復、aria-current、focus、横溢れなし、作文API追加0を実Chromeで確認。
- 有料: 取得待ち、実際の空queue、503取得失敗、再読み込み後の復帰を実Chrome+一時合成D1で確認。
- Login: desktop1366x900はページ高900→900、email y420.7。mobile390x844は946→946、email y328.5。全5幅で開いた際のページ高増加なし、email欄の画面内表示、Escape/Tab/戻る/再訪を確認。初期再現のdesktop900→2951/email y2208、mobile1509→4047/email y2703の一括説明展開は発生しない。

## 検証と配備状態

200files/2072unit、型、58migration、到達性/依存境界、API統合、build、securityは成功。securityのxlsx既定例外1件は維持。追加作文6browserも成功。全Cloud194＋IDB9の203unique browserは90秒/retry0で成功（配備専用2skip）。同じ実装に対する証拠取得の追加作文6件も成功。最終receiptを正本とする。

独立frontend/backend reviewでblockerなし。サーバー・サービス・課金/AI設定・既存migrationの追加変更なし。main182から0058のみ追加し、原本変更後の注記失効を保証する。適用前の不整合をbackfillしないため、新しい436原本照合と0058 before/afterが必要。

公開先照合後のbranch pushと[PR61](https://github.com/wadansyaku/medace-english-app/pull/61)作成は成功。構成・secretの名前・教材/権利台帳/参照整合性の個別読み取り許可を本人から受け、同じremote-readonly gateを直接再試行し成功した（ok53/warn1/error0）。キー値の取得、設定変更、間接迂回は行わない。本番原本436項目と0058 before、初回CI37727710448/preview37727710442、preview after原本436/0058は成功。previewは98bb9ed6.medace-english-app.pages.dev、head24340a1に紐づく正規deploymentである。

PRのP1で、無料組織がクラス・担当・単語課題・通知を準備しても有料作文の配布を要求されることを実API/UIで再現した。現在の追加修正では組織プランに合わせて導入契約を無料の基本4段階、runbookをPDF準備を含む5段階へ限定する。有料の7/8段階、アップグレード時の作文要求、ダウングレード時の古い作文件数の扱い、サーバー403と組織/担当の認可は維持する。無料の完了文も作文返却の完了を誤認させない。

修正後201files2083unit、型、API統合、build、到達性/依存境界、無料導入完了＋作文状態の実browser7件が成功。browserは隔離された合成組織で4基本操作を実行しACTIVE/null target、無料runbook5、全5幅の横溢れなし、再訪後ACTIVE、追加作文要求0と明示要求403を確認した。原本・既存migration・依存lock・課金/AI設定の変更はない。更新版の全browserとCI/previewを確認してから通常merge/productionへ進む。現時点の本番は182ba3d。旧記録の「未公開」「公開禁止」は当時の状態であり、現在の公開禁止を意味しない。

Safari/iOS・物理IME・400%は未検証。長期復習の未接続契約0ae54239と7/28日評価は今回の配備範囲外。ローカル受入を本番配備成功や学習効果の証拠として扱わない。
