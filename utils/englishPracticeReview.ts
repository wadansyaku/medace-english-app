import type { GrammarPracticeItem } from './grammarPractice';
import type { CuratedTranslationPracticeItem } from './translationQuestionBank';

export type CuratedPracticeReviewMode = 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER' | 'JA_TRANSLATION_INPUT' | 'JA_TRANSLATION_ORDER';

/** A copy of the displayed question and assessed answer, stored only on this device. */
export interface CuratedPracticeReview {
  schemaVersion: 1;
  questionId: string;
  questionVersion: number;
  mode: CuratedPracticeReviewMode;
  prompt: string;
  questionText: string;
  sourceSentence: string;
  referenceAnswer: string;
  referenceTranslation: string;
  acceptedAnswers: string[];
  displayedOptions: string[];
  explanationJa: string;
  meaningNotesJa: string[];
  alternativeNotesJa: string[];
  submittedAnswer: string;
  assessment: 'correct' | 'incorrect';
  answerReasonJa: string;
}

const orderedText = (item: { chips: { id: string; text: string }[] }, ids: readonly string[], separator: string) => (
  ids.map(id => item.chips.find(chip => chip.id === id)?.text ?? '').join(separator)
);

export const createGrammarPracticeReview = (
  item: GrammarPracticeItem,
  answer: string | readonly string[],
  correct: boolean,
): CuratedPracticeReview | undefined => {
  const feedback = item.feedback;
  if (item.source !== 'curated' || !feedback?.questionVersion || item.kind === 'JAPANESE_WORD_ORDER') return undefined;
  const isCloze = item.kind === 'GRAMMAR_CLOZE';
  const submittedAnswer = isCloze ? String(answer) : orderedText(item, answer as readonly string[], ' ');
  return {
    schemaVersion: 1, questionId: feedback.questionId, questionVersion: feedback.questionVersion,
    mode: isCloze ? 'GRAMMAR_CLOZE' : 'EN_WORD_ORDER',
    prompt: item.prompt, questionText: isCloze ? item.clozeSentence : item.prompt,
    sourceSentence: item.sourceSentence,
    referenceAnswer: isCloze ? item.answer : item.sourceSentence,
    referenceTranslation: feedback.translationJa,
    acceptedAnswers: isCloze ? [item.answer] : (item.acceptedChipOrders ?? [item.correctChipIds]).map(ids => orderedText(item, ids, ' ')),
    displayedOptions: isCloze ? [...item.options] : item.chips.map(chip => chip.text),
    explanationJa: feedback.explanationJa, meaningNotesJa: [], alternativeNotesJa: [...feedback.alternativeNotesJa],
    submittedAnswer, assessment: correct ? 'correct' : 'incorrect',
    answerReasonJa: correct ? feedback.explanationJa : isCloze
      ? feedback.distractorReasons[submittedAnswer] ?? 'この文脈の正答と一致しません。正答の理由を確認してください。'
      : 'この文脈で受理される語順と一致しません。正解文と主語・動詞・修飾語の位置を比べてください。',
  };
};

export const createTranslationPracticeReview = (
  item: CuratedTranslationPracticeItem,
  mode: 'JA_TRANSLATION_INPUT' | 'JA_TRANSLATION_ORDER',
  answer: string | readonly string[],
  assessment: { status: 'correct' | 'incorrect' | 'unassessed'; reasonJa: string },
): CuratedPracticeReview | undefined => {
  if (assessment.status === 'unassessed') return undefined;
  const question = item.reviewedQuestion;
  return {
    schemaVersion: 1, questionId: item.questionId, questionVersion: item.questionVersion, mode,
    prompt: item.prompt, questionText: item.sourceSentence, sourceSentence: item.sourceSentence,
    referenceAnswer: item.answerText, referenceTranslation: item.answerText,
    acceptedAnswers: [question.referenceTranslation, ...question.acceptedTranslations,
      ...question.alternateOrders.map(order => order.map(index => question.orderChunks[index]).join(''))],
    displayedOptions: mode === 'JA_TRANSLATION_ORDER' ? item.chips.map(chip => chip.text) : [],
    explanationJa: question.explanationJa, meaningNotesJa: [...question.requiredMeaningElements],
    alternativeNotesJa: [],
    submittedAnswer: mode === 'JA_TRANSLATION_INPUT' ? String(answer) : orderedText(item, answer as readonly string[], ''),
    assessment: assessment.status, answerReasonJa: assessment.reasonJa,
  };
};

const textFields = ['questionId', 'prompt', 'questionText', 'sourceSentence', 'referenceAnswer', 'referenceTranslation',
  'explanationJa', 'submittedAnswer', 'answerReasonJa'] as const;
const listFields = ['acceptedAnswers', 'displayedOptions', 'meaningNotesJa', 'alternativeNotesJa'] as const;
const modes: readonly string[] = ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_INPUT', 'JA_TRANSLATION_ORDER'];

/** Discard only malformed optional review data; preserve the attempt and its sync identity. */
export const normalizeCuratedPracticeReview = (
  value: unknown,
  attempt: { curatedQuestionId?: string; mode: string; lane: string; correct: boolean },
): CuratedPracticeReview | undefined => {
  if (!value || typeof value !== 'object') return undefined;
  const review = value as CuratedPracticeReview;
  if (review.schemaVersion !== 1 || !Number.isSafeInteger(review.questionVersion) || review.questionVersion < 1
    || review.questionId !== attempt.curatedQuestionId || review.mode !== attempt.mode || !modes.includes(review.mode)
    || attempt.lane !== (review.mode.startsWith('JA_') ? 'translation' : 'grammar')
    || review.assessment !== (attempt.correct ? 'correct' : 'incorrect')
    || textFields.some(field => typeof review[field] !== 'string' || review[field].length > 12000)
    || listFields.some(field => !Array.isArray(review[field]) || review[field].length > 80
      || review[field].some(text => typeof text !== 'string' || text.length > 12000))) return undefined;
  // Copy explicitly: edits to a question or caller's arrays must not alter the recorded version.
  return {
    schemaVersion: 1, questionVersion: review.questionVersion, mode: review.mode,
    ...Object.fromEntries(textFields.map(field => [field, review[field]])),
    ...Object.fromEntries(listFields.map(field => [field, [...review[field]]])),
    assessment: review.assessment,
  } as CuratedPracticeReview;
};
