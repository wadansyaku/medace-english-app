# 文法・和訳の出題時情報を端末で保持するローカル候補

2026-10-13。今回完了: 採点済み固定問題の設問ID・版・答案・許容解答・解説を端末履歴へ保存し、再訪後に誤答理由を見直す一単位。追加受入で実容量不足の表示と同内容の端末保存再試行も完了。公開・クラウド履歴の問題版保存は未実施。

## 基準と選択理由

原本checkout `/Users/Yodai/MedAce英単語アプリ` はmain `5853d1d`、4文書の未コミット変更あり。旧実装cloneは `codex/medace-october-refresh` / `79d4dc65` で、git statusの読み取りが長く停滞した。いずれも変更せず保護した。task-5の保存済み公開main `f8fcf2708d813690f5ba2862b14005ea4f3be286` source archive（SHA-256 `3758839f95d692ea0b687047cf6a391e4fe7dac321cf6831a4ed0bba1a1f4fc5`）から本workspaceへ独立snapshotを作成し、clean status・独立branchを確認した。live公開状態を再調査した証拠ではない。

既存AGENTS.md、project.md、todo.md、docs/README.md、大規模計画B2/B3と公開記録を照合。checkout内の `.agents/skills` は存在しない。PR65の有限和訳・未採点・複数正答、PR66/67のMy直接入力・編集・undo・UID下書き・再送、PR69の長期復習は既存機能であり、再実装していない。

既存 `curatedQuestionId` だけでは当時の正答・解説を復元できず、文法答案と既知誤訳の答案・理由も残らなかった。追加した実Hub回帰は変更前に1失敗/14成功でこの欠落を再現した。根拠: `../baseline-provenance.log`（納品package内）。B2の端末内部分を選び、サーバschema・認証・権限・D1 transport・デモ・配備workflowを変更しない。

## 実装と境界

- 4形式（文法穴埋め/英語語順/和訳入力/日本語語順）ごとに、実際に採点したitemから問題本文・提示選択肢/語句・参考答え・全有限許容答え・解説・入力・判定理由をコピーする。文法の現在bankへ初めて明示版1を付け、和訳は既存版2を保持。過去の初版を推測する意味ではない。
- 既存UID別localStorage履歴（最大160件）へoptional snapshotを追加。現在bankから旧記録を補完・再採点しない。別UIDが入った破損bucketは読み込まず、壊れたsnapshotだけを除外して旧記録・集計・pending IDを保持する。
- 直近5件を折りたたみで見直し、当時の入力・具体的な誤答理由・参考答え・別答・解説を読める。記録のない旧回答は「版は不明」。詳細はこのブラウザー内だけで、現行cloud payload whitelistへ新フィールドを追加しない。既存の正答translationFeedback契約は維持する。
- UID切替の既存pending送信競合も局所修正。別UIDへ旧記録を送らず、遅い応答が切替後の画面・履歴を更新しない。認証方式/API/サーバ認可は変更しない。
- 端末への保存結果をクラウド保存から分ける。容量不足/ストレージ拒否時は画面内の答案を保持し、再読込で失う可能性を表示。同じ記録の端末保存だけを再試行し、API再送・回答追加・ID変更をしない。
- 未登録訳/未知順/内容や版不一致は従来どおり未採点で入力保持。点数・誤答・receiptへ入れず、今回の見直し履歴にも追加しない。

## 教材照合

新規問題・正答・別訳・解説を追加していない。固定教材原本 `config/grammarQuestionBank.ts` の64問は両文法形式をscope別生成してID集合と照合。`config/translationQuestionBank.ts` の20問は既存参考訳/40別訳/20別順と既知誤訳理由をそのまま保持する検査を実行した。教材原本の本文・許容答え・解説文字列はbaselineと同一。外部講師監修や1531単語教材全体の内容校正の証拠ではない。

## 検証

Node22.19.0、lockfile変更なし、`npm ci --offline` 成功。Documents側のファイル読取停滞後、同一ソースを `/tmp/steady-study-quality-20261013` へ隔離し最終検証を実行。対象source SHA-256一致を独立レビューでも確認。

| 工程 | 最終結果 |
| --- | --- |
| 全unit/既存コンポーネント統合 | 241files / 3140tests成功、retryなし（acceptance-all-unit-final.log） |
| 型 | `npm run typecheck` 成功 |
| build | `npm run build` 成功 |
| 到達性 | 全production source reachable |
| 依存境界/循環 | 399production sources、問題なし |
| 実Chrome合成UI | 今回の履歴4＋既存文法4＋クイズreceipt10＝18成功。安全に分離した既存音声9/worksheet11/Writing19も39成功。合計57成功/retry0 |
| UI操作 | 誤答→UID端末保存→reload→Enterで見直し→同じ答案/版/理由。未採点0保存、既知誤訳の再訪、許容解答確認、余計なpayload0、横はみ出し0、console/pageerror0 |
| 独立コードレビュー | 別担当 `/root/provenance_review` が編集/試験起動なしで確認。追加の保存失敗表示/端末retryも重大残件なし。担当・範囲・原文応答は納品INDEPENDENT-REVIEW.md |

初回標準sandboxの全unitは3128成功/8失敗（127.0.0.1 listen EPERMを伴う7件と隔離copyのGit情報不足1件）。隔離copyへローカルGit情報を用意し、許可された合成試験で待受制限を解消した当時の全unit3136成功を保持し、追加修正後の全unit3140成功を最終正本とする。初回Chrome起動はSIGABRT/EPERM、新UI fixtureのHTML charset不足で2件がtitle不一致。UTF-8指定後の6成功を保持し、追加受入後の最終57成功を正本とする。アプリ不具合をテストassertionの削除で回避していない。初回と最終のlogを区別して保全。

## 未完・未実施

- cloudのcuratedQuestionId/問題版/答案追跡、担当講師による同版再確認、自由訳全体の意味評価、未採点答案の永続履歴、過去誤採点の影響分析は未完。
- 実Safari/iPhone/IME/ソフトキーボード/VoiceOver・教室評価は未実施。人工viewportとEnter操作を実機完了証拠としない。
- 標準API全統合は未実施。runnerはD1 migration→デモ認証→ユーザー/権限fixtureを分離せず実行するため、最新の非DB/非認証限定から除外した。API側の関連receipt契約はメモリーSQLiteの合成fixtureで確認した。アプリの既存D1/権限DBや実セッションへアクセスしない。
- 標準全Cloud/IDB smokeは未実施。ローカルサーバはD1 migration/seedを必須とし、多くの群は認証を使う。IDB My試験もSESSIONを書換えるため今回除外。全通信を遮断する独立fixture6fileの57件を直接実行した。混在するpronunciationの認証済みStudyとそのfile、その他アプリサーバ依存群は実行しない。
- migration replay、npm registry security audit、正式CI/preview/production gateは未実施。公開可能判定ではない。
- localStorageが利用不能/容量超過なら画面内保持となり、失敗表示と端末retryを提供する。retryを確定できないままreloadすると失われ得る。別端末共有はない。回答見直しの展開時は縦スクロールを使う。

本番DB・実生徒データ・認証情報へアクセスせず、外部AIへの送信、本人grantの再試行、停止したreleaseの別経路移管、push/merge/deployを行っていない。


## 追加受入の限定事項

160件上限は既存方針を維持し、161件目では最古の1件を除く。残る回答回数・元ID・pending payloadは維持する。上限超過した未同期記録も除かれ得る既存方針で、無限のoffline queueは保証しない。新詳細表示は直近5件。

11994文字（12000文字の許容境界内）の答案を単体で保存/再読込し、10005文字の合成答案と長い解説を320pxで欠落・横はみ出しなしに表示。ChromeのlocalStorageを実際に満たしてQuotaExceededErrorを発生させ、旧保存JSONが不変・新答案は画面内・空きを作って端末retryすると同じID/内容で保存・API呼出し増加0・reload保持を確認した。

合成bankをruntimeで版99・別の正答/解説へ更新しても、既存の版1・元答案・元解説を表示し、改版による再送0を確認。戻る/再訪とUID別clearは既存 `clearEnglishPracticeProgress` をfixtureから呼ぶ検証であり、新たな履歴削除UIを追加/検証したという意味ではない。別UIDの記録は不変。

最終アプリ/試験source snapshotは `551d40b72bea9966b078d2b2ba9e338efbd74a1d`。後続文書commitのtreeとアプリsourceは同一で、最終patch/manifest/ZIPのhashはACCEPTED-SHA256SUMSへ固定する。先行3136unit/6browserのpackageは初回候補の証拠として保持する。
