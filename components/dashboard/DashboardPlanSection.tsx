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
  isCompact?: boolean;
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
  isCompact = false,
  onEditPlan,
  onGeneratePlan,
}) => (
  <section className={`rounded-lg border border-medace-100 bg-white shadow-sm ${isCompact ? 'p-5' : 'p-6 md:p-7'}`}>
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold text-slate-400">学習プラン</p>
        <h3 className={`mt-2 font-black tracking-tight text-slate-950 ${isCompact ? 'text-xl' : 'text-2xl'}`}>
          {learningPlan ? '今日の学習プラン' : 'プラン未作成'}
        </h3>
      </div>
      {learningPlan && (
        <button onClick={onEditPlan} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 hover:text-medace-600">
          <Edit2 className="h-3.5 w-3.5" />
          編集
        </button>
      )}
    </div>

    {learningPlan ? (
      <>
        <p className={`font-bold text-medace-600 ${isCompact ? 'mt-3 text-sm' : 'mt-4 text-base'}`}>{learningPlan.goalDescription}</p>
        {learningPreference && (
          <div className="mt-4 rounded-lg border border-medace-100 bg-medace-50 px-4 py-3 text-sm text-slate-700">
            <div className="font-bold">使う条件</div>
            <div className={`mt-1 leading-relaxed ${isCompact ? 'line-clamp-2' : ''}`}>{preferenceSummary}</div>
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-medace-100 bg-medace-50 px-4 py-3">
            <div className="text-[11px] font-black text-slate-500">1日の目標</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{learningPlan.dailyWordGoal}</div>
            <div className="text-sm text-slate-500">語 / 日</div>
          </div>
          <div className="rounded-lg border border-medace-100 bg-medace-50 px-4 py-3">
            <div className="text-[11px] font-black text-slate-500">目標日</div>
            <div className="mt-2 text-lg font-black text-slate-950">{learningPlan.targetDate}</div>
            <div className="text-sm text-slate-500">完了予定</div>
          </div>
          <div className="rounded-lg border border-medace-100 bg-medace-50 px-4 py-3">
            <div className="text-[11px] font-black text-slate-500">対象教材</div>
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
    ) : !hasStudyBooks ? (
      <div className="mt-4 rounded-lg border border-medace-100 bg-medace-50 px-4 py-4">
        <div className="text-sm font-black text-slate-950">まず教材を1冊</div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          写真・PDF・テキストからMy単語帳を作れます。
        </p>
        <div className={`rounded-lg border border-white/80 bg-white/80 px-4 py-2.5 text-[13px] leading-relaxed text-slate-600 ${isCompact ? 'mt-3' : 'mt-4'}`}>
          教材を作ると、ここに1日の量と使う教材が表示されます。
        </div>
      </div>
    ) : (
      <div className="mt-5 rounded-lg border border-medace-100 bg-medace-50 px-5 py-5 text-slate-700">
        <p className="text-sm leading-relaxed">
          目標日と学習時間から、今日やる量を決めます。
        </p>
        {!canGenerateAiPlan && (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            教材と学習時間から標準プランを作ります。
          </p>
        )}
        <button
          onClick={onGeneratePlan}
          disabled={generatingPlan || !hasStudyBooks}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-medace-600 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-medace-700 disabled:opacity-50"
        >
          {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          プランを作る
        </button>
      </div>
    )}
  </section>
);

export default DashboardPlanSection;
