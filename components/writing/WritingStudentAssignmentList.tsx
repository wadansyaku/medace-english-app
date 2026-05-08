import React from 'react';
import { CheckCircle2, Clock3, ClipboardList, Eye, Loader2, MessageSquareText, Send } from 'lucide-react';

import { WRITING_ASSIGNMENT_STATUS_LABELS, type WritingAssignment } from '../../types';
import MobileStepPager from '../mobile/MobileStepPager';
import {
  WORKFLOW_STEPS,
  canOpenWritingFeedback,
  canSubmitWritingAssignment,
  formatWritingDateTime,
  getWritingAssignmentPhase,
} from './studentSectionUtils';

interface WritingStudentAssignmentListProps {
  assignments: WritingAssignment[];
  isMobileViewport: boolean;
  openingFeedbackId: string | null;
  onOpenSubmit: (assignment: WritingAssignment) => void;
  onOpenFeedback: (assignment: WritingAssignment) => void;
}

const getDecisionCopy = (assignment: WritingAssignment) => {
  switch (assignment.status) {
    case 'ISSUED':
      return {
        label: '提出待ち',
        title: '紙答案を撮影して提出',
        body: '提出コードと形式を確認してから、PDF 1枚または画像最大4枚で送信します。',
        icon: <Send className="h-4 w-4" />,
      };
    case 'REVISION_REQUESTED':
      return {
        label: 'コメント確認後に再提出',
        title: 'まず返却コメントを見る',
        body: '講師コメントを読んで直す点を決めてから、書き直した答案を提出します。',
        icon: <MessageSquareText className="h-4 w-4" />,
      };
    case 'RETURNED':
      return {
        label: '返却済み',
        title: '添削結果を確認',
        body: '講師コメント、改善点、訂正文例の順に見直します。',
        icon: <Eye className="h-4 w-4" />,
      };
    case 'COMPLETED':
      return {
        label: '完了',
        title: '見直し完了',
        body: '必要な確認は完了しています。次の課題配布を待ちます。',
        icon: <CheckCircle2 className="h-4 w-4" />,
      };
    default:
      return {
        label: WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status],
        title: '講師確認待ち',
        body: '答案は処理中です。返却されると添削結果を開けます。',
        icon: <Clock3 className="h-4 w-4" />,
      };
  }
};

const WritingStudentAssignmentCard: React.FC<{
  assignment: WritingAssignment;
  isMobileViewport: boolean;
  openingFeedbackId: string | null;
  onOpenSubmit: (assignment: WritingAssignment) => void;
  onOpenFeedback: (assignment: WritingAssignment) => void;
}> = ({
  assignment,
  isMobileViewport,
  openingFeedbackId,
  onOpenSubmit,
  onOpenFeedback,
}) => {
  const phase = getWritingAssignmentPhase(assignment.status);
  const decision = getDecisionCopy(assignment);
  const canSubmit = canSubmitWritingAssignment(assignment);
  const canOpenFeedback = canOpenWritingFeedback(assignment);
  const showFeedbackFirst = assignment.status === 'REVISION_REQUESTED' || (canOpenFeedback && !canSubmit);
  const submitButton = canSubmit ? (
    <button
      type="button"
      data-testid={`writing-open-submit-${assignment.id}`}
      onClick={() => onOpenSubmit(assignment)}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
    >
      <Send className="h-4 w-4" />
      {assignment.status === 'REVISION_REQUESTED' ? '書き直して再提出する' : 'スマホで提出する'}
    </button>
  ) : null;
  const feedbackButton = canOpenFeedback ? (
    <button
      type="button"
      data-testid={`writing-open-feedback-${assignment.id}`}
      onClick={() => onOpenFeedback(assignment)}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
    >
      {openingFeedbackId === assignment.latestSubmissionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
      添削結果を見る
    </button>
  ) : null;

  if (isMobileViewport) {
    return (
      <article className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
        <div className="rounded-3xl border border-white bg-white px-4 py-4">
          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-medace-700">
              {decision.icon}
              {decision.label}
            </div>
            <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${phase.tone}`}>
              {phase.label}
            </span>
          </div>
          <div className="mt-3 text-base font-black text-slate-950">{decision.title}</div>
          <div className="mt-2 text-sm leading-relaxed text-slate-600">{decision.body}</div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-bold text-slate-950">{assignment.promptTitle}</div>
            <div className="mt-1 text-xs text-slate-400">{assignment.wordCountMin} - {assignment.wordCountMax} words</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white bg-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Attempt</div>
            <div className="mt-2 text-sm font-black text-slate-950">{assignment.attemptCount} / {assignment.maxAttempts}</div>
          </div>
          <div className="rounded-2xl border border-white bg-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">最終更新</div>
            <div className="mt-2 text-sm font-black leading-snug text-slate-950">{formatWritingDateTime(assignment.updatedAt)}</div>
          </div>
        </div>

        <div className="mt-4 rounded-3xl border border-white bg-white px-4 py-4">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">次にやること</div>
          <div className="mt-2 text-[13px] leading-relaxed text-slate-700">{phase.description}</div>
        </div>

        <div className="mt-4 flex flex-col gap-3">
          {showFeedbackFirst ? feedbackButton : submitButton}
          {showFeedbackFirst ? submitButton : feedbackButton}

          {!canSubmit && !canOpenFeedback && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-500">
              {WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]} のため、次の操作を待っています。
            </div>
          )}
        </div>

        <details className="mt-4 rounded-3xl border border-white bg-white px-4 py-4">
          <summary className="cursor-pointer list-none text-sm font-bold text-slate-900">
            課題詳細を見る
          </summary>
          <div className="mt-4 space-y-4">
            <MobileStepPager
              steps={WORKFLOW_STEPS.map((step) => ({ id: step, label: step }))}
              activeStep={Math.max(0, phase.activeStep - 1)}
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">課題文</div>
              <div className="mt-3 text-sm leading-relaxed text-slate-700">{assignment.promptText}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出コード</div>
                <div className="mt-2 text-lg font-black text-slate-950">{assignment.submissionCode}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">状態</div>
                <div className="mt-2 text-sm font-black text-slate-950">{WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]}</div>
              </div>
            </div>
          </div>
        </details>
      </article>
    );
  }

  return (
    <article className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      <div className="grid gap-5 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="space-y-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-950">{assignment.promptTitle}</div>
              <div className="mt-1 text-xs text-slate-400">{assignment.wordCountMin} - {assignment.wordCountMax} words</div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${phase.tone}`}>
              {phase.label}
            </span>
          </div>

          <div className="rounded-3xl border border-white bg-white px-5 py-5">
            <div className="flex items-center justify-between gap-3">
              <div className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em] text-medace-700">
                {decision.icon}
                {decision.label}
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${phase.tone}`}>
                {phase.label}
              </span>
            </div>
            <div className="mt-3 text-lg font-black text-slate-950">{decision.title}</div>
            <div className="mt-2 text-sm leading-relaxed text-slate-600">{decision.body}</div>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            {WORKFLOW_STEPS.map((step, index) => {
              const active = phase.activeStep >= index + 1;
              return (
                <div
                  key={step}
                  className={`rounded-2xl border px-3 py-3 ${
                    active
                      ? 'border-medace-200 bg-white text-slate-950'
                      : 'border-slate-200 bg-slate-100 text-slate-400'
                  }`}
                >
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em]">Step {index + 1}</div>
                  <div className="mt-2 text-sm font-bold">{step}</div>
                </div>
              );
            })}
          </div>

          <div className="rounded-3xl border border-white bg-white px-5 py-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">課題文</div>
            <div className="mt-3 text-sm leading-relaxed text-slate-700">{assignment.promptText}</div>
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
              {phase.description}
            </div>
          </div>
        </div>

        <div className="flex h-full flex-col gap-4">
          <div className="rounded-3xl border border-white bg-white px-5 py-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">課題情報</div>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出コード</div>
                <div className="mt-2 text-lg font-black text-slate-950">{assignment.submissionCode}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">Attempt</div>
                <div className="mt-2 text-lg font-black text-slate-950">{assignment.attemptCount} / {assignment.maxAttempts}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">最終更新</div>
                <div className="mt-2 text-sm font-black text-slate-950">{formatWritingDateTime(assignment.updatedAt)}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-white bg-white px-5 py-5">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">次にやること</div>
            <div className="mt-3 text-sm leading-relaxed text-slate-700">{phase.description}</div>
          </div>

          <div className="mt-auto flex flex-col gap-3">
            {showFeedbackFirst ? feedbackButton : submitButton}
            {showFeedbackFirst ? submitButton : feedbackButton}

            {!canSubmit && !canOpenFeedback && (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-500">
                {WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]} のため、次の操作を待っています。
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
};

const WritingStudentAssignmentList: React.FC<WritingStudentAssignmentListProps> = ({
  assignments,
  isMobileViewport,
  openingFeedbackId,
  onOpenSubmit,
  onOpenFeedback,
}) => {
  if (assignments.length === 0) {
    return (
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6">
        <div className="flex items-start gap-3">
          <ClipboardList className="mt-0.5 h-5 w-5 text-slate-400" />
          <div>
            <div className="text-sm font-black text-slate-900">まだ自由英作文課題はありません</div>
            <div className="mt-2 text-sm leading-relaxed text-slate-500">
              講師が課題を配布すると、提出コード、提出ボタン、返却結果がここに表示されます。
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {assignments.map((assignment) => (
        <WritingStudentAssignmentCard
          key={assignment.id}
          assignment={assignment}
          isMobileViewport={isMobileViewport}
          openingFeedbackId={openingFeedbackId}
          onOpenSubmit={onOpenSubmit}
          onOpenFeedback={onOpenFeedback}
        />
      ))}
    </div>
  );
};

export default WritingStudentAssignmentList;
