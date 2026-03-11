import React from 'react';
import { ArrowLeft, BookOpen, Building2, Sparkles } from 'lucide-react';
import { getSubscriptionPolicy } from '../config/subscription';
import { type PublicMotivationSnapshot, SubscriptionPlan } from '../types';
import PublicMotivationPanel from './PublicMotivationPanel';

interface PublicInfoPageProps {
  onBack: () => void;
  motivationSnapshot: PublicMotivationSnapshot | null;
  motivationLoading: boolean;
  motivationError: string | null;
}

const PLAN_PREVIEWS = [
  SubscriptionPlan.TOC_FREE,
  SubscriptionPlan.TOC_PAID,
  SubscriptionPlan.TOB_PAID,
].map((plan) => getSubscriptionPolicy(plan));

const PLATFORM_HIGHLIGHTS = [
  {
    icon: <BookOpen className="h-4 w-4" />,
    label: '個人学習',
    detail: '初回診断から今日の復習、学習プランまでを1つの流れで始められます。',
  },
  {
    icon: <Building2 className="h-4 w-4" />,
    label: '学校・教室運用',
    detail: '講師フォロー、担当割当、教材権限まで同じ画面群で運用できます。',
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    label: '教材活用',
    detail: '既存の公式単語帳と My単語帳を目的に応じて切り替えられます。',
  },
];

const PublicInfoPage: React.FC<PublicInfoPageProps> = ({
  onBack,
  motivationSnapshot,
  motivationLoading,
  motivationError,
}) => {
  return (
    <div className="mx-auto mt-6 max-w-5xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-base font-bold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" /> ログイン画面に戻る
      </button>

      <PublicMotivationPanel
        snapshot={motivationSnapshot}
        loading={motivationLoading}
        error={motivationError}
        title="公開ページで見える学習ライブ"
        description="導入前でも、いま動いている学習量とアプリ全体の積み上がりを確認できます。"
      />

      <div className="overflow-hidden rounded-[32px] border border-medace-100 bg-white shadow-[0_28px_90px_rgba(255,130,22,0.12)]">
        <div className="border-b border-slate-100 bg-medace-50 p-8 md:p-10">
          <div className="max-w-3xl">
            <p className="text-sm font-bold tracking-[0.12em] text-medace-500">Public Guide</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              アプリの説明と
              <br />
              料金の考え方
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:text-[1.05rem]">
              Steady Study は、個人学習の立ち上がりを軽くしつつ、学校・教室では教材配信と講師フォローまでまとめて扱える設計です。
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {PLATFORM_HIGHLIGHTS.map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-200 bg-white/90 px-5 py-5 shadow-sm">
                <div className="flex items-center gap-2 text-medace-600">
                  {item.icon}
                  <span className="text-sm font-bold">{item.label}</span>
                </div>
                <p className="mt-3 text-base leading-relaxed text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8 p-6 md:p-8">
          <section>
            <p className="text-sm font-bold tracking-[0.12em] text-slate-500">Plan Overview</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">料金体系の考え方</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              個人利用はそのまま始められる導線、ビジネス利用は教材配信と運用画面を含めた個別ご案内を前提にしています。
            </p>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {PLAN_PREVIEWS.map((plan) => (
                <div key={plan.plan} className="rounded-3xl border border-slate-200 bg-slate-50/70 px-5 py-5">
                  <div className="text-sm font-bold text-slate-500">{plan.audienceLabel}</div>
                  <div className="mt-2 text-lg font-black text-slate-950">{plan.label}</div>
                  <div className="mt-1 text-base font-black text-medace-700">{plan.priceLabel}</div>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">{plan.pricingNote}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PublicInfoPage;
