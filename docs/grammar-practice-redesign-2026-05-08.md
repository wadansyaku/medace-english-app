# Grammar Practice Redesign - 2026-05-08

## Goal

登場済みの英単語を、単語テストだけで終わらせず、文法穴埋め・英語語順並び替え・日本語並び替えへ再利用する。

先生向けには「学習済み単語を文法プリントへ変換できる」ことを見せ、生徒向けには「見たことがある単語を文の中で使える」ことをその場で確認できるようにする。

## UI Direction

- 日本語UIを前提にする。
- 生成画像1の方向性に寄せ、オレンジ基調で温かい学習アプリらしさを出す。
- 主色は既存の `medace` / orange 系を使い、teal/purple を主役にしない。
- スマホではチップ、解答欄、判定ボタンを一画面で扱えるようにする。
- 先生向けワークシートでは、文法化できる語数を先に表示し、問題/解答プレビューへ進める。

## Generated UI Mocks

- Mobile orange v2: `docs/assets/ui-mocks/2026-05-08/grammar-practice/mobile-practice-orange-v2.png`
- Mobile orange v3: `docs/assets/ui-mocks/2026-05-08/grammar-practice/mobile-practice-orange-v3.png`
- Teacher orange v2: `docs/assets/ui-mocks/2026-05-08/grammar-practice/teacher-workspace-orange-v2.png`
- Earlier exploration:
  - `docs/assets/ui-mocks/2026-05-08/grammar-practice/mobile-practice-v1.png`
  - `docs/assets/ui-mocks/2026-05-08/grammar-practice/teacher-workspace-v1.png`
  - `docs/assets/ui-mocks/2026-05-08/grammar-practice/interaction-system-v1.png`

## Product Decisions

- 新しい DB 列は追加しない。`WordData.exampleSentence` / `exampleMeaning` があれば優先し、足りない場合は短い fallback 文で最低限の復習を作る。
- 文法系の出題は正式な `WorksheetQuestionMode` として扱う。
  - `GRAMMAR_CLOZE`
  - `EN_WORD_ORDER`
  - `JA_TRANSLATION_ORDER`
- クイズ保存と弱点分析も同じ question mode を受ける。UIだけの見せかけにしない。
- 先生向けの `WorksheetPrintLauncher` は、出題可能数と文法化できる語数を分けて表示する。

## Risks

- 日本語の自然な分割は完全な形態素解析ではないため、まずは短いチャンクに安全に分ける。
- 例文品質が低い単語は fallback 文になるため、将来的には例文準備ステータスを先生画面に出す余地がある。
- 文法系の弱点分析は新しい signal が増えるため、既存の mission/writing 導線より不自然に優先されないように監視する。
