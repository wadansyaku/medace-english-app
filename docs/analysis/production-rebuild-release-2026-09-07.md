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
- 最新の必須CI・preview・productionの完了は以下の実配備記録と区別する。

## 残る境界

XPの完全なreceipt化・サーバー算出、全演習の保存契約統一、Writingの処理claim/lease、返却後に状態が進んだ場合も回復できるoutbox、実iOS PWA・読み上げ検証は[バックログ](../../todo.md)へ保持する。回答保存、XP付与、外部通知到達は別の完了状態である。既存XLSX high例外1件は残り、脆弱性ゼロとはしない。
