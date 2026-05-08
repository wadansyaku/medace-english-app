import type { WritingSubmissionDetailResponse } from '../contracts/writing';
import { WritingAssignmentStatus, type WritingAssignment, type WritingQueueItem } from '../types';

export type WritingOpsTab = 'CREATE' | 'PRINT' | 'QUEUE' | 'HISTORY';

export interface WritingOpsCounts {
  draftCount: number;
  issuedCount: number;
  submittedCount: number;
  reviewReadyCount: number;
  revisionRequestedCount: number;
  returnedCount: number;
  completedCount: number;
}

export interface WritingOpsTriage {
  tab: WritingOpsTab;
  label: string;
  message: string;
  ctaLabel: string;
}

export const getWritingOpsCounts = (
  assignments: WritingAssignment[],
  queue: WritingQueueItem[],
): WritingOpsCounts => ({
  draftCount: assignments.filter((assignment) => assignment.status === WritingAssignmentStatus.DRAFT).length,
  issuedCount: assignments.filter((assignment) => assignment.status === WritingAssignmentStatus.ISSUED).length,
  submittedCount: assignments.filter((assignment) => assignment.status === WritingAssignmentStatus.SUBMITTED).length,
  reviewReadyCount: queue.length,
  revisionRequestedCount: assignments.filter((assignment) => assignment.status === WritingAssignmentStatus.REVISION_REQUESTED).length,
  returnedCount: assignments.filter((assignment) => assignment.status === WritingAssignmentStatus.RETURNED).length,
  completedCount: assignments.filter((assignment) => assignment.status === WritingAssignmentStatus.COMPLETED).length,
});

export const getWritingOpsTriage = (counts: WritingOpsCounts): WritingOpsTriage => {
  if (counts.reviewReadyCount > 0) {
    return {
      tab: 'QUEUE',
      label: '返却判断を優先',
      message: `${counts.reviewReadyCount}件の答案が講師確認待ちです。採用する AI 結果、講師コメント、返却または再提出依頼を先に確定します。`,
      ctaLabel: '添削キューへ',
    };
  }

  if (counts.draftCount > 0) {
    return {
      tab: 'PRINT',
      label: '配布前の課題あり',
      message: `${counts.draftCount}件の下書きがあります。印刷内容を確認して、配布状態にしてから生徒へ渡します。`,
      ctaLabel: '印刷 / 配布へ',
    };
  }

  if (counts.issuedCount + counts.revisionRequestedCount > 0) {
    return {
      tab: 'PRINT',
      label: '提出待ちを確認',
      message: `${counts.issuedCount + counts.revisionRequestedCount}件が生徒の提出待ちです。必要なら提出コードとスキャナー登録を確認します。`,
      ctaLabel: '提出状況を見る',
    };
  }

  if (counts.returnedCount > 0) {
    return {
      tab: 'HISTORY',
      label: '返却後の完了確認',
      message: `${counts.returnedCount}件が返却済みです。面談や確認が済んだものから完了へ進めます。`,
      ctaLabel: '返却履歴へ',
    };
  }

  return {
    tab: 'CREATE',
    label: '次の課題を作成',
    message: '現在、講師が処理すべき提出はありません。対象生徒とテンプレートを選んで次の自由英作文課題を作成できます。',
    ctaLabel: '問題作成へ',
  };
};

export const resolveSelectedAssignmentId = (
  assignments: WritingAssignment[],
  selectedAssignmentId: string,
): string => {
  if (assignments.length === 0) return '';
  if (selectedAssignmentId && assignments.some((assignment) => assignment.id === selectedAssignmentId)) {
    return selectedAssignmentId;
  }
  return assignments[0].id;
};

export const getReviewListForTab = (
  tab: WritingOpsTab,
  queue: WritingQueueItem[],
  history: WritingQueueItem[],
): WritingQueueItem[] => (tab === 'QUEUE' ? queue : history);

export const resolveSelectedSubmissionId = (
  reviewList: WritingQueueItem[],
  selectedSubmissionId: string,
): string => {
  if (reviewList.length === 0) return '';
  if (selectedSubmissionId && reviewList.some((item) => item.submissionId === selectedSubmissionId)) {
    return selectedSubmissionId;
  }
  return reviewList[0].submissionId;
};

export const resolveSelectedEvaluationId = (
  detail: WritingSubmissionDetailResponse,
  selectedEvaluationId?: string,
): string => {
  if (
    selectedEvaluationId
    && detail.submission.evaluations.some((evaluation) => evaluation.id === selectedEvaluationId)
  ) {
    return selectedEvaluationId;
  }

  return (
    detail.submission.teacherReview?.selectedEvaluationId
    || detail.submission.selectedEvaluationId
    || detail.submission.evaluations[0]?.id
    || ''
  );
};
