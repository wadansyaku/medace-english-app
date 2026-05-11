import React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

import { type UserProfile } from '../types';
import { useWritingOpsController } from '../hooks/useWritingOpsController';
import WorkspaceStageStrip from './workspace/WorkspaceStageStrip';
import WritingOpsCreateSection from './writing/ops/WritingOpsCreateSection';
import WritingOpsPrintSection from './writing/ops/WritingOpsPrintSection';
import WritingOpsReviewSection from './writing/ops/WritingOpsReviewSection';
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
  const stageSteps = [
    {
      id: 'CREATE',
      index: 1,
      label: '問題作成',
      value: `${controller.templates.length}種`,
      hint: `${controller.students.length}名に配布候補`,
      active: controller.tab === 'CREATE',
    },
    {
      id: 'PRINT',
      index: 2,
      label: '印刷 / 配布',
      value: `${controller.assignments.length}件`,
      hint: `下書き ${opsCounts.draftCount} / 配布済み ${opsCounts.issuedCount}`,
      active: controller.tab === 'PRINT',
    },
    {
      id: 'QUEUE',
      index: 3,
      label: '添削キュー',
      value: `${opsCounts.reviewReadyCount}件`,
      hint: '返却前の講師確認待ち',
      active: controller.tab === 'QUEUE',
    },
    {
      id: 'HISTORY',
      index: 4,
      label: '返却履歴',
      value: `${controller.history.length}件`,
      hint: `返却済み ${opsCounts.returnedCount} / 完了 ${opsCounts.completedCount}`,
      active: controller.tab === 'HISTORY',
    },
  ];
  const currentStageCount = getCurrentStageCount(
    controller.tab,
    controller.templates.length,
    controller.assignments.length,
    controller.queue.length,
    controller.history.length,
  );

  return (
    <section data-testid="writing-ops-panel" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold text-slate-400">英作文運用</p>
          <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">自由英作文の紙提出運用</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
            問題生成、印刷、紙答案の提出、AI比較、講師確認、返却までを段階ごとに処理します。
          </p>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-bold text-slate-500">
          {user.organizationName || '組織ワークスペース'}
        </div>
      </div>

      {controller.notice && (
        <div className={`mt-5 rounded-2xl border px-4 py-3 text-sm font-bold ${
          controller.notice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {controller.notice.message}
        </div>
      )}

      <div className="mt-6 rounded-[28px] border border-medace-100 bg-medace-50 px-5 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">Current Priority</p>
            <h4 className="mt-1 text-xl font-black tracking-tight text-medace-950">{triage.label}</h4>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-medace-900/80">{triage.message}</p>
          </div>
          <button
            type="button"
            onClick={() => controller.setTab(triage.tab)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
          >
            {triage.ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-6">
        <WorkspaceStageStrip steps={stageSteps} />
      </div>

      <div className="mt-6 rounded-[28px] border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{viewCopy.eyebrow}</p>
            <h4 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{viewCopy.title}</h4>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{viewCopy.body}</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3 xl:min-w-[560px]">
            <div className="rounded-2xl border border-white bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">現在の段階</div>
              <div className="mt-2 text-lg font-black text-slate-950">{viewCopy.label}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">件数</div>
              <div className="mt-2 text-lg font-black text-slate-950">{currentStageCount}</div>
            </div>
            <div className="rounded-2xl border border-white bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">次にやること</div>
              <div className="mt-2 text-sm font-bold leading-relaxed text-slate-700">{viewCopy.nextAction}</div>
            </div>
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-white bg-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">下書き</div>
            <div className="mt-2 text-lg font-black text-slate-950">{opsCounts.draftCount}</div>
          </div>
          <div className="rounded-2xl border border-white bg-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">提出待ち</div>
            <div className="mt-2 text-lg font-black text-slate-950">{opsCounts.issuedCount + opsCounts.revisionRequestedCount}</div>
          </div>
          <div className="rounded-2xl border border-white bg-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">確認待ち</div>
            <div className="mt-2 text-lg font-black text-slate-950">{opsCounts.reviewReadyCount}</div>
          </div>
          <div className="rounded-2xl border border-white bg-white px-4 py-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">返却後</div>
            <div className="mt-2 text-lg font-black text-slate-950">{opsCounts.returnedCount + opsCounts.completedCount}</div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {(Object.keys(TAB_COPY) as Array<keyof typeof TAB_COPY>).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => controller.setTab(key)}
              className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ${
                controller.tab === key
                  ? 'bg-medace-700 text-white'
                  : 'border border-slate-200 bg-white text-slate-600 hover:border-medace-200 hover:text-medace-700'
              }`}
            >
              {TAB_COPY[key].icon}
              {TAB_COPY[key].label}
            </button>
          ))}
        </div>
      </div>

      {controller.loading ? (
        <div className="mt-8 flex min-h-[24vh] items-center justify-center text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin text-medace-500" />
        </div>
      ) : (
        <div className="mt-6">
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
      )}

      {controller.scannerTarget && (
        <WritingOpsScannerModal
          scannerTarget={controller.scannerTarget}
          scannerFiles={controller.scannerFiles}
          scannerManualTranscript={controller.scannerManualTranscript}
          submittingScan={controller.submittingScan}
          onClose={() => {
            if (controller.submittingScan) return;
            controller.resetScanner();
          }}
          onFilesChange={controller.setScannerFiles}
          onManualTranscriptChange={controller.setScannerManualTranscript}
          onSubmit={controller.handleScannerSubmit}
        />
      )}
    </section>
  );
};

export default WritingOpsPanel;
