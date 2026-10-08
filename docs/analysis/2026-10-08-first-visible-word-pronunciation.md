# A8: 英単語表示時の初回自動発音 — 2026-10-08

本人の「英単語が見えたら最初の一回は自動的に音声が再生されるように」依頼を[全体改善計画A8](./2026-10-07-steady-study-improvement-plan.md)へ追加し、公開済みPR61/main `0736ae71597bfb512e800ca73a87a9b3ea900e76` から独立した候補へ実装した。LibraryのHTML/Markdown正本v2は親担当が更新済み。前のUI改善は本番反映済みである。初回実装とローカル受入の後、本人が「本番にも反映してよい」「本番反映を完了させて、公開禁止は今後も取り除いてください」と指示した。旧公開禁止は今後も再適用せず、[PR62](https://github.com/wadansyaku/medace-english-app/pull/62)の通常公開工程を進める。

## 最終動作

- Study/ゲスト単語カード、登録前5語体験、語彙の英→日・日→英・スペルへ接続。対象要素がviewport内に見え、非表示・inert・modal背景でない時に、そのsession/round＋設問位置の最初の1回だけ再生を要求する。同じ語の再出題や再開始、前の設問への移動は新しい表示。再描画・反転からの復帰・late voices・保存retryでは反復しない。
- 日→英の選択肢、伏字・ヒント・未確定スペルの正答は発音しない。採点確定後に英単語全文を明示し、その要素と同じ文字列を発音する。suffixだけの正解でも全文が見えた後に読む。文法・和訳・長文本文・教材一覧・複数語彙chipを一斉に読む機能は追加していない。
- 手動の単語/例文再生を維持。音声オン/オフを端末localStorageへ保存し、保存不能時はメモリー内で使える。裏面と例文modalでも音声をオンへ戻せる。オフ中に見えた表示は自動再生を消費し、オンに戻すだけでは突然流れない。OS音量は変更しない。
- Studyの声選択（Google US English→Samantha→en-US）と速度0.9、ゲストの既定速度1を維持。ブラウザーの既存SpeechSynthesisを使用し、追加TTS provider、課金、API外部送信adapterや新権限を追加していない。
- 前後・連打・離脱・pagehide・非表示・認証/終了確認/お知らせmodalで古い予約と再生を停止。所有者とrevisionで遅延start/errorを無効にし、古い画面のcleanupが新画面の音声を止めない。manualは自動予約を消費し、例文modal内の実ボタンを可視範囲として検証する。
- 再生要求を成功表示と同一視せず、startイベントを使う。not-allowed・未開始4秒・非対応・その他errorは短い日本語で手動操作へ案内し、自動の無限retryをしない。意図したcanceled/interruptedは失敗にしない。

Quiz既存の900ms進行は維持する。音声開始が遅い場合や長い語は次問へ移った時に途中停止し得る。再生終了を待つために回答保存や進行を遅らせる仕様へは変更していない。

## 実再現と独立review

初期の実装候補でStrictModeのlayout RAFがpassive cleanupより先に走り、初回音声を消費して取消・拒否案内も消えることを実ブラウザーで再現した。layoutで旧音声を停止し、passive effectで予約する形へ修正。発音1回だけでなく初回に内部cancelが0であること、拒否/非対応の案内が残ることを固定した。

独立レビューで、auth modalが背景をmountしたまま残す時の自動音声、例文portalでmanual scopeが不一致になる問題、お知らせmodalに遮断属性がない問題、裏面ミュートから復帰できない問題を確認して修正した。全回帰で、reduced motionの裏面のmanual error案内がMutationObserverによって消えることも再現し、stopがstarting/speakingだけidleへ戻す形へ修正。最新差分の読み取りreviewに残る確認済みP0/P1/重要P2はない。既存保存・認可・原本/承認ゲート・SRSを変更していない。

## 公開前の追加修正

PR62のreviewで、重要お知らせのaria-modalに対応するfocus移動・Tab閉じ込め・背景inert・終了時復帰が不足していることを確認した。既存ModalOverlayへ接続し、お知らせを最優先のfocus対象にする。遅れて報告受付完了modalが開いてもcriticalの確認操作を奪わず、確認後は下位modalの操作へ戻る。Criticalの確認必須、Majorの閉じる、既存acknowledgment保存と表示条件を維持した。実StudyReportDialogsを使う非同期回帰を追加した。

初回previewの全smokeで、667×375のStudyが発音失敗案内の下に単語を配置するとtriageの下端を切ることを確認。Macでもblocked fixtureで同じviewport ratio 0.84600228を再現した。短い横向き画面では単語と音声操作を横に配置し、案内本文と44px操作と解答領域を保持する。667×375/844×390のblocked・その他error・再描画・反転を回帰へ追加した。viewportの全表示基準を緩めていない。

追加修正後は202files/2101unit・型/migration/依存境界・buildと、関連43browserが成功した。667×375の失敗案内と単語・音声操作・解答ボタンの全表示も実画像で確認。追加差分の独立read-only reviewに残る確認済みblockerはない。

以下は初回受入snapshotであり、追加修正後の結果と公開SHAはPR62/workflowとdelivery/publicationを正本とする。

## 検証と証拠

202files/2101unit、型、migration replay、未使用/依存境界、build、合成local D1 API、security auditが成功。auditは既定のlocal教材QA用xlsx例外1件を保持し、依存/lock変更なし。

36件の追加browser受入（ゲスト19、共通hook/Study8、Quiz9）を標準full suiteへ登録し全件成功。1366×900、320×740、390×844、844×390で、復元・once/StrictMode・masked answer・次/戻る/requeue/restart・manual/例文・mute/再訪/保存不能・遅延/blocked/unsupported・modal・pagehideを確認した。最終全回帰はCloudflare231＋IDB9、計240unique成功、retry 0、preview専用2件は本候補未配備のためskip。追加ボタンを解答として選んでいた既存test helperは選択肢scopeへ修正し、SRS/receiptの保証を保った。

最終候補と同じapp source 12ファイルのSHA256を照合したNative Mac Chrome 154では、fakeなしのブラウザー音声APIで180voices、自動/手動それぞれのstartとend、pageerror 0を観測。先の検証では手動割込みのinterruptedも観測した。物理スピーカーの聞こえ方は直接確認していない。スマホはviewportでの受入であり、実Safari/iOS、物理スマホ、支援技術、長期学習効果は未検証である。

ブラウザーごとの音声開始はWeb Speechの実装に依存する。拒否や未開始は短い手動操作案内へ戻す（一次資料: [Web Speech API specification](https://webaudio.github.io/web-speech-api/#tts-error)、[SpeechSynthesis error event](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisUtterance/error_event)）。開始/終了イベントは音声APIの観測であり、本人の聴感確認の代用ではない。

証拠・画像・各log・最終SHA/patchと起動方法は独立delivery `medace-first-visible-audio-delivery-20261008` に保全する。旧42661、保護対象41812、原本repo、本番D1には触れない。本人の公開許可により通常PR/CI/preview/productionと公開受入を実施する。原本repoと保護runtimeを保持し、公開受入はゲスト導線で実学習記録を書き換えず、本番D1の保持はread-onlyで確認する。公開完了はworkflowと公開URLのSHA/受入が揃った時に記録する。
