# 10月講師ミーティング向け更新・導入計画

## 作業対象と起動

原repo `/Users/Yodai/MedAce英単語アプリ` の5853d1dを起点に、安全コピー `/Users/Yodai/Documents/Codex/2026-10-02/task/medace-refresh`、branch `codex/medace-october-refresh`で実装。元の未コミット4文書は保持した。元repo・原本Excel・本番DBは変更していない。Documents領域の読み込み停滞を避け、最終実行は同ソースの `/tmp/medace-verified-runtime` で行った。

Node22（22.13以上23未満）を使用する。`npm ci`後に `npm run verify:fast`、`npm run build`、`npm run test:api`を実行する。原本監査は `node scripts/audit-original-workbooks.mjs --local-preview`、再現テストは `node scripts/validate-original-workbook-import.mjs`。4原本はDownloadsの指定ファイルを読むだけで変更しない。

録画用プレビューは `VITE_STORAGE_MODE=cloudflare npm run meeting:preview -- --state /tmp/medace-meeting-preview-clean-state`、URL `http://127.0.0.1:41812`。build先は `output/meeting-preview/dist`、通常のsmoke/IDB用`dist`から分離した。local D1のみ、AIクラウドbindingなし、合成体験アカウントのみ。生徒は `/student`の「この役割を試す」、講師は `/teacher`から入る。無料体験の即開始と塾所属の体験では教材アクセスが異なる。

## 実装した導線

- 公式MedAse Study Spaceサイトの明るいオレンジF66D0B、補色FFBF52を採用。主操作は暗い文字で、hoverを含むコントラストを確保した。スマホ320/390pxとPCで可読性、タップ範囲、横溢れを確認。
- 生徒ホームは次の学習を先頭に置き、続き・復習・小テスト・教材・進捗へ進める。教材検索/絞り込み、最初の自作教材作成、固定ヘッダーを避ける画面内移動、reduced-motionに対応。
- 講師画面をデータ取得・操作・表示へ分割。自分の担当を初期表示し、閲覧できる全生徒への明示切替、通信失敗と0件の区別、再試行、モーダルのfocus管理、重複送信抑止を実装。AIの遅延応答は手編集を上書きせず、送信中の編集も保護する。
- 原本の品詞・活用・例文注記・出典をカードへ表示。提供されていない発音は推測しない。

## 教材の根拠

[原本監査](./october-content-audit-2026-10-02.md)と[generator照合](./october-content-audit-generator-2026-10-02.md)を参照。4原本1531本文行のうち1530を別の4冊へローカル収録。副詞actuallyの意味未記入1行は保留した。動詞353、名詞932、副詞86、形容詞159。語義・品詞・活用・用例・出典が違う重複は保持する。source SHA/revision、原本行、69コメント、名詞69訂正履歴を保存した。

既存レベル1〜6は本人による市販教材の再編で、4原本とは別namespace。generatorの48掲載とapp公式45冊（39ライセンス＋6再編）から単純な網羅率は出さない。未対応候補4冊/件数差5冊は版・掲載範囲・本文の確認待ち。本文照合はChrome接続復旧後に正規機能で再開する。

## 本番切替は未実施

この版は講師評価用のローカル候補。デプロイ、merge、実生徒データ変更、課金、権限追加は今回保留した。合成体験の成果を本番の学習効果として扱わない。

承認用の次段階：

1. 本人/講師が1530行の対象範囲・保留1行・generator版対応・4冊の表示名を確認する。
2. 正規権限で現在schema/教材集計/対象IDを再確認し、承認対象DBのbackupと復旧手順を確定する。生徒情報を開発へ複製しない。
3. localで通った追加migration0043とsource revision単位の追記importを、明示承認後に対象環境へ適用する。既存levelbook ID、word ID、study_history、ユーザーを置換しない。教材公開/配布対象も別に承認する。
4. 読取で4冊件数・1531source entries・1530links・FK・既存履歴保全を確認し、限定した講師/生徒で開始する。
5. rollbackは新教材の公開/配布を停止し、前のapp版へ戻す。追加列/出典revision/新履歴は保持し、DELETEや旧DB全体の上書きを自動実行しない。DB復元が必要なら、対象と切替後履歴への影響を提示して別途承認を得る。

## 最終確認結果

単体126 files/764 testsは全PASS（ワーカー1、88.95秒、時間制限assertを緩和せず）。API・build・44migrationと再適用・原本SQLite10検証もPASS。最新D1全体smokeは55PASS/2SKIP/測定1FAILで、同フレーム座標測定へ修正後に該当1件PASS。IDB3件PASS。全体runの過去exit1と修正後の限定run成功を区別して記録した。320/390/1440pxの実UI、4原本詳細、20語完了/reload保存、小テスト5問/reload保存を確認。独立最終ソースレビューで具体的P0/P1は残らなかった。

標準fresh npm ciはSSDで45分後exit0（legacy-peer-deps不使用）。SSD上workerdの起動検査がdyldで停滞したため一度中断したが、その後の単独version checkは2026-09-30でexit0、検証済みruntimeとbinary SHA完全一致。環境遅延と依存解決を区別する。

96秒1080p/30fps MP4、日本語字幕11区間、Kyoko音声が完成。全decode成功、音量-15.9LUFS/truepeak-2.2dBFS、全7章と重要箇所を画像確認。隔離Chromeの実再生で0〜96秒を中断せず終端まで確認し、10時点のreadyState4/pausedfalse/媒体エラーなしを記録。QuickTime UIは応答待ちになったため、その操作を再試行せずブラウザー実再生へ切り替えた。

完成MP4/SRTと匿名QAソースtarを公式Libraryへ保存済み。tarは422files/864KB、秘密候補0、独立stagingで223unit/9browser/44migration/API/typecheck/build PASS。本番設定・原本・実生徒・認証状態は同梱しない。

## 独立QA後の限定修正

上記は初回引継ぎ時の検証記録。追加の独立QA資料を公式Libraryから取得し、SHA256 `f6bf66ee4c11970a2d9059251836cb080a041038d7f43040a98d30daa0cd78b5`の一致を確認した。資料の12観測test成功は旧不具合の再現であり、修正版のrelease gateへ加算しない。

- My単語帳と管理AI/CSV取込は、保存中の入力・モード・ファイル・閉じる操作を固定し、同期refで同じ瞬間の二重送信を防ぐ。遅延失敗後は入力を保持して再試行できる。PDF/画像と管理CSV選択はfocus可能なbuttonからTab/Enter/Spaceで開く。
- 公式importは新規pending/needs_review。既存の権利判断は出典が同じ場合だけ保持し、内容変更は再審査へ戻す。所有者のない公式教材をUSER_GENERATED扱いにして台帳を迂回する指定も保存前に拒否する。仮置き文字列、不完全な数値ID、正規化警告のある公式取込は既存教材・台帳・利用者・履歴を変更しない。
- 非A1原本の座標を保持し、数値ID保有率とセル座標/リンク対応率を別計測する。不正なpercent encoded学習URLは初期状態へ安全に戻し、正常な日本語・空白・slashを含むIDはroundtripを維持する。

My単語帳8件、管理取込10件の限定testと実Chromeのkeyboard/pending/失敗保持を確認。ブラウザー検証は実コンポーネント＋合成応答であり、本物AIや本番保存の証明として扱わない。実原本のID/本文完全不変と全44migration後15項目のSQLite検証も成功。最終全回帰・更新Libraryの版とSHAは`output/final-verification/followup-results.json`へ記録する。

録画された通常の学習・講師導線は今回の限定修正で変わらず、完成動画を再生成しない。既存MP4のSHA256 `d71dd282c793406c582cbaa649bde8d706c33f4ae84c27228497697b3659da3d`を維持する。本番切替、generator本文の全件一致、未提供の発音、実AIの確認は引き続き保留／未確認。

詳細：[検証集計](../../output/final-verification/results.json)、[正本/実行版の86変更ファイルSHA照合](../../output/final-verification/source-integrity.json)、[実再生記録](../../output/final-verification/playback-evidence.json)、[動画台本・再制作](./meeting-demo-2026-10-12.md)。動画本体はSSD `/Volumes/YodaiOffload/CodexOffload-20261002/production/medace-video/medase-meeting-2026-10-12.mp4`。
