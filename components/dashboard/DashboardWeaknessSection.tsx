import React from 'react';

import {
  WEAKNESS_DIMENSION_LABELS,
  WEAKNESS_SIGNAL_LEVEL_LABELS,
  type StudentWeaknessProfile,
} from '../../types';
import { buildWeaknessEmptyStateLabel, WEAKNESS_MIN_SAMPLE } from '../../shared/weakness';

interface DashboardWeaknessSectionProps {
  weaknessProfile: StudentWeaknessProfile | null;
  onStartFocusQuest: () => void;
  onOpenPlan: () => void;
}

const DashboardWeaknessSection: React.FC<DashboardWeaknessSectionProps> = ({
  weaknessProfile,
  onStartFocusQuest,
  onOpenPlan,
}) => {
  const topWeakness = weaknessProfile?.topWeaknesses[0] || null;
  const hasSignals = Boolean(weaknessProfile?.hasSufficientData && topWeakness);

  if (!hasSignals) {
    return (
      <section data-testid="dashboard-weakness-section" className="rounded-lg border border-orange-100 bg-white px-5 py-5 shadow-sm sm:px-6">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-bold text-slate-400">苦手フォーカス</div>
            <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">苦手はもう少し解くと見えてきます</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              まずは{WEAKNESS_MIN_SAMPLE}問ほど解くと、次に見直す10語を選べます。
            </p>
          </div>
          <button
            type="button"
            data-testid="weakness-focus-cta"
            onClick={onStartFocusQuest}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-medace-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-medace-800"
          >
            {buildWeaknessEmptyStateLabel()}
          </button>
        </div>
      </section>
    );
  }

  const handlePrimaryAction = topWeakness.recommendedActionType === 'OPEN_PLAN'
    ? onOpenPlan
    : onStartFocusQuest;

  return (
    <section data-testid="dashboard-weakness-section" className="rounded-lg border border-orange-100 bg-white px-5 py-5 shadow-sm sm:px-6">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="text-xs font-bold text-slate-400">苦手フォーカス</div>
            <h3 className="mt-3 text-xl font-black tracking-tight text-slate-950">今日はここを先に整える</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{topWeakness.reason}</p>
          </div>
          <button
            type="button"
            data-testid="weakness-focus-cta"
            onClick={handlePrimaryAction}
            className="inline-flex min-h-12 items-center justify-center rounded-lg bg-medace-700 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-medace-800"
          >
            {topWeakness.nextActionLabel}
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {weaknessProfile.topWeaknesses.slice(0, 3).map((signal) => (
            <article key={signal.dimension} className="rounded-lg border border-orange-100 bg-medace-50 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-bold text-slate-900">{WEAKNESS_DIMENSION_LABELS[signal.dimension]}</div>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  {WEAKNESS_SIGNAL_LEVEL_LABELS[signal.level]}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{signal.reason}</p>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs font-medium text-slate-500">
                <span>{signal.nextActionLabel}</span>
                <span>{signal.sampleSize}問から判定</span>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default DashboardWeaknessSection;
