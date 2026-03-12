import React from 'react';
import { Eye, Loader2, Send } from 'lucide-react';

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

  if (isMobileViewport) {
    return (
      <article className="rounded-[28px] border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-base font-bold text-slate-950">{assignment.promptTitle}</div>
            <div className="mt-1 text-xs text-slate-400">{assignment.wordCountMin} - {assignment.wordCountMax} words</div>
          </div>
          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${phase.tone}`}>
            {phase.label}
          </span>
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
          {canSubmitWritingAssignment(assignment) && (
            <button
              type="button"
              data-testid={`writing-open-submit-${assignment.id}`}
              onClick={() => onOpenSubmit(assignment)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
            >
              <Send className="h-4 w-4" />
              {assignment.status === 'REVISION_REQUESTED' ? '書き直して再提出する' : 'スマホで提出する'}
            </button>
          )}

          {canOpenWritingFeedback(assignment) && (
            <button
              type="button"
              data-testid={`writing-open-feedback-${assignment.id}`}
              onClick={() => onOpenFeedback(assignment)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
            >
              {openingFeedbackId === assignment.latestSubmissionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
              添削結果を見る
            </button>
          )}

          {!canSubmitWritingAssignment(assignment) && !canOpenWritingFeedback(assignment) && (
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
            {canSubmitWritingAssignment(assignment) && (
              <button
                type="button"
                data-testid={`writing-open-submit-${assignment.id}`}
                onClick={() => onOpenSubmit(assignment)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
              >
                <Send className="h-4 w-4" />
                {assignment.status === 'REVISION_REQUESTED' ? '書き直して再提出する' : 'スマホで提出する'}
              </button>
            )}

            {canOpenWritingFeedback(assignment) && (
              <button
                type="button"
                data-testid={`writing-open-feedback-${assignment.id}`}
                onClick={() => onOpenFeedback(assignment)}
                className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
              >
                {openingFeedbackId === assignment.latestSubmissionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                添削結果を見る
              </button>
            )}

            {!canSubmitWritingAssignment(assignment) && !canOpenWritingFeedback(assignment) && (
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
      <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
        まだ自由英作文課題は配布されていません。
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
