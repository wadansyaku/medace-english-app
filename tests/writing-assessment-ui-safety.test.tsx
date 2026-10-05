import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Keep the real feedback content in this SSR test; modal portal/focus is covered by browser checks.
vi.mock('../components/ModalOverlay', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import WritingOpsReviewSection from '../components/writing/ops/WritingOpsReviewSection';
import WritingOpsPrintSection from '../components/writing/ops/WritingOpsPrintSection';
import WritingStudentFeedbackSheet from '../components/writing/WritingStudentFeedbackSheet';
import WritingStudentAssignmentList from '../components/writing/WritingStudentAssignmentList';
import type { WritingStudentSubmissionDetailResponse, WritingSubmissionDetailResponse } from '../contracts/writing';
import {
  WritingAssignmentStatus,
  WritingExamCategory,
  WritingSubmissionSource,
  type WritingAiExecutionProvenance,
  type WritingAssignment,
  type WritingEvaluation,
  type WritingQueueItem,
} from '../types';

const live: WritingAiExecutionProvenance = { mode: 'live', provider: 'GEMINI', model: 'gemini-2.5-flash' };
const fixture: WritingAiExecutionProvenance = { mode: 'fixture', provider: 'GEMINI', model: 'fixture-evaluation' };
const hybrid: WritingAiExecutionProvenance = { mode: 'hybrid-fallback', provider: 'GEMINI', model: 'fixture-evaluation' };
const asset = { id: 'asset-1', fileName: 'original-answer.png', mimeType: 'image/png', byteSize: 100, assetOrder: 1, assetUrl: '/synthetic-original-answer.png' };
const assignment: WritingAssignment = {
  id: 'assignment-1', organizationId: 'org-synthetic', organizationName: 'Synthetic school',
  instructorUid: 'teacher-synthetic', instructorName: 'Synthetic teacher', studentUid: 'student-synthetic', studentName: 'Synthetic student',
  examCategory: WritingExamCategory.EIKEN, templateType: 'OPINION', promptTitle: 'Synthetic question',
  promptText: 'Write your opinion.', guidance: 'Give a reason.', wordCountMin: 40, wordCountMax: 60,
  submissionCode: 'SYNTHETIC', status: WritingAssignmentStatus.REVIEW_READY, attemptCount: 1, maxAttempts: 2,
  createdAt: 1, updatedAt: 1,
};
const evaluation = (provenance: WritingAiExecutionProvenance | undefined, score = 17): WritingEvaluation => ({
  id: 'evaluation-1', provider: 'GEMINI', overallScore: score,
  rubric: [{ key: 'grammar', label: '文法', score: 4, maxScore: 5, comment: 'Synthetic rubric comment' }],
  strengths: ['Synthetic strength'], improvementPoints: ['Synthetic improvement'],
  sentenceCorrections: [], correctedDraft: 'Synthetic corrected draft', modelAnswer: 'Synthetic model answer',
  confidence: .97, transcriptAlignment: .96, rubricConsistency: .95, structureScore: .94, selectionScore: .93,
  costMilliYen: 333, latencyMs: 222, isDefault: true, provenance,
});
const detail = (ocrMeta: WritingAiExecutionProvenance | undefined, selected = evaluation(live)): WritingSubmissionDetailResponse => ({
  assignment,
  submission: {
    id: 'submission-1', assignmentId: assignment.id, attemptNo: 1, submissionSource: WritingSubmissionSource.STUDENT_MOBILE,
    submittedByUid: assignment.studentUid, transcript: 'Synthetic transcript', transcriptConfidence: .99,
    ocrProvider: 'GEMINI', ocrMeta, processingState: 'EVALUATED', submittedAt: 1, assets: [asset], evaluations: [selected],
    selectedEvaluationId: selected.id,
    teacherReview: { id: 'review-1', submissionId: 'submission-1', reviewerUid: assignment.instructorUid,
      reviewerName: assignment.instructorName, selectedEvaluationId: selected.id, publicComment: 'Original human comment',
      privateMemo: 'Original private note', reviewDecision: 'APPROVED_RETURN', createdAt: 1, updatedAt: 1, releasedAt: 1 },
  },
});
const queue = (assessmentStatus?: 'sample' | 'unverified'): WritingQueueItem => ({
  assignmentId: assignment.id, submissionId: 'submission-1', studentUid: assignment.studentUid,
  studentName: assignment.studentName, examCategory: assignment.examCategory, promptTitle: assignment.promptTitle,
  status: assignment.status, attemptNo: 1, submittedAt: 1, transcriptConfidence: .99,
  recommendedProvider: 'GEMINI', instructorName: assignment.instructorName, assessmentStatus,
});
const renderReview = (response: WritingSubmissionDetailResponse, tab: 'QUEUE' | 'HISTORY' = 'QUEUE', queueStatus?: 'sample' | 'unverified') => renderToStaticMarkup(
  <WritingOpsReviewSection tab={tab} reviewList={[queue(queueStatus)]} selectedSubmissionId={response.submission.id}
    detail={response} selectedEvaluationId={response.submission.evaluations[0]?.id ?? ''}
    selectedEvaluation={response.submission.evaluations[0]} reviewPublicComment="Valid human draft" reviewPrivateMemo="Original private note"
    reviewing={false} onSelectSubmission={vi.fn()} onSelectEvaluation={vi.fn()} onReviewPublicCommentChange={vi.fn()}
    onReviewPrivateMemoChange={vi.fn()} onApprove={vi.fn()} onRequestRevision={vi.fn()} onComplete={vi.fn()} />,
);
const button = (html: string, id: string) => html.match(new RegExp(`<button[^>]*data-testid="${id}"[^>]*>`))?.[0];

describe('writing review provenance safety', () => {
  it.each([
    ['fixture evaluation', live, fixture, 'sample'],
    ['hybrid fallback evaluation', live, hybrid, 'sample'],
    ['legacy mislabeled fixture', live, { ...live, model: 'fixture-evaluation' }, 'sample'],
    ['sample OCR with live evaluation', fixture, live, 'sample'],
    ['unknown OCR provenance', undefined, live, 'unverified'],
    ['unknown evaluation provenance', live, undefined, 'unverified'],
  ] as const)('holds review and completion for %s while keeping the original and human draft', (_name, ocrMeta, provenance, status) => {
    const response = detail(ocrMeta, evaluation(provenance));
    const html = renderReview(response, 'QUEUE', status);
    expect(html).toContain(status === 'sample' ? 'サンプル／実際の答案を評価していません' : '答案の処理方法を確認できません');
    expect(html).toContain('/synthetic-original-answer.png');
    expect(html).toContain('Valid human draft');
    expect(html).not.toContain('17 / 20');
    expect(html).not.toContain('OCR 99%');
    expect(html).not.toContain('confidence 97');
    expect(html).not.toContain('OCR整合:');
    expect(button(html, 'writing-approve-return')).toContain('disabled=""');
    expect(button(html, 'writing-request-revision')).toContain('disabled=""');
    if (status === 'sample') expect(html).toContain('参考用サンプルを見る（答案の評価ではありません）');
    response.assignment = { ...response.assignment, status: WritingAssignmentStatus.RETURNED };
    const history = renderReview(response, 'HISTORY', status);
    expect(history).toContain('Original human comment');
    expect(button(history, 'writing-complete-assignment')).toContain('disabled=""');
  });

  it.each([live, { ...live, notes: 'manual-transcript', model: 'manual-transcript' }])(
    'keeps actual evaluation scores and review controls for verified OCR or a manual transcript', ocrMeta => {
      const response = detail(ocrMeta);
      const html = renderReview(response);
      expect(html).not.toContain('writing-review-assessment-warning');
      expect(html).toContain('17 / 20');
      expect(button(html, 'writing-approve-return')).not.toContain('disabled=""');
      expect(button(html, 'writing-request-revision')).not.toContain('disabled=""');
      response.assignment = { ...response.assignment, status: WritingAssignmentStatus.RETURNED };
      expect(button(renderReview(response, 'HISTORY'), 'writing-complete-assignment')).not.toContain('disabled=""');
    },
  );

  it('keeps the selected real evaluation usable while clearly isolating an unselected sample', () => {
    const response = detail(live, evaluation(live, 14));
    response.submission.evaluations.push({ ...evaluation(hybrid), id: 'sample-2' });
    const html = renderReview(response);
    expect(html).toContain('14 / 20');
    expect(html).not.toContain('17 / 20');
    expect(html).toContain('サンプル／実際の答案を評価していません');
    expect(button(html, 'writing-approve-return')).not.toContain('disabled=""');
  });
});

describe('student writing feedback safety', () => {
  const studentDetail = (assessmentStatus?: 'sample' | 'unverified', includeEvaluation = true): WritingStudentSubmissionDetailResponse => ({
    assignment: { id: assignment.id, promptTitle: assignment.promptTitle, status: WritingAssignmentStatus.RETURNED },
    submission: {
      id: 'submission-1', assignmentId: assignment.id, attemptNo: 1, submissionSource: WritingSubmissionSource.STUDENT_MOBILE,
      submittedAt: 1, transcript: 'Never show a sample transcript', assets: [asset], assessmentStatus,
      evaluations: includeEvaluation ? [evaluation(live)] : [], teacherReview: { publicComment: 'Original human comment', releasedAt: 1 },
    },
  });
  const renderFeedback = (response: WritingStudentSubmissionDetailResponse, mobile: boolean) => renderToStaticMarkup(
    <WritingStudentFeedbackSheet feedbackDetail={response} isMobileViewport={mobile} selectedEvaluation={response.submission.evaluations[0]}
      feedbackCommentExpanded={false} onToggleFeedbackCommentExpanded={vi.fn()} onClose={vi.fn()} onPrintFeedback={vi.fn()} />,
  );

  it.each([false, true])('shows originals and human comments while suppressing unsafe results at mobile=%s', mobile => {
    for (const status of ['sample', 'unverified'] as const) {
      for (const includeEvaluation of [false, true]) {
        const html = renderFeedback(studentDetail(status, includeEvaluation), mobile);
        expect(html).toContain('writing-feedback-assessment-warning');
        expect(html).toContain(status === 'sample' ? 'サンプル／実際の答案を評価していません' : '答案の処理方法を確認できません');
        expect(html).toContain('/synthetic-original-answer.png');
        expect(html).toContain('Original human comment');
        expect(html).toContain('閉じる');
        expect(html).not.toContain('確定スコア');
        expect(html).not.toContain('Synthetic corrected draft');
        expect(html).not.toContain('Never show a sample transcript');
        expect(html).not.toContain('添削結果を印刷');
      }
    }
  });

  it('fails closed when a legacy released response has no selected evaluation or assessment metadata', () => {
    const html = renderFeedback(studentDetail(undefined, false), false);
    expect(html).toContain('答案の処理方法を確認できません');
    expect(html).toContain('/synthetic-original-answer.png');
    expect(html).not.toContain('添削結果を印刷');
  });

  it.each([false, true])('preserves real released feedback and print at mobile=%s', mobile => {
    const html = renderFeedback(studentDetail(), mobile);
    expect(html).not.toContain('writing-feedback-assessment-warning');
    expect(html).toContain('確定スコア');
    expect(html).toContain('17 / 20');
    expect(html).toContain('Synthetic corrected draft');
    expect(html).toContain('添削結果を印刷');
  });
});

describe('template question provenance', () => {
  it.each([false, true])('labels template questions without blocking submission at mobile=%s', mobile => {
    const templateAssignment = { ...assignment, status: WritingAssignmentStatus.ISSUED, promptProvenance: hybrid };
    const html = renderToStaticMarkup(<WritingStudentAssignmentList assignments={[templateAssignment]} isMobileViewport={mobile}
      openingFeedbackId={null} onOpenSubmit={vi.fn()} onOpenFeedback={vi.fn()} />);
    expect(html).toContain('テンプレート課題（AI生成なし）');
    expect(button(html, 'writing-open-submit-assignment-1')).not.toContain('disabled=""');
  });

  it('labels teacher template questions and keeps valid print and issue actions', () => {
    const templateAssignment = { ...assignment, status: WritingAssignmentStatus.DRAFT, promptProvenance: fixture };
    const html = renderToStaticMarkup(<WritingOpsPrintSection assignments={[templateAssignment]} selectedAssignment={templateAssignment}
      selectedAssignmentId={templateAssignment.id} issuing={false} onSelectAssignment={vi.fn()} onIssue={vi.fn()} onOpenScanner={vi.fn()} />);
    expect(html).toContain('テンプレート課題（AI生成なし）');
    expect(button(html, 'writing-issue-assignment')).not.toContain('disabled=""');
    expect(button(html, 'writing-print-launcher')).not.toContain('disabled=""');
  });
});
