import React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

import { type UserProfile } from '../types';
import { useWritingOpsController } from '../hooks/useWritingOpsController';
import WorkspaceStageStrip from './workspace/WorkspaceStageStrip';
import WritingOpsCreateSection from './writing/ops/WritingOpsCreateSection';
import WritingOpsPrintSection from './writing/ops/WritingOpsPrintSection';
import WritingOpsReviewSection from './writing/ops/WritingOpsReviewSection';
import WritingTeacherDraftModal from './writing/ops/WritingTeacherDraftModal';
import WritingOpsScannerModal from './writing/ops/WritingOpsScannerModal';
import { TAB_COPY } from './writing/ops/presentation';
import { getWritingOpsCounts, getWritingOpsTriage } from '../utils/writingOps';

interface WritingOpsPanelProps {
  user: UserProfile;
}

const getCurrentStageCount = (
  tab: keyof typeof TAB_COPY,
  templateCount: number,
  assignmentCount: number,
  queueCount: number,
  historyCount: number,
): string => {
  if (tab === 'CREATE') return `${templateCount}テンプレート`;
  if (tab === 'PRINT') return `${assignmentCount}課題`;
  if (tab === 'QUEUE') return `${queueCount}提出`;
  return `${historyCount}履歴`;
};

const WritingOpsPanel: React.FC<WritingOpsPanelProps> = ({ user }) => {
  const controller = useWritingOpsController();
  const viewCopy = TAB_COPY[controller.tab];
  const opsCounts = getWritingOpsCounts(controller.assignments, controller.queue);
  const triage = getWritingOpsTriage(opsCounts);
  const unknownCount = controller.loading ? '読込中' : '未取得';
  const stageSteps = [
    {
      id: 'CREATE',
      index: 1,
      label: '問題作成',
      value: controller.hasData ? `${controller.templates.length}種` : unknownCount,
      hint: controller.hasData ? `${controller.students.length}名に配布候補` : '取得後に配布候補を表示',
      active: controller.tab === 'CREATE',
    },
    {
      id: 'PRINT',
      index: 2,
      label: '印刷 / 配布',
      value: controller.hasData ? `${controller.assignments.length}件` : unknownCount,
      hint: controller.hasData ? `下書き ${opsCounts.draftCount} / 配布済み ${opsCounts.issuedCount}` : '取得後に課題の状態を表示',
      active: controller.tab === 'PRINT',
    },
    {
      id: 'QUEUE',
      index: 3,
      label: '添削キュー',
      value: controller.hasData ? `${opsCounts.reviewReadyCount}件` : unknownCount,
      hint: '返却前の講師確認待ち',
      active: controller.tab === 'QUEUE',
    },
    {
      id: 'HISTORY',
      index: 4,
      label: '返却履歴',
      value: controller.hasData ? `${controller.history.length}件` : unknownCount,
      hint: controller.hasData ? `返却済み ${opsCounts.returnedCount} / 完了 ${opsCounts.completedCount}` : '取得後に返却の状態を表示',
      active: controller.tab === 'HISTORY',
    },
  ];
  const currentStageCount = controller.hasData ? getCurrentStageCount(
    controller.tab,
    controller.templates.length,
    controller.assignments.length,
    controller.queue.length,
    controller.history.length,
  ) : unknownCount;

  return (
    <section data-testid="writing-ops-panel" className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-400">英作文運用</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">自由英作文の紙提出運用</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            作成 → 印刷・配布 → 添削 → 返却の順に進めます。
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">{user.organizationName || '組織ワークスペース'}</span>
          <button type="button" disabled={controller.loading || Boolean(controller.busyAction) || controller.submittingScan} onClick={() => void controller.refresh()} className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
            {controller.loading ? '更新中' : '英作文の状況を更新'}
          </button>
        </div>
      </div>

      {controller.notice && (
        <div role={controller.notice.tone === 'error' ? 'alert' : 'status'} className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
          controller.notice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {controller.notice.message}
        </div>
      )}

      {controller.loadError && (
        <div role="alert" className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm leading-6 text-red-800">
          <p className="font-bold">{controller.loadError}</p>
          <p className="mt-1">{controller.hasData ? '前回取得した内容を表示しています。最新の状態を再取得してください。' : '件数と対象生徒をまだ確認できていません。通信を確認して再取得してください。'}</p>
          <button type="button" disabled={controller.loading} onClick={() => void controller.refresh()} className="mt-3 min-h-11 rounded-xl border border-red-300 bg-white px-4 py-2 font-bold disabled:opacity-50">再取得する</button>
        </div>
      )}

      {controller.hasData && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-medace-100 bg-medace-50 px-4 py-3">
          <p className="text-sm font-bold text-medace-950">優先: {triage.label}</p>
          <button
            type="button"
            disabled={Boolean(controller.busyAction) || controller.submittingScan}
            onClick={() => controller.setTab(triage.tab)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-steady-action px-3 py-2 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50"
          >
            {triage.ctaLabel}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav aria-label="英作文の作業" className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {(Object.keys(TAB_COPY) as Array<keyof typeof TAB_COPY>).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={controller.tab === key}
            aria-controls="writing-ops-workspace"
            disabled={Boolean(controller.busyAction) || controller.submittingScan}
            onClick={() => controller.setTab(key)}
            className={`inline-flex items-center justify-center gap-2 rounded-2xl px-3 py-3 text-sm font-bold ${
              controller.tab === key
                ? 'bg-medace-600 text-slate-950'
                : 'border border-slate-200 bg-white text-slate-600 hover:border-medace-200 hover:text-medace-700'
            }`}
          >
            {TAB_COPY[key].icon}
            {TAB_COPY[key].label}
          </button>
        ))}
      </nav>

      <div className="mt-4 rounded-2xl bg-slate-50 px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h4 className="text-sm font-black text-slate-950">現在: {viewCopy.label}</h4>
          <span className="text-xs font-bold text-slate-500">{currentStageCount}</span>
        </div>
        <p className="mt-1 text-sm text-slate-700">次に: {viewCopy.nextAction}</p>
      </div>

      <div id="writing-ops-workspace">
        {controller.loading ? (
          <div role="status" className="mt-8 flex min-h-[24vh] items-center justify-center gap-3 text-sm text-slate-500">
            <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin text-medace-500" />
            生徒・課題・提出を読み込んでいます。
          </div>
        ) : controller.hasData ? (
          <div className="mt-4">
            {controller.tab === 'CREATE' && (
              <WritingOpsCreateSection
                templates={controller.templates}
                students={controller.students}
                selectedStudentUid={controller.selectedStudentUid}
                selectedTemplateId={controller.selectedTemplateId}
                selectedStudent={controller.selectedStudent}
                selectedTemplate={controller.selectedTemplate}
                topicHint={controller.topicHint}
                notes={controller.notes}
                generating={controller.busyAction === 'generate'}
                onSelectStudent={controller.setSelectedStudentUid}
                onSelectTemplate={controller.setSelectedTemplateId}
                onTopicHintChange={controller.setTopicHint}
                onNotesChange={controller.setNotes}
                onGenerate={controller.handleGenerate}
              />
            )}

            {controller.tab === 'PRINT' && (
              <WritingOpsPrintSection
                assignments={controller.assignments}
                selectedAssignment={controller.selectedAssignment}
                selectedAssignmentId={controller.selectedAssignmentId}
                issuing={controller.busyAction === 'issue'}
                onSelectAssignment={controller.setSelectedAssignmentId}
                onIssue={controller.handleIssue}
                onOpenScanner={controller.setScannerTarget}
              />
            )}

            {(controller.tab === 'QUEUE' || controller.tab === 'HISTORY') && (
              <WritingOpsReviewSection
                tab={controller.tab}
                reviewList={controller.reviewList}
                selectedSubmissionId={controller.selectedSubmissionId}
                detail={controller.detail}
                detailLoading={controller.detailLoading}
                detailError={controller.detailError}
                onRetryDetail={controller.retryDetail}
                selectedEvaluationId={controller.selectedEvaluationId}
                selectedEvaluation={controller.selectedEvaluation}
                reviewPublicComment={controller.reviewPublicComment}
                reviewPrivateMemo={controller.reviewPrivateMemo}
                reviewing={controller.busyAction === 'review'}
                onSelectSubmission={controller.setSelectedSubmissionId}
                onSelectEvaluation={controller.setSelectedEvaluationId}
                onReviewPublicCommentChange={controller.setReviewPublicComment}
                onReviewPrivateMemoChange={controller.setReviewPrivateMemo}
                onApprove={controller.handleApprove}
                onRequestRevision={controller.handleRequestRevision}
                onComplete={controller.handleComplete}
              />
            )}
          </div>
        ) : null}
      </div>

      <details data-testid="writing-ops-guidance" className="mt-5 rounded-2xl border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-slate-700">全体の件数と運用の流れ</summary>
        <div className="border-t border-slate-200 p-4">
          <h4 className="text-base font-bold text-slate-950">{viewCopy.title}</h4>
          <p className="mt-2 text-sm text-slate-600">{viewCopy.body}</p>
          {controller.hasData && <p className="mt-3 text-sm text-medace-900">{triage.message}</p>}
          <div className="mt-4"><WorkspaceStageStrip steps={stageSteps} /></div>
          <dl className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['下書き', opsCounts.draftCount],
              ['提出待ち', opsCounts.issuedCount + opsCounts.revisionRequestedCount],
              ['確認待ち', opsCounts.reviewReadyCount],
              ['返却後', opsCounts.returnedCount + opsCounts.completedCount],
            ].map(([label, count]) => (
              <div key={label} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                <dt className="text-xs font-bold text-slate-500">{label}</dt>
                <dd className="mt-1 text-lg font-black text-slate-950">{controller.hasData ? count : unknownCount}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>

      {controller.scannerTarget && (
        <WritingTeacherDraftModal assignment={controller.scannerTarget} onClose={controller.resetScanner} legacyScanner={
        <WritingOpsScannerModal
          scannerTarget={controller.scannerTarget}
          scannerFiles={controller.scannerFiles}
          scannerManualTranscript={controller.scannerManualTranscript}
          submittingScan={controller.submittingScan}
          error={controller.scannerError}
          onClose={() => {
            if (controller.submittingScan) return;
            controller.resetScanner();
          }}
          onFilesChange={controller.setScannerFiles}
          onManualTranscriptChange={controller.setScannerManualTranscript}
          onSubmit={controller.handleScannerSubmit}
        />} />
      )}
    </section>
  );
};

export default WritingOpsPanel;
