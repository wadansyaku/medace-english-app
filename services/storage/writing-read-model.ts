import {
  InterventionKind,
  InterventionOutcome,
  RecommendedActionType,
  type DashboardSnapshot,
  type UserProfile,
} from '../../types';

export const getCoachNotifications = async (
  uid: string,
  sessionUser: UserProfile | null,
): Promise<DashboardSnapshot['coachNotifications']> => [
  {
    id: 1,
    studentUid: uid,
    studentName: sessionUser?.displayName || 'あなた',
    instructorUid: 'mock-instructor-001',
    instructorName: 'Oak先生',
    message: 'Oak先生より: 今週は復習のペースが良いです。この調子で明日も15分だけ続けましょう。',
    triggerReason: '学習フォローアップ',
    deliveryChannel: 'IN_APP',
    usedAi: false,
    interventionKind: InterventionKind.PRAISE,
    recommendedActionType: RecommendedActionType.START_REVIEW,
    interventionOutcome: InterventionOutcome.REACTIVATED,
    createdAt: Date.now() - 3600_000,
  },
];
