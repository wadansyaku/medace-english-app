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
  onOpenCreateModal: () => void;
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
  onOpenCreateModal,
}) => (
  <section className={`rounded-lg border border-orange-100 bg-white shadow-sm ${isCompact ? 'p-5' : 'p-6 md:p-7'}`}>
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">学習プラン</p>
        <h3 className={`mt-2 font-black tracking-tight text-slate-950 ${isCompact ? 'text-xl' : 'text-2xl'}`}>
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
        <p className={`font-bold text-medace-600 ${isCompact ? 'mt-3 text-sm' : 'mt-4 text-base'}`}>"{learningPlan.goalDescription}"</p>
        {learningPreference && (
          <div className="mt-4 rounded-lg border border-orange-100 bg-medace-50 px-4 py-4 text-sm text-slate-700">
            <div className="font-bold">プラン作成に使う条件</div>
            <div className={`mt-1 leading-relaxed ${isCompact ? 'line-clamp-2' : ''}`}>{preferenceSummary}</div>
          </div>
        )}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-orange-100 bg-medace-50 px-4 py-4">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">1日の目標</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{learningPlan.dailyWordGoal}</div>
            <div className="text-sm text-slate-500">語 / 日</div>
          </div>
          <div className="rounded-lg border border-orange-100 bg-medace-50 px-4 py-4">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">目標日</div>
            <div className="mt-2 text-lg font-black text-slate-950">{learningPlan.targetDate}</div>
            <div className="text-sm text-slate-500">完了予定</div>
          </div>
          <div className="rounded-lg border border-orange-100 bg-medace-50 px-4 py-4">
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
    ) : !hasStudyBooks ? (
      <div className="mt-4 rounded-lg border border-orange-100 bg-medace-50 px-4 py-4">
        <div className="text-sm font-black text-slate-950">教材を1冊用意する</div>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          写真・PDF・テキストからMy単語帳を作ると、すぐに学習を始められます。
        </p>
        <div className={`grid gap-3 ${isCompact ? 'mt-3' : 'mt-4 sm:grid-cols-[1fr_auto]'}`}>
          <div className="rounded-lg border border-white/80 bg-white/80 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
            教科書1ページ分からで大丈夫です。あとから追加できます。
          </div>
          <button
            onClick={onOpenCreateModal}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-medace-700 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800"
          >
            My単語帳を作る
          </button>
        </div>
      </div>
    ) : (
      <div className="mt-5 rounded-lg border border-orange-100 bg-medace-50 px-5 py-5 text-slate-700">
        <p className="text-sm leading-relaxed">
          目標日と学習時間から、今日進める単語数と教材を1つに絞ります。
        </p>
        {!canGenerateAiPlan && (
          <p className="mt-3 text-xs leading-relaxed text-slate-500">
            現在のプランでは、教材と学習時間から標準プランを作成します。
          </p>
        )}
        <button
          onClick={onGeneratePlan}
          disabled={generatingPlan || !hasStudyBooks}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
        >
          {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          プランを作成
        </button>
      </div>
    )}
  </section>
);

export default DashboardPlanSection;
