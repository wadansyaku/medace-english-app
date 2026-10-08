import { LearningTaskIntentType, type LearningTaskIntent, type StudyWordRange } from '../types';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS, type NaruRangePreset } from './naruBook';

export type NaruStudyKind = 'new' | 'due';

// Only the three previously published full chapters are upgraded. Custom and
// mission ranges keep their exact numeric scope rather than shifting by POS.
const LEGACY_NARU_CHAPTER_RANGES = [
  { id: 'all', start: 1, end: 1530 },
  { id: 'adverb', start: 1286, end: 1371 },
  { id: 'adjective', start: 1372, end: 1530 },
] as const;

export const resolveNaruStudyChapter = (range?: StudyWordRange): NaruRangePreset | null => {
  if (range === undefined) return NARU_RANGE_PRESETS[0];
  const current = NARU_RANGE_PRESETS.find(chapter => chapter.start === range.start && chapter.end === range.end);
  if (current) return current;
  const legacy = LEGACY_NARU_CHAPTER_RANGES.find(chapter => chapter.start === range.start && chapter.end === range.end);
  return legacy ? NARU_RANGE_PRESETS.find(chapter => chapter.id === legacy.id) || null : null;
};

export const isNaruChapterStudyTask = (bookId: string, task?: LearningTaskIntent | null): boolean => (
  bookId === NARU_BOOK_ID && (!task || (
    task.mode === 'study' && task.intentType === LearningTaskIntentType.BOOK_STUDY
    && task.bookId === bookId && !task.missionAssignmentId
  ))
);

export const normalizeNaruChapterQuizTask = (
  bookId: string,
  task?: LearningTaskIntent | null,
): LearningTaskIntent | null | undefined => {
  if (bookId !== NARU_BOOK_ID || task?.bookId !== bookId || task.mode !== 'quiz'
    || task.intentType !== LearningTaskIntentType.BOOK_QUIZ || task.missionAssignmentId
    || !task.wordRange) return task;
  const chapter = resolveNaruStudyChapter(task.wordRange);
  if (!chapter || (chapter.start === task.wordRange.start && chapter.end === task.wordRange.end)) return task;
  return { ...task, wordRange: { start: chapter.start, end: chapter.end } };
};

export const createNaruChapterTask = (
  chapter: NaruRangePreset,
  kind: NaruStudyKind,
  autoStart = false,
): LearningTaskIntent => ({
  mode: 'study', intentType: LearningTaskIntentType.BOOK_STUDY, bookId: NARU_BOOK_ID,
  label: `${chapter.label}・${kind === 'due' ? '期限が来た復習' : '新しい単語'}`,
  selectionPolicy: kind === 'due' ? 'BOOK_DUE_ONLY' : 'BOOK_NEW_ONLY',
  wordRange: { start: chapter.start, end: chapter.end }, limit: 10, autoStart,
});

export const createNaruChapterReturnTask = (task: LearningTaskIntent): LearningTaskIntent => (
  createNaruChapterTask(resolveNaruStudyChapter(task.wordRange) || NARU_RANGE_PRESETS[0],
    task.selectionPolicy === 'BOOK_DUE_ONLY' ? 'due' : 'new')
);
