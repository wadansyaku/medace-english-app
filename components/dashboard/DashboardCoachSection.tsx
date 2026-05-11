import React from 'react';
import { ArrowRight, MessageSquareText } from 'lucide-react';
import {
  INTERVENTION_KIND_LABELS,
  INTERVENTION_OUTCOME_LABELS,
  type InstructorNotification,
} from '../../types';

export interface DashboardCoachSectionProps {
  latestNotification: InstructorNotification;
  notifications: InstructorNotification[];
  isCompact?: boolean;
  primaryActionLabel?: string | null;
  onPrimaryAction?: (() => void) | null;
}

const DashboardCoachSection: React.FC<DashboardCoachSectionProps> = ({
  latestNotification,
  notifications,
  isCompact = false,
  primaryActionLabel,
  onPrimaryAction,
}) => {
  const history = notifications.slice(1, 4);

  return (
    <section className={`rounded-[32px] border border-slate-200 bg-white shadow-sm ${isCompact ? 'p-5' : 'p-6 md:p-7'}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-medace-100 bg-medace-50 p-3 text-medace-700">
            <MessageSquareText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400">講師メッセージ</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">講師からのメッセージ</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              課題や復習の進め方について、講師から届いた最新のフォローをここで確認できます。
            </p>
          </div>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
          {notifications.length}件
        </div>
      </div>

      <div className={`mt-5 grid gap-4 ${history.length > 0 ? 'lg:grid-cols-[1.08fr_0.92fr]' : ''}`}>
        <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-900">{latestNotification.instructorName}</div>
            <div className="text-[11px] font-bold text-slate-400">
              {latestNotification.usedAi ? 'AI下書き' : '手動'}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-bold text-slate-600">
              {INTERVENTION_KIND_LABELS[latestNotification.interventionKind]}
            </span>
            {latestNotification.interventionOutcome && (
              <span className="rounded-full border border-medace-100 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
                {INTERVENTION_OUTCOME_LABELS[latestNotification.interventionOutcome]}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-relaxed text-slate-700">{latestNotification.message}</p>
          {primaryActionLabel && onPrimaryAction && (
            <button
              type="button"
              data-testid="coach-follow-up-cta"
              onClick={onPrimaryAction}
              className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800"
            >
              {primaryActionLabel}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
          <div className="mt-4 text-xs text-slate-400">
            {new Date(latestNotification.createdAt).toLocaleString('ja-JP')}
          </div>
        </div>

        {history.length > 0 && (
          <div className="grid gap-3">
            {history.map((notification) => (
              <div key={notification.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-bold text-slate-900">{notification.instructorName}</div>
                  <div className="text-[11px] font-bold text-slate-400">
                    {notification.usedAi ? 'AI下書き' : '手動'}
                  </div>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{notification.message}</p>
              </div>
            ))}
            {notifications.length > 4 && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                さらに {notifications.length - 4} 件のメッセージがあります。
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
};

export default DashboardCoachSection;
