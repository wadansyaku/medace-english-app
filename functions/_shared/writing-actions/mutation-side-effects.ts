import { rebuildOrganizationKpiSnapshots } from '../organization-kpi';
import { touchWeeklyMissionProgressFromWriting } from '../storage-mission-actions';
import { toTokyoDateKey } from '../storage-support';
import type { AppEnv } from '../types';
import { HttpError } from '../http';
import { classifyWritingEvaluation } from '../../../shared/writingAiSafety';
import { parseAiProvenance } from './models';
import {
  readAssignmentRow,
  readSubmissionRow,
  readSubmissionEvaluationRowsBySubmissionIds,
  readTeacherReviewRowsBySubmissionIds,
} from './repository';

interface SyncWritingActivityParams {
  studentUid: string;
  writingAssignmentId: string;
  // Persisted jobs predating this field must fail closed rather than infer a target.
  writingSubmissionId?: string;
  organizationId?: string | null;
  activityAt: number;
}

export const syncWritingActivitySideEffects = async (
  env: AppEnv,
  params: SyncWritingActivityParams,
): Promise<void> => {
  if (typeof params.writingSubmissionId !== 'string' || !params.writingSubmissionId.trim()) {
    throw new HttpError(409, '旧形式の学習記録jobには元の提出識別子がありません。最新の答案から推測せず、講師の手動確認が必要です。');
  }
  // A later attempt cannot authorize or suppress activity from this submission.
  const [submission, assignment] = await Promise.all([
    readSubmissionRow(env, params.writingSubmissionId),
    readAssignmentRow(env, params.writingAssignmentId),
  ]);
  if (!submission || !assignment || submission.assignment_id !== params.writingAssignmentId
    || assignment.student_user_id !== params.studentUid
    || (assignment.organization_id || null) !== (params.organizationId || null)
    || !Number.isSafeInteger(params.activityAt) || params.activityAt <= 0) {
    throw new HttpError(409, '答案の実処理を確認できないため学習記録へ反映しません。講師の手動確認が必要です。');
  }
  const [evaluationsBySubmission, reviewsBySubmission] = await Promise.all([
    readSubmissionEvaluationRowsBySubmissionIds(env, [submission.id]),
    readTeacherReviewRowsBySubmissionIds(env, [submission.id]),
  ]);
  const selectedId = reviewsBySubmission.get(submission.id)?.selected_evaluation_id || submission.selected_evaluation_id;
  const selected = evaluationsBySubmission.get(submission.id)?.find((evaluation) => evaluation.id === selectedId);
  if (!selected || classifyWritingEvaluation(
    { provenance: parseAiProvenance(selected.raw_payload) },
    parseAiProvenance(submission.ocr_meta),
  ) !== 'real') {
    throw new HttpError(409, 'サンプルまたは処理元未確認の評価は学習記録へ反映しません。講師の手動確認が必要です。');
  }

  await touchWeeklyMissionProgressFromWriting(env, {
    studentUid: params.studentUid,
    writingAssignmentId: params.writingAssignmentId,
    activityAt: params.activityAt,
  });

  if (!params.organizationId) {
    return;
  }

  await rebuildOrganizationKpiSnapshots(env, params.organizationId, {
    dateKeys: [toTokyoDateKey(params.activityAt)],
  });
};
