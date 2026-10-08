# 2026-10-08 統合UI・公開後修正の公開候補

本人の直接指示により公開禁止を解除し、以降も過去の禁止を通常の公開依頼へ再適用しない。公開先は本人の既存公開repo `wadansyaku/medace-english-app`、配備経路は既存GitHub Actions。元repo・前回保全版・動画用runtime41812を保持した独立cloneで作業した。

## 最終追加修正

無料の学校管理者で未取得の作文を「0件」「返却率0%」と表示し、対象外画面から403を取得する問題を解消。対象外/環境不可/取得中/失敗/取得済みを別状態として伝播し、対象外では作文処理をmountしない。有料から無料への切替中の古い応答も最新状態を上書きしない。対象外作文の画面はクラス作成へ誘導しない。有料で本当に取得した0件は維持する。

実装commit `dbe52be27475eccbcc6a5c7d9b507eb66061d2fc`。最終browser source `459d2830a56f052dd0aa27288aaafc9a09d38148` は実装からtest/runnerだけを調整。専用runtimeであることをrunnerが明示し、新規合成accountのprovision試験を公開URLでは起動しない。

## 実操作

- 320/390/844横向き/768tablet/1366desktop: 無料対象外の表示、0件の誤表示なし、横溢れなし、作文APIの追加要求なし。明示的な禁止API要求は引き続き403。
- 有料: 取得待ち、実際の空queue、503取得失敗、再読み込み後の復帰を実Chrome+一時合成D1で確認。
- Login: desktop1366x900はページ高900→900、email y420.7。mobile390x844は946→946、email y328.5。全5幅で開いた際のページ高増加なし、email欄の画面内表示、Escape/Tab/戻る/再訪を確認。初期再現のdesktop900→2951/email y2208、mobile1509→4047/email y2703の一括説明展開は発生しない。

## 検証と配備状態

200files/2071unit、型、58migration、到達性/依存境界、API統合、build、securityは成功。securityのxlsx既定例外1件は維持。追加作文6browserも成功。全Cloud194＋IDB9の203unique browserは90秒/retry0で成功（配備専用2skip）。同じ実装に対する証拠取得の追加作文6件も成功。最終receiptを正本とする。

独立frontend/backend reviewでblockerなし。サーバー・サービス・課金/AI設定・既存migrationの追加変更なし。main182から0058のみ追加し、原本変更後の注記失効を保証する。適用前の不整合をbackfillしないため、新しい436原本照合と0058 before/afterが必要。

公開先照合後のbranch pushは成功。PR作成/preview/main/productionは未実行。必須remote-readonly構成/教材/台帳/参照整合性の検査が自動承認レビューの具体的許可不足により拒否され、ユーザーへの確認を保留中。CI経由での間接再試行も行わない。本番は182ba3dのまま。旧記録の「未公開」「公開禁止」は当時の状態であり、現在の公開禁止を意味しない。

Safari/iOS・物理IME・400%は未検証。長期復習の未接続契約0ae54239と7/28日評価は今回の配備範囲外。ローカル受入を本番配備成功や学習効果の証拠として扱わない。
