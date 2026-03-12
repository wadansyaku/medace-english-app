import type {
  QuizSelectionMode,
  QuizSessionConfig,
  WorksheetQuestionMode,
} from '../types';

export const DEFAULT_QUESTION_COUNT = 5;
export const QUESTION_COUNT_OPTIONS = [5, 10, 20] as const;

export const QUIZ_SELECTION_COPY: Array<{
  key: QuizSelectionMode;
  label: string;
  description: string;
}> = [
  {
    key: 'FULL_RANDOM',
    label: '全範囲ランダム',
    description: '単語帳全体から、その場でランダムに出題します。',
  },
  {
    key: 'RANGE_RANDOM',
    label: '範囲指定ランダム',
    description: '番号範囲を決めて、その中だけをランダムに確認します。',
  },
  {
    key: 'LEARNED_ONLY',
    label: '学習済みのみ',
    description: '学習モードで評価した単語だけを厳密に抽出して出題します。',
  },
];

export const buildQuizLoadingMessage = (mode: WorksheetQuestionMode): string => {
  if (mode === 'JA_TO_EN') return '日本語から英語の確認テストを準備中...';
  if (mode === 'SPELLING_HINT') return '先頭2文字ヒントの確認テストを準備中...';
  return '英語から日本語の確認テストを準備中...';
};

export const createDefaultQuizConfig = (
  rangeStart: number,
  rangeEnd: number,
): QuizSessionConfig => ({
  selectionMode: 'FULL_RANDOM',
  questionMode: 'EN_TO_JA',
  questionCount: DEFAULT_QUESTION_COUNT,
  rangeStart,
  rangeEnd,
});
