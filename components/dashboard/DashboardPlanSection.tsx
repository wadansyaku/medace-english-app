import React from 'react';
import { Edit2, Loader2, Sparkles } from 'lucide-react';
import type { BookMetadata, LearningPlan, LearningPreference } from '../../types';

interface DashboardPlanSectionProps {
  learningPlan: LearningPlan | null;
  learningPreference: LearningPreference | null;
  preferenceSummary: string;
  plannedBooks: BookMetadata[];
  canGenerateAiPlan: boolean;
  generatingPlan: boolean;
  hasStudyBooks: boolean;
  onEditPlan: () => void;
  onGeneratePlan: () => void;
}

const DashboardPlanSection: React.FC<DashboardPlanSectionProps> = ({
  learningPlan,
  learningPreference,
  preferenceSummary,
  plannedBooks,
  canGenerateAiPlan,
  generatingPlan,
  hasStudyBooks,
  onEditPlan,
  onGeneratePlan,
}) => (
  <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">学習プラン</p>
        <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
          {learningPlan ? '今日の学習プラン' : 'まだプラン未作成'}
        </h3>
      </div>
      {learningPlan && (
        <button onClick={onEditPlan} className="rounded-full bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 hover:text-medace-600">
          編集
        </button>
      )}
    </div>

    {learningPlan ? (
      <>
        <p className="mt-4 text-base font-bold text-medace-600">"{learningPlan.goalDescription}"</p>
        {learningPreference && (
          <div className="mt-4 rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-4 text-sm text-medace-900">
            <div className="font-bold">プラン生成に使う条件</div>
            <div className="mt-1 leading-relaxed">{preferenceSummary}</div>
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">1日の目標</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{learningPlan.dailyWordGoal}</div>
            <div className="text-sm text-slate-500">語 / 日</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">目標日</div>
            <div className="mt-2 text-lg font-black text-slate-950">{learningPlan.targetDate}</div>
            <div className="text-sm text-slate-500">完了予定</div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">対象教材</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{plannedBooks.length}</div>
            <div className="text-sm text-slate-500">優先教材</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {plannedBooks.slice(0, 4).map((book) => (
            <span key={book.id} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">
              {book.title}
            </span>
          ))}
        </div>
      </>
    ) : (
      <div className="mt-5 rounded-3xl bg-medace-500 px-5 py-5 text-white">
        <p className="text-sm leading-relaxed text-white/75">
          診断結果に加えて、目標試験・試験日・学習時間・苦手分野をもとに、毎日の単語数とコースを自動で提案します。
        </p>
        {!canGenerateAiPlan && (
          <p className="mt-3 text-xs leading-relaxed text-white/70">
            現在のプランでは、AIを使わずに教材と学習時間から標準プランを作成します。
          </p>
        )}
        <button
          onClick={onGeneratePlan}
          disabled={generatingPlan || !hasStudyBooks}
          className="mt-4 inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-medace-900 hover:bg-medace-50 disabled:opacity-50"
        >
          {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          プランを生成
        </button>
      </div>
    )}
  </section>
);

export default DashboardPlanSection;
