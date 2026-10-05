# 登録不要Naru版の公開候補

2026-10-05、本人がNaru1530全項目・6種類の基本演習を登録なしで利用できる版の本番反映を明示承認した。公開対象は保存候補 `13e1ee34cfc84bfdc4c55e4f4804a74073bf436c` のゲスト/カード/教材既定改善と0048。Writing安全候補 `e615746` と未完成のAPI移行・新課金は含めない。

## 統合と保持

最新mainは `915f4f7de47620e8d3c2467b29a0953e07c45b17`。そのtreeは元候補の基点 `33a6b8d1b85060bfe735b3c99cb82373bcf7b5ad` と完全一致した。独立cloneへゲスト2 commitをrebaseし、保存候補13e1ee3との全tracked tree一致を確認した。追加変更は公開記録と、6演習を実入力してAI/提出の通信0を確認するbrowser gateのみ。

元repoの未コミット文書4件、検証済みゲスト候補とWriting候補、既存動画を保持。SSD `/Volumes/YodaiOffload` はAPFSでマウント済み。Library保存は公開と切り離す。以前のTLS/capacityでPR・remote migration・本番deployは未開始だった。

## 保存とAPI境界

匿名公開は固定Naruのみで、権利・レビュー・QA・全語の原本readyリンクを検査する。未承認教材/例文や認証付き画像を公開しない。7日端末記録、5000回答上限、登録後の本人による明示取り込み、100件batch、expectedUserId、別本人拒否、receipt再送、部分成功ack、XPなしを維持する。既存の明示教材選択をNaru既定で上書きしない。

ゲスト6演習は端末の判定と固定教材のみ。GeminiやWriting提出を呼ばない。公開gateで意味・スペル・文法・和訳・読解・作文の実入力、API mutation/AI呼出0、pageerror0、320px横溢れ0を記録する。ログイン後の既存AI経路やAPI接続/課金は変更しない。

## 検証・配備

保存候補13e1ee3は1366unit、型/build/API/migration/境界/audit、Cloud157＋IDB9の166unique browserを受入済み。同じコードの成功を再利用し、新しいbrowser gateと型/buildをローカルで確認する。最終SHAの通常PR CI、正規previewとremote-readonly gates、preview限定検証、main統合後のproduction workflowは必須のまま通す。

この文書のcommit時点では公開前。実際のPR番号、最終SHA、workflow/preview/production URL、0048適用、recovery bookmark、公開後の匿名Naru1530取得と主要操作の結果は、作業成果フォルダーの公開引継ぎへ記録する。未完了を成功として扱わない。

## ロールバック

0048は新しいclaim/attempt表と索引だけを追加し、旧テーブルを書き換えない。通常は0048を残して直前の安定コード915f4f7へ戻す。取り込み済みSRSは表削除で取り消せず、claim/再送記録を失うため、追加表を削除しない。DB復元はbookmark以後の正当な書込みも巻き戻すので、通常のcode rollbackと分けて判断する。production workflowの配備前bookmarkを保全する。
