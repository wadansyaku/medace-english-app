import React from 'react';
import { ArrowRight, CalendarClock, Flag, Target } from 'lucide-react';
import {
  LEARNING_TRACK_LABELS,
  WEEKLY_MISSION_STATUS_LABELS,
  type PrimaryMissionSnapshot,
} from '../../types';

interface DashboardMissionSectionProps {
  mission: PrimaryMissionSnapshot;
  isCompact?: boolean;
  onPrimaryAction: () => void;
}

const toneByStatus: Record<string, string> = {
  ASSIGNED: 'border-sky-200 bg-sky-50 text-sky-700',
  IN_PROGRESS: 'border-medace-200 bg-medace-50 text-medace-700',
  OVERDUE: 'border-red-200 bg-red-50 text-red-700',
  COMPLETED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

const formatDueDate = (timestamp: number): string => new Date(timestamp).toLocaleDateString('ja-JP', {
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
});

const DashboardMissionSection: React.FC<DashboardMissionSectionProps> = ({
  mission,
  isCompact = false,
  onPrimaryAction,
}) => (
  <section
    data-testid="dashboard-mission-section"
    className={`rounded-[32px] border border-slate-200 bg-white shadow-sm ${isCompact ? 'p-5' : 'p-6 md:p-7'}`}
  >
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl border border-medace-100 bg-medace-50 p-3 text-medace-700">
          <Flag className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold text-slate-400">週次ミッション</p>
          <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">今週のミッション</h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            なぜこの課題か、あと何を進めれば完了か、次の1アクションを1枚で確認できます。
          </p>
        </div>
      </div>
      <div className={`rounded-full border px-3 py-1 text-xs font-bold ${toneByStatus[mission.status] || 'border-slate-200 bg-slate-50 text-slate-600'}`}>
        {WEEKLY_MISSION_STATUS_LABELS[mission.status]}
      </div>
    </div>

    <div className={`mt-5 grid gap-4 ${isCompact ? '' : 'lg:grid-cols-[1.18fr_0.82fr]'}`}>
      <div className="rounded-[28px] border border-slate-200 bg-slate-50 px-5 py-5">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
            {LEARNING_TRACK_LABELS[mission.track]}
          </span>
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-600">
            {formatDueDate(mission.dueAt)} まで
          </span>
          {mission.isSuggested && (
            <span className="rounded-full border border-dashed border-medace-200 bg-medace-50 px-3 py-1 text-medace-700">
              自動提案
            </span>
          )}
        </div>
        <h4 className="mt-3 text-lg font-black tracking-tight text-slate-950">{mission.title}</h4>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{mission.rationale}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {mission.sourceBookTitle && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              教材: {mission.sourceBookTitle}
            </span>
          )}
          {mission.writingPromptTitle && (
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
              作文: {mission.writingPromptTitle}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-400">進捗</p>
            <div className="mt-2 text-3xl font-black text-slate-950">{mission.completionRate}%</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
            <div className="text-[11px] font-bold text-slate-400">残り</div>
            <div className="mt-1 text-sm font-bold text-slate-700">{mission.blockers.length > 0 ? mission.blockers.join(' / ') : '完了'}</div>
          </div>
        </div>

        <div className="mt-4 grid gap-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <Target className="h-4 w-4" />
              次の1アクション
            </div>
            <div className="mt-2 font-bold text-slate-900">{mission.nextActionLabel}</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-400">
              <CalendarClock className="h-4 w-4" />
              進め方
            </div>
            <div className="mt-2">まず1セットだけ進めれば進行中に変わります。完了よりも、止めないことを優先します。</div>
          </div>
        </div>

        <button
          type="button"
          data-testid="dashboard-mission-primary-cta"
          onClick={onPrimaryAction}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800"
        >
          {mission.nextActionLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  </section>
);

export default DashboardMissionSection;
