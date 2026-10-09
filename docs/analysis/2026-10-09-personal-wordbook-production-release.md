# My単語帳の本番公開工程 2026-10-09

2026-10-09 17:44 UTCに、親の主会話で本人が「いつも基本的に本番反映させて構わない。」と明示した。親は今回My単語帳候補の正式CI/preview/merge/production・事後検証を承認。残る2件の独立再確認通過までmain統合しない。恒久ルールの保存は親が別途扱い、規約ファイルに公開許可を新設しない。必須gate、教材承認、認可、料金・外部AI送信の条件を維持する。

## 公開対象と証拠

基準main `4955b54d370ef62fb14502031a405e83acc4d677` から、直接単語・意味入力、登録後/ゲストの本人別下書き、原子的な個人保存receipt、返却された実教材IDからの学習を反映する。実装候補は `b5f8b81f23498ef51c19c08f69045efba928c192`、tree `822ce8c1073bf573cbf85997e9971cb5187a331a`。今回の公開用追記は方針・運用文書のみで、同候補のアプリ/API/契約/migration/testsを変更しない。

実Mac Chromeの最終local-only gateは11/11工程、214files/2426unit、Cloudflare291＋native IDB12の303browser成功、retry/flaky0。preview限定2件は実previewで確認する。CSV読込中の別下書き世代、400拒否後のpending解除write失敗、unmount後CSVを修正し、対象回帰9件・追加4ケースが成功。最終sourceの独立read-only再確認でも公開を止める重大懸念なし。独立確認は本番保存実行とは区別する。

## 正規配備と復旧

公開branch `codex/my-wordbook-release-20261009` を本人の既存repoへpushし、通常PR、必須verify、preview deploymentとdeployed-only2件を確認する。mainのsquash merge後、既定GitHub Actionsのproduction workflowでbookmark、0061 migration、配備、公開URL到達を確認する。main・run ID・URL・bookmark・読み戻し・画面証拠は独立deliveryのpublicationに保存し、同じ計画/レビューLibrary資料へ最終結果を戻す。

0061は追加receipt tableで旧Cloudflare APIと共存する。IDB v9端末へDB_VERSION8だけの旧クライアントを配信するrollbackは避け、v9互換のforward fix/rollbackを使う。端末DB削除や本番bookmark復元を通常のコード復旧に混ぜない。原本・既存語ID・学習履歴・承認台帳を保持する。

本番では実生徒のテスト答案や下書きを作らず、読み取りによる公開asset/SHA/既存履歴/教材照合を行う。保存の障害注入は合成D1/IDBとpreviewの専用合成アカウントだけで行い、実生徒本文・secret・DB exportを公開証拠へ含めない。

## 残る確認

実Safari/iPhone、実IME/ソフトキーボード、VoiceOver、一般教室での完走と7日後の学習効果は未確認。localStorage read→setItemを全並行編集の原子的CASとは扱わない。新機能・権限/料金/教材承認の変更を公開禁止解除だけで追加しない。
