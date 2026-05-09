import type { WorksheetQuestionMode } from '../types';

export const WORKSHEET_QUESTION_MODES = [
  'EN_TO_JA',
  'JA_TO_EN',
  'SPELLING_HINT',
  'GRAMMAR_CLOZE',
  'EN_WORD_ORDER',
  'JA_TRANSLATION_ORDER',
  'JA_TRANSLATION_INPUT',
] as const satisfies readonly WorksheetQuestionMode[];

export const isWorksheetQuestionMode = (value: unknown): value is WorksheetQuestionMode => (
  typeof value === 'string'
  && (WORKSHEET_QUESTION_MODES as readonly string[]).includes(value)
);
