import {
  ORIGINAL_TRANSLATION_QUESTIONS,
  type OriginalTranslationQuestion,
} from '../config/translationQuestionBank';
import {
  EnglishLevel,
  type GrammarCurriculumScopeId,
  type JapaneseTranslationFeedback,
  type TranslationExamTarget,
} from '../types';
import type { JapaneseWordOrderPracticeItem } from './grammarPractice';
import { compareEnglishLevels, resolveGrammarScopeSelection } from './grammarScope';
import {
  assessJapaneseTranslationOrder, normalizeJapaneseTranslationText,
  type JapaneseTranslationOrderAssessment,
} from './japaneseTranslationOrder';

export interface CuratedTranslationPracticeItem extends JapaneseWordOrderPracticeItem {
  source: 'curated';
  questionId: string;
  questionVersion: number;
  level: EnglishLevel;
  reviewedQuestion: OriginalTranslationQuestion;
}

export interface CuratedTranslationPracticeOptions {
  userLevel?: EnglishLevel;
  seed?: string | number;
  questionCount?: number;
  excludeQuestionIds?: readonly string[];
  scopeIds?: readonly GrammarCurriculumScopeId[];
}

export interface CuratedTranslationAssessment {
  status: 'correct' | 'incorrect' | 'unassessed';
  feedback?: JapaneseTranslationFeedback;
  reasonJa: string;
}

/** Only typographic differences are ignored; negation, numbers and participants remain intact. */
const normalizeTranslation = normalizeJapaneseTranslationText;

const reviewedTranslations = (question: OriginalTranslationQuestion): string[] => [
  question.referenceTranslation, ...question.acceptedTranslations,
  ...question.alternateOrders.map(order => order.map(index => question.orderChunks[index]).join('')),
];

const questionById = new Map(ORIGINAL_TRANSLATION_QUESTIONS.map(question => [question.id, question]));

const shuffle = <T>(items: readonly T[], seed: string): T[] => {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const toPracticeItem = (question: OriginalTranslationQuestion, seed: string): CuratedTranslationPracticeItem => {
  const id = `${question.id}:v${question.version}:JA_TRANSLATION`;
  const orderedChips = question.orderChunks.map((text, index) => ({ id: `${id}:chip:${index}`, text }));
  const correctChipIds = orderedChips.map(chip => chip.id);
  const shuffled = shuffle(orderedChips, `${seed}:${id}:chips`);
  const chips = shuffled.every((chip, index) => chip.id === correctChipIds[index])
    ? [...shuffled.slice(1), shuffled[0]] : shuffled;
  return {
    id,
    kind: 'JAPANESE_WORD_ORDER',
    source: 'curated',
    wordId: '',
    bookId: '',
    word: '',
    questionId: question.id,
    questionVersion: question.version,
    level: question.level,
    reviewedQuestion: question,
    sourceSentence: question.sourceSentence,
    answerText: question.referenceTranslation,
    prompt: question.contextJa,
    grammarScope: {
      ...resolveGrammarScopeSelection({ mode: 'JA_TRANSLATION_INPUT', requestedScopeId: question.scopeId }),
      cefrLevel: question.level,
    },
    feedback: {
      questionId: question.id,
      level: question.level,
      recommendedGradeJa: {
        A1: '中1の基礎', A2: '中2〜中3の基礎', B1: '高1〜高2の標準',
        B2: '高2〜大学受験の発展', C1: '発展', C2: '発展',
      }[question.level],
      translationJa: question.referenceTranslation,
      explanationJa: question.explanationJa,
      distractorReasons: Object.fromEntries(question.knownIncorrectTranslations.map(error => [error.text, error.reasonJa])),
      alternativeNotesJa: question.acceptedTranslations.map(text => `別訳例：${text}`),
    },
    chips,
    correctChipIds,
  };
};

/** Prefer the current level, then easier authored material. Exhaustion returns fewer items, never duplicates. */
export const buildCuratedTranslationPracticeItems = (
  options: CuratedTranslationPracticeOptions = {},
): CuratedTranslationPracticeItem[] => {
  const requestedCount = options.questionCount ?? 5;
  if (!Number.isFinite(requestedCount)) return [];
  const limit = Math.max(0, Math.min(ORIGINAL_TRANSLATION_QUESTIONS.length, Math.floor(requestedCount)));
  if (limit === 0) return [];
  const scopes = options.scopeIds ? new Set(options.scopeIds) : null;
  const excluded = new Set(options.excludeQuestionIds ?? []);
  const level = options.userLevel ?? EnglishLevel.B1;
  const seed = String(options.seed ?? 'original-translation');
  const eligible = ORIGINAL_TRANSLATION_QUESTIONS.filter(question => (
    (!scopes || scopes.has(question.scopeId))
    && !excluded.has(question.id)
    && compareEnglishLevels(question.level, level) <= 0
  ));
  const levels = [...new Set(eligible.map(question => question.level))]
    .sort((left, right) => compareEnglishLevels(right, left));
  const selected: OriginalTranslationQuestion[] = [];
  for (const currentLevel of levels) {
    const groups = new Map<GrammarCurriculumScopeId, OriginalTranslationQuestion[]>();
    for (const question of shuffle(eligible.filter(candidate => candidate.level === currentLevel), `${seed}:${currentLevel}:questions`)) {
      const group = groups.get(question.scopeId) ?? [];
      group.push(question);
      groups.set(question.scopeId, group);
    }
    const queues = shuffle([...groups.values()], `${seed}:${currentLevel}:scopes`);
    for (let round = 0; selected.length < limit; round += 1) {
      let added = false;
      for (const queue of queues) {
        if (queue[round]) { selected.push(queue[round]); added = true; }
        if (selected.length === limit) break;
      }
      if (!added) break;
    }
    if (selected.length === limit) break;
  }
  return selected.map(question => toPracticeItem(question, seed));
};

const correctFeedback = (
  question: OriginalTranslationQuestion,
  input: string,
  examTarget: TranslationExamTarget,
): JapaneseTranslationFeedback => ({
  isCorrect: true,
  score: 10,
  maxScore: 10,
  verdictLabel: '意味を確認できました',
  examTarget,
  sourceSentence: question.sourceSentence,
  expectedTranslation: question.referenceTranslation,
  userTranslation: input,
  summaryJa: '英文の意味を保った訳です。語順や丁寧さが違う別訳も受理します。',
  strengths: [...question.requiredMeaningElements],
  issues: [],
  improvedTranslation: question.referenceTranslation,
  grammarAdviceJa: question.explanationJa,
  nextDrillJa: '主語・動作・修飾語を英文で確認してから、別の自然な日本語でも訳してみましょう。',
  criteria: [
    { label: '意味', score: 4, maxScore: 4, comment: question.requiredMeaningElements.join('。') },
    { label: '文法構造', score: 3, maxScore: 3, comment: question.explanationJa },
    { label: '日本語の表現', score: 3, maxScore: 3, comment: '参考訳または意味を確認済みの別訳で表現できています。' },
  ],
  usedAi: false,
});

/** Unknown text is not evidence of an error. Only reviewed alternatives and specific known errors are graded. */
export const assessCuratedTranslationAnswer = (
  itemOrQuestionId: CuratedTranslationPracticeItem | string,
  input: string,
  examTarget: TranslationExamTarget = 'GENERAL',
): CuratedTranslationAssessment => {
  const questionId = typeof itemOrQuestionId === 'string' ? itemOrQuestionId : itemOrQuestionId.questionId;
  const question = questionById.get(questionId);
  if (!question || (typeof itemOrQuestionId !== 'string' && (
    itemOrQuestionId.questionVersion !== question.version
    || itemOrQuestionId.sourceSentence !== question.sourceSentence
    || itemOrQuestionId.answerText !== question.referenceTranslation
  ))) {
    return { status: 'unassessed', reasonJa: 'この問題の内容または版を確認できません。新しい練習で確認してください。' };
  }
  const normalized = normalizeTranslation(input);
  if (!normalized) return { status: 'unassessed', reasonJa: '和訳を入力してから確認してください。' };
  if (reviewedTranslations(question)
    .some(answer => normalizeTranslation(answer) === normalized)) {
    return {
      status: 'correct',
      feedback: correctFeedback(question, input, examTarget),
      reasonJa: '英文の意味を保った訳です。',
    };
  }
  const knownError = question.knownIncorrectTranslations.find(error => normalizeTranslation(error.text) === normalized);
  if (knownError) return { status: 'incorrect', reasonJa: knownError.reasonJa };
  return {
    status: 'unassessed',
    reasonJa: '未登録の別訳です。正しい表現でも未採点になることがあります。同じ入力では判定は変わりません。参考訳と比べ、訳を修正するか別の問題へ進めます。',
  };
};

export const assessCuratedTranslationOrder = (
  item: CuratedTranslationPracticeItem,
  orderedChipIds: readonly string[],
): JapaneseTranslationOrderAssessment => {
  const question = questionById.get(item.questionId);
  if (!question || item.questionVersion !== question.version || item.sourceSentence !== question.sourceSentence
    || item.answerText !== question.referenceTranslation) {
    return { status: 'unassessed', reasonJa: 'この問題の内容または版を確認できません。新しい練習で確認してください。' };
  }
  return assessJapaneseTranslationOrder({
    tokens: item.chips, answerTokenIds: item.correctChipIds, orderedTokenIds: orderedChipIds,
    referenceTranslation: question.referenceTranslation, acceptedTranslations: reviewedTranslations(question),
    knownIncorrectTranslations: question.knownIncorrectTranslations,
  });
};

/** Reuse registered variants only when both the English source and model translation match. */
export const assessWorksheetTranslationOrder = (
  question: {
    sourceSentence?: string; answer: string;
    tokens?: readonly { id: string; text: string }[]; answerTokenIds?: readonly string[];
  },
  orderedTokenIds: readonly string[],
): JapaneseTranslationOrderAssessment => {
  const reviewed = ORIGINAL_TRANSLATION_QUESTIONS.find(candidate => candidate.sourceSentence === question.sourceSentence
    && normalizeTranslation(candidate.referenceTranslation) === normalizeTranslation(question.answer));
  return assessJapaneseTranslationOrder({
    tokens: question.tokens ?? [], answerTokenIds: question.answerTokenIds ?? [], orderedTokenIds,
    referenceTranslation: question.answer,
    acceptedTranslations: reviewed ? reviewedTranslations(reviewed) : [],
    knownIncorrectTranslations: reviewed?.knownIncorrectTranslations,
  });
};
