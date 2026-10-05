# 標準学習プランと講師通知テンプレートのAI廃止候補

2026-10-05。公開済み `b7e0c0c8af6059c775e0298ac192dfbb6144367f` から独立したローカル候補。Writing安全候補 `f558dae7f27e135199ae2fa22ae64533c8304a24` の同内容を先に取り込み、plan/follow-upだけを変更した。本番・preview配備、push、キー取得・設定、有料生成、実生徒の外部送信は実施していない。

## 変更した動作

- 全4プランの生徒は既存 `buildFallbackLearningPlan` の標準ロジックで学習プランを作る。学習時間・週の日数・目標日と教材メタデータを使い、1日8–36語の既存範囲を維持する。既存プランの選択教材ID・順序を、現在選択可能な候補内で保つ。明示保存が成功するまで画面上の旧プランを置換しない。連打時は同じ処理中の保存を重ねない。
- 通知は介入種別ごとの純粋テンプレート。初期文、明示的な入れ直し、講師の手編集、アプリ内保存の順に操作できる。「追加する一文」はそのまま通知文の末尾へ入り、モデル指示として解釈しない。入れ直しは編集文を置換することを画面へ明記する。
- 通知テンプレートは未取得日数を0日と表現せず、学習成績・習得・合格を推測しない。プラン作成と既存プラン確認の文を区別する。生成した文は `usedAi=false` で、既存AI利用通知の保存記録やラベルは書き換えない。
- `services/gemini.ts` の旧plan/follow-up exportもローカル標準ロジックにした。互換API `/api/ai` の同actionは既存payload検証の後、planをSTUDENT/ADMIN、follow-upをINSTRUCTOR/ADMINに限定して純粋な提案を返す。既存APIのsession・same-origin検証は変更していない。キーの有無にかかわらずprovider・予算照会・AI使用ログを呼ばない。
- この2actionを有料AI機能一覧から外す。過去AI利用の集計互換に必要なaction名・旧概算単価定義は保持する。料金・契約・他actionの予算は本担当では変更しない。

## 維持する保存境界

プラン生成は成績評価ではない。未診断の英語レベルやXP、SRS、教材・単語ID、教材本文・出典、source ledgerを書き換えない。既存 `saveLearningPlan` の本人・教材権限確認と `sendInstructorNotification` のACTIVE組織・担当範囲・IN_APP保存を維持する。下書き作成だけでは通知を保存・外部送信しない。保存応答が失われた場合は保存失敗と断定せず、再取得を案内する。既存通知の重複・保存claim契約は変更していない。

## 限定検証

Node 22.19.0、独立 `/tmp/medace-ai-free-plans-notifications-20261005`、外部通信なしのmock/合成データのみ。

- 対象12files / 117unit成功。全4プランとlegacy key存在時もprovider/予算/使用ログ0、サーバーrole拒否403、不正payload拒否400、教材ID保持、保存失敗時の画面旧プラン保持、連打1保存、通知の手編集・文字通りの補足・保存前送信0を確認。
- `tsc --noEmit` と `git diff --check` 成功。
- 既存 `organization.smoke.spec.ts` の通知ケースを新文言に更新し、テンプレート入れ直し時の `/api/ai` POSTが0である受入を追加。新suite追加はない。build/full browserは親担当の統合後に単独実施するため、本担当で実render検証済みとはしない。

## 残確認とrollback

親担当のWriting修復・provider廃止境界と統合して、PC/スマホの通知入力・入れ直し・手編集・保存と標準plan保存を実render確認する。旧provider metering試験は親担当の明示test-only注入へ合わせる。この候補に新provider承認やlive生成は不要。Gemini以外のOCR/添削・月$5予算制御・未成年データ条件は別担当のmock候補に留める。

本担当のcommitをrevertすれば同2actionとUIは元へ戻る。migration・DB変更はない。既存の保存済み学習プラン・通知を削除したり、公開済みゲスト版を巻き戻す必要はない。Gemini停止の親統合候補全体を戻す場合は親引継ぎのrollbackを使う。
