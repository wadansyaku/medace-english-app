import React from 'react';
import { AccountOverview, OrganizationRole, SUBSCRIPTION_PLAN_LABELS, SubscriptionPlan, UserProfile, UserRole } from '../types';
import { isAdSupportedPlan, isBusinessPlan } from '../config/subscription';
import { getWorkspaceRoleLabel } from '../config/access';
import AdSenseSlot from './AdSenseSlot';
import { ArrowUpRight, BadgeCheck, Building2, Crown, Megaphone, ShieldCheck, Sparkles, Users } from 'lucide-react';

interface PlanExperiencePanelProps {
  user: UserProfile;
  accountOverview: AccountOverview;
  plannedBookCount: number;
  coachNotificationCount: number;
}

const benefitTone = (index: number) => {
  if (index === 0) return 'border-medace-200 bg-medace-50 text-medace-900';
  if (index === 1) return 'border-slate-200 bg-slate-50 text-slate-700';
  return 'border-amber-200 bg-amber-50 text-amber-800';
};

const PlanExperiencePanel: React.FC<PlanExperiencePanelProps> = ({
  user,
  accountOverview,
  plannedBookCount,
  coachNotificationCount,
}) => {
  const plan = accountOverview.subscriptionPlan;
  const isBusinessWorkspace = isBusinessPlan(plan) && !!user.organizationName;
  const isBusinessStudent = user.organizationRole === OrganizationRole.STUDENT || (isBusinessWorkspace && user.role === UserRole.STUDENT);
  const isFreePlan = isAdSupportedPlan(plan);
  const hasBusinessCatalog = plan === SubscriptionPlan.TOB_PAID;

  if (isFreePlan) {
    return (
      <section className="grid gap-6 xl:grid-cols-[1.04fr_0.96fr]">
        <div className="rounded-[32px] border border-medace-100 bg-[linear-gradient(135deg,#fff7ea_0%,#ffffff_100%)] p-6 md:p-7 shadow-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-medace-900 px-3 py-1 text-xs font-bold text-white">
              {SUBSCRIPTION_PLAN_LABELS[plan]}
            </span>
            <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
              広告付き
            </span>
          </div>
          <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-950">まずは無料で学習習慣を作る</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            フリープランは自己学習を軽く始めるための入口です。広告表示でコストを抑えつつ、自分で作った教材と小さなAI補助に絞ってテンポ良く使えます。
          </p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習方式</div>
              <div className="mt-2 text-lg font-black text-slate-950">自己管理</div>
              <div className="mt-1 text-sm text-slate-500">個人で進める標準導線</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">AI枠</div>
              <div className="mt-2 text-lg font-black text-slate-950">ライト</div>
              <div className="mt-1 text-sm text-slate-500">例文生成と小クイズ中心</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">次の伸びしろ</div>
              <div className="mt-2 text-lg font-black text-slate-950">広告なし</div>
              <div className="mt-1 text-sm text-slate-500">上位プランで集中しやすく</div>
            </div>
          </div>
          <div className="mt-5 rounded-3xl border border-dashed border-medace-200 bg-white px-5 py-4">
            <div className="flex items-start gap-3">
              <Megaphone className="mt-0.5 h-5 w-5 text-medace-500" />
              <div>
                <div className="text-sm font-bold text-slate-900">フリープランの収益導線</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-500">
                  無料利用ではこの画面に Google AdSense を表示し、事業側は広告収益で基礎コストを回収します。
                </div>
              </div>
            </div>
          </div>
        </div>

        <AdSenseSlot slot={import.meta.env.VITE_ADSENSE_SLOT_DASHBOARD_INLINE} label="Google AdSense" minHeightClassName="min-h-[240px]" />
      </section>
    );
  }

  if (isBusinessStudent) {
    const businessBenefits = [
      '広告なしで集中しやすい学習画面',
      '講師フォロー通知とグループ進行に対応',
      hasBusinessCatalog
        ? 'Steady Study Original とライセンス教材をビジネス限定で配布'
        : '正式教材カタログは本導入後に開放',
    ];

    return (
      <section className="rounded-[32px] border border-medace-100 bg-[linear-gradient(135deg,#fffdfa_0%,#fff4e6_45%,#ffffff_100%)] p-6 md:p-7 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-medace-900 px-3 py-1 text-xs font-bold text-white">
              {SUBSCRIPTION_PLAN_LABELS[plan]}
            </span>
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
              広告なし
            </span>
          </div>
          <div className="rounded-full border border-medace-200 bg-white px-3 py-1 text-xs font-bold text-medace-800">
            {getWorkspaceRoleLabel(user)}
          </div>
        </div>

        <div className="mt-5 grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div>
            <div className="flex items-center gap-3 text-medace-700">
              <Building2 className="h-5 w-5" />
              <span className="text-sm font-bold">{user.organizationName}</span>
            </div>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">グループ学習の流れで迷わない</h3>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              個人学習ではなく、教室や法人の学習運用に乗る体験です。教材権限・講師フォロー・学習プランが一枚の導線としてつながります。
            </p>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">担当導線</div>
                <div className="mt-2 text-lg font-black text-slate-950">{coachNotificationCount}件</div>
                <div className="mt-1 text-sm text-slate-500">講師フォロー通知</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">対象教材</div>
                <div className="mt-2 text-lg font-black text-slate-950">{plannedBookCount}冊</div>
                <div className="mt-1 text-sm text-slate-500">{hasBusinessCatalog ? 'ビジネス限定の公式教材を反映' : 'トライアル用の範囲で反映'}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">利用環境</div>
                <div className="mt-2 text-lg font-black text-slate-950">広告なし</div>
                <div className="mt-1 text-sm text-slate-500">授業中でも邪魔しない</div>
              </div>
            </div>
          </div>

          <div className="grid gap-3">
            {businessBenefits.map((benefit, index) => (
              <div key={benefit} className={`rounded-3xl border px-4 py-4 ${benefitTone(index)}`}>
                <div className="flex items-start gap-3">
                  {index === 0 ? <ShieldCheck className="mt-0.5 h-5 w-5" /> : index === 1 ? <Users className="mt-0.5 h-5 w-5" /> : <BadgeCheck className="mt-0.5 h-5 w-5" />}
                  <div className="text-sm font-medium leading-relaxed">{benefit}</div>
                </div>
              </div>
            ))}
            <div className="rounded-3xl border border-dashed border-medace-200 bg-white px-4 py-4 text-sm leading-relaxed text-slate-600">
              料金メモ: {accountOverview.pricingNote}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-7 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-medace-900 px-3 py-1 text-xs font-bold text-white">
            {SUBSCRIPTION_PLAN_LABELS[plan]}
          </span>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            広告なし
          </span>
        </div>
        <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600">
          {getWorkspaceRoleLabel(user)}
        </div>
      </div>
      <h3 className="mt-4 text-2xl font-black tracking-tight text-slate-950">学習体験を広げる個人向け上位プラン</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        広告なしで集中しつつ、画像やPDFからの教材化まで使える個人向けプランです。フリープランとの差は、学習の深さと素材化の自由度にあります。
      </p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {[
          { icon: <Sparkles className="h-5 w-5" />, label: '教材化', value: '画像 / PDF対応' },
          { icon: <Crown className="h-5 w-5" />, label: '環境', value: '広告なし' },
          { icon: <ArrowUpRight className="h-5 w-5" />, label: '活用幅', value: '個人最適化を拡張' },
        ].map((item) => (
          <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-2 text-medace-600">{item.icon}<span className="text-xs font-bold uppercase tracking-[0.16em]">{item.label}</span></div>
            <div className="mt-3 text-lg font-black text-slate-950">{item.value}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default PlanExperiencePanel;
