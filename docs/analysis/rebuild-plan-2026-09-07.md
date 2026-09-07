# Steady Study 再構築計画・現状監査

更新日: 2026-09-07。対象: この作業ツリー。R0〜R5はローカル実装・検証済み。本番反映と公開URLの実操作確認済み。配備手順の補修は後続工程として記録する。次期P1〜P3は継続バックログ。配備証拠は[本番リリース記録](./production-rebuild-release-2026-09-07.md)に分離する。

## 判断

機能の数に対して、取得・保存・実行・完了の意味を統一する基盤が弱い。全面置換の対象はこの状態管理と行動契約であり、教材、学習履歴、権限制御、既存マイグレーションは維持する。まず学習者が「何をするか」「保存できたか」を信頼できる状態を作り、教室の週次運用へつなぐ。

外見だけの刷新、フレームワーク移行、機能数の追加を成功指標にしない。今回の実装単位を R1〜R5 に固定し、次期の事業・運用課題と完了を区別する。

## 開始時の証拠

- ブランチ: `codex/repo-audit-large-improvement-20260711`。既存変更・未追跡109パスを作業外に保全。既存成果を今回の実装数へ計上しない。
- Node 22.19.0。初期 `verify:fast` は migration replay / unused source / typecheck 成功、110ファイル・598テスト成功。
- 現行の production source reachability は成功。確認できた追加の未使用本番ソースは0。削除数を増やすための削除はしない。
- 開始時 artifact cleanup dry-run は0。`.wrangler`、教材、`output`、`tmp`、ブラウザ記録、依存ディレクトリは保護する。
- 本番利用率、7日継続率、通知到達、収益、教材権利の現在の実態は本監査では未取得。過去の日付付きレポートの数値を現在値にしない。

## 批判的評価

| 領域 | 根拠と問題 | 影響 | 判断 |
| --- | --- | --- | --- |
| 事業 | B2Bを主軸とする文書に、ランキング・自動通知・ネイティブ化が並列 | 限られた開発時間の分散 | 教室の週次完了・再開を優先、収益は実測まで仮説 |
| 学習ホーム | `useDashboardData` が取得失敗を握りつぶし、null snapshotを空データへ変換 | 未取得が0に見え、不要な教材作成へ誘導 | R1: 状態契約を作り直す |
| 行動設計 | DashboardとSectionsがprimaryTask実行を二重判断 | 作文表示から語彙開始など表示と行動のずれ | R1: 単一commandと実行箇所 |
| 学習保存 | Studyのロック開始が保存await後。例外回復UIなし | 連打で重複回答、最終カードのXPも重複しうる | R2: 同期ロック・保存状態・確認済み完了 |
| データ整合性 | SRSはread→無条件upsert、イベント・集計は別commit | 更新消失、失敗後リトライで二重計上 | R3: attempt receiptと原子的保存を優先 |
| 教室課題 | missionのJSON進捗を無条件更新、重複を除く前に達成判定 | 誤完了、並行学習の上書き | R3: 一意語数・厳密達成・CAS |
| 演習保存 | English practiceの32bit hash PKとquiz委譲が別処理 | 衝突・重複の可能性 | 次期P1: 全演習receiptへ展開 |
| アーキテクチャ | client storageからserver helperへ逆依存、巨大facade | 実行環境混在、変更の波及 | R4: shared境界・循環検出を固定 |
| CI | CIとSmoke Sentinelが同じPR smokeを重複実行 | コスト・待ち時間・秘密の不要な受け渡し | R4: ジョブ名を保って責務を分離 |
| 教材・AI | 承認境界は既存実装。費用予約・監査待ちの運用が未完 | 学習可能量と費用を保証しにくい | 次期P1: 予算予約、滞留SLO、golden set |
| 認証・Writing | 前回の大きな未コミット修正と0041あり | 未配備コードを本番保証と混同しやすい | 全ローカル回帰、release記録を別管理 |
| PWA・アクセシビリティ | manifestとsmokeは存在。端末・支援技術の全面証拠なし | 実端末の停止・読み上げを机上で保証できない | PC/モバイルrender確認、実機は別gate |
| ドキュメント | READMEが設定・事業・運用の百科事典、複数のCurrent/Nextが矛盾 | 新規参加時の判断困難 | R5: product / architecture / operations / roadmapを分離 |
| 整理 | 過去の削除成果と生成物が同じdirty tree | 既存作業の消失、成果の誤計上 | provenance付き削除台帳、再生成物のみ掃除 |

## 今回の実装 WBS

| ID | 完了条件 | 担当 | 状態 |
| --- | --- | --- | --- |
| R0 | 既存差分保全・初期検証・削除候補の根拠確定 | 統合 | 完了 |
| R1 | 未取得/空/更新失敗を区別、古い応答を遮断、commandの表示と実行一致、重複CTA整理 | 学習ホーム | 完了 |
| R2 | 保存開始前の連打lock、読込失敗再試行、回答失敗時の状態保持、未確認XPを表示しない | 統合 | 完了 |
| R3 | mission誤完了/競合を回帰テストで封鎖。SRS receiptの独立した保存単位を構築 | データ整合性 | 完了 |
| R4 | client/server逆依存と循環のgate、PR smoke重複除去、不要secretsの削除、依存更新 | 品質基盤 | 完了 |
| R5 | AGENTS/README/project/todo/docs/journalを現行計画へ統一、過去文書の日付と状態明示、全検証 | 統合 | 完了 |

## 今回追加した品質上の対応

- 依存監査で想定外の9種類のmoderate/highとlow2種類を確認。Wrangler/PostCSSと既存override・関連依存を更新し、例外を追加せず解消した。ローカルworkbook用XLSXの既知high例外1件は残る。
- ロックファイルからの `npm ci` を確認。最低Nodeを22.13に統一し、回帰テストで使うSQLiteのフラグ不要バージョンと揃えた。実行環境は22.19.0。
- productionの `cancel-in-progress` をfalseへ変更。新しいpushでmigrationと配備の途中を中断しない。PRの古い検証だけを取り消す。
- 同じセッション内のカード送りと教材変更で、古い例文/画像/編集応答が現在の単語へ混ざらないようカードごとの非同期操作を無効化する。
- IDB v6→v7の旧タブによるblockedを明示的なエラーへ変更し、後から成功した不要接続を閉じる。将来のversionchangeにも対応する。

- smoke helperが「中断して戻る」を完了扱いしていたため、完了画面と保存された語数を確認するよう修正した。折り畳み後の詳細も実際のナビゲーションで展開して検証する。

- 全体smokeでWrangler内部proxyの `Network connection lost.` によりローカルサーバーが停止した。ランナーが起動待ち・ブラウザ実行中の停止を直ちに検出し、終了コード/シグナルを記録して後続の連鎖失敗を止めるよう改善した。切断自体の発生理由は未確定であり、自動再試行で隠さない。

- 実画面確認で見つかった旧オレンジ面と影を、ニュートラルな背景・白いヘッダーへ整理。学習ホームの主操作を深い青緑/白文字へ統一し、通常5.47:1・hover7.58:1の文字コントラストを確認した。旧paletteの全置換はせず、操作色のsemantic tokenを追加した。

## 次期の大規模改善計画

順番は安全な保存→運用実証→教材品質→拡張。各段階の受入条件を満たしてから次へ進む。

| 段階 | 必要な実装・運用 | 完了の証拠 | 依存 |
| --- | --- | --- | --- |
| P1 保存契約の全面化 | quiz/English practice/XPをサーバー発行報酬とattempt receiptへ統合。WritingのOCR/AI実行前claimとlease回復 | 同時要求、通信断、再送、期限切れの実DB回帰。1回答1記録1報酬 | R2/R3 |
| P1 B2B週次運用 | cohort→担当→配布→開始→提出→講師返却→翌週再開を管理者の次アクションへ統合 | テスト組織の全工程、許可された本番read-only baselineと週次指標。未取得はnull | R1/R3 |
| P1 認証・教材 | signup/reset abuse、session lifecycle、AI予算予約、承認待ち滞留と教材golden set | negative/負荷test、費用台帳、承認済教材の品質gate | release trust |
| P2 保守性 | 巨大storage/organization read modelをユースケースごとに分割、quiz状態機械 | 境界gate維持、移行前後の契約同値、削除可能な旧経路0参照 | P1保存契約 |
| P2 利用品質 | キーボード/読み上げ、iOS PWA、通信中断、性能予算と計測 | 実画面・実端末、bundle/perf基準と回帰 | R1/R2 |
| P3 拡張 | 商用運用、クラス権限拡張、必要性が実証された外部通知/ネイティブ化 | 継続率・導入率・運用時間の改善と運用者承認 | B2B実証 |

残る具体的なP2として、IDBの教材削除後の孤立履歴/receipt、IDB missionのin-memory状態、weaknessのDELETE/INSERT分離と競合投影、receiptの保持期間/削除方針を管理する。同一StudyModeマウントで教材を切り替えた場合の開始/完了analytics参照リセットも未完。詳細トグルのaria属性統一、スクロール先の支援技術向けfocus移動、VoiceOver実機確認も次期の対象。既存IDB read helperの取得失敗時の既定値も、全ストレージ取得契約を統一する段階で扱う。

数値の事業目標は、母数・期間・イベント品質を確認してから設定する。外部通知は送信操作・サービス記録・受信を別の状態として扱う。

## 検証と配備境界

今回: migration replay、source/boundary gate、typecheck、全unit、build、API integration、Cloudflare/IDB browser smoke、PC/モバイル実画面。追加変更ごとに対象テスト、統合後に全検証。

本番反映はremote-readonly確認→PRの必須check→previewのmigration/build/deployed smoke→review→production→live smokeの順で進める。最新の適用状態・配備SHAは[本番リリース記録](./production-rebuild-release-2026-09-07.md)を参照する。

## 削除・整理台帳

| 対象 | 根拠 | 処置 | 検証 |
| --- | --- | --- | --- |
| 前回の未使用コンポーネント等の削除 | 開始時から削除済 | 保持、今回件数から除外 | baseline manifest |
| serverに置かれた純粋なmission選択helper | client/server双方が使う純粋関数 | `shared/dashboardPrimaryMission.ts` へ移動 | import boundary / mission regression |
| 旧READMEの設定・運用詳細 | 入口として過密 | 設定詳細を `docs/environment-setup.md` へ分冊しリンクで誘導 | 文書リンク確認 |
| dist / test-results | 検証で再生成可能・追跡ファイル0 | 証拠退避後に2ディレクトリ・109ファイル・2,130,480 bytesを削除 | dry-run → apply → 残り候補0 |
| 教材・学習DB・ブラウザ記録・個別成果物 | 固有データ、または用途未確定 | 保持 | 保護境界 |

## 第1段階: ローカル再構築完了時の検証記録

今回の差分は開始時の未コミット状態を基準に89パス（新規26・更新62・shared移動に伴う削除1）。開始前から存在した変更・削除はこの件数に含めない。

- `release:gate:local-only` 完走: migration replay / audit / unused source / architecture / typecheck / unit / API integration / full browser / 配備用build がすべて成功。
- 43本のSQL migrationを空のローカルD1へ再適用。0042のreceiptと既存0041を含む。本番DBへの適用は未実施。
- 単体テスト: 初期110ファイル・598件 → 最終118ファイル・675件成功。最終配色・ブランド文言の変更後にも全unitと型を確認。
- 全browser: Cloudflare 55件 + native IndexedDB 3件成功。配備済みpreview専用の2件はローカルでは対象外としてskip。
- 最終配色・文言の変更後: Dashboard recovery / 主行動 / mobile overflow / Study reliability の12件とIDBの3件を再実行して成功。PC・スマホの実画面も確認。
- native IDBは同一接続での並行保存、重複receipt、payload不一致、receipt故障時の全rollbackと再送、遅延catalogを伴うquiz保存、旧タブによるupgrade blocked回復を検証した。実iOS・物理電源断の保証ではない。
- APIは同一ID並行要求/再送、異なる回答の並行保存、quizとの競合、権限・不正payloadの拒否をローカルD1で確認。
- セキュリティ監査: 追加例外なしで成功。既存のローカルworkbook用 `xlsx` high例外1件は残る。脆弱性0件とはしない。
- 初回full smokeで旧UI前提のテスト3箇所とローカルWranglerの停止を検出。テスト・終了検知を修正し、後のfull runは再試行設定を増やさず完走した。
- 既存109パスの保全を再確認: 実ファイル93件の退避ハッシュ93/93一致、開始時削除16件の混入0。固有教材・DB・個別成果物を維持し、生成物清掃後の候補0を確認。
- 独立レビューで新規P0/P1の指摘なし。既知の未完項目は次期計画に保持。GitHubの実check、remote-readonly、preview/production、実端末は今回未実施。

## 設計根拠

- [React useEffect](https://react.dev/reference/react/useEffect): effect cleanupで古い取得結果の反映を遮断する。
- [Cloudflare D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/): batchはトランザクション。単に複数の独立writeを順番にawaitしても原子的にはならない。
- [GitHub token authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token): ジョブに必要な権限だけを渡す。
