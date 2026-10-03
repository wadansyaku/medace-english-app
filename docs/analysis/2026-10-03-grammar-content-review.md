# 文法問題の独立品質レビュー（2026-10-03）

担当: naru_migration_review。対象: worksheet_reliability が作成する独自問題。
本レビューは原本の翻訳・商用問題の複製、既存履歴 ID の変更、外部 AI 送信を含まない。bank/tests は編集せず、この文書のみを所有する。

最新結果: source SHA256 `12745124d6574a8fc1ecf43fef7f4363e047700f99ba735aa0d0dfe29619673c` の64本文は穴埋め・英語語順とも内容 `ACCEPTED`、`HELD` 0。以下の先行表に残る HELD は修正前の判定履歴であり、最終確認では解消済み。静的な画面接続は確認したが、ブラウザ実行・自動テストは本レビューでは実施していない。

## 判定基準

各問題を、作問者の正答ラベルを信用せず、学習者が回答前に読める指示・英文・日本語文脈から判定する。

| 観点 | 確認内容 | 保留条件 |
|---|---|---|
| 正答一意性 | 空所へ全選択肢を代入し、文法・意味・時点・談話上の成立を個別に検討する | 別の選択肢も自然に成立する。正答を決める条件が回答後の説明にしかない |
| 英文の自然さ | 語法、冠詞、可算性、時制、主語動詞一致、目的語、修飾関係、会話の応答を検討する | 正答文が不自然。別の読みで誤答が成立する。特殊な文脈を勝手に補う必要がある |
| 日本語の対応 | 主体、肯否、時点、継続・経験・完了、条件と反実仮想、丁寧さを保持する | 英日で意味が違う。日本語文脈が正答文と矛盾する |
| 別解 | 副詞・時の句の移動、関係詞の置換、米英差、縮約、同じ表示語の交換を検討する | 自然な別解を誤答にする。別解一覧が根拠なく一つに限定される |
| 単元・難度 | 空所が指定単元の能力を測るか、語彙と文の複雑さが学年・level の目安に合うかを検討する | 単元名と実際の課題がずれる。範囲未習事項を主因として誤答させる |
| 誤答の妥当性 | よくある誤用として学習価値があり、各誤答理由が対象文に即しているかを検討する | 不自然な文字列だけで消去可能。正しい用法まで一般的に誤りと説明する |
| 解説 | 正答の成立理由と他の選択肢がこの文で合わない理由を、回答後に実際に表示するかを確認する | 汎用単元説明だけで具体的な疑問に答えない。UI に出ない字段を解説として数える |
| 分量 | scope/level/学習内容の実質的な広がりを数える | ID や名詞だけを変えた同型文を独立した難度拡張として数える |

判定は `ACCEPTED`（最終文面を確認）、`HELD`（要修正・理由あり）、`PENDING`（未確認）とする。修正版は再読後に判定を変更する。学年・CEFR は作問上の難度目安として確認し、公式カリキュラムへの外部認証とは扱わない。

## 既存実装から確認した制約

- `types.ts` の GrammarCurriculumScopeId は 26 単元。`config/grammarCurriculum.ts` が単元説明と level 範囲を持つ。
- `utils/worksheet.ts` の選択問題は answer/options、並べ替えは token ID と answerTokenIds を持つ。既存 `hooks/useQuizModeController.ts` の語順採点は ID 配列の完全一致で、自然な別語順は自動で許容されない。
- 既存の日本語入力正誤は空白・記号の正規化後の一致が中心で、意味の等しい訳を全て受理する仕組みではない。独自問題の正答一意性と、自由訳の一意性を混同しない。
- `components/quiz/QuizRunningView.tsx` の通常単元パネルは patternJa/examFocusJa/automationDrillJa/threeSlotFrameJa を表示し、commonMistakeJa はそこには表示しない。追加する問題固有の explanationJa と誤答理由は実際の回答後表示へ接続されていることが必要。
- 既存 `WorksheetPrintLauncher.tsx` の問題印刷は穴埋めなら promptText、英語語順なら tokens が中心で instruction を印刷しない。`EnglishPracticeHub.tsx` の既存 grammar card も穴埋め文と正答後の例文が中心。これらに新問を接続する場合は回答前の context と回答後の問題固有説明が欠落しないことを確認する。
- 既存 fallback の modal（can/should/must/will）、接続詞（when/because/if/although）、時の前置詞（before/during/after）、現在形と過去形の選択には、文脈なしでは複数成立する場合がある。構造検査や regex 一致だけでは解消を証明できない。
- 独立したソース集計で、既存 fallback は 26 単元・85 テンプレート。最低 level は A1=10、A2=28、B1=42、B2=5、C1=0、C2=0。単語の置換で生成される問題数と、異なる文法課題の数を区別する。
- 語順問題では副詞位置・時の句の位置・疑問文の別形・同一表示 token を重点確認する。英語の文法上可能な別解と、今回の明示された意味に適合する別解を分けて記録する。

## 問題別レビュー

先行 manifest: `/tmp/medace-grammar-content-first16-20261003.json`。宣言 source SHA256: `0cd7aa90b43e01a8999afbcca0a43fc91aead9cf2c1a8effc17c84cd97ea60ba`。16 本文を独立して読了。各本文を穴埋め・語順の二形式に展開する予定であり、32 の独立した学習内容とは数えない。

以下の ID はすべて `grammar-original-20261003-` を接頭辞に持つ。`ACCEPTED*` は本文についての判定で、回答前 contextJa、回答後 explanationJa、および別解採点への接続確認がまだ必要。

| ID末尾 | 穴埋め | 語順 | 独立した判定理由・修正事項 |
|---|---|---|---|
| svo-01 | ACCEPTED* | ACCEPTED* | 現在の習慣・Mina の三単現から eats。他3形は述語として不成立。every morning の文頭移動も登録済み |
| svo-02 | ACCEPTED* | ACCEPTED* | We + meet、後2形は有限述語でない。after practice の文頭移動も登録済み |
| be-01 | ACCEPTED* | ACCEPTED* | These shoes は複数、現在の所有。are のみ成立。所有代名詞 mine の説明も正しい |
| be-02 | ACCEPTED* | ACCEPTED* | I am not tired、tired は状態。today の文頭別解を登録済み |
| tense-01 | ACCEPTED* | ACCEPTED* | 済んだ過去という context と last Sunday から visited。物語の歴史的現在という特殊解釈は指示の範囲外 |
| tense-02 | ACCEPTED* | ACCEPTED* | will + 原形の一意な形。tomorrow の文頭別解を登録済み。基本時制という scope に適合するが、単独では高度な時制判断を測らない |
| progressive-01 | ACCEPTED* | HELD | is swimming の一致と形は一意。独立した Look! chunk は文末の呼びかけにもなり得る。Look! を先頭に固定する回答前指示、固定表示、または末尾別解が必要 |
| progressive-02 | ACCEPTED* | ACCEPTED* | 昨夜の背景動作、I was cooking。when 節の文頭移動も登録済み |
| modal-01 | ACCEPTED* | HELD | can + 原形 explain は一意。Without help, she can explain the answer. は自然な同義別解。`[3,0,1,2]` の追加が必要 |
| modal-02 | ACCEPTED* | ACCEPTED* | 文法だけでは4択すべて成立するが、回答前の明示された禁止文脈から must not が一意。必要がないこととの違いを説明している |
| time-01 | ACCEPTED* | ACCEPTED* | 時計の時刻への at が一意。at 句の文頭移動も登録済み |
| time-02 | ACCEPTED* | ACCEPTED* | 開始年＋現在まで継続という context から since。他選択肢は長さ・期間内・終了を表し不適合。現在完了はこの問題の前提知識 |
| infinitive-01 | HELD | HELD | decide to の形は一意だが apply for the art club は入部の申込先として不自然・意味が曖昧。decided to join the art club、または apply to join the art club へ修正し英日・選択肢を同期させる |
| infinitive-02 | ACCEPTED* | ACCEPTED* | 目的の to buy。他3形はこの位置の目的句にならない。目的句の文頭移動も登録済み。内容自体は A2 程度の基礎で、B1 の難問としては数えない |
| gerund-01 | ACCEPTED* | ACCEPTED* | enjoy drawing が「描くこと」に適合。enjoys drawn portraits 自体は「描かれた肖像画を楽しむ」として文法上可能だが、回答前 context の動作の意味と異なる。誤答理由が「この位置で描くことを表さない」と限定されている点を確認 |
| gerund-02 | ACCEPTED* | ACCEPTED* | suggest taking の動名詞の形。他の節形式 suggested that we take は自然だが今回の tokens には that we がないため別解ではない。説明もその違いを明示 |

先行集計: 穴埋め15 accepted/1 held、語順13 accepted/3 held（実装接続は未確認）。必須修正は modal-01 別解、infinitive-01 の自然さ、progressive-01 の独立呼びかけの語順。標準語順以外の極端な文語的倒置を通常練習の別解として無制限に要求してはいない。

次の18本文は manifest の確定前にソースを先行読了（読み取り時 source SHA256 `5cf7b70ff59bd60ea91c89ec149614d6086d55f0ff53bac6de41198f1ff186d4`、最終 manifest で再照合する）。

| ID末尾 | 穴埋め | 語順 | 独立した判定理由・修正事項 |
|---|---|---|---|
| participle-01 | ACCEPTED* | ACCEPTED* | 女性自身の動作を名詞修飾する standing が標準形。stood を単に過去形と説明するのは過去分詞もあることを落とす。状態用法・方言差の論争を避けるため誤答を stand/is standing 等へ変更推奨 |
| participle-02 | ACCEPTED* | ACCEPTED* | 建てられた橋という受動の修飾 built。他3形は意味・構造に不適合。ただし分詞の基礎例で B2 の難問ではない |
| comparison-01 | ACCEPTED* | ACCEPTED* | than で軽さの差を表す lighter のみ成立 |
| comparison-02 | ACCEPTED* | ACCEPTED* | 3つ中の最短という文脈から the shortest。最上級の基礎例で B1 発展問題としては数えない |
| pronoun-01 | ACCEPTED* | ACCEPTED* | called の目的語 her が Emma 本人を受ける。hers/herself は指定意味に不適合 |
| pronoun-02 | ACCEPTED* | ACCEPTED* | 所有を表す述語補語 ours が一意。他3形は今回の所有の意味を表せない |
| conjunction-01 | ACCEPTED* | ACCEPTED* | 同時進行を明示した文脈で while。他接続詞は理由・逆接・条件へ変わる。while 節の文頭別解も登録済み |
| conjunction-02 | HELD | HELD | when の鍵は正しいが、for が節をつなぐ接続詞にならないという誤答説明は誤り。for は理由を表す等位接続詞になれる。この「その時」という意味・節間関係に合わない、と限定して修正 |
| passive-01 | ACCEPTED* | ACCEPTED* | 窓が清掃される側という指定、複数主語から are cleaned |
| passive-02 | ACCEPTED* | HELD | 過去の受動 was written は一意。This song was written in 2010 by a local musician.（`[0,1,3,2]`）が自然な同義別解で登録不足 |
| perfect-01 | ACCEPTED* | ACCEPTED* | 現在の結果 have lost が選択肢中で一意。単純過去 lost も一般には可能と説明し、無用な排除をしていない |
| perfect-02 | ACCEPTED* | HELD | has + 過去分詞 lived は一意。Mika has lived for five years in Osaka.（`[0,1,3,2]`）が自然な同義別解で登録不足 |
| relative-01 | ACCEPTED* | ACCEPTED* | 人を受け、節の主語となる who が選択肢中で一意。that も可能と明記されている |
| relative-02 | ACCEPTED* | ACCEPTED* | grow up の場所を補う where。which 単独では前置詞が不足。in which 別表現を説明している |
| conditional-01 | ACCEPTED* | ACCEPTED* | 実現し得る未来条件という明示文脈で rains。特殊な意志 will の文脈ではない。if 節の後置も登録済み |
| conditional-02 | ACCEPTED* | ACCEPTED* | unless you leave now の現実条件。unless 節の後置も登録済み |
| subjunctive-01 | ACCEPTED* | ACCEPTED* | If I were you が一意。口語 was を一般に誤りと断定せず選択肢から除いている |
| subjunctive-02 | ACCEPTED* | ACCEPTED* | 昨日の機会を逃したという文脈から would have caught。混合仮定法で現在の結果を述べる意味ではない |

数の最終集計は全 manifest 確定後に行う。

続く18本文もソースを先行読了（全26単元について2本文ずつ、計52本文に到達。最終 manifest 再照合待ち）。

| ID末尾 | 穴埋め | 語順 | 独立した判定理由・修正事項 |
|---|---|---|---|
| agreement-01 | ACCEPTED* | ACCEPTED* | 主語の中心 Each に合わせた has。複数 desks に引かれる典型誤用を扱う |
| agreement-02 | ACCEPTED* | ACCEPTED* | 主語の中心 keys に合わせた are。前置詞句の cabinet へ一致させない |
| question-01 | ACCEPTED* | ACCEPTED* | Where does your brother live? の一般動詞疑問文。does に三単現が現れ live は原形 |
| question-02 | ACCEPTED* | ACCEPTED* | 間接疑問 where the station is。重複主語・原形・do の誤用を除外できる |
| negation-01 | ACCEPTED* | ACCEPTED* | My sister does not eat の形が一意。否定助動詞と原形の関係を説明 |
| negation-02 | HELD | HELD | not all の鍵と部分否定説明は正しいが、context の「何席かは空いています」は現在、were taken は過去。空いていましたへ時点を同期する |
| speech-01 | ACCEPTED* | ACCEPTED* | 昨日の発言を時制の一致で報告する明示条件から was。現在の真実なら現在形も可能という説明を確認 |
| speech-02 | ACCEPTED* | ACCEPTED* | yes/no の質問の報告から if。whether を一般に不正解とはせず、選択肢から除外している |
| verb-pattern-01 | ACCEPTED* | ACCEPTED* | 能動 make + 人 + 原形 read。受動 made to read との相違も説明 |
| verb-pattern-02 | ACCEPTED* | HELD | look forward to + seeing の鍵は一意。Next week を文頭へ動かすと「来週楽しみにする」という時点へ係り先が変わり得る。seeing you next week を1chunkにする等、会う時点の意味を保つ必要 |
| adverb-01 | ACCEPTED* | HELD | 動作の様子 beautifully の鍵は一意。The singer beautifully performed.（`[0,2,1]`）は自然な別語順で追加が必要 |
| adverb-02 | ACCEPTED* | ACCEPTED* | light enough to carry の形と語順が一意。too/very はこの位置の型にならない |
| noun-01 | ACCEPTED* | ACCEPTED* | some information が通常の不可算用法。通常という留保があり例外的法律語用を全否定しない |
| noun-02 | ACCEPTED* | ACCEPTED* | scissors は複数形の道具名、一つなら a pair of scissors。目的句の前置も登録済み |
| idiom-01 | ACCEPTED* | ACCEPTED* | 意味・用法を辞書で調べるという明示から look up。look for は対象を探す行為で、今回の情報参照の指定とは区別可能。分離形 look the word up も別表現として説明 |
| idiom-02 | ACCEPTED* | ACCEPTED* | 牛乳を使い切った文脈から ran out of が一意。他句動詞は意味が異なる |
| conversation-01 | ACCEPTED* | ACCEPTED* | お礼への定型返答 You are welcome。歓迎する性質・喜ぶ状態とは区別可能 |
| conversation-02 | ACCEPTED* | ACCEPTED* | 快い承諾という文脈から Not at all。Yes は mind を肯定して不適合。日本語訳はより素直な「窓を開けていただけますか」へ整える推奨（もらうが相手の行為を受ける依頼にも使えるため必須の意味誤りとは判定しない） |

並べ替えで時間句の文頭移動を全問へ機械的に許可してはいけない。特に verb-pattern-02 は会う時点と期待する時点が違う。解答の語順が文法上成立するだけでなく、提示された意味を保つことを確認する。

## 64問 manifest の最終本文レビュー

Manifest: `/tmp/medace-grammar-content-manifest-20261003.json`。source SHA256 `65574f407c0da3aead06738e9b3470c60c5d237926dbbd2c6ed09a85d7c45923` は実ファイルの SHA256 と一致した。26単元・64本文、level は A1=10/A2=21/B1=23/B2=9/C1=1。C1 は単元上限と整合する仮定法に限定されている。学年の札は一般的な学習順序を表す目安で、全問がその level の難問という意味ではない。

先行52問の全必須指摘は再読で解消を確認した。具体的には join the art club への自然な修正、Look! 先頭と会話順の回答前指示、Without help/in 2010/for five years/beautifully の自然な別解、for の正しい接続詞説明、過去時点の一致、seeing you next week の意味を保つ chunk。stood 誤答も is standing に変更済み。基礎例4件の level は下げられた。

追加12本文の独立判定:

| ID末尾 | 穴埋め | 語順 | 独立した判定理由・修正事項 |
|---|---|---|---|
| modal-03 | ACCEPTED* | ACCEPTED* | must の現在の強い推量、後ろは be 原形。義務だけの解説にしない点も正しい |
| comparison-03 | ACCEPTED* | ACCEPTED* | 比例構文 the more/the fewer。標準的な書き言葉という明示で less + 可算複数の口語的用法を別扱いできる |
| gerund-03 | ACCEPTED* | ACCEPTED* | yesterday に済んだ行為を覚えている remember locking と、忘れずに行う remember to lock を意味から区別可能 |
| perfect-03 | ACCEPTED* | ACCEPTED* | 現在まで経験のない have never climbed。3誤答は過去分詞を欠く。文法内容は現在完了の基礎 |
| perfect-04 | ACCEPTED* | ACCEPTED* | 現在完了進行形という明示で been waiting が一意。単純完了も一般には可能と説明し、期間句の前置と対象句との入れ替えも登録済み |
| relative-03 | ACCEPTED* | HELD | 穴埋めの非制限用法 which が一意。しかし語順 chunks は My bike / which I bought last week にコンマがなく、非制限用法という本題が表示から失われる。My bike, / which I bought last week, へ必須コンマ追加 |
| subjunctive-03 | ACCEPTED* | ACCEPTED* | 昨日の事実への後悔を wish + had not left で表す。他の時点・形は指定意味に不適合 |
| subjunctive-04 | ACCEPTED* | ACCEPTED* | yesterday の過去条件、now の現在結果という混合仮定法。would not be が一意。時点差の説明も具体的 |
| speech-03 | ACCEPTED* | ACCEPTED* | 否定指示 told me not to play。to not play を一般に禁止せず、別の -ing 誤答を使う配慮は適切 |
| verb-pattern-03 | ACCEPTED* | ACCEPTED* | 動作の中断目的 stop to answer と、電話に出る行為をやめる stop answering を明示文脈から区別可能 |
| agreement-03 | ACCEPTED* | HELD | The number の単数一致 is は一意。The number of students this week is larger.（`[0,3,1,2]`）が自然な同義別解で登録不足 |
| noun-03 | ACCEPTED* | ACCEPTED* | honest の初頭音から an。他選択肢は冠詞音または可算数と単数形が不適合 |

この SHA の本文判定: 穴埋め64 ACCEPTED、語順62 ACCEPTED/2 HELD。最後の2件を作問者へ返却した。ACCEPTED は内容判定であり、後述の画面接続まで成功したという意味ではない。

### 最終2件の再確認

修正後 source SHA256 `12745124d6574a8fc1ecf43fef7f4363e047700f99ba735aa0d0dfe29619673c` を読み取りで確認。relative-03 は `My bike,` / `which I bought last week,` にコンマを表示し、生成 helper の displayOrderChunk もコンマを保持する。agreement-03 は `[0,3,1,2]` を登録し、主語の後ろに this week を置く自然な同義文を受理する。この2件も ACCEPTED に変更し、64本文の両形式はすべて ACCEPTED、HELD 0 とする。

### 静的な画面・採点接続

- `utils/grammarQuestionBank.ts` は contextJa を prompt に渡し、EnglishPracticeHub の穴埋め・語順 card が回答前に prompt を表示する。語順では意味を示す translationJa も指示に含む。
- 同 Hub は判定後に具体的な正答文・日本語訳・explanationJa・選んだ誤答理由を表示する。他の誤答理由と alternativeNotesJa も details から確認できる。正解前に正答英文や誤答理由を表示する接続ではない。
- `isGrammarPracticeOrderCorrect` は全 chip を一度ずつ使ったことを検証し、明示された acceptedChipOrders と正規化された文字列で比較する。同じ表示語の chip 交換を ID だけで誤答にする制約も避ける。非制限用法のコンマは表示に残し、採点では句読点差を正規化する。
- 現在この独自 bank は EnglishPracticeHub の文法練習へ接続されている。Quiz の単語由来問題と印刷 worksheet の既存 fallback 品質は、この64本文の採択をもって改善済みとは扱わない。
- level 上限・scope と既出問題を filter し、scope ごとに順に選ぶ生成 helper を読んだ。64本文は最大128の形式を持つが、128の異なる学習内容として数えない。C2 独自問題は追加されていない。

## 実行範囲と未完了事項

ソースの読み取り・作問基準・全64本文の独立レビュー・指摘修正版の再確認・問題固有説明/別解/回答前文脈の静的接続確認を実施した。Chrome、build、公開、ネットワーク、外部 AI は実行していない。実ブラウザでの挙動、自動テスト、最終候補全体の release gate は担当者の別検証が必要。
