import { LearningTaskIntentType, type LearningTaskIntent, type StudyWordRange } from '../types';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS, type NaruRangePreset } from './naruBook';

export type NaruStudyKind = 'new' | 'due';

export const resolveNaruStudyChapter = (range?: StudyWordRange): NaruRangePreset | null => (
  range === undefined ? NARU_RANGE_PRESETS[0]
    : NARU_RANGE_PRESETS.find(chapter => chapter.start === range.start && chapter.end === range.end) || null
);

export const isNaruChapterStudyTask = (bookId: string, task?: LearningTaskIntent | null): boolean => (
  bookId === NARU_BOOK_ID && (!task || (
    task.mode === 'study' && task.intentType === LearningTaskIntentType.BOOK_STUDY
    && task.bookId === bookId && !task.missionAssignmentId
  ))
);

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
