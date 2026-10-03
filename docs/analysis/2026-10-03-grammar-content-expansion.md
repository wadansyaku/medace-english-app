# 文法問題の量・品質の改善（2026-10-03）

ローカル候補 `/tmp/medace-chapter-study-20261003`、branch `codex/medace-chapter-study-20261003` に、独自の64本文を追加した。26単元を各2本文以上で扱い、穴埋め・英語語順の二形式で利用できる。**学習内容は64問であり、形式違いの128表示を128の独立問題とは数えない。** 本番配備・DB変更・実生徒データ利用・外部AI送信は行っていない。

## 監査で確認した問題

| 監査対象 | 変更前の確認結果 | 今回の対応 |
|---|---|---|
| 固定問題 | 独立した固定文法bankは0問。単語例文・fallbackを加工していた | 問題ごとの安定IDを持つ64本文を追加 |
| fallback量 | 26単元・85テンプレート（各3〜4）。最低levelはA1=10/A2=28/B1=42/B2=5/C1=0/C2=0 | 単語だけを置換した出題数とは分けて、原文・文脈・誤答を作成 |
| 単元整合 | `time-preposition-phrase` を要求しても、使えない文からSVOにfallbackし、`Students ____ the material today.` / `monitor` が時の前置詞のラベルを持つ場合がある | 新bankは選択単元と実問題を対応させ、不足時に別単元の穴埋めを補充しない |
| 正答一意性 | `Learners ____ monitor the material today.` の can/should/must/will は、文脈なしではいずれも成立 | 回答前に意味・時点・必要な文体を指定。一般に正しい表現を無条件に誤りと説明しない |
| 英文の自然さ | 素材によって `Using monitor is better than guessing.`、`A coach explained that players needed how to monitor the material.` のような文が生成される | 文・日本語・選択肢を一つの設問として独立レビュー |
| 解説 | 単元共通の説明が中心で、今回の誤答を選んだ理由が分からない | 全64問に正答理由、3誤答それぞれの理由、和訳を付ける |
| 語順の別解 | ID配列の単一順序のみでは自然な副詞・時の句の移動も誤答になり得る | レビュー済みの代替順序と、同じ表示のchip交換を受理 |

旧単語ベースのbuilder・既存ID・履歴は維持した。旧fallbackの上記制約は、この新bankを使わないQuiz/印刷等では解消を主張しない。とくに既存印刷はcontextを印字しないため、新bankを接続する場合は回答前文脈の印刷を別途整備する必要がある。

## 追加量と難度

| levelの目安 | A1 | A2 | B1 | B2 | C1 | C2 |
|---|---:|---:|---:|---:|---:|---:|
| 新しい本文数 | 10 | 21 | 23 | 9 | 1 | 0 |

学年・CEFRは作問上の目安で、公式な認証や全範囲の網羅を示さない。基礎的な不定詞目的用法・分詞・最上級・間接yes/no質問を、発展問題として水増ししないよう難度札を調整した。C2本文は追加していない。

| 単元 | 本文数 | 単元 | 本文数 |
|---|---:|---|---:|
| 基本文型SVO | 2 | be動詞 | 2 |
| 基本時制 | 2 | 進行形 | 2 |
| 助動詞 | 3 | 時の前置詞 | 2 |
| to不定詞 | 2 | 動名詞 | 3 |
| 分詞修飾 | 2 | 比較 | 3 |
| 代名詞 | 2 | when/while節 | 2 |
| 受け身 | 2 | 現在完了 | 4 |
| 関係詞 | 3 | 現実の条件 | 2 |
| 仮定法 | 4 | 主語・動詞の一致 | 3 |
| 疑問文の語順 | 2 | 否定 | 2 |
| 間接話法 | 3 | 動詞の語法 | 3 |
| 形容詞・副詞 | 2 | 名詞の語法 | 3 |
| イディオム | 2 | 会話表現 | 2 |

追加12本文には、完了の経験・完了進行、非制限関係節、過去の後悔・混合仮定法、remember doing/to do・stop doing/to doの意味、否定命令の間接話法、the number/a numberの一致、比例比較を含む。冠詞の音、mustの推量も基礎の穴を補った。市販問題の大量転載・教材の無断変換を行わず、この変更で新しく作成した。

## 出題・採点の契約

- `config/grammarQuestionBank.ts`: `OriginalGrammarQuestion` と64本文。IDは `grammar-original-20261003-*`。今後も既存IDを再利用して別内容に差し替えない。
- `utils/grammarQuestionBank.ts`: `buildCuratedGrammarPracticeItems` がモード・単元・学習者level・seed・除外済みIDで選択する。1セット内で重複せず、まず異なる単元を均等に扱う。難度を勝手に上げず、選択範囲が少ない場合は存在する数だけ返す。最大60問、不正な件数は空で返す。
- 新項目は `source: 'curated'`、`wordId/bookId/word` は空。実在する単語・教材IDを捏造しない。本文のIDは `feedback.questionId` に持ち、形式別項目IDにはモードを付ける。
- `isGrammarPracticeOrderCorrect` が完全なchip集合を検証し、レビュー済み順序の英文と照合する。表示が同じchipの入れ替えを不正解にしない。非制限用法のコンマは画面用chipで残し、採点では句読点を正規化する。
- 文頭へ移動すると意味が変わる `seeing you next week` は一つのchunkにした。Look!の位置・会話の順序が必要な問題では、その指示を回答前contextに書く。
- UI接続は他担当の `EnglishPracticeHub.tsx`。回答前にcontext、判定後に和訳・正答理由・選んだ誤答理由を表示し、全誤答理由・別表現は任意詳細にする。本文の全文英文は判定後。語順の和訳は出題の意味指定なので回答前にも含む。

## レビューと検証

独立担当が全64本文の穴埋め・語順を読み、**content ACCEPTED 64/64、HELD 0** と判定した。修正前の指摘と解消経緯、静的UI接続の確認は [独立レビュー](2026-10-03-grammar-content-review.md) に記録。forの説明、自然な別語順、時点の同期、入部表現、非制限用法のコンマ等を修正した。

最終manifest: `/tmp/medace-grammar-content-manifest-20261003.json`。bank source SHA256:

```text
12745124d6574a8fc1ecf43fef7f4363e047700f99ba735aa0d0dfe29619673c
```

Node `v22.19.0` で以下のfocused unitを実行し、**5 files / 48 tests passed**。新テスト11件は全64本文のID/重複/正答・誤答説明/語順復元/難度範囲、単元均等・level・除外選択、コンマ実表示、別語順・同表示chip・不完全回答を検証する。初回は無限大の件数が大量出題になり1件failed。件数のfinite guardを追加後、全件greenとなった。

```sh
/Users/Yodai/.nvm/versions/node/v22.19.0/bin/node node_modules/vitest/vitest.mjs run \
  tests/grammar-question-bank.test.ts tests/grammar-practice.test.ts \
  tests/grammar-scope.test.ts tests/grammar-golden-set.test.ts \
  tests/ai-grammar-questions.test.ts
```

実行ログ: `/tmp/medace-grammar-focused-tests-20261003.log`。既存grammar回帰37件も成功し、旧builderへの変更は型拡張だけに限定した。自動構造検査は文法の正答一意性を証明するものではなく、独立本文レビューと合わせて扱う。

この担当はChrome、build、標準smoke、外部ネットワーク、AIprovider、公開、DB exportを実行していない。統合されたUIの実操作、保存・再訪、全体型検査・build・リリースgateは親担当の確認範囲。

## 保存と残る境界

現行の独立英語練習APIへは教材/単語IDを付けず、単元・level・正誤等を保存する。`curatedQuestionId` は端末内の進捗にのみ残り、現行Cloud契約には問題固有IDの永続化がない。そのため別端末での問題単位の履歴復元・全端末共通の重複回避は保証しない。必要になれば、サーバー側の問題ID検証と履歴契約を別途追加する。

SRSの単語履歴へ流さず、既存attemptの再送・認可・保存gateを変更していない。AI生成問題や未承認教材のgateも緩めていない。bankのcontentレビュー成功はローカルコード候補の品質確認であり、本番到達やCloud保存成功の証拠ではない。
