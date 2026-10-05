import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { getSubscriptionPolicy, SUBSCRIPTION_POLICIES } from '../config/subscription';
import DashboardAccountSection from '../components/dashboard/DashboardAccountSection';
import PlanExperiencePanel from '../components/PlanExperiencePanel';
import { OrganizationRole, SubscriptionPlan, UserRole, type AccountOverview, type UserProfile } from '../types';

vi.mock('../components/AdSenseSlot', () => ({ default: () => null }));

const user = (plan: SubscriptionPlan): UserProfile => ({
  uid: 'synthetic-plan-user', displayName: '合成学習者', email: 'synthetic@example.invalid',
  role: UserRole.STUDENT, subscriptionPlan: plan,
  ...(plan === SubscriptionPlan.TOB_FREE || plan === SubscriptionPlan.TOB_PAID
    ? { organizationName: '合成教室', organizationRole: OrganizationRole.STUDENT } : {}),
});
const overview = (plan: SubscriptionPlan): AccountOverview => {
  const policy = getSubscriptionPolicy(plan);
  return { subscriptionPlan: plan, priceLabel: policy.priceLabel, audienceLabel: policy.audienceLabel,
    pricingNote: policy.pricingNote, featureSummary: policy.featureSummary,
    aiUsage: { monthKey: '2026-10', estimatedCostMilliYen: 0, budgetMilliYen: policy.monthlyAiBudgetMilliYen,
      remainingMilliYen: policy.monthlyAiBudgetMilliYen, generationCount: 0, cacheHitCount: 0,
      cacheHitRatio: 0, avoidedCostMilliYen: 0, actionCounts: {} } };
};
const accountHtml = (plan: SubscriptionPlan) => renderToStaticMarkup(<DashboardAccountSection
  open user={user(plan)} accountOverview={overview(plan)} commercialRequests={[]}
  aiBudgetPercent={0} aiUsageLabel="従来AIの参考記録" aiUsageCopy="過去の円建て利用記録です。"
  plannedBookCount={1} coachNotificationCount={0} showAdSlots={false} onToggle={() => {}} />);

describe('available subscription features', () => {
  it('renders paid personal account and plan descriptions consistent with manual/CSV import', () => {
    const html = accountHtml(SubscriptionPlan.TOC_PAID);
    expect(html).toContain('手入力・CSV'); expect(html).toContain('手入力 / CSV');
    expect(html).toContain('標準ロジック'); expect(html).toContain('保存済み例文');
    expect(html).toContain('画像・PDFの自動抽出は停止');
    expect(html).toContain('月額課金想定'); expect(html).toContain('広告なし');
    expect(html).not.toMatch(/AI教材化まで利用できます|画像やPDFからの教材化まで使える|画像 \/ PDF対応|個人最適化を拡張/);
  });
  it('renders free learning with saved materials and standard plans instead of live AI allowances', () => {
    const html = renderToStaticMarkup(<PlanExperiencePanel user={user(SubscriptionPlan.TOC_FREE)}
      accountOverview={overview(SubscriptionPlan.TOC_FREE)} plannedBookCount={1} coachNotificationCount={0} />);
    expect(html).toContain('保存済み例文'); expect(html).toContain('標準学習プラン');
    expect(html).not.toMatch(/小さなAI補助|AI枠/);
  });
  it('renders business benefits as standard plans and editable notification templates', () => {
    const html = accountHtml(SubscriptionPlan.TOB_PAID);
    expect(html).toContain('標準学習プラン'); expect(html).toContain('テンプレートを編集');
    expect(html).not.toMatch(/AI利用枠|高コスト機能/);
  });
  it.each(Object.values(SubscriptionPlan))('does not use legacy budget as a current feature promise on %s', plan => {
    const policy = SUBSCRIPTION_POLICIES[plan];
    const html = accountHtml(plan);
    expect([policy.pricingNote, ...policy.featureSummary].join(' '))
      .not.toMatch(/AI教材化まで利用|AI利用枠|AIは小さなクイズ補助|画像やPDFからの抽出にも対応|高コスト機能/);
    expect(html).toContain('従来AIの利用記録（参考）');
    expect(html).not.toContain('教材化の利用状況');
  });
});
