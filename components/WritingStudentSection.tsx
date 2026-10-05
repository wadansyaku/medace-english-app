import React from 'react';
import { CheckCircle2, Clock3, Loader2, MessageSquareText, RefreshCcw, Send } from 'lucide-react';

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
  const refreshedAtLabel = controller.lastRefreshedAt
    ? new Date(controller.lastRefreshedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
    : '未取得';
  const hasAssignmentsData = controller.lastRefreshedAt !== null;
  const unknownCount = controller.loading || controller.refreshing ? '読込中' : '未取得';
  const primaryStatus = !hasAssignmentsData
    ? {
      icon: controller.loading || controller.refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />,
      label: controller.loading || controller.refreshing ? '課題を確認中です' : '課題は未取得です',
      body: '課題と返却の件数をまだ確認できていません。',
      className: 'border-slate-200 bg-slate-50 text-slate-700',
    }
    : controller.submitReadyCount > 0
    ? {
      icon: <Send className="h-4 w-4" />,
      label: '下書きを保存できます',
      body: `${controller.submitReadyCount}件の課題で本文・画像・PDFを未評価の下書きとして保存できます。`,
      className: 'border-medace-200 bg-medace-50 text-medace-800',
    }
    : controller.feedbackReadyCount > 0
      ? {
        icon: <MessageSquareText className="h-4 w-4" />,
        label: '返却があります',
        body: `${controller.feedbackReadyCount}件の添削結果を確認できます。コメントから次の修正点を見ます。`,
        className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      }
      : controller.waitingAssignmentCount > 0
        ? {
          icon: <Clock3 className="h-4 w-4" />,
          label: '確認待ちです',
          body: `${controller.waitingAssignmentCount}件が処理中です。講師からの返却を待っています。`,
          className: 'border-sky-200 bg-sky-50 text-sky-800',
        }
        : {
          icon: <CheckCircle2 className="h-4 w-4" />,
          label: '対応待ちはありません',
          body: '講師が新しい課題を配布すると、ここに次の提出が表示されます。',
          className: 'border-slate-200 bg-slate-50 text-slate-700',
        };

  return (
    <section data-testid="writing-student-section" className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-400">英作文課題</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">自由英作文</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            答案は未評価の下書きとして保存できます。既存の返却内容は引き続き確認できます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="writing-refresh-button"
            onClick={() => void controller.refresh({ silent: true })}
            disabled={controller.loading || controller.refreshing}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 transition-colors hover:border-medace-200 hover:text-medace-700 disabled:opacity-60"
          >
            {controller.refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
            更新
          </button>
          <div data-testid="writing-last-refreshed" className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
            {user.organizationName || '組織ワークスペース'} / {refreshedAtLabel}
          </div>
        </div>
      </div>

      {controller.refreshing && !controller.loading && (
        <div role="status" aria-live="polite" data-testid="writing-refresh-status" className="mt-4 inline-flex items-center gap-2 rounded-full border border-medace-100 bg-medace-50 px-4 py-2 text-xs font-bold text-medace-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          最新の課題と返却状況を確認中
        </div>
      )}

      <div className="mt-5 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_repeat(3,minmax(0,0.66fr))]">
        <div className={`rounded-2xl border px-4 py-4 ${primaryStatus.className}`}>
          <div className="flex items-center gap-2 text-sm font-black">
            {primaryStatus.icon}
            {primaryStatus.label}
          </div>
          <div className="mt-2 text-sm leading-relaxed opacity-85">{primaryStatus.body}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">提出</div>
          <div className="mt-2 text-lg font-black text-slate-950">{hasAssignmentsData ? controller.submitReadyCount : unknownCount}</div>
          <div className="mt-1 text-xs text-slate-500">下書き入力に進めます</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">返却</div>
          <div className="mt-2 text-lg font-black text-slate-950">{hasAssignmentsData ? controller.feedbackReadyCount : unknownCount}</div>
          <div className="mt-1 text-xs text-slate-500">確認できる添削</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">合計</div>
          <div className="mt-2 text-lg font-black text-slate-950">{hasAssignmentsData ? controller.assignments.length : unknownCount}</div>
          <div className="mt-1 text-xs text-slate-500">{isMobileViewport ? '全課題' : '現在表示中'}</div>
        </div>
      </div>

      {isMobileViewport && controller.assignments.length > 0 && (
        <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500">
          スマホでは、操作が必要な課題から順に表示しています。
        </div>
      )}

      {controller.loadError && (
        <div role="alert" data-testid="writing-load-error" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">{controller.loadError}</p>
          <p className="mt-1">{hasAssignmentsData ? '最新の状態を確認できません。前回取得した課題と件数を表示しています。' : '課題と返却の有無は、まだ確認できていません。'}</p>
          <button type="button" onClick={() => void controller.refresh({ silent: true })} disabled={controller.loading || controller.refreshing} className="mt-3 min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 font-bold disabled:opacity-50">課題をもう一度読み込む</button>
        </div>
      )}

      {controller.notice && (
        <div role={controller.notice.tone === 'error' ? 'alert' : 'status'} aria-live="polite" className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
          controller.notice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {controller.notice.message}
        </div>
      )}

      {controller.loading ? (
        <div role="status" aria-label="自由英作文課題を読み込み中" className="mt-8 flex min-h-[16vh] items-center justify-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-medace-500" />
        </div>
      ) : !hasAssignmentsData ? (
        <div role="status" data-testid="writing-assignments-unknown" className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          課題の有無は未確認です。上の更新ボタンから、もう一度読み込めます。
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
          submissionError={controller.submissionError}
          capabilities={controller.capabilities}
          savedInputDraft={controller.savedInputDraft}
          draftLoading={controller.draftLoading}
          draftLoaded={controller.draftLoaded}
          draftLoadError={controller.draftLoadError}
          draftSavedMessage={controller.draftSavedMessage}
          onRetryDraftLoad={controller.retryDraftLoad}
          onRemoveSavedAsset={controller.removeSavedAsset}
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
          selectedEvaluation={controller.selectedEvaluation}
          feedbackCommentExpanded={controller.feedbackCommentExpanded}
          onToggleFeedbackCommentExpanded={controller.toggleFeedbackCommentExpanded}
          onClose={controller.closeFeedback}
          onPrintFeedback={controller.handlePrintFeedback}
        />
      )}
    </section>
  );
};

export default WritingStudentSection;
