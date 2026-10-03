# 画面整理版とStart版の公開作業

2026-10-03 UTCの公開準備記録。配備の現在状態は [PR #54](https://github.com/wadansyaku/medace-english-app/pull/54) と正規Actionsを参照する。この文書は配備成功を先取りしない。

本人の後続指示により、画面整理版とStart版の既存本番URLへの公開を進める。講師への送信、新しい第三者権限、DBdump、他教材の権限拡大は含まない。原本repoと独立候補・動画runtimeは保持する。

Start `4837870` は画面整理 `28fa869` の後続。最新main `4c4690a` と旧基準 `e88a7fd` はtree同一で、公開用 `8471120` はStartの681 tracked filesと全tree同一だった。最初のCI/previewは1186件へ増える前の1173unit、134 unique local browser、4 deployed preview smokeを通過。実previewのStartは7件成功と、同一Originを付けて再確認した別account拒否1件が成功した。直接APIのOrigin無し403はCSRF保護の正常動作で、テスト側を実ブラウザーと同じOriginへ合わせた。

## PRレビューの保存修正

回答canonicalのcommitと、weakness・課題進捗の投影確認を `projectionStatus` で分ける。PENDING時は保存済み回答を失敗扱いで捨てず、同ID・同内容の再確認を促す。QuizはCOMPLETE後に一度だけ得点へ反映し次問へ進む。English PracticeはPENDINGを端末queueに残し、同IDで手動再確認または再訪時の再送を行う。

English Practiceの委譲IDはuserと元attempt IDからnamespace付きSHA256で決定する。投影・委譲確認metadataが完了するまでdelegated flagを1にしない。応答喪失・metadata失敗・同時再送でもcanonical履歴とCBTを増やさない。serverの再認可、内容409、報酬計算、原子的保存を保持する。IDBも投影待ちを明示する。

旧ID無しAPIはCOMPLETEの204互換を維持し、PENDINGには生成ID付きreceiptを返す。bodyを読む旧callerはそのIDで回復できるが、bodyを無視する旧callerまで再送を保証しない。旧委譲完了行に新stable receiptが無い場合は、対応情報の不足による重複writeを避けて旧完了互換とする。公開版のQuiz/English Practiceは安定したIDを使う。

対象server45、frontend27、実hook/browserのPENDING→同内容再送→一度だけ加点が成功。最終verify:fastは152files/1186unit、46 migration replay、型・境界・到達性を通過した。修正後の必須CIと正規preview全回帰を再実行する。

## 配備と復旧

0044/0045は追加schemaだけで、教材・原本出典・履歴・XP・role・プランの一括変更はない。正規preview migration→品質/台帳/権限gate→deploy→実preview確認を通してからmerge。本番は直前TimeTravel Recovery Bookmark→migration→gate→deploy→live確認を通す。

公開前のSELECT-only集計は、本番59冊67241語、learning_histories198、events245、users11、原本4・entries1531・sheet rows3101・word links1530、FK0。previewは12冊15139語、histories83、users20、FK0。migration前後を照合し、受入用の合成account増加は別に記録する。

復旧はschemaを残したコードrollbackを優先する。旧UIではguest記録が表示されず、延期済み未診断生徒が診断必須へ戻る。TimeTravelは後続の正当なwriteも戻す最終手段。公開SHA・URL・workflow・bookmark・画像・実操作証拠は本人Macのrelease成果へ保全する。
