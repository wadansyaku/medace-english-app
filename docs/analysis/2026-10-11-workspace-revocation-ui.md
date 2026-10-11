# 明示業務 grant の失効と画面内データの破棄

確認済みの業務画面で grant を REVOKED にする、または version を更新すると、再取得が403になる一方、取得済みの生徒情報・答案が表示されたままだった。

最新の明示grantを確認するサーバー境界は、正のcaptured versionに対して失効・version不一致・workspace flag喪失・grant不存在を検出したとき、403の `WORKSPACE_ACCESS_REVOKED` と要求元のUID/workspace/教室/versionを返す。canonical version 0、担当外の一般403、identity/教室の偽装拒否にはこのmarkerを付けない。

API clientは全JSON error payloadを `ApiError.details` に保持する。失効markerと現在の確認済みcontext・要求時context・generationが完全一致した場合だけ、タブの選択を消し、進行中リクエストをabortする。遅れて到着した古いerror bodyや別workspaceのmarkerは現在の画面を解除しない。通常403・503・通信失敗では確認済みの表示と入力を保持する。

既存の `useStaffWorkspaceSwitch` へ失効通知を接続し、先にuserをnullにしてAppのcontext keyed Suspense配下をunmountする。これにより生徒情報、添削queue、答案manual、添付File、upload retry cache、支援dialog/下書きが破棄される。スタッフ本文・queue・入力はhook内メモリにあり、端末storageへ永続化していない。本人の正本sessionを再取得し、同UIDかつworkspace無しの場合だけ本人homeへ戻す。再取得失敗時も旧業務画面は再表示せず、再ログイン案内を表示する。DBの保存済み答案・学習・所属・正本roleは削除/変更しない。

使い捨てlocal D1を変更するbrowser回帰は既存owner suiteに追加する。runnerは実HEADのSHAをlocal runtime/readinessへ渡す。private metadataはpersistDirとsource SHAのみ、0600のファイルへ記録する。private copied Functionsにだけgeneration応答headerを追加する。ローカルhost、明示synthetic runtime、metadata権限、生成ディレクトリ、実HEAD、配信SHA、HTTP generation、D1内generation markerが一致しない場合はSQL実行前に失敗する。Wranglerの操作は `--local --persist-to` に固定し、外部targetでは当該テストをskipする。production Functionsへテスト用middleware/権限変更APIを追加しない。

単体テストはmarker serialization、raw STUDENT保持、一般拒否、UID/教室/workspace/version不一致、canonical version 0、error-body競合を確認する。browser回帰は390px/desktopで成功表示から実D1のREVOKED/version更新、答案再取得、本人home、入力/添付消去、reload、再付与後の空入力を確認する。通常403とnetwork失敗では未保存答案を保持する。実運用の権限付与/取消、実生徒データ、本番/previewへのSQL実行はこの候補作成では行っていない。
