import { FOLLOW_UP_WINDOW_MS } from '../../shared/retention';
import {
  InterventionOutcome,
  StudentRiskLevel,
  WeeklyMissionStatus,
} from '../../types';

export const resolveStudentRiskLevel = (daysSinceActive: number): StudentRiskLevel => (
  daysSinceActive >= 3
    ? StudentRiskLevel.DANGER
    : daysSinceActive >= 1
      ? StudentRiskLevel.WARNING
      : StudentRiskLevel.SAFE
);

export const buildStudentRiskReasons = ({
  daysSinceActive,
  activeStudyDays7d,
  accuracy,
  hasLearningPlan,
  missionOverdue,
  missionStatus,
  riskLevel,
  latestInterventionAt,
  latestInterventionOutcome,
  now,
}: {
  daysSinceActive: number;
  activeStudyDays7d: number;
  accuracy: number;
  hasLearningPlan: boolean;
  missionOverdue: boolean;
  missionStatus?: WeeklyMissionStatus;
  riskLevel: StudentRiskLevel;
  latestInterventionAt?: number;
  latestInterventionOutcome?: InterventionOutcome;
  now: number;
}): string[] => {
  const riskReasons: string[] = [];

  if (daysSinceActive >= 3) riskReasons.push('3日以上学習が空いています');
  else if (daysSinceActive >= 1) riskReasons.push('前回学習から1日以上空いています');
  if (activeStudyDays7d < 4) riskReasons.push(`直近7日で${activeStudyDays7d}日学習です`);
  if (accuracy > 0 && accuracy < 0.7) riskReasons.push(`正答率が ${Math.round(accuracy * 100)}% です`);
  if (!hasLearningPlan) riskReasons.push('学習プランが未設定です');
  if (missionOverdue) riskReasons.push('今週ミッションが期限超過です');
  else if (missionStatus === WeeklyMissionStatus.ASSIGNED) riskReasons.push('今週ミッションが未着手です');
  if (latestInterventionOutcome === InterventionOutcome.EXPIRED) {
    riskReasons.push('前回フォローが72時間以内に再開されず失効しています');
  } else if (
    riskLevel !== StudentRiskLevel.SAFE
    && (!latestInterventionAt || (now - latestInterventionAt > FOLLOW_UP_WINDOW_MS && latestInterventionOutcome !== InterventionOutcome.REACTIVATED))
  ) {
    riskReasons.push('48時間以内の講師フォローがありません');
  }
  return riskReasons.length > 0 ? riskReasons : ['学習ペースは安定しています'];
};

export const buildRecommendedAction = ({
  riskLevel,
  hasLearningPlan,
  latestInterventionOutcome,
  needsFollowUpNow,
  missionOverdue,
  missionStatus,
}: {
  riskLevel: StudentRiskLevel;
  hasLearningPlan: boolean;
  latestInterventionOutcome?: InterventionOutcome;
  needsFollowUpNow: boolean;
  missionOverdue?: boolean;
  missionStatus?: WeeklyMissionStatus;
}): string => {
  if (missionOverdue) {
    return '期限超過の今週ミッションを最優先に再開させ、残りタスクを1つだけに絞る';
  }
  if (missionStatus === WeeklyMissionStatus.ASSIGNED) {
    return '今週ミッションの最初の1アクションを明示し、未着手のまま止まらないようにする';
  }
  if (latestInterventionOutcome === InterventionOutcome.REACTIVATED) {
    return hasLearningPlan
      ? '再開できたので称賛し、今日の学習プランに戻して継続へつなぐ'
      : '再開できたので称賛し、次の短い復習タスクへつなぐ';
  }
  if (needsFollowUpNow && !hasLearningPlan) {
    return '短い復習タスクを指定しつつ、学習プランの設定有無を確認する';
  }
  if (needsFollowUpNow) {
    return '今日は10語だけの復習再開を促し、48時間以内に反応を確認する';
  }
  if (riskLevel === StudentRiskLevel.WARNING) {
    return '前回フォロー後の再開を待ち、次回の継続へつなぐ';
  }
  return hasLearningPlan
    ? '現状の学習プランを維持し、良いリズムを称賛する'
    : '安定しているので、このペースを称賛して次の学習計画へつなぐ';
};
