import React from 'react';
import {
  SubscriptionPlan,
  SUBSCRIPTION_PLAN_LABELS,
  type AccountOverview,
  type CommercialRequest,
} from '../../types';
import CommercialRequestStatusList from './CommercialRequestStatusList';

interface CommercialUpgradePanelProps {
  accountOverview: AccountOverview | null;
  requests: CommercialRequest[];
}

const CommercialUpgradePanel: React.FC<CommercialUpgradePanelProps> = ({
  accountOverview,
  requests,
}) => {
  const currentPlan = accountOverview?.subscriptionPlan || SubscriptionPlan.TOC_FREE;
  const planLabel = SUBSCRIPTION_PLAN_LABELS[currentPlan];
  const guidance = currentPlan === SubscriptionPlan.TOC_FREE
    ? '個人学習はこのまま開始できます。学校・教室で使う場合は、管理者が招待または手動発行したアカウントから進みます。'
    : currentPlan === SubscriptionPlan.TOC_PAID
      ? '広告なしの個人利用を継続できます。学校・教室ワークスペースは、専用ロールのリンクから確認してください。'
      : '現在のビジネス利用状態と、過去の申請・承認履歴をここで確認できます。';

  return (
    <div className="space-y-4" data-testid="commercial-upgrade-panel">
      <div className="rounded-[28px] border border-medace-100 bg-medace-50 px-5 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-medace-600">Plan Status</p>
        <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">現在のプランと受付状況</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{guidance}</p>
        <div className="mt-4 rounded-2xl border border-white/80 bg-white px-4 py-3 text-sm text-slate-700">
          現在のプラン: <span className="font-bold text-slate-950">{planLabel}</span>
        </div>
      </div>

      <CommercialRequestStatusList
        requests={requests}
        emptyCopy="進行中の申請はありません。学習はこのまま開始できます。"
      />
    </div>
  );
};

export default CommercialUpgradePanel;
