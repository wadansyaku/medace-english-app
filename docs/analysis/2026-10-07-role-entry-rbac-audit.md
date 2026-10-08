# 生徒共通入口・役割/RBACの計画前監査

対象: `/tmp/medace-vocabulary-first-20261007` HEAD `b96b10e1a1e15325b81d81daaab18955de4fbc34`。開始・終了の `git status --short` は空。2026-10-07にソース・契約・migration・既存テストを読み取った。source/test/build/runtime/DB/API/remote/git変更は実施していない。この監査文書のみ別evidenceへ保存した。公開保留の候補を本番実装済みとは扱わない。

本人要件は「5ロールとも見れるが、生徒だけにし他は別リンクのみ」「生徒とビジネス版生徒は同じ、管理者などが昇格」「ビジネス版生徒の名前変更」「先に計画、その後実装」。現行コードで自由昇格バグを確認したという報告ではない。表示名は本人回答待ちであり、この文書では確定しない。

## 確定した現行構造

内部の `UserRole` は3種であり、5ロールenumは存在しない。個人と所属生徒は既に同じ `STUDENT`。トップの5選択は個人生徒デモ＋4つの公開役割案内/デモであり、本登録のrole選択ではない。トップの4ボタンは公開案内を開くだけで、実roleや所属を変更しない。

| 表示上の入口 | global role | 組織内role | 公開案内URL | 認証後のworkspace | 確認箇所 |
| --- | --- | --- | --- | --- | --- |
| 個人生徒・期間限定デモ | STUDENT | なし | `/`（デモはdetails内） | `/dashboard` | `AuthExperienceScreen.tsx:210`、`config/access.ts:4` |
| ビジネス版 生徒 | STUDENT | STUDENT | `/student` | `/dashboard` | `shared/publicBusinessRoles.ts:68`、`:88` |
| 講師 | INSTRUCTOR | INSTRUCTOR | `/teacher` | `/instructor` | 同`:99`、`:119` |
| 学校管理者 | INSTRUCTOR | GROUP_ADMIN | `/school-admin` | `/instructor` | 同`:130`、`:150` |
| サービス管理者 | ADMIN | 不要 | `/service-admin`、互換 `/admin-access` | `/admin` | 同`:161`、`:201` |

公開URLには旧 `/public/roles/{student,instructor,group-admin,service-admin}` の互換解析もある。`hooks/useAppNavigation.ts:98` は実workspaceをroleで制限、`:122`以降の公開パス解析は案内を返す。`App.tsx:155` はrender前に `canAccessAppView` を確認する。直URLはrole付与の根拠にならない。通常login後は保存された本人roleに合うhomeへ進む。

| 区分 | 定義・契約・経路 | 現行挙動/最小変更の境界 |
| --- | --- | --- |
| global role | `types.ts:2` UserRole STUDENT/INSTRUCTOR/ADMIN | 値・既存uid・保存契約を維持する |
| 組織内role | `types.ts:8` OrganizationRole STUDENT/INSTRUCTOR/GROUP_ADMIN | 所属と管理能力。global ADMINと学校管理者を混同しない |
| 役割表示 | `types.ts:14` ORGANIZATION_ROLE_LABELS、`:26` COMMERCIAL_WORKSPACE_ROLE_LABELS、`config/access.ts:31`、`shared/publicBusinessRoles.ts` | 「グループ生徒」「ビジネス版 生徒」が分散。決定後に所属生徒の表示を揃える。学習画面分岐・plan名・DBenumをrenameしない |
| プラン/entitlement | `types.ts:142` TOC_FREE/TOC_PAID/TOB_FREE/TOB_PAID、`config/subscription.ts` | 学習画面共通と教材許可共通は別。プランによる教材・広告・機能・予算の制限を維持 |
| 本登録 | `contracts/storage.ts:636` EmailAuthRequest、`functions/_shared/api-routes/auth-profile.ts:99` | SIGNUPの非STUDENT指定は403、createUserもSTUDENT固定。通常フォームはroleを送らない (`useAuthExperienceController.ts:214`) |
| 本login | 同 auth-profile email-auth | email/password確認後にDB本人profileを返す。body.roleをrole変更として適用しない |
| 本人profile更新 | 同`:235`以降、POST `/api/profile` | uid一致を検査。SQL更新は表示名/学年/英語level/studyMode/診断延期だけ。role/所属/planを更新しない |
| デモlogin | DemoLoginRequest、POST `/api/auth` action=demo-login | 新しい期限付きdemoユーザーを作成し48時間session。既存本人アカウントを昇格する操作ではない。内部key・role組合せ・demo識別を維持 |
| デモ設定 | `shared/runtimeFlags.ts:68`、`functions/_shared/runtime.ts`、`config/runtime.ts` | business demoの既定は**true**（production相当でも）、admin demoの既定はproduction false。明示envは別。deploy workflowはadmin false既定をserverへ同期。remote設定は今回読んでいないので本番business設定値は未確認 |
| 公開案内 | `AuthExperienceScreen.tsx:221`、`PublicRolePage.tsx:48`、`components/PublicInfoPage.tsx`、BusinessRolePreviewSection | トップ4cardと別 `/public` に役割案内。案内primaryがdemoなら明示クリックでdemo、無効なら静的構成previewへscroll。別「登録済みのアカウントでログイン」は共通login |
| 正本所属 | `organization-memberships.ts:69`、`:132` | ACTIVE membershipとorganizationを読む。tenant管理操作はcallerの正本organizationId/組織roleを検査。組織表示名をpermissionとして使わない |
| legacy互換 | 同`:103`、`:424`、`auth.ts:544` | session取得はusers shadowからの既存membership同期後にhydrate。shadowとmembershipの両方を既存運用で更新する前提を維持し、表示名renameだけで同期仕様を改造しない |
| 管理者による所属/role付与 | POST `/api/storage` `updateCommercialRequest`、`storage-action-registry/commercial.ts:29`、`commercial-actions.ts:251` | **サービス管理者ADMIN限定**。PROVISIONEDで既存uid/TOBプラン/組織/組織roleを指定。STUDENT→global STUDENT、INSTRUCTOR/GROUP_ADMIN→global INSTRUCTOR。既存uid・学習履歴を作り直さない |
| 学校管理者の操作 | organization registry、`organization-assignment-actions.ts:29`、`:229`、`:296` | 同tenant内の担当割当、クラス、講師担当範囲、組織profile等。一般的なrole昇格APIは存在しない。サービス管理者ADMINへの昇格APIもこのprovision契約には無い |
| 申請と権限変更 | submitCommercialRequest / public commercial-request vs updateCommercialRequest | 生徒は申請を作れてもOPENから権限を付与しない。requestedWorkspaceRoleは希望であり付与roleではない。list/update/初回運用prepareはADMIN限定 |
| 認可の最終境界 | `/api/storage` route requireUser/same-origin、`storage-actions.ts:26` requireRole、各organization handler | UIや公開URLの有無で代替しない。サービス管理者は明示的に全tenantへ管理可能な操作があり、学校管理者/講師のtenant境界とは分ける |
| 監査履歴 | `commercial-actions.ts:314`、`organization-memberships.ts:392`、`organization-settings-actions.ts:76`以降 | COMMERCIAL_PROVISIONEDにactor/target/付与plan・組織roleを追記。組織設定は同組織の直近20auditを表示。担当変更は別assignment event+organization audit。完全な過去権限履歴や変更前後CASを新実装済みとは記さない |
| migration | 0002 commercial fields、0003 organization_role、0014 commercial_requests、0017 organization/membership/audit、0018 target_organization_id、0019 teaching_format | 既存schemaと履歴を保持。0017はuser+org PK、ACTIVE userの部分unique、audit FK。今回の入口/表示名変更に新migrationは不要 |
| IDB | `services/storage/auth-session.ts`、`shared/storageMode.ts` | ローカルmock mode。authenticateは本番と同じ認証/role拒否保証を実装したものではない。Cloud正本のRBAC受入証拠にIDBを使わない。通常storage defaultはcloudflare |

## 計画へ追加する具体案（未実装）

**R1 生徒共通入口・役割専用リンク**: 未ログイントップは登録不要学習＋生徒向け新規登録/loginの既存導線を主操作とし、個人/所属を選ばせない。トップの4役割cardと重複する「ビジネス版生徒」の選択を除く。講師・学校管理者・サービス管理者は既存 `/teacher` `/school-admin` `/service-admin` の別リンクへ寄せる。共通生徒入口と `/student`・旧公開パスの互換を維持する。役割を試すdemoと登録済み本人のloginは明確に区別し、URL変更や公開案内表示だけではsession/roleを変えない。admin signupは追加しない。

トップに最小の「講師・管理者用リンク」を残すか、別案内 `/public` からだけ辿らせるかは本人の「別リンクのみ」の解釈として親が計画に明記する。どちらでも4大型cardや5つのアカウント種別選択を通常生徒開始面へ戻さない。既存本人loginのbackend endpointをroleごとに分ける必要はない。

**R2 共通STUDENT＋所属/entitlement**: 個人/所属のhome・単語・quiz・学習保存は同じSTUDENT UIを使う。既存organizationId/organizationRole/planと機能permissionから、必要な所属名・講師配布課題・通知等を表示する。「同じ生徒」は全教材gateやpaid機能の全開放を意味しない。内部UserRole/OrganizationRole/CommercialWorkspaceRole/SubscriptionPlan、APIキー、DB値、既存uid・学習履歴・source/provenance・receiptを維持する。

**R3 名称統一**: 本人が新名称を確定後、`shared/publicBusinessRoles` のtitle/copy、`ORGANIZATION_ROLE_LABELS[STUDENT]`、`config/access` のfallback等を表示用の同じ語へ揃える。組織所属が無い個人生徒は「生徒」または「個人学習」の既存意味を維持し、所属ある生徒は所属名も表示できる。実ユーザーdisplay_name・過去監査payload・demoの既存保存recordの一括renameは行わない。デモ用displayName文字列を変える場合も新規デモ生成時だけ。学習教材BUSINESS_ONLYの「ビジネス版」、subscriptionのビジネスplan名まで本人の名称要件と同一視して置換しない。

| 未確定名称候補 | 利点 | 範囲/必要な説明 |
| --- | --- | --- |
| 所属生徒（塾・教室など） | 学校・教室・法人等の既存tenantモデルにも使える | 通常学習UIは「生徒」、所属欄に組織名。短い「所属生徒」だけでは所属先を補う必要あり |
| 塾所属の生徒 | 塾所属を直ちに理解しやすい | 学校・別組織を扱う現行モデルには狭い。対象を塾に限定する事業判断とは切り分ける |

**R4 既存サービス管理者による付与を整える**: 通常signupはSTUDENT固定。所属生徒追加・講師/学校管理者付与は既存ADMINの申請provisionを再利用し、反映対象uid/組織ID/付与role/planを明示して実行・成功/失敗を表示する。サービス管理者ADMIN発行は今回の公開登録対象にしない。生徒本人/通常講師/学校管理者の自己昇格は引き続き拒否。学校管理者にも他者昇格を許すなら、対象tenant・許可role・同tenant対象・管理者自身の変更/最後の管理者保護・監査を別の権限仕様として先に決定する。今回の最小案にはその拡張を含めない。

既存provisionは複数SQLのmembership/user/request/audit更新であり、新しいCAS・idempotent原子付与が完成しているとは説明しない。今回UIだけなら既存処理を再利用。新専用role変更APIまで拡張する判断が出た場合は、変更前後、期待version、再送ID、原子更新、監査をその追加scopeに含める。

## 既存検証対応と追加受入

以下は**テストソースの確認**であり、この担当は実行していない。

| 現行の証拠 | 確認できるテスト契約 | 今回追加/変更する受入 |
| --- | --- | --- |
| public-business-entrypoints.test.tsx | トップ4card存在、公開専用入口、production business demo有効/admin preview、noindex | トップ4card不在・単一生徒入口、選定した別リンク到達、全旧URL互換、確定名称。既存「トップ4card存在」の期待を新仕様へ更新 |
| appNavigation.test.ts | 公開直パス/旧パス/admin-access解析、route保存、englishPractice student限定 | 未認証/STUDENT/INSTRUCTOR/ADMIN×admin/instructor URLの拒否、公開案内の直アクセスが本人session/roleを変更しない |
| auth-experience-focused/controller tests、auth-focused smoke | 通常STUDENT signup、login入力/再送/error、深い学習routeをlogin後保持 | 個人/所属の共通login、同じuid・学習途中route/保存記録を維持、role一覧選択無し。未登録admin URLでadmin signupを出さない |
| organization-memberships.test.ts | ACTIVE無しの組織shadow/TOB権利解除、個人paid維持（hydrate単位） | 表示名・入口変更後もcanonical所属とplanを読み、同じSTUDENT UIを使う。legacy同期は別に既存仕様を保持 |
| commercial-actions.test.ts | requestedBy本人IDだけの申請閲覧、未確認email一致による他人申請漏洩防止 | signup ADMIN/INSTRUCTOR指定403、login/profileへのrole/所属/plan注入でDB不変、非ADMIN updateCommercialRequest403・権限/申請/監査不変 |
| run-api-integration-tests.mjs:708/:721/:2080 | 生徒登録→ADMINによる講師/学校管理者provision、次session反映、COMMERCIAL_PROVISIONED監査 | 所属生徒付与後もglobal STUDENT、同じuid/語/本文/履歴/receipt件数・内容保持。管理者付与後のroleに応じた既存home。新規本生徒を4planで確認 |
| 同runner:995/:1105/:1167/:1176/:1220、organization smoke | 他組織担当割当403、担当外worksheet/通知403、他組織mission403、クラス担当範囲 | URL/対象studentUID/organizationIDを他tenantへ変更して403、データ不変。同tenantの既存許可操作は成功。サービス管理者の既存全体管理は維持 |
| commercial/organization smoke | 申請はOPEN、ADMIN承認/反映、組織role/担当・クラス操作、audit表示 | 準備済み合成accountでPC/mobile/keyboard/back/reloadの生徒開始と3専用入口。実アカウントとdemoの区別、エラー/成功の状態表示 |

付与受入は「ログインuser本人の既存uid」を使い、別studentや別tenantへ履歴を付け替えない。原本教材/approval/可視性/source gateは今回変更しない。保存未完了/同じattempt再送/応答喪失/再訪の既存回帰も対象操作で維持する。公開は計画反映→名称回答・scope確定→実装→対象検証→統合/公開判断の順とし、今回の監査では実装や公開に進まない。

## 親へ渡す判断点

- 入り口は表示整理。現行global3roleとSTUDENT共通UIを土台にし、enum/DB総rename・新登録種別・自動昇格を追加しない。
- 昇格の最小仕様はサービス管理者ADMINの既存provision再利用。学校管理者への権限拡張を本人から明示されていない段階で混ぜない。
- 新名称は本人の選択待ち。「所属生徒（塾・教室など）」と「塾所属の生徒」を計画上未決として記録する。
- business demoはコード既定で有効、admin demoはproduction既定無効。隠すだけでAPI停止済みとは記さない。今回デモ停止自体まで行うなら別の明示scopeとして両client/server設定と回帰を計画に載せる。
- このread-only監査の確認済み新blockerは無し。実装開始前に上記名称・リンク掲載場所・付与authorityを計画で明確にする。
