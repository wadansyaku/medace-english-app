import React from 'react';
import type { CommercialRequestPayload } from '../../contracts/storage';
import { getRecommendedCommercialRequestKind } from '../../shared/commercial';
import {
  COMMERCIAL_REQUEST_KIND_LABELS,
  CommercialRequestKind,
  SubscriptionPlan,
  type AccountOverview,
  type CommercialRequest,
  type UserProfile,
} from '../../types';
import CommercialRequestForm from './CommercialRequestForm';
import CommercialRequestStatusList from './CommercialRequestStatusList';

interface CommercialUpgradePanelProps {
  user: UserProfile;
  accountOverview: AccountOverview | null;
  requests: CommercialRequest[];
  source: string;
  onSubmit: (payload: CommercialRequestPayload) => Promise<void>;
}

const CommercialUpgradePanel: React.FC<CommercialUpgradePanelProps> = ({
  user,
  accountOverview,
  requests,
  source,
  onSubmit,
}) => {
  const recommendedKind = getRecommendedCommercialRequestKind(user);
  const currentPlan = accountOverview?.subscriptionPlan || user.subscriptionPlan || SubscriptionPlan.TOC_FREE;
  const recommendation = currentPlan === SubscriptionPlan.TOC_FREE
    ? '個人利用を続ける場合はパーソナル相談、学校・教室として使う場合は導入相談を送れます。'
    : currentPlan === SubscriptionPlan.TOC_PAID
      ? '広告なしの個人利用を継続しつつ、必要なら学校・教室導入へ切り替えられます。'
      : '現在のビジネス利用状況に応じて、本導入や役割変更を相談できます。';

  return (
    <div className="space-y-4" data-testid="commercial-upgrade-panel">
      <div className="rounded-[28px] border border-medace-100 bg-medace-50 px-5 py-5">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-medace-600">Plan Pathway</p>
        <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">導入・格上げの進め方</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{recommendation}</p>
        <div className="mt-4 rounded-2xl border border-white/80 bg-white px-4 py-3 text-sm text-slate-700">
          推奨アクション: <span className="font-bold text-slate-950">{COMMERCIAL_REQUEST_KIND_LABELS[recommendedKind]}</span>
        </div>
      </div>

      <CommercialRequestStatusList
        requests={requests}
        emptyCopy="進行中の申請はありません。必要なタイミングでここから導入相談や格上げ相談を送れます。"
      />

      <CommercialRequestForm
        title="導入・格上げを相談する"
        description="決済ではなく相談ベースで受け付けます。学校・教室導入、役割切替、個人上位プランの相談をここからまとめて送れます。"
        source={source}
        submitLabel="相談を送る"
        availableKinds={[
          recommendedKind,
          currentPlan === SubscriptionPlan.TOC_FREE || currentPlan === SubscriptionPlan.TOC_PAID
            ? CommercialRequestKind.BUSINESS_TRIAL
            : CommercialRequestKind.BUSINESS_ROLE_CONVERSION,
        ].filter((value, index, array) => array.indexOf(value) === index)}
        defaultKind={recommendedKind}
        defaultContactName={user.displayName}
        defaultContactEmail={user.email}
        defaultOrganizationName={user.organizationName}
        onSubmit={onSubmit}
      />
    </div>
  );
};

export default CommercialUpgradePanel;
