import React from 'react';
import { Edit2, Loader2, Play, Settings, Sparkles } from 'lucide-react';
import { BRAND } from '../../config/brand';
import { GRADE_LABELS, type LearningPlan, type UserGrade } from '../../types';
import ResponsiveMetricRail from '../mobile/ResponsiveMetricRail';

interface DashboardHeroSectionProps {
  grade: UserGrade;
  englishLevel?: string;
  heroTitle: string;
  heroCopy: string;
  primaryRecommendedBookTitle?: string | null;
  primaryRecommendedBookWordCount?: number;
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
  isMobileCompact?: boolean;
  onOpenSettings: () => void;
  onOpenRecommendedCourse?: () => void;
  onStartQuest: () => void;
  onOpenPlan: () => void;
  onGeneratePlan: () => void;
}

const DashboardHeroSection: React.FC<DashboardHeroSectionProps> = ({
  grade,
  englishLevel,
  heroTitle,
  heroCopy,
  primaryRecommendedBookTitle,
  primaryRecommendedBookWordCount,
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
  isMobileCompact = false,
  onOpenSettings,
  onOpenRecommendedCourse,
  onStartQuest,
  onOpenPlan,
  onGeneratePlan,
}) => (
  <section className={`relative min-w-0 overflow-hidden bg-medace-500 text-white shadow-[0_24px_60px_rgba(255,130,22,0.22)] ${
    isMobileCompact ? 'rounded-[28px] p-4' : 'rounded-[32px] p-5 md:p-8'
  }`}>
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.26),_transparent_26%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_24%)]"></div>
    <div className="relative min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border border-white/10 bg-white/5 font-bold uppercase tracking-[0.18em] text-white/70 ${
            isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1 text-xs'
          }`}>
            {BRAND.productLabel}
          </span>
          <span className={`rounded-full border border-white/10 bg-white/5 font-bold text-white/88 ${
            isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1 text-xs'
          }`}>
            {GRADE_LABELS[grade]} / {englishLevel || '未診断'}
          </span>
          {gameLeagueBadge && (
            <span className={`rounded-full border font-bold ${gameLeagueBadge.color} ${
              isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1 text-xs'
            }`}>
              {gameLeagueBadge.name}
            </span>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          data-testid="student-hero-settings"
          className={`flex items-center gap-2 rounded-full border border-white/10 bg-white/5 font-bold text-white/80 transition-colors hover:bg-white/10 ${
            isMobileCompact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'
          }`}
        >
          <Settings className="h-4 w-4" /> {isMobileCompact ? '設定' : '設定・プロフィール'}
        </button>
      </div>

      <div className={`grid min-w-0 gap-4 lg:gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:items-start ${
        isMobileCompact ? 'mt-4' : 'mt-5 lg:mt-6'
      }`}>
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-medace-200">Today Focus</p>
          <h2 className={`min-w-0 font-black leading-tight tracking-tight ${isMobileCompact ? 'mt-1.5 text-[1.35rem]' : 'mt-2 text-[1.7rem] sm:text-[1.9rem] md:text-4xl'}`}>
            今日やることは 1 つだけ
          </h2>
          <p className={`min-w-0 font-black tracking-tight text-white ${isMobileCompact ? 'mt-2 text-[1.12rem]' : 'mt-2.5 text-[1.3rem] sm:text-[1.45rem] md:text-2xl'}`}>
            {heroTitle}
          </p>
          <p className={`max-w-2xl min-w-0 leading-relaxed text-white/76 ${isMobileCompact ? 'mt-2 text-[13px] line-clamp-2' : 'mt-2.5 text-sm line-clamp-3 md:mt-3 md:line-clamp-none md:text-base'}`}>
            {heroCopy}
          </p>

          <div className={`flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap ${isMobileCompact ? 'mt-3' : 'mt-4'}`}>
            <button
              onClick={onStartQuest}
              data-testid="student-hero-primary-cta"
              className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white font-bold text-medace-900 transition-colors hover:bg-medace-50 sm:w-auto ${
                isMobileCompact ? 'min-h-11 px-4 py-3 text-sm' : 'px-5 py-3.5 text-sm'
              }`}
            >
              <Play className="h-4 w-4 fill-current" /> {questButtonLabel}
            </button>
            {hasStudyBooks && learningPlan ? (
              <button
                onClick={onOpenPlan}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 font-bold text-white/85 transition-colors hover:bg-white/10 sm:w-auto ${
                  isMobileCompact ? 'min-h-11 px-4 py-3 text-sm' : 'px-5 py-3 text-sm'
                }`}
              >
                <Edit2 className="h-4 w-4" /> 今日のプランを見る
              </button>
            ) : hasStudyBooks ? (
              <button
                onClick={onGeneratePlan}
                disabled={generatingPlan}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/5 font-bold text-white/85 transition-colors hover:bg-white/10 disabled:opacity-50 sm:w-auto ${
                  isMobileCompact ? 'min-h-11 px-4 py-3 text-sm' : 'px-5 py-3 text-sm'
                }`}
              >
                {generatingPlan ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                最初のプランを作る
              </button>
            ) : null}
          </div>

          {isMobileCompact && primaryRecommendedBookTitle && onOpenRecommendedCourse ? (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">推奨コース 1つ</div>
              <div className="mt-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="line-clamp-2 text-sm font-bold leading-snug text-white">
                    {primaryRecommendedBookTitle}
                  </div>
                  <div className="mt-1 text-xs text-white/70">
                    {primaryRecommendedBookWordCount ? `${primaryRecommendedBookWordCount}語` : '今日の学習に最適'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenRecommendedCourse}
                  className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-bold text-medace-900"
                >
                  このコースで始める
                </button>
              </div>
            </div>
          ) : (
            <div className={`min-w-0 rounded-2xl border border-white/10 bg-white/6 px-4 ${isMobileCompact ? 'mt-3 py-2.5' : 'mt-4 py-3'}`}>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">学習の個別設定</div>
              <div className={`min-w-0 leading-relaxed text-white/80 ${isMobileCompact ? 'mt-1.5 text-[13px] line-clamp-2' : 'mt-2 text-sm line-clamp-2 md:line-clamp-none'}`}>
                {preferenceSummary}
              </div>
            </div>
          )}
        </div>

        <div className={`min-w-0 rounded-[28px] border border-white/10 bg-white/8 backdrop-blur-sm ${isMobileCompact ? 'p-3' : 'p-3.5 md:p-5'}`}>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">今日の目安</div>
          <div className={isMobileCompact ? 'mt-3' : 'mt-4'}>
            <ResponsiveMetricRail
              className={isMobileCompact ? 'md:gap-2' : ''}
              items={[
                { id: 'remaining', label: '残り', value: `${remainingWords}`, helper: '語' },
                { id: 'due', label: '復習待ち', value: `${dueCount}`, helper: '語' },
                { id: 'minutes', label: '目安時間', value: `${estimatedMinutes}`, helper: '分' },
              ]}
            />
          </div>

          <div className={`rounded-2xl border border-white/10 bg-white/6 px-4 ${isMobileCompact ? 'mt-3 py-3' : 'mt-3 py-3.5 md:mt-4 md:py-4'}`}>
            <div className="flex items-center justify-between gap-3 text-xs font-bold uppercase tracking-[0.16em] text-white/60">
              <span>今日の進み具合</span>
              <span>{todayCount} / {todayWordGoal} 語</span>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/15">
              <div className="h-full rounded-full bg-white/90" style={{ width: `${todayProgressPercent}%` }}></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

export default DashboardHeroSection;
