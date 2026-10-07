# Naru公開後レビューの修正候補

公開済みPR59/main `182ba3d3fd4a088e46c49acbace172588132fbc1` は2026-10-07 12:21:56 UTCに通常production workflowが成功した。原本436項目、公開API/画像、1531語/638印/補完1と履歴非減少を照合済み。この記録と追加修正候補を分ける。既存のUI改善・欠訳補完・通常公開の承認範囲で、次の4件を再現した。今回の本番反映は下記の配備状態欄で確認する。

| 根拠 | 再現と修正 |
| --- | --- |
| [StudyModeの再描画](https://github.com/wadansyaku/medace-english-app/pull/59#discussion_r4206682011) | 章taskの正規化objectを毎render生成してcontrollerのload effectが再実行した。修正前専用5件中4件で余分な取得を確認。正規化taskを無条件のuseMemoにし、同じtaskで親profile/callbackが更新されてもカード・queue・進捗・同じ回答のretryを維持。task変更/利用者変更による再読込は維持する。 |
| [旧章クイズURL](https://github.com/wadansyaku/medace-english-app/pull/59#discussion_r4206682016) | 旧副詞1286–1371は1372を除外、旧形容詞1372–1530は副詞1372を含み形容詞1531を除外した。通常Naru BOOK_QUIZで既知章と完全一致する旧rangeだけ既存章resolverで更新し、正規化taskをmemo化。副詞1286–1372、形容詞1373–1531、全範囲1–1531へ。current/non一致custom/別intent/missionのobjectと数値を保持。 |
| [原本変更後の出題表示](https://github.com/wadansyaku/medace-english-app/pull/59#discussion_r4206682023) | 合成D1でsource SHA変更後にも認証済みstorage APIが旧flag=trueを返した。既存0056/0057は不変のまま0058を追加。source entry/workbook/archive row/link/annotation根拠の変更・削除・移動・REPLACEで対象の派生flagを0にし、失効記録を新表へ保持。履歴annotation本体は削除せず、旧SQL再実行・根拠の復元で無審査の再点灯を防ぐ。 |
| [標準import分類gate](https://github.com/wadansyaku/medace-english-app/pull/59#discussion_r4206682030) | 原4XLSXを保持したままESM loaderで分類を1件欠落させると、旧CLIは636件でもSQLを生成し固定638を報告した。生成前に原本637marks/held actually1を座標・語義・分類内容まで固定監査manifestへ照合。同件数の誤語義も拒否。失敗時artifact0、既存reviewed SQLは保持しauthorization artifactだけ破棄。ログは実計数から算出する。 |

旧URLには章originのfieldがなく、任意範囲が旧章とrange/intentの全情報まで同じ場合は識別できない。既存Study互換と同じ完全章一致の限定移行を用いる。新しいorigin契約を推測追加せず、その他の任意範囲とmissionは変更しない。actuallyは1361であり、副詞末尾は1372。

0058は追加・互換migrationで、既存source/word/ledger/history/approvalを更新しない。初回の合成1531語/638印と10既存表の内容、canonical ready=0、FK0を保持し、0058後に0057を初適用するINSERT word→link→annotation順序も確認した。原本の通常UPSERT/DO NOTHING再実行は638印を保持する。SQLite recursive_triggers=0で4種REPLACEの迂回を先に再現して追加triggerで閉じた。source/rowのbyte同一REPLACEも置換として別途reviewを要し、同一annotation locator/通常importの再送とは区別する。

失効は永続し、解除は原本SHA・payload/link・黄色セルを厳密に再reviewした別操作を要する。0058は適用前から存在する誤点灯を自動backfillしない。公開直前に原本のremote-readonly全照合を行い、現データに不一致がある場合は適用を進めない。本番誤りの証拠はなく、合成再現を本番データの異常と混同しない。

対象検証: Study関連23、Quiz関連46、source失効42、CLI7の対象テスト成功。修正前のfailureを保存。最初のverify:fastは既存schema fixtureの57件固定だけで失敗したため、58件と0058存在を明記して全体を再確認した。最新verify:fastは58migration/type/architecture/reachability、196files/2001unit全成功。build/API/security audit成功。独立read-onlyレビューで具体的blockerなし。初回source fixtureのsyntax failureとREPLACEの意図した4failureも保全し、試験保証を弱めていない。

実画面: frozen公開182rendererと28e988d候補rendererを専用42511/42521・別freshD1・原本1531・合成利用者で比較。親Appのfeed内容を保ったstate identity更新を実行し、PC1366/320/390で旧2/10裏面→1/10表面/余分な再取得を再現。候補は3幅とも2/10/裏面/内容/取得数を維持し、実保存204・戻る・再訪・横overflow0を確認。旧副詞quizは実pool86→87語/1372を取得、旧形容詞の副詞混入を解消し1373から取得。全章の要求終端1531を確認したが、100語上限のため実quizpoolに1531は含まれず、境界の実包含と要求範囲を区別する。keyboard二段階hint/誤答保存/戻るも成功。両backendは28e988d、rendererのみ比較。初回の正常204を200期待で誤失敗したharnessと、SPELLING_HINT初回誤答がhintのみで保存されないharnessの診断を保全し、正常契約へ修正後に全比較成功。

公開前read-only: 原本436項目すべて成功、skip0、全SELECT rows_written0/changed_dbfalse。旧8migration/schema/AI8台帳0/履歴218以上/receipt23以上/FK0を再照合。0058専用6項目もbefore成功、既存1531/638/annotation638/補完1、canonical ready0、新表/17trigger未適用を確認。doctor error0、Content QA/source ledger/B2B整合性gate成功。

全browser: source `89655e71ccfe25a0bae065a71cfe7978cd2b1f83` で標準runner/Chrome/既定timeout/retryなしのCloud183成功＋既存preview-only2skip、IDB9成功、command exit0。最初の2回は各1件失敗したためログと対象再試験を保全。第1回のWriting下書き再訪deadline失敗は同じ90秒条件の個別再試験で成功。第2回はdraft取得中のdisabled file inputへPlaywright setInputFilesが合成changeを送ってcontrollerが無視するfixture競合を特定した。実ユーザー操作と同じenabled待ちを当該testだけ追加し、アプリsource/timeout/保存assertを変えず全体を通した。

配備状態: 追加修正は独立branch `codex/medace-postrelease-review-fixes-20261007` のローカル候補。push/PR作成は自動承認レビューが当初の「push・merge・deployなし」を理由に拒否したため未実行。必須CI/preview、productionと公開後readbackは未完了。本番更新済みとは扱わない。原本・課金・権限・AI設定・実生徒の外部送信を変更しない。実Safari/iOS/物理印刷は未検証。
