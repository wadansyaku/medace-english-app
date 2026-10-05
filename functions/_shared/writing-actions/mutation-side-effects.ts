import { rebuildOrganizationKpiSnapshots } from '../organization-kpi';
import { touchWeeklyMissionProgressFromWriting } from '../storage-mission-actions';
import { toTokyoDateKey } from '../storage-support';
import type { AppEnv } from '../types';
import { HttpError } from '../http';
import { classifyWritingEvaluation } from '../../../shared/writingAiSafety';
import { parseAiProvenance } from './models';
import {
  readLatestSubmissionRowForAssignment,
  readSubmissionEvaluationRowsBySubmissionIds,
  readTeacherReviewRowsBySubmissionIds,
} from './repository';

interface SyncWritingActivityParams {
  studentUid: string;
  writingAssignmentId: string;
  organizationId?: string | null;
  activityAt: number;
}

export const syncWritingActivitySideEffects = async (
  env: AppEnv,
  params: SyncWritingActivityParams,
): Promise<void> => {
  // Old durable jobs can be retried independently of the review endpoint.
  // Check the persisted selected result before publishing learning activity.
  const submission = await readLatestSubmissionRowForAssignment(env, params.writingAssignmentId);
  if (!submission) {
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
