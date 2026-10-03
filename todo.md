# 実装・運用バックログ

更新日: 2026-09-07。プロダクト方針は [project](./project.md)、根拠と全体WBSは [再構築計画](./docs/analysis/rebuild-plan-2026-09-07.md)。完了は実装と検証が揃った項目だけに付ける。

2026-10-03追加: [Naruシスト一冊化と公開検証](./docs/analysis/2026-10-03-naru-one-book-release.md)を進行中。ローカル一冊1530語の原本照合と実操作は成功、preview・productionは未反映。新しいビルド依存脆弱性の解消と最終全回帰を公開前条件とする。[包括改善計画](./docs/analysis/2026-10-03-medace-improvement-plan.md)に従い、小テスト保存receiptを別段階で開発する。

## 今回: 学習と保存の基盤を再構築

- [x] **R0 現状確定**: 既存109パス保全、初期110ファイル/598テスト、不要ソースとartifact候補の確認。
- [x] **R1 学習ホーム**: アカウントごとの取得状態、失敗・再試行、単一command、主行動と次の1件へ整理。
- [x] **R2 学習セッション**: 連打排除、読込失敗再試行、同じ回答の再送、保存済みとXP未確認の分離。
- [x] **R3 データ保存**: D1/IDBのSRS receipt、履歴+eventの原子commit、missionの厳密達成と競合更新。
- [x] **R4 品質基盤**: 依存境界・循環gate、CI重複除去、依存脆弱性更新。
- [x] **R5 統合**: MD整理、unit/API/browser/build/auditの全検証、生成物清掃と独立レビュー。

## 次に必要なこと

| 優先 | 作業 | 受入条件 |
| --- | --- | --- |
| P1 | quiz / English practice / XPのreceipt・サーバー算出報酬 | 同時回答・再送・通信断で履歴と報酬が二重にならない |
| P1 | B2B導入と週次運用をoverviewから一周できるようにする | cohort→担当→課題→通知→提出→講師返却→再開を実操作で検証 |
| P1 | 教材・AIの費用予約、監査待ち滞留、golden set | 予算超過・重複課金・未承認公開を防ぎ、滞留を観測 |
| P1 | 認証abuseとWritingの処理claim/lease | rate limit、session lifecycle、OCR前claim、失効予約回復のnegative test |
| P1 | SRS派生集計の自動修復・receipt保持方針 | outboxと再構築の運用、教材/利用者削除時の保持仕様を検証 |
| P2 | IDB教材削除後の孤立履歴/receipt、missionの永続化、投影競合 | 孤立した進捗を数えず、更新失敗を0化しない |
| P2 | storage/organization巨大モジュールとquiz状態を分割 | domain境界を維持し、契約同値を回帰で確認 |
| P2 | キーボード/読み上げ、実iOS PWA、性能予算 | 実機証拠と性能計測。未検証を実装完了に含めない |

## 本番へ進むための条件

- [x] 今回の0042を含むpreview migration、deployed smoke、レビュー指摘3件の修正・解決。
- [x] remote-readonlyの構成・教材・台帳・B2B整合性gate（2026-09-07、エラー0）。
- [x] PR #51で必須checkを確認し、main `95daf52f`へマージ。
- [x] production bookmark、95daf52fの配備、公開URLのlive smoke5件と個人デモ11項目、DB19項目を記録。
- [x] PR #52で配備切替readiness・秘匿診断を補修し、main `5853d1d`のproduction workflowが全工程成功。

PR #51の本番反映・実操作確認と、PR #52の配備手順補修まで完了。最新の検証・配備状態は[本番リリース記録](./docs/analysis/production-rebuild-release-2026-09-07.md)を参照する。外部通知・料金・権限の事業判断は別の確認を要する。以前の完了項目と検討履歴は [過去バックログ](./docs/archive/todo-through-2026-07-11.md) に保存した。
