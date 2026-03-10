import React from 'react';
import { Edit2, Loader2, Play, Settings, Sparkles } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { GRADE_LABELS, type LearningPlan, type UserGrade } from '../../types';

interface DashboardHeroSectionProps {
  grade: UserGrade;
  englishLevel?: string;
  heroTitle: string;
  heroCopy: string;
  preferenceSummary: string;
  hasStudyBooks: boolean;
  questButtonLabel: string;
  learningPlan: LearningPlan | null;
  generatingPlan: boolean;
  remainingWords: number;
  dueCount: number;
  estimatedMinutes: number;
  todayCount: number;
  todayWordGoal: number;
  todayProgressPercent: number;
  gameLeagueBadge?: { name: string; color: string };
  onOpenSettings: () => void;
  onStartQuest: () => void;
  onOpenPlan: () => void;
  onGeneratePlan: () => void;
}

const DashboardHeroSection: React.FC<DashboardHeroSectionProps> = ({
  grade,
  englishLevel,
  heroTitle,
  heroCopy,
  preferenceSummary,
  hasStudyBooks,
  questButtonLabel,
  learningPlan,
  generatingPlan,
  remainingWords,
  dueCount,
  estimatedMinutes,
  todayCount,
  todayWordGoal,
  todayProgressPercent,
  gameLeagueBadge,
  onOpenSettings,
  onStartQuest,
  onOpenPlan,
  onGeneratePlan,
}) => (
  <section className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#2F1609_0%,#66321A_42%,#F66D0B_100%)] p-7 text-white shadow-[0_24px_60px_rgba(228,94,4,0.18)] md:p-8">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,191,82,0.34),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(252,215,151,0.24),_transparent_22%)]"></div>
    <div className="relative">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white/70">
            {BRAND.productLabel}
          </span>
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold text-white/88">
            {GRADE_LABELS[grade]} / {englishLevel || '未診断'}
          </span>
          {gameLeagueBadge && (
            <span className={`rounded-full border px-3 py-1 text-xs font-bold ${gameLeagueBadge.color}`}>
              {gameLeagueBadge.name}
            </span>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold text-white/80 transition-colors hover:bg-white/10"
        >
          <Settings className="h-4 w-4" /> 設定・プロフィール
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-medace-200">Today Focus</p>
          <h2 className="mt-3 text-3xl font-black leading-tight tracking-tight md:text-4xl">今日やることは 1 つだけ</h2>
          <p className="mt-4 text-2xl font-black tracking-tight text-white">{heroTitle}</p>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-white/74 md:text-base">{heroCopy}</p>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">学習の個別設定</div>
            <div className="mt-2 text-sm leading-relaxed text-white/80">{preferenceSummary}</div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              onClick={onStartQuest}
              disabled={!hasStudyBooks}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-medace-900 transition-colors hover:bg-medace-50 disabled:cursor-not-allowed disabled:bg-white/60 disabled:text-medace-900/40"
            >
              <Play className="h-4 w-4 fill-current" /> {questButtonLabel}
            </button>
            {learningPlan ? (
              <button
                onClick={onOpenPlan}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/85 transition-colors hover:bg-white/10"
              >
                <Edit2 className="h-4 w-4" /> 今日のプランを見る
              </button>
            ) : (
              <button
                onClick={onGeneratePlan}
                disabled={generatingPlan || !hasStudyBooks}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-5 py-3 text-sm font-bold text-white/85 transition-colors hover:bg-white/10 disabled:opacity-50"
              >
                {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                最初のプランを作る
              </button>
            )}
          </div>
        </div>

        <div className="rounded-[28px] border border-white/10 bg-white/8 p-5 backdrop-blur-sm">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">今日の目安</div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">残り</div>
              <div className="mt-2 text-3xl font-black">{remainingWords}</div>
              <div className="mt-1 text-sm text-white/68">語</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">復習待ち</div>
              <div className="mt-2 text-3xl font-black">{dueCount}</div>
              <div className="mt-1 text-sm text-white/68">語</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-white/55">目安時間</div>
              <div className="mt-2 text-3xl font-black">{estimatedMinutes}</div>
              <div className="mt-1 text-sm text-white/68">分</div>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-[0.16em] text-white/60">
              <span>今日の進み具合</span>
              <span>{todayCount} / {todayWordGoal} 語</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-gradient-to-r from-[#FCD797] to-white" style={{ width: `${todayProgressPercent}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default DashboardHeroSection;
