# 再構築の本番リリース記録

更新日: 2026-09-07。対象PR: [#51](https://github.com/wadansyaku/medace-english-app/pull/51)。ユーザーから本番反映の明示承認を受け、既存のPR・CI・preview・conversation resolution条件を維持して進める。

## 配備前の基準

- main / production: `97127cb133181cfa2b5917feff3cf6d03314f466`。
- 旧安定配備: `06aec447-558d-48d7-a398-fce7bf041027`。
- production / preview は別D1・R2を使用。事前のmigration記録は各41本、0041 / 0042が未適用。
- productionの集計: users14、books57、words65709、histories195、interaction events237、writing submissions0。取得時刻は2026-09-07 06:47 UTC。顧客識別子・教材本文はリリース証拠に含めない。
- remote-readonlyの構成・教材・source ledger・B2B整合性gateが成功。台帳・B2Bの運用警告はエラー0と区別する。

## リリース時に加えた修正

- 公開content QAを厳密な件数allowlistへ限定。子プロセスの失敗出力にも教材本文を出さない。
- 本番migrationの直前に復旧bookmarkを記録。追加スキーマを維持するコード切り戻しを優先する。
- 配備済みbrowser testの選択名を実際の登録名に照合し、改名による検証漏れを防ぐ。
- 作文の同内容返却再送は保存済みレビューに基づいて後処理を回復し、イベント・ジョブを重複登録しない。
- 返却済み答案の閲覧は課題全体の状態ではなく、その提出の公開済み教師評価で判断する。新しい提出が確認待ちでも、一覧の「前の添削結果を見る」から既存の返却へ到達できる。
- 学習上限をD1・端末内保存・画面で共通化。最大100語と最大100%の連続学習ボーナスからXP上限2000を導出し、25語・10日連続の500XPも保存できる。端末内の復習語数が指定数を超える不具合を修正。

## 検証段階

- 最初の候補 `3e58d763ad571dab2c1f5632f739fe88716bc3af` はCIとpreview配備が成功。reviewで3件を検出し、修正後の新しい必須checkとpreviewを再実行する。
- 最初のpreviewで0041 / 0042を適用し、read-only schema受入19項目が成功。PC・スマホ表示、個人デモの2語学習、再読込後の保存も確認。
- 本番配備と公開URLの最終確認は実際に完了後に追記する。先行previewの成功を新しい候補や本番の成功として扱わない。

## 追加レビュー修正後のローカル検証

- `verify:fast`: 119ファイル・725単体テスト成功。migration replay・型・依存境界も成功。
- API統合: 500 / 2000 XPの保存・セッション再取得、2001の拒否を含め成功。
- Writing / Study実画面: 9件成功。過去返却の再提出中閲覧、回答再送、再出題後の付与1回と初回語数のみのXP計算を含む。
- 最新の必須CI・preview・productionは以下の実配備記録と区別する。

## 最終候補と本番反映

- 最終PR head: `2bc5717b43f795dc5964c0a1e941c9e2e748b223`。
- [CI 34095468330](https://github.com/wadansyaku/medace-english-app/actions/runs/34095468330): 119ファイル・725単体テスト、重点browser13件成功。
- [Preview 34095468336](https://github.com/wadansyaku/medace-english-app/actions/runs/34095468336): Cloudflare full56件成功・2件対象外、native IDB3件成功、配備済みpreview4件成功。
- 最終preview: https://3c7b3c63.medace-english-app.pages.dev 。統合コミット `e224aa5d729c242d836cb81d290fd6a6a13f8eb2` と実稼働SHA一致。別D1上の個人デモで2語の学習・204保存・再読込後の2語記録、PC/390px/320px表示と配信ファイルを確認。
- 指摘3件を修正・解決後、追加の未解決レビュー0でマージ。main: `95daf52f5ed3168e2ffd526357b75a4fe8205027`、マージ時刻2026-09-07 07:36:19 UTC。
- 本番workflow [34096286681](https://github.com/wadansyaku/medace-english-app/actions/runs/34096286681) のattempt 1はローカルWranglerの空ERROR・exit1で停止。画面assertion失敗は記録されておらず、bookmark・migration・配備はすべて未実行。詳細ランタイムログが残らず根本原因は未確定。
- [上流issue #15317](https://github.com/cloudflare/workers-sdk/issues/15317)に同様の症状報告があるが、今回の根因を証明するものではない。条件・コード・自動retry設定を変えず、失敗記録を保持して単発のworkflow再実行を行う。
- attempt 2は全preflight・bookmark・migration・Pages配備まで成功。配備直後のproduction aliasが旧HTMLの3assetsを参照しHTML fallbackを返したため、静的ファイルのreadinessで停止。公開browser5件はこの時点では未開始で、workflow総合成功ではない。
- 実本番配備: `e014b9f3-40b1-4715-b8b3-60351e4da7c8`、https://e014b9f3.medace-english-app.pages.dev 。公開URL https://medace-english-app.pages.dev の `/api/session` は204 / SHA `95daf52f` / no-store。
- 2026-09-07 07:50:20 UTC、migration後のread-only schema19項目成功。migration43件、0041/0042各1、参照不整合0。個人デモ受入前の6集計は全件不変（users14/books57/words65709/histories195/events237/writing0）。件数整合は全行の内容同一を証明するものではない。
- alias切替後、公開HTMLは新JS `index-DKQQkmnw.js` とCSS `index-Dpiwu6x5.css` を参照し、全6assetsが200・正しいMIMEで応答。既存の公開browser5件を同じ期待SHAで独立再実行し、5/5成功。
- 本番の個人デモ実受入11項目も成功。自分の教材2語を学習し204保存、dashboard再読込後も一意2語を確認。PC1366px・スマホ390/320px表示、主CTAのコントラスト5.47:1、横はみ出し0、教材への導線を確認。これは画面幅検証であり実iOS端末検証ではない。
- プレビュー統合コミットと本番95daf52fのGit treeは `28c40eb8b8a0138233eec9172b65076af7672a53` で一致。
- 配備前後の切替を待つreadinessと、ローカル実行サーバー故障時の秘匿診断を追加して運用を補修する。後続PRとworkflow結果は別に追記する。

## 残る境界

XPの完全なreceipt化・サーバー算出、全演習の保存契約統一、Writingの処理claim/lease、返却後に状態が進んだ場合も回復できるoutbox、実iOS PWA・読み上げ検証は[バックログ](../../todo.md)へ保持する。回答保存、XP付与、外部通知到達は別の完了状態である。既存XLSX high例外1件は残り、脆弱性ゼロとはしない。


## 配備手順の補修（追加PRの検証前時点）

APIの期待SHAとHTML参照assets・PWAが揃うまで最大180秒待つ共通readinessを導入した。旧SHA、HTML fallback、古いmanifest、欠けたiconが順に回復するHTTP fixtureを使い、永続不整合・応答停止・実行サーバー停止で成功しないことも確認した。実行サーバーの内部ログは一時保存し、固定の分類だけを記録して削除する。

ローカル検証は121ファイル・735単体テスト、型、migration replay、依存境界、実ローカルサーバーでの公開session確認が成功。追加PRの必須CI、preview、productionはこのローカル記録とは別に評価する。


## 最終完了記録（2026-09-07 08:32 UTC）

- [追加PR #52](https://github.com/wadansyaku/medace-english-app/pull/52)をマージ。本番mainは `5853d1dc3701ace947865b064723161b3e0aee86`。
- [PR CI](https://github.com/wadansyaku/medace-english-app/actions/runs/34099622002)と[preview](https://github.com/wadansyaku/medace-english-app/actions/runs/34099621908)が成功。previewの実API SHAは統合コミット `ee173ff343ddd47f5b66ef1f7b47ddeda1f3bd36` と一致。
- [main CI](https://github.com/wadansyaku/medace-english-app/actions/runs/34100402034)は初回のローカル実行サーバー停止を `PROXY_CONNECTION_LOST` と分類できた。コード・条件を変えない単発再実行（attempt 2）が成功。内部ログは削除され、固定の分類だけが残る。上流の接続切れ自体を修正したという保証ではない。
- [最終production workflow](https://github.com/wadansyaku/medace-english-app/actions/runs/34100401966)はattempt 1で全工程成功。121ファイル・735単体テスト、Cloudflare full56件（対象外2件）、native IDB3件、公開済みproduction5件、構成・教材・台帳・B2B・必要secretの確認が成功。
- 最終canonical配備: `3970cea3-5dc9-4626-bcee-768e107deef7`、https://3970cea3.medace-english-app.pages.dev 。公開URL https://medace-english-app.pages.dev のAPIは204・期待SHA一致・no-store、HTML参照6assetsが200・正しいMIMEで応答。
- 95daf52fから5853d1dの差分は配備用スクリプト・テスト・MDのみ。実学習受入済みの画面・API・DBスキーマと同一であり、公開JS/CSSのhashも同じ。最終確認のために新しい学習データを繰り返し追加していない。
- 0041/0042適用前の復旧bookmark: `00000564-00000000-000050df-d4dc5cda30de799e80ae554df4776520`（旧workflow attempt 2）。
- 最終運用補修配備前の復旧bookmark: `00000566-00000094-000050df-c3e69c386f7571c8fb35183e966aa487`。DB復元より追加スキーマを保ったコード復旧を優先し、復元時の正規利用データ喪失に注意する。
- ローカル作業ツリーは最終mainへfast-forward済み。配備完了後にしか確定しない本節とバックログ・日誌の最終結果は、ローカル追記として保持する。稼働ソースは上記マージ済みcommitで確定している。
