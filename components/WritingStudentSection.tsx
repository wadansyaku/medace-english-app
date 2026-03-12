import React from 'react';
import { Loader2 } from 'lucide-react';

import useIsMobileViewport from '../hooks/useIsMobileViewport';
import { type UserProfile } from '../types';
import { useWritingStudentController } from '../hooks/useWritingStudentController';
import WritingStudentAssignmentList from './writing/WritingStudentAssignmentList';
import WritingStudentFeedbackSheet from './writing/WritingStudentFeedbackSheet';
import WritingStudentSubmitSheet from './writing/WritingStudentSubmitSheet';

interface WritingStudentSectionProps {
  user: UserProfile;
}

const WritingStudentSection: React.FC<WritingStudentSectionProps> = ({ user }) => {
  const isMobileViewport = useIsMobileViewport();
  const controller = useWritingStudentController(user);

  return (
    <section data-testid="writing-student-section" className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Writing Track</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">自由英作文</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            紙で書いた答案をスマホで提出し、講師確認後の添削結果をアプリ内で確認できます。
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
          {user.organizationName || 'Business Workspace'}
        </div>
      </div>

      {isMobileViewport && (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">対応中</div>
            <div className="mt-2 text-lg font-black text-slate-950">{controller.actionableAssignmentCount}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">課題数</div>
            <div className="mt-2 text-lg font-black text-slate-950">{controller.assignments.length}</div>
          </div>
        </div>
      )}

      {controller.notice && (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
          controller.notice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {controller.notice.message}
        </div>
      )}

      {controller.loading ? (
        <div className="mt-8 flex min-h-[16vh] items-center justify-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-medace-500" />
        </div>
      ) : (
        <div className="mt-6">
          <WritingStudentAssignmentList
            assignments={controller.assignments}
            isMobileViewport={isMobileViewport}
            openingFeedbackId={controller.openingFeedbackId}
            onOpenSubmit={controller.openSubmitDialog}
            onOpenFeedback={controller.openFeedback}
          />
        </div>
      )}

      {controller.submitTarget && (
        <WritingStudentSubmitSheet
          submitTarget={controller.submitTarget}
          isMobileViewport={isMobileViewport}
          files={controller.files}
          manualTranscript={controller.manualTranscript}
          mobileSubmitStep={controller.mobileSubmitStep}
          submitting={controller.submitting}
          onClose={controller.resetSubmitDialog}
          onChangeFiles={controller.setFiles}
          onChangeManualTranscript={controller.setManualTranscript}
          onChangeStep={controller.setMobileSubmitStep}
          onSubmit={controller.handleSubmit}
        />
      )}

      {controller.feedbackDetail && (
        <WritingStudentFeedbackSheet
          feedbackDetail={controller.feedbackDetail}
          isMobileViewport={isMobileViewport}
          selectedEvaluationId={controller.selectedEvaluationId}
          selectedEvaluation={controller.selectedEvaluation}
          feedbackCommentExpanded={controller.feedbackCommentExpanded}
          onSelectEvaluation={controller.setSelectedEvaluationId}
          onToggleFeedbackCommentExpanded={controller.toggleFeedbackCommentExpanded}
          onClose={controller.closeFeedback}
          onPrintFeedback={controller.handlePrintFeedback}
        />
      )}
    </section>
  );
};

export default WritingStudentSection;
