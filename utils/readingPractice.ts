import { EnglishLevel } from '../types';

export type ReadingQuestionKind =
  | 'CONTENT_MATCH'
  | 'REFERENCE_OR_MAIN_IDEA'
  | 'VOCAB_INFERENCE'
  | 'GRAMMAR_STRUCTURE';

export type ReadingPracticeSource =
  | 'DETERMINISTIC_SEED'
  | 'AI_GENERATED'
  | 'AI_CACHE'
  | 'TEACHER_AUTHORED';

export interface ReadingPracticeGeneratorMeta {
  source: ReadingPracticeSource;
  version: string;
  seed?: string;
  cacheKey?: string;
  model?: string;
  generatedAt?: string;
}

export interface ReadingQuestionOption {
  id: string;
  textJa: string;
}

export interface ReadingQuestion {
  id: string;
  kind: ReadingQuestionKind;
  promptJa: string;
  options: ReadingQuestionOption[];
  correctOptionId: string;
  evidenceSentence: string;
  explanationJa: string;
  targetExpression?: string;
  grammarFocusJa?: string;
}

export interface ReadingPracticePassage {
  id: string;
  level: EnglishLevel;
  levelLabelJa: string;
  titleJa: string;
  titleEn: string;
  topicJa: string;
  passageEn: string;
  estimatedWords: number;
  source: ReadingPracticeSource;
  generator: ReadingPracticeGeneratorMeta;
  vocabularyFocus: string[];
  questions: ReadingQuestion[];
}

export interface BuildReadingPracticeOptions {
  level?: EnglishLevel;
  seed?: string | number;
  maxPassages?: number;
}

export interface ReadingPracticeAnswerResult {
  questionId: string;
  kind: ReadingQuestionKind;
  selectedOptionId: string | null;
  correctOptionId: string;
  correct: boolean;
  evidenceSentence: string;
  explanationJa: string;
}

export interface ReadingPracticeSessionSummary {
  passageCount: number;
  total: number;
  answered: number;
  correct: number;
  accuracy: number;
  weakQuestionKinds: ReadingQuestionKind[];
  results: ReadingPracticeAnswerResult[];
}

type SeedReadingPracticePassage = Omit<
  ReadingPracticePassage,
  'estimatedWords' | 'source' | 'generator'
>;

export const READING_QUESTION_KIND_LABELS: Record<ReadingQuestionKind, string> = {
  CONTENT_MATCH: '内容一致',
  REFERENCE_OR_MAIN_IDEA: '指示語・要旨',
  VOCAB_INFERENCE: '語彙推測',
  GRAMMAR_STRUCTURE: '文法構造',
};

export const READING_LEVEL_LABELS: Record<EnglishLevel, string> = {
  [EnglishLevel.A1]: 'A1 はじめての読解',
  [EnglishLevel.A2]: 'A2 基礎読解',
  [EnglishLevel.B1]: 'B1 標準読解',
  [EnglishLevel.B2]: 'B2 発展読解',
  [EnglishLevel.C1]: 'C1 高度読解',
  [EnglishLevel.C2]: 'C2 精密読解',
};

const SEED_VERSION = 'reading-seed-2026-05-11-v1';

const SEED_PASSAGES: SeedReadingPracticePassage[] = [
  {
    id: 'seed-a1-word-notebook',
    level: EnglishLevel.A1,
    levelLabelJa: READING_LEVEL_LABELS[EnglishLevel.A1],
    titleJa: '単語ノートの習慣',
    titleEn: 'A Word Notebook',
    topicJa: '毎日の復習',
    passageEn: 'Mika keeps a word notebook in her school bag. After English club, she writes three new words and one short example. She opens the notebook on the train before dinner and reads it. This small habit helps her remember words the next day.',
    vocabularyFocus: ['notebook', 'example', 'habit'],
    questions: [
      {
        id: 'seed-a1-word-notebook:q-content',
        kind: 'CONTENT_MATCH',
        promptJa: '美香は英語クラブの後に何を書きますか。',
        options: [
          { id: 'a', textJa: '新しい単語を3つと短い例文を1つ書く' },
          { id: 'b', textJa: '夕食の予定と友だちの名前を書く' },
          { id: 'c', textJa: '電車で読んだ本の感想を書く' },
          { id: 'd', textJa: '次の日の宿題を全部書く' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'After English club, she writes three new words and one short example.',
        explanationJa: 'after English club の後に、three new words と one short example を書くと述べられています。',
      },
      {
        id: 'seed-a1-word-notebook:q-reference',
        kind: 'REFERENCE_OR_MAIN_IDEA',
        promptJa: '3文目の it は何を指していますか。',
        options: [
          { id: 'a', textJa: 'school bag' },
          { id: 'b', textJa: 'English club' },
          { id: 'c', textJa: 'the notebook' },
          { id: 'd', textJa: 'dinner' },
        ],
        correctOptionId: 'c',
        evidenceSentence: 'She opens the notebook on the train before dinner and reads it.',
        explanationJa: '直前に the notebook を開くとあるので、reads it の it はそのノートを指します。',
        targetExpression: 'it',
      },
      {
        id: 'seed-a1-word-notebook:q-vocab',
        kind: 'VOCAB_INFERENCE',
        promptJa: '本文の habit に最も近い意味はどれですか。',
        options: [
          { id: 'a', textJa: '何度も行う習慣' },
          { id: 'b', textJa: '一度だけの失敗' },
          { id: 'c', textJa: '大きなかばん' },
          { id: 'd', textJa: '電車の切符' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'This small habit helps her remember words the next day.',
        explanationJa: '毎日ノートを読んで覚える流れなので、habit は繰り返す行動を表します。',
        targetExpression: 'habit',
      },
      {
        id: 'seed-a1-word-notebook:q-grammar',
        kind: 'GRAMMAR_STRUCTURE',
        promptJa: 'After English club は文の中で何を表していますか。',
        options: [
          { id: 'a', textJa: 'いつ書くのか' },
          { id: 'b', textJa: '誰が書くのか' },
          { id: 'c', textJa: '何色のノートか' },
          { id: 'd', textJa: 'どのくらい難しいか' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'After English club, she writes three new words and one short example.',
        explanationJa: 'After は「...の後で」を表し、writes が行われるタイミングを説明しています。',
        grammarFocusJa: '時を表す前置詞句',
      },
    ],
  },
  {
    id: 'seed-a2-clinic-volunteer',
    level: EnglishLevel.A2,
    levelLabelJa: READING_LEVEL_LABELS[EnglishLevel.A2],
    titleJa: '土曜のクリニック',
    titleEn: 'Saturday at the Clinic',
    topicJa: '医療とボランティア',
    passageEn: 'Ryo volunteers at a small clinic on Saturday mornings. When patients arrive, he gives them a number and asks them to sit near the window. The nurse calls the numbers slowly, so nobody feels confused. Ryo wants to become a doctor because he likes helping people stay calm.',
    vocabularyFocus: ['clinic', 'patients', 'calm'],
    questions: [
      {
        id: 'seed-a2-clinic-volunteer:q-content',
        kind: 'CONTENT_MATCH',
        promptJa: '患者が到着すると、亮は何をしますか。',
        options: [
          { id: 'a', textJa: '番号を渡し、窓の近くに座るよう頼む' },
          { id: 'b', textJa: 'すぐに薬を渡す' },
          { id: 'c', textJa: '医師として診察する' },
          { id: 'd', textJa: '患者を外で待たせる' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'When patients arrive, he gives them a number and asks them to sit near the window.',
        explanationJa: 'patients arrive の後に gives them a number と asks them to sit near the window が続きます。',
      },
      {
        id: 'seed-a2-clinic-volunteer:q-reference',
        kind: 'REFERENCE_OR_MAIN_IDEA',
        promptJa: 'この本文の要旨として最も合うものはどれですか。',
        options: [
          { id: 'a', textJa: '亮は土曜のクリニックで人を落ち着かせる手伝いをしている' },
          { id: 'b', textJa: '亮は窓を掃除する仕事だけをしている' },
          { id: 'c', textJa: '看護師は番号を呼ぶのが速すぎる' },
          { id: 'd', textJa: '患者は番号を使わずに診察室へ入る' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Ryo wants to become a doctor because he likes helping people stay calm.',
        explanationJa: '番号を渡す行動と、people stay calm を助けたいという理由が本文全体の中心です。',
      },
      {
        id: 'seed-a2-clinic-volunteer:q-vocab',
        kind: 'VOCAB_INFERENCE',
        promptJa: 'confused は本文ではどのような状態を表しますか。',
        options: [
          { id: 'a', textJa: '何をすればよいか分からず混乱している状態' },
          { id: 'b', textJa: 'とても眠い状態' },
          { id: 'c', textJa: '速く走っている状態' },
          { id: 'd', textJa: '窓を開けたい状態' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'The nurse calls the numbers slowly, so nobody feels confused.',
        explanationJa: '番号をゆっくり呼ぶことで nobody feels confused になるため、混乱しないという意味だと分かります。',
        targetExpression: 'confused',
      },
      {
        id: 'seed-a2-clinic-volunteer:q-grammar',
        kind: 'GRAMMAR_STRUCTURE',
        promptJa: 'because he likes helping people stay calm の because は何を説明していますか。',
        options: [
          { id: 'a', textJa: '亮が医師になりたい理由' },
          { id: 'b', textJa: '患者が到着する時刻' },
          { id: 'c', textJa: '看護師が番号を呼ぶ順番' },
          { id: 'd', textJa: 'クリニックの場所' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Ryo wants to become a doctor because he likes helping people stay calm.',
        explanationJa: 'because は理由を導く語で、wants to become a doctor の理由を後ろから説明しています。',
        grammarFocusJa: 'because が導く理由節',
      },
    ],
  },
  {
    id: 'seed-b1-own-sentences',
    level: EnglishLevel.B1,
    levelLabelJa: READING_LEVEL_LABELS[EnglishLevel.B1],
    titleJa: '自分の文で覚える',
    titleEn: 'Using New Words',
    topicJa: '単語学習の定着',
    passageEn: 'Many students stop reviewing words once they can choose the right answer in a quiz. However, real reading needs faster recall. A teacher in Osaka asks her class to explain each new word in their own sentence. This extra step takes time, but it makes the words easier to use in writing.',
    vocabularyFocus: ['reviewing', 'recall', 'extra step'],
    questions: [
      {
        id: 'seed-b1-own-sentences:q-content',
        kind: 'CONTENT_MATCH',
        promptJa: '大阪の先生は生徒に何を求めていますか。',
        options: [
          { id: 'a', textJa: '新しい単語を自分の文で説明すること' },
          { id: 'b', textJa: 'クイズの答えだけを暗記すること' },
          { id: 'c', textJa: '書く練習をやめること' },
          { id: 'd', textJa: 'すべての単語を日本語だけで読むこと' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'A teacher in Osaka asks her class to explain each new word in their own sentence.',
        explanationJa: 'asks her class to explain each new word in their own sentence が、先生の要求を直接表しています。',
      },
      {
        id: 'seed-b1-own-sentences:q-reference',
        kind: 'REFERENCE_OR_MAIN_IDEA',
        promptJa: '本文の主張として最も近いものはどれですか。',
        options: [
          { id: 'a', textJa: '単語は正解を選べるだけでなく、使える形で覚える必要がある' },
          { id: 'b', textJa: '読解では単語を早く思い出す必要はない' },
          { id: 'c', textJa: '作文では新しい単語を使わない方がよい' },
          { id: 'd', textJa: 'クイズはいつも読解より難しい' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'This extra step takes time, but it makes the words easier to use in writing.',
        explanationJa: '自分の文で説明する追加ステップにより、writing で使いやすくなるという流れが中心です。',
      },
      {
        id: 'seed-b1-own-sentences:q-vocab',
        kind: 'VOCAB_INFERENCE',
        promptJa: 'recall は本文では何を意味しますか。',
        options: [
          { id: 'a', textJa: '覚えたことを素早く思い出すこと' },
          { id: 'b', textJa: '単語を紙に大きく書くこと' },
          { id: 'c', textJa: '答えを隠しておくこと' },
          { id: 'd', textJa: '授業を早く終えること' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'However, real reading needs faster recall.',
        explanationJa: '読解ではすばやく意味を取り出す必要があるため、recall は記憶から思い出すことです。',
        targetExpression: 'recall',
      },
      {
        id: 'seed-b1-own-sentences:q-grammar',
        kind: 'GRAMMAR_STRUCTURE',
        promptJa: 'once they can choose the right answer in a quiz は何を表していますか。',
        options: [
          { id: 'a', textJa: '復習をやめてしまうタイミング' },
          { id: 'b', textJa: '先生が大阪にいる理由' },
          { id: 'c', textJa: '作文が簡単になる結果' },
          { id: 'd', textJa: '新しい単語の数' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Many students stop reviewing words once they can choose the right answer in a quiz.',
        explanationJa: 'once は「いったん...すると」という時の条件を表し、stop reviewing words のタイミングを示します。',
        grammarFocusJa: 'once が導く時の副詞節',
      },
    ],
  },
  {
    id: 'seed-b2-evidence-reading',
    level: EnglishLevel.B2,
    levelLabelJa: READING_LEVEL_LABELS[EnglishLevel.B2],
    titleJa: '根拠を結ぶ読解',
    titleEn: 'Reading with Evidence',
    topicJa: '学習アプリと根拠確認',
    passageEn: 'An online study tool can feel efficient when it shows many questions in a short time. Still, speed alone does not prove that a learner understands a passage. The most useful systems ask students to point to the sentence that supports their answer. By connecting each choice to evidence, the tool turns practice into careful reading.',
    vocabularyFocus: ['efficient', 'prove', 'evidence'],
    questions: [
      {
        id: 'seed-b2-evidence-reading:q-content',
        kind: 'CONTENT_MATCH',
        promptJa: '本文によると、最も有用なシステムは生徒に何を求めますか。',
        options: [
          { id: 'a', textJa: '答えを支える文を指し示すこと' },
          { id: 'b', textJa: '短時間でできるだけ多くクリックすること' },
          { id: 'c', textJa: '本文を読まずに選択肢を選ぶこと' },
          { id: 'd', textJa: 'すべての問題を同じ速さで解くこと' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'The most useful systems ask students to point to the sentence that supports their answer.',
        explanationJa: 'ask students to point to the sentence が要求内容で、supports their answer が根拠文の役割です。',
      },
      {
        id: 'seed-b2-evidence-reading:q-reference',
        kind: 'REFERENCE_OR_MAIN_IDEA',
        promptJa: '本文の要旨として最も適切なものはどれですか。',
        options: [
          { id: 'a', textJa: '速さだけでなく、答えと根拠を結ぶ練習が読解を深める' },
          { id: 'b', textJa: '問題数が多ければ必ず読解力が上がる' },
          { id: 'c', textJa: 'オンライン学習では本文を表示しない方がよい' },
          { id: 'd', textJa: '根拠を探す練習は短時間学習に向かない' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'By connecting each choice to evidence, the tool turns practice into careful reading.',
        explanationJa: 'choice と evidence を結ぶことで careful reading になる、という最後の文が主張をまとめています。',
      },
      {
        id: 'seed-b2-evidence-reading:q-vocab',
        kind: 'VOCAB_INFERENCE',
        promptJa: 'prove は本文ではどの意味に近いですか。',
        options: [
          { id: 'a', textJa: '本当にそうだと示す' },
          { id: 'b', textJa: '声に出して読む' },
          { id: 'c', textJa: '短くまとめる' },
          { id: 'd', textJa: '質問を増やす' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Still, speed alone does not prove that a learner understands a passage.',
        explanationJa: 'speed alone だけでは理解していることの証明にならない、という対比から「示す・証明する」と読めます。',
        targetExpression: 'prove',
      },
      {
        id: 'seed-b2-evidence-reading:q-grammar',
        kind: 'GRAMMAR_STRUCTURE',
        promptJa: 'that supports their answer はどの語を説明していますか。',
        options: [
          { id: 'a', textJa: 'the sentence' },
          { id: 'b', textJa: 'students' },
          { id: 'c', textJa: 'systems' },
          { id: 'd', textJa: 'questions' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'The most useful systems ask students to point to the sentence that supports their answer.',
        explanationJa: 'that supports their answer は関係代名詞節で、直前の the sentence を後ろから説明しています。',
        grammarFocusJa: '関係代名詞 that',
      },
    ],
  },
  {
    id: 'seed-c1-adaptive-feedback',
    level: EnglishLevel.C1,
    levelLabelJa: READING_LEVEL_LABELS[EnglishLevel.C1],
    titleJa: '適応型フィードバック',
    titleEn: 'Adaptive Feedback',
    topicJa: '教育データの解釈',
    passageEn: 'Adaptive software is often praised because it can respond to a learner immediately. Yet immediate feedback is not automatically meaningful. If a system only reports whether an answer is right, it may hide the reason behind the mistake. Feedback becomes useful when it directs attention to the part of the text that the learner overlooked.',
    vocabularyFocus: ['adaptive', 'meaningful', 'overlooked'],
    questions: [
      {
        id: 'seed-c1-adaptive-feedback:q-content',
        kind: 'CONTENT_MATCH',
        promptJa: '有用なフィードバックは何に注意を向けさせると述べられていますか。',
        options: [
          { id: 'a', textJa: '学習者が見落とした本文の部分' },
          { id: 'b', textJa: '次に使う端末の種類' },
          { id: 'c', textJa: '正答数だけのランキング' },
          { id: 'd', textJa: '問題を解いた曜日' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Feedback becomes useful when it directs attention to the part of the text that the learner overlooked.',
        explanationJa: 'directs attention to the part of the text that the learner overlooked が有用になる条件です。',
      },
      {
        id: 'seed-c1-adaptive-feedback:q-reference',
        kind: 'REFERENCE_OR_MAIN_IDEA',
        promptJa: '本文の主張として最も近いものはどれですか。',
        options: [
          { id: 'a', textJa: '即時フィードバックも、誤りの理由に結びつかなければ十分ではない' },
          { id: 'b', textJa: '即時フィードバックは常に意味がある' },
          { id: 'c', textJa: '適応型ソフトは読解練習に使えない' },
          { id: 'd', textJa: '正誤だけを示す仕組みが最も深い学習を生む' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Yet immediate feedback is not automatically meaningful.',
        explanationJa: 'Yet で前文を受け、即時であるだけでは meaningful とは限らないと述べています。',
      },
      {
        id: 'seed-c1-adaptive-feedback:q-vocab',
        kind: 'VOCAB_INFERENCE',
        promptJa: 'overlooked は本文ではどの意味に近いですか。',
        options: [
          { id: 'a', textJa: '見落とした' },
          { id: 'b', textJa: '詳しく説明した' },
          { id: 'c', textJa: '意図的に選んだ' },
          { id: 'd', textJa: '声に出した' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Feedback becomes useful when it directs attention to the part of the text that the learner overlooked.',
        explanationJa: 'attention を向けさせる対象なので、overlooked は注意できていなかった部分、つまり見落とした部分です。',
        targetExpression: 'overlooked',
      },
      {
        id: 'seed-c1-adaptive-feedback:q-grammar',
        kind: 'GRAMMAR_STRUCTURE',
        promptJa: 'whether an answer is right は文の中で何を表しますか。',
        options: [
          { id: 'a', textJa: 'システムが報告する内容' },
          { id: 'b', textJa: '学習者が見落とす場所' },
          { id: 'c', textJa: 'ソフトウェアがほめられる理由' },
          { id: 'd', textJa: 'フィードバックが遅れる時間' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'If a system only reports whether an answer is right, it may hide the reason behind the mistake.',
        explanationJa: 'reports の目的語として whether 節が続き、「答えが正しいかどうか」を報告する内容になっています。',
        grammarFocusJa: 'whether が導く名詞節',
      },
    ],
  },
  {
    id: 'seed-c2-convenience-evidence',
    level: EnglishLevel.C2,
    levelLabelJa: READING_LEVEL_LABELS[EnglishLevel.C2],
    titleJa: '便利さと証拠',
    titleEn: 'Convenience and Evidence',
    topicJa: '研究的な読み方',
    passageEn: 'In educational research, convenience can quietly replace evidence. A tool that records every click may appear rigorous, but the abundance of data does not guarantee that the right question has been asked. Careful evaluation begins by deciding which behavior would genuinely indicate understanding. Without that decision, measurement becomes a performance of precision rather than a path to insight.',
    vocabularyFocus: ['rigorous', 'abundance', 'insight'],
    questions: [
      {
        id: 'seed-c2-convenience-evidence:q-content',
        kind: 'CONTENT_MATCH',
        promptJa: '慎重な評価は何から始まると述べられていますか。',
        options: [
          { id: 'a', textJa: 'どの行動が本当に理解を示すかを決めること' },
          { id: 'b', textJa: 'すべてのクリックをすぐ削除すること' },
          { id: 'c', textJa: 'データ量をできるだけ増やすこと' },
          { id: 'd', textJa: '正答率だけを公開すること' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Careful evaluation begins by deciding which behavior would genuinely indicate understanding.',
        explanationJa: 'begins by deciding が起点を示し、which behavior would genuinely indicate understanding が決める内容です。',
      },
      {
        id: 'seed-c2-convenience-evidence:q-reference',
        kind: 'REFERENCE_OR_MAIN_IDEA',
        promptJa: '本文の主張として最も適切なものはどれですか。',
        options: [
          { id: 'a', textJa: '大量データだけでは理解を測れず、何を証拠とするかの設計が必要である' },
          { id: 'b', textJa: 'クリック数が多いほど必ず理解が深い' },
          { id: 'c', textJa: '教育研究では便利な測定を避けるべきではない' },
          { id: 'd', textJa: '精密な数値は常に洞察につながる' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Without that decision, measurement becomes a performance of precision rather than a path to insight.',
        explanationJa: '何を理解の証拠とするかを決めないと、精密そうな測定で終わるという結論です。',
      },
      {
        id: 'seed-c2-convenience-evidence:q-vocab',
        kind: 'VOCAB_INFERENCE',
        promptJa: 'abundance は本文ではどの意味に近いですか。',
        options: [
          { id: 'a', textJa: '非常に多いこと' },
          { id: 'b', textJa: 'まったく無いこと' },
          { id: 'c', textJa: 'すぐ消えること' },
          { id: 'd', textJa: '正確に分類すること' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'A tool that records every click may appear rigorous, but the abundance of data does not guarantee that the right question has been asked.',
        explanationJa: 'every click を記録する流れなので、abundance of data はデータが大量にあることを表します。',
        targetExpression: 'abundance',
      },
      {
        id: 'seed-c2-convenience-evidence:q-grammar',
        kind: 'GRAMMAR_STRUCTURE',
        promptJa: 'rather than a path to insight は何と対比されていますか。',
        options: [
          { id: 'a', textJa: 'a performance of precision' },
          { id: 'b', textJa: 'educational research' },
          { id: 'c', textJa: 'every click' },
          { id: 'd', textJa: 'the right question' },
        ],
        correctOptionId: 'a',
        evidenceSentence: 'Without that decision, measurement becomes a performance of precision rather than a path to insight.',
        explanationJa: 'rather than は前の a performance of precision と後ろの a path to insight を対比しています。',
        grammarFocusJa: 'rather than による対比',
      },
    ],
  },
];

const normalizeSeed = (seed: string | number | undefined): string => String(seed ?? 'reading-practice');

const countEstimatedWords = (text: string): number => (
  text
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length
);

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seed: string): () => number => {
  let state = hashSeed(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
};

const deterministicShuffle = <T>(items: readonly T[], seed: string): T[] => {
  const next = [...items];
  const random = createSeededRandom(seed);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const materializePassage = (
  passage: SeedReadingPracticePassage,
  seed: string,
): ReadingPracticePassage => ({
  ...passage,
  estimatedWords: countEstimatedWords(passage.passageEn),
  source: 'DETERMINISTIC_SEED',
  generator: {
    source: 'DETERMINISTIC_SEED',
    version: SEED_VERSION,
    seed,
    cacheKey: `reading:${passage.level}:${passage.id}:${SEED_VERSION}`,
  },
  questions: passage.questions.map((question) => {
    const shuffledOptions = deterministicShuffle(question.options, `${seed}:${question.id}:options`);
    const visibleOptions = shuffledOptions.map((option, index) => ({
      ...option,
      id: String.fromCharCode(97 + index),
    }));
    const correctOptionIndex = shuffledOptions.findIndex((option) => option.id === question.correctOptionId);

    return {
      ...question,
      options: visibleOptions,
      correctOptionId: visibleOptions[correctOptionIndex]?.id ?? question.correctOptionId,
    };
  }),
});

export const buildReadingPracticePassages = (
  options: BuildReadingPracticeOptions = {},
): ReadingPracticePassage[] => {
  const seed = normalizeSeed(options.seed);
  const passages = options.level
    ? SEED_PASSAGES.filter((passage) => passage.level === options.level)
    : SEED_PASSAGES;
  const maxPassages = Math.max(0, options.maxPassages ?? passages.length);

  return deterministicShuffle(passages, `${seed}:passages:${options.level ?? 'all'}`)
    .slice(0, maxPassages)
    .map((passage) => materializePassage(passage, seed));
};

export const getReadingPracticePassageById = (
  passageId: string,
  options: Omit<BuildReadingPracticeOptions, 'maxPassages'> = {},
): ReadingPracticePassage | null => (
  buildReadingPracticePassages(options).find((passage) => passage.id === passageId) ?? null
);

export const getReadingQuestionKindLabel = (kind: ReadingQuestionKind): string => (
  READING_QUESTION_KIND_LABELS[kind]
);

export const scoreReadingAnswer = (
  question: ReadingQuestion,
  selectedOptionId: string | null | undefined,
): ReadingPracticeAnswerResult => ({
  questionId: question.id,
  kind: question.kind,
  selectedOptionId: selectedOptionId ?? null,
  correctOptionId: question.correctOptionId,
  correct: selectedOptionId === question.correctOptionId,
  evidenceSentence: question.evidenceSentence,
  explanationJa: question.explanationJa,
});

export const summarizeReadingPracticeSession = (
  passages: ReadingPracticePassage[],
  results: ReadingPracticeAnswerResult[],
): ReadingPracticeSessionSummary => {
  const total = passages.reduce((sum, passage) => sum + passage.questions.length, 0);
  const answered = results.length;
  const correct = results.filter((result) => result.correct).length;
  const weakQuestionKinds = Array.from(new Set(
    results
      .filter((result) => !result.correct)
      .map((result) => result.kind),
  ));

  return {
    passageCount: passages.length,
    total,
    answered,
    correct,
    accuracy: total === 0 ? 0 : Math.round((correct / total) * 100),
    weakQuestionKinds,
    results,
  };
};
