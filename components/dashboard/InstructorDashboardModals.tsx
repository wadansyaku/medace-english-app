import React from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';

import {
  INTERVENTION_KIND_LABELS,
  InterventionKind,
  StudentRiskLevel,
  SUBSCRIPTION_PLAN_LABELS,
  WEAKNESS_DIMENSION_LABELS,
  type StudentSummary,
} from '../../types';
import type { useInstructorDashboardController } from '../../hooks/useInstructorDashboardController';

type InstructorDashboardController = ReturnType<typeof useInstructorDashboardController>;

interface InstructorDashboardModalsProps {
  userDisplayName: string;
  controller: InstructorDashboardController;
}

const getRiskStyle = (risk: StudentRiskLevel) => {
  switch (risk) {
    case StudentRiskLevel.DANGER:
      return 'bg-red-50 text-red-700 border-red-200';
    case StudentRiskLevel.WARNING:
      return 'bg-orange-50 text-orange-700 border-orange-200';
    default:
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
};

const getRiskLabel = (risk: StudentRiskLevel) => {
  switch (risk) {
    case StudentRiskLevel.DANGER:
      return '要フォロー';
    case StudentRiskLevel.WARNING:
      return '見守り';
    default:
      return '安定';
  }
};

const getPlanStyle = (plan?: StudentSummary['subscriptionPlan']) => {
  if (!plan) return 'bg-medace-50 text-medace-700 border-medace-100';
  if (plan === 'TOB_PAID') return 'bg-medace-900 text-white border-medace-900';
  if (plan === 'TOB_FREE') return 'bg-medace-100 text-medace-800 border-medace-200';
  if (plan === 'TOC_PAID') return 'bg-medace-50 text-medace-700 border-medace-200';
  return 'bg-white text-medace-700 border-medace-200';
};

const getWeaknessTone = (score = 0): string => (
  score >= 55
    ? 'border-red-200 bg-red-50 text-red-700'
    : score >= 30
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
);

const getCohortStyle = (cohortName?: string): string => (
  cohortName
    ? 'bg-sky-50 text-sky-700 border-sky-200'
    : 'bg-white text-slate-500 border-dashed border-slate-200'
);

const getCohortLabel = (cohortName?: string): string => cohortName || '未設定';

const formatDaysSinceActive = (timestamp: number): string => {
  if (!timestamp) return '未学習';
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (days === 0) return '今日';
  if (days === 1) return '1日ぶり';
  return `${days}日ぶり`;
};

const InstructorDashboardModals: React.FC<InstructorDashboardModalsProps> = ({
  userDisplayName,
  controller,
}) => {
  if (!controller.selectedStudent) {
    return null;
  }

  return (
    <div data-testid="notification-composer" className="fixed inset-0 z-50 flex items-center justify-center bg-medace-900/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl md:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Follow-up Message</p>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{controller.selectedStudent.name}さんへの通知</h3>
            <p className="mt-2 text-sm text-slate-500">
              生徒には <span className="font-bold text-slate-700">{userDisplayName}</span> 名義で自然な日本語の通知が表示されます。
            </p>
          </div>
          <button type="button" onClick={controller.closeComposer} className="text-sm font-bold text-slate-400 hover:text-slate-600">
            閉じる
          </button>
        </div>

        <div className="mt-6 grid gap-4 rounded-3xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
            <span className={`rounded-full border px-2.5 py-1 ${getRiskStyle(controller.selectedStudent.riskLevel)}`}>
              {getRiskLabel(controller.selectedStudent.riskLevel)}
            </span>
            <span className={`rounded-full border px-2.5 py-1 ${getCohortStyle(controller.selectedStudent.cohortName)}`}>
              クラス: {getCohortLabel(controller.selectedStudent.cohortName)}
            </span>
            {controller.selectedStudent.subscriptionPlan && (
              <span className={`rounded-full border px-2.5 py-1 ${getPlanStyle(controller.selectedStudent.subscriptionPlan)}`}>
                {SUBSCRIPTION_PLAN_LABELS[controller.selectedStudent.subscriptionPlan]}
              </span>
            )}
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-500">
              {formatDaysSinceActive(controller.selectedStudent.lastActive)}
            </span>
          </div>
          {controller.selectedStudent.riskReasons && controller.selectedStudent.riskReasons.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {controller.selectedStudent.riskReasons.map((reason) => (
                <span key={reason} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                  {reason}
                </span>
              ))}
            </div>
          )}
          {controller.selectedStudent.topWeaknesses && controller.selectedStudent.topWeaknesses.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {controller.selectedStudent.topWeaknesses.slice(0, 2).map((weakness) => (
                <span key={weakness.dimension} className={`rounded-full border px-3 py-1 text-xs font-bold ${getWeaknessTone(weakness.score)}`}>
                  {WEAKNESS_DIMENSION_LABELS[weakness.dimension]}
                </span>
              ))}
            </div>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-slate-500">介入種別</label>
              <select
                data-testid="notification-intervention-kind"
                value={controller.interventionKind}
                onChange={(event) => controller.setInterventionKind(event.target.value as InterventionKind)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
              >
                {Object.values(InterventionKind).map((kind) => (
                  <option key={kind} value={kind}>
                    {INTERVENTION_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-xs font-bold uppercase text-slate-500">下書きへの補足</label>
              <input
                type="text"
                value={controller.customInstruction}
                onChange={(event) => controller.setCustomInstruction(event.target.value)}
                className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                placeholder="例: 次の模試までに復習を再開してほしい"
              />
            </div>
          </div>
          <button
            type="button"
            onClick={controller.handleGenerateDraft}
            disabled={controller.drafting}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-medace-200 bg-white px-4 py-3 text-sm font-bold text-medace-700 transition-colors hover:bg-medace-50 disabled:opacity-60"
          >
            {controller.drafting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            下書きを作る
          </button>
        </div>

        <div className="mt-5">
          <label className="mb-2 block text-xs font-bold uppercase text-slate-500">通知文</label>
          <textarea
            data-testid="notification-message-draft"
            value={controller.messageDraft}
            onChange={(event) => controller.setMessageDraft(event.target.value)}
            rows={8}
            className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm leading-relaxed text-slate-700 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
          />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={controller.closeComposer}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="notification-send-submit"
            onClick={controller.handleSendNotification}
            disabled={controller.sending || !controller.messageDraft.trim()}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:opacity-60"
          >
            {controller.sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            通知を保存する
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstructorDashboardModals;
