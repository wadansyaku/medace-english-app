# 実装・運用バックログ

更新日: 2026-10-03。プロダクト方針は [project](./project.md)、根拠と全体WBSは [再構築計画](./docs/analysis/rebuild-plan-2026-09-07.md)。完了は実装と検証が揃った項目だけに付ける。以下の非公開候補記録に対し、後続の本人承認で [PR54の公開作業](./docs/analysis/2026-10-03-ui-start-release.md) を開始した。最初のpreviewは成功し、保存レビュー修正後の最終gateを進めている。

## 2026.10.03 Start版 — 非公開の次版候補

固定UI版28fa869から独立したbranch `codex/medace-value-first-onboarding-20261003`。正本は [登録前の学習と任意診断](./docs/analysis/2026-10-03-value-first-onboarding.md)。公開済み版へ適用したとは扱わない。

- [x] 登録前の独自5語を主操作にし、初回12問診断の延期と後日の任意診断を実装。英語レベルは未診断のまま保持。
- [x] 端末内の7日記録、本人確認後の明示Cloud保存、部分回答の追加、同じID再送、別account拒否、端末消去後の本人記録取得を確認。
- [x] 端末保存復帰時の回答消失、channel例外、登録の遅延focus、お試し再読込の戻りを修正。
- [x] 通常登録の実操作は入力4項目・12問・ホーム29クリック/学習入口30クリック。次版の独自1語は1クリック、意味と解説は選択/確認込み3クリック。効果/離脱率の数値は未計測。
- [x] 152files/1173unit、型/build、境界/到達性、46migrationのローカルreplay、合成API回帰、security audit（既定xlsx例外1件）成功。
- [x] 最終browserはCloud125＋IDB9の134unique成功。5幅・keyboard/Escape/Back/reload・延期失敗/retry・部分保存/追加・応答喪失/再送・別account・複数tab・端末記録不可を受入。
- [ ] Remote公開と0044/0045 migration→正規preview配備→deployed-only2件。今回のno push/merge/deploy/remote write範囲外で未実施。

2026-10-03追加: [Naruシスト一冊化と公開検証](./docs/analysis/2026-10-03-naru-one-book-release.md)が完了。追加レビュー3件を修正したPR #53をmain `4c4690a`へマージし、production workflowが全工程成功。本人の一冊1530語をPUBLIC/approvedで原本七表照合、既存58冊65711語・履歴等の件数保持、FK0を確認。Notion企画との構成照合も完了し、例文和訳・参照・用法別学習の拡充を後続へ記録した。[包括改善計画](./docs/analysis/2026-10-03-medace-improvement-plan.md)の小テストreceiptは現行UI/一冊/Tailwind4へ非公開統合済み。935unit・34SQLite・独立70・API/build/audit成功、接続復旧後の同一sourceで合計126local browser成功（preview限定2skipを除く）まで完了し、保存HEAD e6271f7を保全した。未公開候補であり本番の0044/preview検証は未実施。

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

## 2026-10-03 画面整理・文法追加の非公開候補

- [x] 生徒ホームの重複shortcut/mobile launcherを統合し、referenceを単一panelへ。講師overviewを2領域へ整理。
- [x] Naru章範囲と統計、語義/原本例文を中心にする学習画面、独自64文法本文と一問ずつの学習を統合。内容独立レビュー64受入/保留0。
- [x] 最終UI候補146files/1085unit・型/build成功。直前の145files/1082unit verify:fastでmigration/境界成功。backend不変のlocal API回帰成功も再利用。
- [x] 同一fixtureのbefore/after14場面28画像、320/390/横向き/tablet/desktop、keyboard/失敗/retry/保存/再訪の受入を保全。
- [x] Chrome更新後、合計126 local browser成功（Cloud117 unique＋IDB9）。既存preview-only2skipは配備gateで別途実行。失敗した旧期待値差3件だけ再確認し、同じアプリruntimeで全成功。Naru出典差分は5幅16画像・横溢れ0・1530取得内容不変で受入完了。
- [x] 本人承認後12:46UTC、NaruだけALL_PLANSに修復。7table全列保持、本番無料生徒閲覧と公開コード合成4プランHTTP成功。出典の生徒表示省略は非公開UI候補に反映。

正本: [実装・移行影響・残確認](./docs/analysis/2026-10-03-smart-ui-and-grammar.md)。旧Quiz/印刷fallback・C2追加・本文IDのCloud永続化まで改善済みとはしない。
