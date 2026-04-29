import { useCallback, useMemo, useState } from 'react';

import { resolveRecommendedActionType } from '../../shared/retention';
import { workspaceService } from '../../services/workspace';
import {
  InterventionKind,
  type OrganizationActivationActionTarget,
  type OrganizationDashboardSnapshot,
  type StudentSummary,
} from '../../types';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

export interface BusinessAdminFirstNotificationTarget {
  studentUid: string;
  studentName: string;
  instructorUid: string;
  instructorName: string;
  missionTitle: string;
  missionStatus?: string;
  missionDueAt?: number;
  message: string;
  triggerReason: string;
  interventionKind: InterventionKind;
  hasLearningPlan?: boolean;
}

interface UseFirstNotificationActionParams {
  snapshot: OrganizationDashboardSnapshot | null;
  onSent?: (target: BusinessAdminFirstNotificationTarget) => void | Promise<void>;
}

const resolveInstructorName = (
  snapshot: OrganizationDashboardSnapshot,
  student: StudentSummary,
): string => {
  if (student.assignedInstructorName) return student.assignedInstructorName;
  const instructor = snapshot.instructors.find((item) => item.uid === student.assignedInstructorUid);
  return instructor?.displayName || `講師ID: ${student.assignedInstructorUid}`;
};

export const resolveFirstNotificationTarget = (
  snapshot: OrganizationDashboardSnapshot | null,
  actionTarget?: OrganizationActivationActionTarget | null,
): BusinessAdminFirstNotificationTarget | null => {
  if (!snapshot) return null;
  if (actionTarget?.kind === 'INSTRUCTOR_NOTIFICATION' && actionTarget.studentUid) {
    const targetStudent = snapshot.studentAssignments.find((student) => student.uid === actionTarget.studentUid);
    const instructorUid = actionTarget.instructorUid || targetStudent?.assignedInstructorUid;
    const instructorName = actionTarget.instructorName || (targetStudent ? resolveInstructorName(snapshot, targetStudent) : undefined);
    if (!instructorUid || !instructorName) return null;

    const missionTitle = actionTarget.missionTitle || targetStudent?.primaryMissionTitle || '初回ミッション';
    const interventionKind = InterventionKind.REVIEW_RESTART;
    return {
      studentUid: actionTarget.studentUid,
      studentName: actionTarget.studentName || targetStudent?.name || '対象生徒',
      instructorUid,
      instructorName,
      missionTitle,
      missionStatus: targetStudent?.primaryMissionStatus,
      missionDueAt: targetStudent?.missionDueAt,
      message: `${actionTarget.studentName || targetStudent?.name || '生徒'}さん、まずは「${missionTitle}」を今日5分だけ進めましょう。担当の${instructorName}先生と一緒に、最初の一歩から戻せば大丈夫です。`,
      triggerReason: 'Business Admin 初回フォロー通知',
      interventionKind,
      hasLearningPlan: targetStudent?.hasLearningPlan,
    };
  }

  const targetStudent = snapshot.studentAssignments.find((student) => (
    Boolean(student.assignedInstructorUid)
    && Boolean(student.primaryMissionTitle)
    && !student.lastNotificationAt
  ));
  if (!targetStudent || !targetStudent.assignedInstructorUid || !targetStudent.primaryMissionTitle) {
    return null;
  }

  const instructorName = resolveInstructorName(snapshot, targetStudent);
  const interventionKind = InterventionKind.REVIEW_RESTART;
  return {
    studentUid: targetStudent.uid,
    studentName: targetStudent.name,
    instructorUid: targetStudent.assignedInstructorUid,
    instructorName,
    missionTitle: targetStudent.primaryMissionTitle,
    missionStatus: targetStudent.primaryMissionStatus,
    missionDueAt: targetStudent.missionDueAt,
    message: `${targetStudent.name}さん、まずは「${targetStudent.primaryMissionTitle}」を今日5分だけ進めましょう。担当の${instructorName}先生と一緒に、最初の一歩から戻せば大丈夫です。`,
    triggerReason: 'Business Admin 初回フォロー通知',
    interventionKind,
    hasLearningPlan: targetStudent.hasLearningPlan,
  };
};

export const useFirstNotificationAction = ({
  snapshot,
  onSent,
}: UseFirstNotificationActionParams) => {
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const target = useMemo(() => resolveFirstNotificationTarget(snapshot, snapshot?.nextRequiredActionTarget), [snapshot]);

  const sendFirstNotification = useCallback(async (overrideTarget?: OrganizationActivationActionTarget | null) => {
    const resolvedTarget = overrideTarget ? resolveFirstNotificationTarget(snapshot, overrideTarget) : target;
    if (!resolvedTarget) return;

    setSending(true);
    setNotice(null);
    try {
      await workspaceService.sendInstructorNotification(
        resolvedTarget.studentUid,
        resolvedTarget.message,
        resolvedTarget.triggerReason,
        false,
        resolvedTarget.interventionKind,
        resolveRecommendedActionType({
          interventionKind: resolvedTarget.interventionKind,
          hasLearningPlan: resolvedTarget.hasLearningPlan,
        }),
      );
      setNotice({
        tone: 'success',
        message: `${resolvedTarget.studentName}さんへ初回フォロー通知を保存しました。作文運用へ進めます。`,
      });
      await onSent?.(resolvedTarget);
    } catch (error) {
      console.error(error);
      setNotice({
        tone: 'error',
        message: error instanceof Error ? error.message : '初回フォロー通知の保存に失敗しました。',
      });
    } finally {
      setSending(false);
    }
  }, [onSent, snapshot, target]);

  return {
    firstNotificationNotice: notice,
    firstNotificationSending: sending,
    firstNotificationTarget: target,
    sendFirstNotification,
  };
};

export default useFirstNotificationAction;
