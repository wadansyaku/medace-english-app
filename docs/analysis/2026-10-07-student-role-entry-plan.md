# 生徒の共通入口と所属管理の実装計画

2026-10-07の本人追加指示を、実装前に計画へ追加する。承認されたLibrary計画 `libfile_c6ea3740c63081919bf5560793e979ca` version1（親照合SHA `a9b90eb1843264ea72ef284a34a5530a18e51f6bd63ff2f060db9949f6530ccc`）の第4節・A7に対応する。基準は単語優先UI候補b96b10e。公開済み182、検証中のUI候補、今回の追加段階を区別する。

現状の5入口は個人生徒デモと4種の役割案内であり、内部roleはSTUDENT/INSTRUCTOR/ADMINの3種。個人と組織所属の生徒は既にSTUDENTで学習画面も共通。本登録はサーバーでSTUDENT固定。公開URLが役割や所属を付与する経路ではない。[コード・API・migrationの監査](./2026-10-07-role-entry-rbac-audit.md)を根拠とする。

1. 通常のトップ・登録・ログインは生徒に一本化する。4つの役割カードや切替を下部・折りたたみに残さない。講師、教室/学校管理者、サービス管理者は既存 `/teacher`、`/school-admin`、`/service-admin` と旧URL互換を使用する。通常生徒画面に管理用選択肢を置かない。
2. `/student` は既存STUDENTを使う生徒入口として扱う。個人/所属という新しい登録種別を追加しない。認証後は保存済みの実roleに対応する既存専用workspaceへ遷移する。URL、body.role、表示名で権限を付与しない。サーバーの本人・tenant・担当範囲の認可を維持する。
3. 共通の生徒ホーム・単語・記録を保ち、ACTIVE所属、教材権利、講師課題・返却を必要時に表示する。共通UIを全有料教材の開放と解釈しない。内部enum、uid、履歴、receipt、教材原本・承認、planとschemaは維持する。
4. 所属の付与は既存サービス管理者ADMINの申請provisionを再利用する。対象uid・組織・所属role・planを確認し、成功/失敗と既存COMMERCIAL_PROVISIONED監査を保持する。生徒・講師・学校管理者による自己昇格、新しいADMIN登録、全員の自動昇格を追加しない。学校管理者の付与権限拡張は別仕様とする。
5. 名称は本人へ確認中。「所属生徒（塾・教室など）」と「塾所属の生徒」を比較する。回答がない間の表示案は組織種別を限定しない「所属生徒」とし、本人確定と区別する。表示ラベルを統一し、DB値・既存本人displayName・過去監査payloadを一括renameしない。

追加migrationは不要。既存provisionの原子性/CAS改善や新しい所属変更APIはこの入口整理と分ける。実本番の所属・永続権限・料金・AI設定を変更しない。

受入は通常入口の管理カード不在、専用URLと旧URLの直接アクセス、ログイン後のrole別遷移、同じSTUDENTの個人/所属の保存・再訪を確認する。サーバーでは非STUDENT登録拒否、profileへのrole/所属/plan注入で不変、非ADMIN provision拒否、他tenant/担当外アクセス拒否、ADMINによる合成所属付与後の同じuid・学習履歴保持・監査を検証する。PC/mobile/keyboard/back/reload、エラーとretryを含め、デモ案内と実アカウントを区別する。

実装と検証をローカルbranchで進める。必須gateと親側の公開判断まで、公開済み・本番所属変更済みとは扱わない。

## 最終ローカル受入（2026-10-07）

アプリ受入source `896a4a031138e8fa85d8544cf5202a3a4220e8b2`、branch `codex/medace-student-entry-20261007`。型/199files2045unit/build成功。標準全browserはCloud188PASS＋preview専用2SKIP、IDB9PASS、90秒/retry0/worker1、command exit0。構成/到達性、API・認可と保存、58migration、security例外1件は証拠sourceを区別し保持する。実nativeはsourceごとの7core＋2layout（97資産hash照合）を保持し、最終Adminの通常応答/表示onlyfixture 2case・10幅scene・18資産hash照合を追加。詳細は[確認問題と受入](./2026-10-07-integrated-ui-acceptance.md)。

根本のrole/RBAC/tenant/plan/原本/保存を維持。TOB_FREEの正規GROUP_ADMINをWriting任意取得403で全体errorにするUI不具合と、Admin mobile横はみ出しを追加修正。最終通常入口は生徒のみ、CTA「登録不要」は途中折れを避ける。実Safari/iOS/IME/実zoomは未検証。公開は未実行、最初の公開禁止によりpush/PRが自動レビューで拒否されたため明示許可待ち。長期復習0ae54239は独立の未接続契約であり、B1の本番再参加は未実装。
