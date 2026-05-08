import {
  LearningTaskIntentType,
  MissionNextActionType,
  RecommendedActionType,
  WeaknessDimension,
  type InstructorNotification,
  type LearningTaskIntent,
  type PrimaryMissionSnapshot,
  type WeaknessSignalSummary,
} from '../types';
import {
  DEFAULT_SMART_SESSION_ID,
  DEFAULT_SMART_SESSION_LIMIT,
  WEAKNESS_FOCUS_SESSION_ID,
  WEAKNESS_FOCUS_SESSION_LIMIT,
} from './studySession';

const TASK_QUERY_KEY = 'task';

const serializeTaskPayload = (task: LearningTaskIntent): string => (
  encodeURIComponent(JSON.stringify(task))
);

export const serializeTaskIntent = (task: LearningTaskIntent | null | undefined): string | null => {
  if (!task) return null;
  return serializeTaskPayload(task);
};

export const parseTaskIntent = (value: string | null | undefined): LearningTaskIntent | null => {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(value)) as LearningTaskIntent;
    if (!parsed || (parsed.mode !== 'study' && parsed.mode !== 'quiz')) return null;
    if (!parsed.intentType || !parsed.selectionPolicy || !parsed.label) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const buildTaskQueryString = (task: LearningTaskIntent | null | undefined): string => {
  const serialized = serializeTaskIntent(task);
  if (!serialized) return '';
  const search = new URLSearchParams();
  search.set(TASK_QUERY_KEY, serialized);
  return `?${search.toString()}`;
};

export const parseTaskIntentFromSearch = (search: string): LearningTaskIntent | null => {
  const params = new URLSearchParams(search);
  return parseTaskIntent(params.get(TASK_QUERY_KEY));
};

export const getTaskRouteBookId = (task: LearningTaskIntent): string => {
  if (task.bookId) return task.bookId;
  if (task.intentType === LearningTaskIntentType.WEAKNESS_STUDY || task.intentType === LearningTaskIntentType.WEAKNESS_QUIZ) {
    return WEAKNESS_FOCUS_SESSION_ID;
  }
  return DEFAULT_SMART_SESSION_ID;
};

export const createBookStudyTaskIntent = (bookId: string, label = '教材学習'): LearningTaskIntent => ({
  mode: 'study',
  intentType: LearningTaskIntentType.BOOK_STUDY,
  bookId,
  label,
  selectionPolicy: 'BOOK_DEFAULT',
  limit: 10,
});

export const createBookQuizTaskIntent = (bookId: string, label = '教材テスト'): LearningTaskIntent => ({
  mode: 'quiz',
  intentType: LearningTaskIntentType.BOOK_QUIZ,
  bookId,
  label,
  selectionPolicy: 'BOOK_DEFAULT',
  limit: 10,
});

export const createFollowUpSpellingTaskIntent = (bookId: string): LearningTaskIntent => ({
  mode: 'quiz',
  intentType: LearningTaskIntentType.BOOK_QUIZ,
  bookId,
  label: '仕上げのスペルチェック',
  selectionPolicy: 'BOOK_DEFAULT',
  limit: 5,
  targetQuestionModes: ['SPELLING_HINT'],
  autoStart: true,
});

export const createTodayFocusTaskIntent = (): LearningTaskIntent => ({
  mode: 'study',
  intentType: LearningTaskIntentType.TODAY_FOCUS,
  label: '今日のクエスト',
  selectionPolicy: 'DUE_FIRST',
  limit: DEFAULT_SMART_SESSION_LIMIT,
});

export const createCoachTaskIntent = ({
  recommendedActionType,
  hasLearningPlan,
}: {
  recommendedActionType?: RecommendedActionType | null;
  hasLearningPlan: boolean;
}): LearningTaskIntent | null => {
  if (recommendedActionType === RecommendedActionType.OPEN_PLAN) {
    return null;
  }
  return {
    mode: 'study',
    intentType: LearningTaskIntentType.COACH_REVIEW,
    label: '講師フォローに沿って復習',
    selectionPolicy: 'DUE_FIRST',
    limit: WEAKNESS_FOCUS_SESSION_LIMIT,
  };
};

export const createWeaknessTaskIntent = (signal: WeaknessSignalSummary | null | undefined): LearningTaskIntent => {
  if (!signal) {
    return {
      mode: 'study',
      intentType: LearningTaskIntentType.WEAKNESS_STUDY,
      label: '苦手診断クエスト',
      selectionPolicy: 'WEAKNESS_FOCUS',
      limit: WEAKNESS_FOCUS_SESSION_LIMIT,
      targetQuestionModes: ['JA_TO_EN', 'EN_TO_JA'],
    };
  }

  const quizDriven = (
    signal.dimension === WeaknessDimension.MEANING_RECALL
    || signal.dimension === WeaknessDimension.MEANING_RECOGNITION
    || signal.dimension === WeaknessDimension.SPELLING_RECALL
    || signal.dimension === WeaknessDimension.GRAMMAR_APPLICATION
    || signal.dimension === WeaknessDimension.WORD_ORDER
    || signal.dimension === WeaknessDimension.TRANSLATION_ORDER
  );

  return {
    mode: quizDriven ? 'quiz' : 'study',
    intentType: quizDriven ? LearningTaskIntentType.WEAKNESS_QUIZ : LearningTaskIntentType.WEAKNESS_STUDY,
    label: signal.nextActionLabel,
    selectionPolicy: 'WEAKNESS_FOCUS',
    limit: WEAKNESS_FOCUS_SESSION_LIMIT,
    targetQuestionModes: signal.targetQuestionModes,
    targetBandIndex: signal.targetBandIndex,
    autoStart: quizDriven,
  };
};

export const createMissionTaskIntent = (mission: PrimaryMissionSnapshot): LearningTaskIntent | null => {
  if (mission.nextActionType === MissionNextActionType.OPEN_WRITING || mission.nextActionType === MissionNextActionType.OPEN_PLAN) {
    return null;
  }
  if (!mission.sourceBookId) return null;

  if (mission.nextActionType === MissionNextActionType.OPEN_QUIZ) {
    return {
      mode: 'quiz',
      intentType: LearningTaskIntentType.MISSION_QUIZ,
      label: mission.nextActionLabel,
      selectionPolicy: 'BOOK_DEFAULT',
      limit: Math.max(5, Math.min(10, mission.quizTargetCount || 10)),
      bookId: mission.sourceBookId,
      missionAssignmentId: mission.assignmentId,
      targetQuestionModes: ['EN_TO_JA'],
      autoStart: true,
    };
  }

  const reviewRemaining = Math.max(0, mission.reviewWordsTarget - mission.reviewWordsCompleted);
  const newRemaining = Math.max(0, mission.newWordsTarget - mission.newWordsCompleted);
  const shouldStartWithNewWords = (
    mission.newWordsCompleted === 0
    && mission.reviewWordsCompleted === 0
    && newRemaining > 0
  );
  const reviewFirst = reviewRemaining > 0 && !shouldStartWithNewWords;
  return {
    mode: 'study',
    intentType: reviewFirst ? LearningTaskIntentType.MISSION_REVIEW : LearningTaskIntentType.MISSION_NEW,
    label: mission.nextActionLabel,
    selectionPolicy: reviewFirst ? 'BOOK_REVIEW_ONLY' : 'BOOK_NEW_ONLY',
    limit: Math.max(5, Math.min(10, reviewFirst ? reviewRemaining : newRemaining || 10)),
    bookId: mission.sourceBookId,
    missionAssignmentId: mission.assignmentId,
  };
};

export const createTaskIntentFromBookSelection = (
  bookId: string,
  mode: 'study' | 'quiz',
): LearningTaskIntent => (
  mode === 'study'
    ? createBookStudyTaskIntent(bookId)
    : createBookQuizTaskIntent(bookId)
);

export const createDefaultTaskIntentFromRoute = (
  bookId: string,
  mode: 'study' | 'quiz',
): LearningTaskIntent => (
  createTaskIntentFromBookSelection(bookId, mode)
);

export const createTaskIntentFromCoachNotification = ({
  notification,
  hasLearningPlan,
}: {
  notification: InstructorNotification | null | undefined;
  hasLearningPlan: boolean;
}): LearningTaskIntent | null => {
  if (!notification) return null;
  return createCoachTaskIntent({
    recommendedActionType: notification.recommendedActionType,
    hasLearningPlan,
  });
};
