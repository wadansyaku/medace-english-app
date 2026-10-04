# 2026-10-04 有料単語生成廃止の独立公開候補

基点 e97e68c29558a4e7d45e0814ddd0a2233078614c。混在候補607f366から費用・承認境界だけを分離。本番未反映、push/merge/deploy未実行。

学習中の画像・追加例文生成、個人教材の例文準備操作、旧AI/storage生成API、有料定期再監査を廃止。保存済み例文は常時表示、保存済み画像は既存panelで表示。generated assetは承認済みだけ表示し、語義・単語編集で承認を無効化する。

管理者だけが欠損を読み、概算上限1.2円・最大10件を明示確認して事前準備できる。0046 durable claimは重複・並行provider呼出を抑止し、生成結果を承認待ちで保存する。和訳欠損、結果不明claimの回復、人手承認の運用整備は残課題。

FAQ/製品改善の画面、App wrapper、service/shared、unit/browser試作は含めない。管理者の見積もり・明示確認browser fixtureだけ独立ファイルへ移した。認証・onboardingと講師7日指標は基点のまま。

独立clone: `/tmp/medace-paid-only-20261004/source`。Node22、依存は既存node_modulesのread-only共有symlink。公開には本人承認と正式CI/preview/production gate、0046の適用、配備後確認が必要。本候補の限定ローカル検証はそれらを代替しない。

## 分離候補のローカル検証

2026-10-04 Node22.19.0: 型/build、関連13files116unit、全unit154files1217件成功（初回1211成功、HTTP readiness6件はsandbox listen EPERMにより失敗し、権限付き合成localhostで再検証成功）。unused/architecture315 production sources、migration名check、0046を含む一時ローカルD1 replay成功。

限定Chrome browser16件成功: auth5viewport、admin欠損/見積もり/明示確認5viewport、欠損例文1件、保存例文/画像/編集invalidations5viewport。管理者生成応答はroute fixture、実provider通信なし。専用42049・一時合成DB。初回は同梱Chromium未導入で起動不可、既存Chromeで成功した。

backendと関連unitの有料廃止変更は607f366と同一。先行候補の全API/回帰成功は参考証拠であり、この分離候補で全API・全browser回帰を再実行したとはしない。公開時の正式gateは維持する。

再現: `PLAYWRIGHT_CHROMIUM_CHANNEL=chrome PLAYWRIGHT_SMOKE_PORT=42049 SMOKE_SKIP_BUILD=1 node scripts/run-smoke-tests.mjs --grep 'admin sees missing examples|missing examples have no generation|saved examples and images|auth stays focused'`（build完了後）。runnerは合成DBを作成・終了時清掃する。手動起動は `node scripts/start-smoke-server.mjs --port 42049`。
