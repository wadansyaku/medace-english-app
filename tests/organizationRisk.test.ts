import { describe, expect, it } from 'vitest';

import {
  buildRecommendedAction,
  buildStudentRiskReasons,
  resolveStudentRiskLevel,
} from '../functions/_shared/organization-risk';
import { InterventionOutcome, StudentRiskLevel, WeeklyMissionStatus } from '../types';

describe('organization risk helpers', () => {
  it('derives danger, warning, and safe risk bands from inactivity days', () => {
    expect(resolveStudentRiskLevel(5)).toBe(StudentRiskLevel.DANGER);
    expect(resolveStudentRiskLevel(1)).toBe(StudentRiskLevel.WARNING);
    expect(resolveStudentRiskLevel(0)).toBe(StudentRiskLevel.SAFE);
  });

  it('builds consistent risk reasons for overdue, unplanned, expired follow-up students', () => {
    expect(buildStudentRiskReasons({
      daysSinceActive: 4,
      activeStudyDays7d: 1,
      accuracy: 0.65,
      hasLearningPlan: false,
      missionOverdue: true,
      missionStatus: WeeklyMissionStatus.OVERDUE,
      riskLevel: StudentRiskLevel.DANGER,
      latestInterventionAt: 1_000,
      latestInterventionOutcome: InterventionOutcome.EXPIRED,
      now: 5_000,
    })).toEqual([
      '3日以上学習が空いています',
      '直近7日で1日学習です',
      '正答率が 65% です',
      '学習プランが未設定です',
      '今週ミッションが期限超過です',
      '前回フォローが72時間以内に再開されず失効しています',
    ]);
  });

  it('recommends plan-return messaging after a successful reactivation', () => {
    expect(buildRecommendedAction({
      riskLevel: StudentRiskLevel.WARNING,
      hasLearningPlan: true,
      latestInterventionOutcome: InterventionOutcome.REACTIVATED,
      needsFollowUpNow: false,
      missionOverdue: false,
      missionStatus: WeeklyMissionStatus.IN_PROGRESS,
    })).toBe('再開できたので称賛し、今日の学習プランに戻して継続へつなぐ');
  });
});
