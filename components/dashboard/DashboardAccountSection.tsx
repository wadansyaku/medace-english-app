import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { AccountOverview, UserProfile } from '../../types';
import { SUBSCRIPTION_PLAN_LABELS } from '../../types';
import AdSenseSlot from '../AdSenseSlot';
import PlanExperiencePanel from '../PlanExperiencePanel';

interface DashboardAccountSectionProps {
  open: boolean;
  user: UserProfile;
  accountOverview: AccountOverview | null;
  aiBudgetPercent: number;
  aiUsageLabel: string;
  aiUsageCopy: string;
  plannedBookCount: number;
  coachNotificationCount: number;
  showAdSlots: boolean;
  onToggle: () => void;
}

const DashboardAccountSection: React.FC<DashboardAccountSectionProps> = ({
  open,
  user,
  accountOverview,
  aiBudgetPercent,
  aiUsageLabel,
  aiUsageCopy,
  plannedBookCount,
  coachNotificationCount,
  showAdSlots,
  onToggle,
}) => (
  <div className="space-y-4">
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:bg-slate-50"
    >
      <div>
        <div className="text-sm font-bold text-slate-900">プラン・学習環境の詳細</div>
        <div className="mt-1 text-sm text-slate-500">課金情報やAI利用枠は必要なときだけ開けます。</div>
      </div>
      {open ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
    </button>

    {open && (
      <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
        {accountOverview && (
          <section className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-7 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">ご利用プラン</p>
            <div className="mt-2 flex items-center justify-between gap-4">
              <h3 className="text-xl font-black tracking-tight text-slate-950">
                {SUBSCRIPTION_PLAN_LABELS[accountOverview.subscriptionPlan]}
              </h3>
              <span className="rounded-full bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
                {accountOverview.audienceLabel} / {accountOverview.priceLabel}
              </span>
            </div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {accountOverview.pricingNote}
            </div>
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                <span>AIサポート利用状況</span>
                <span>{aiBudgetPercent}%</span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-medace-500"
                  style={{ width: `${aiBudgetPercent}%` }}
                ></div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl bg-medace-50 px-4 py-3 text-sm text-medace-900">
              <div className="font-bold">{aiUsageLabel}</div>
              <div className="mt-1 text-medace-900/70">{aiUsageCopy}</div>
            </div>
            <div className="mt-4 space-y-2">
              {accountOverview.featureSummary.map((item) => (
                <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                  {item}
                </div>
              ))}
            </div>
          </section>
        )}

        {accountOverview && (
          <PlanExperiencePanel
            user={user}
            accountOverview={accountOverview}
            plannedBookCount={plannedBookCount}
            coachNotificationCount={coachNotificationCount}
          />
        )}

        {showAdSlots && (
          <AdSenseSlot
            slot={import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD_SECONDARY}
            label="Sponsored"
            minHeightClassName="min-h-[180px]"
          />
        )}
      </div>
    )}
  </div>
);

export default DashboardAccountSection;
