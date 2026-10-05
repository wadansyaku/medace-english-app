# GPT下書きの再確認・明示再開UI

公開前レビューのPENDING回復修復に対応するローカル候補。基準はroot `c8d66210ff5f734bd35a14fe8dbeac852ebf2f65`。サーバー担当が所有するDTOの `inputDraftRevision?` と `recoveryAction?` を使用し、サーバー・migration・外部APIは変更しない。

- GET用canonical結果IDと、元のPOST request ID・入力payloadを別に保持する。別講師のcanonical IDを元callerのPOST identityへ上書きしない。
- assignment / attempt / operation / input revisionを照合して結果を採用する。canonical ID変更と明示再開の許可には一致するrevisionを必要とする。古いsame-ID fixtureは後方互換で読めるが、revisionなしの応答ではPOST再開を許可しない。
- 通常PENDINGと応答喪失時の「結果を再確認」はGETのみ。確認済み `RESEND_SAME_REQUEST` の「同じリクエストを再開」だけが元ID・同payloadの明示POSTを行う。POST開始時に再開許可を消費し、応答が失われた後はGET確認へ戻す。
- 処理待ち中は新生成ボタンを無効にする。連打や同じ操作の呼出しは別requestを作らず、別操作へもpending identityを上書きしない。保存入力のrevisionが変わった場合は古い結果・照会導線を除き、新しい入力への操作を分ける。
- 未評価の内部reason codeは日本語の操作案内へ置き換える。結果不明は再送しないこと、月が変わっても自動再送しないこと、保存答案を保持することを示す。READYも人手確認用の下書きで、本文・成績を自動変更しない。

対象hook/parser/実modalのSSR・callback unitで、canonical ID照合拒否、alias GET、元POST identityの維持、再開応答喪失、二重クリック、revision更新、capability無効後のread-only確認、入力保持、raw code非表示を確認した。サービスparserは新optional fieldsの値と型、空の結果ID、不正reasonを拒否する。

関連8ファイル144 unit、型チェック、差分チェック成功。型確認は合意済みDTOを作業用にコピーして行い、契約ファイルをこのUI commitには含めない。provider担当の契約・server修復との統合後にrootが型・全体gate・合成実Chrome受入を実行する。新キー、live API、build、smoke、配備、pushは行っていない。
