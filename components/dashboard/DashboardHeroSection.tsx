import React from 'react';
import {
  ArrowRight,
  BookOpenText,
  Brain,
  CheckCircle2,
  Clock3,
  Languages,
  LibraryBig,
  NotebookPen,
  Play,
  Settings,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';
import { BRAND } from '../../config/brand';
import { GRADE_LABELS, type LearningPlan, type UserGrade } from '../../types';
import type {
  StudentDashboardLearningRouteId,
  StudentDashboardPracticeRecommendation,
} from '../../hooks/useStudentDashboardViewModel';

type FocusedPracticeLane = 'grammar' | 'translation' | 'reading' | 'writing';

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
  primaryLearningRouteId: StudentDashboardLearningRouteId;
  practiceRecommendation: StudentDashboardPracticeRecommendation;
  gameLeagueBadge?: { name: string; color: string };
  isMobileCompact?: boolean;
  practiceAnchorRef?: React.RefObject<HTMLDivElement | null>;
  practiceAnchorStyle?: React.CSSProperties;
  onOpenSettings: () => void;
  onOpenRecommendedCourse?: () => void;
  onStartQuest: () => void;
  onSelectPracticeLane: (lane: FocusedPracticeLane) => void;
  onOpenPlan: () => void;
  onGeneratePlan: () => void;
}

const PRACTICE_LANE_ICON: Record<FocusedPracticeLane, LucideIcon> = {
  grammar: Brain,
  translation: Languages,
  reading: LibraryBig,
  writing: NotebookPen,
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

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
  primaryLearningRouteId,
  practiceRecommendation,
  gameLeagueBadge,
  isMobileCompact = false,
  practiceAnchorRef,
  practiceAnchorStyle,
  onOpenSettings,
  onOpenRecommendedCourse,
  onStartQuest,
  onSelectPracticeLane,
  onOpenPlan,
  onGeneratePlan,
}) => {
  const PracticeIcon = PRACTICE_LANE_ICON[practiceRecommendation.lane] || Brain;
  const safeProgressPercent = clampPercent(todayProgressPercent);
  const isPracticePrimary = primaryLearningRouteId === 'englishPractice';
  const compactMetrics = [
    {
      id: 'remaining',
      label: '残り',
      value: `${remainingWords}語`,
      helper: remainingWords > 0 ? '今日の目安' : '達成',
      icon: Target,
    },
    {
      id: 'due',
      label: '復習',
      value: `${dueCount}語`,
      helper: dueCount > 0 ? '先に確認' : 'なし',
      icon: CheckCircle2,
    },
    {
      id: 'minutes',
      label: '時間',
      value: `${estimatedMinutes}分`,
      helper: '短く区切る',
      icon: Clock3,
    },
  ];
  const focusSteps = [
    {
      id: 'start',
      label: 'いま',
      title: heroTitle,
      helper: heroCopy,
      icon: Play,
      tone: 'current' as const,
    },
    {
      id: 'practice',
      label: '次',
      title: practiceRecommendation.ctaLabel,
      helper: practiceRecommendation.body,
      icon: PracticeIcon,
      tone: primaryLearningRouteId === 'englishPractice' ? 'current' as const : 'ready' as const,
    },
    {
      id: 'record',
      label: '記録',
      title: `${todayCount} / ${todayWordGoal}語`,
      helper: safeProgressPercent >= 100 ? '今日はここまでで十分です。' : '終わった分だけ残ります。',
      icon: CheckCircle2,
      tone: safeProgressPercent >= 100 ? 'done' as const : 'ready' as const,
    },
  ];

  return (
    <section
      data-testid="dashboard-command-center"
      className={`relative min-w-0 overflow-hidden rounded-[28px] border border-slate-200 bg-white text-slate-950 shadow-[0_18px_50px_rgba(15,23,42,0.08)] ${
        isMobileCompact ? 'p-4' : 'p-5 md:p-6'
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`rounded-lg border border-medace-100 bg-medace-50 font-black text-medace-700 ${
            isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
          }`}>
            {BRAND.productLabel}
          </span>
          <span className={`rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-600 ${
            isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
          }`}>
            {GRADE_LABELS[grade]} / {englishLevel || '未診断'}
          </span>
          {gameLeagueBadge && (
            <span className={`rounded-lg border font-bold ${gameLeagueBadge.color} ${
              isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
            }`}>
              {gameLeagueBadge.name}
            </span>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          data-testid="student-hero-settings"
          className={`flex items-center gap-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 ${
            isMobileCompact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'
          }`}
        >
          <Settings className="h-4 w-4" /> {isMobileCompact ? '設定' : '設定・プロフィール'}
        </button>
      </div>

      <div className={`grid min-w-0 gap-4 ${isMobileCompact ? 'mt-4' : 'mt-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.38fr)] xl:items-start'}`}>
        <div className="min-w-0 rounded-2xl bg-medace-700 p-4 text-white sm:p-5 md:p-6">
          <div className={`grid min-w-0 gap-4 ${isMobileCompact ? '' : 'lg:grid-cols-[minmax(0,1fr)_170px] lg:items-start'}`}>
            <div className="min-w-0">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-lg bg-white/12 px-3 py-1.5 text-xs font-black text-white/88">
                  今日やることは 1 つだけ
                </span>
              </div>
              <h2 className={`mt-4 font-black leading-tight tracking-tight ${isMobileCompact ? 'text-[2rem]' : 'text-4xl md:text-5xl'}`}>
                {hasStudyBooks ? heroTitle : '最初の教材を作る'}
              </h2>
              {hasStudyBooks && (
                <p className={`mt-2 font-black leading-snug text-white/92 ${isMobileCompact ? 'text-lg' : 'text-2xl'}`}>
                  {questButtonLabel}
                </p>
              )}
              <p className={`mt-3 max-w-2xl leading-relaxed text-white/76 ${isMobileCompact ? 'line-clamp-2 text-sm' : 'text-base'}`}>
                {heroCopy}
              </p>
            </div>

            {!isMobileCompact && (
              <div className="rounded-2xl border border-white/12 bg-white/10 p-4">
                <div className="text-xs font-black text-white/68">今日の進み具合</div>
                <div className="mt-2 text-4xl font-black">{safeProgressPercent}%</div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/18">
                  <div className="h-full rounded-full bg-white" style={{ width: `${safeProgressPercent}%` }} />
                </div>
                <div className="mt-3 text-xs font-bold leading-relaxed text-white/68">
                  {todayCount} / {todayWordGoal}語
                </div>
              </div>
            )}
          </div>

          <div className={`mt-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap`}>
            <button
              onClick={onStartQuest}
              data-testid="student-hero-primary-cta"
              className={`inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white font-black text-medace-900 transition-colors hover:bg-medace-50 sm:w-auto ${
                isMobileCompact ? 'min-h-12 px-4 py-3 text-sm' : 'px-6 py-3.5 text-base'
              }`}
            >
              <Play className="h-4 w-4 fill-current" /> {questButtonLabel}
            </button>
            {hasStudyBooks && learningPlan ? (
              <button
                onClick={onOpenPlan}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/8 font-bold text-white/88 transition-colors hover:bg-white/12 sm:w-auto ${
                  isMobileCompact ? 'min-h-12 px-4 py-3 text-sm' : 'px-5 py-3 text-sm'
                }`}
              >
                <BookOpenText className="h-4 w-4" /> 今日のプランを見る
              </button>
            ) : hasStudyBooks ? (
              <button
                onClick={onGeneratePlan}
                disabled={generatingPlan}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/8 font-bold text-white/88 transition-colors hover:bg-white/12 disabled:opacity-50 sm:w-auto ${
                  isMobileCompact ? 'min-h-12 px-4 py-3 text-sm' : 'px-5 py-3 text-sm'
                }`}
              >
                <Sparkles className="h-4 w-4" />
                最初のプランを作る
              </button>
            ) : null}
          </div>

          {!isMobileCompact && (
            <div className="mt-5 grid min-w-0 gap-2 md:grid-cols-3">
              {focusSteps.map((step) => {
                const StepIcon = step.icon;
                return (
                  <article
                    key={step.id}
                    className={`min-w-0 rounded-2xl border px-3 py-3 ${
                      step.tone === 'current'
                        ? 'border-white/28 bg-white/14'
                        : step.tone === 'done'
                          ? 'border-emerald-200/40 bg-emerald-400/16'
                          : 'border-white/12 bg-white/8'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-medace-700">
                        <StepIcon className={`h-4 w-4 ${step.tone === 'current' ? 'fill-current' : ''}`} />
                      </span>
                      <div className="text-xs font-black text-white/72">{step.label}</div>
                    </div>
                    <div className="mt-2 truncate text-sm font-black text-white">{step.title}</div>
                    <p className="mt-1 line-clamp-2 text-xs font-bold leading-relaxed text-white/62">{step.helper}</p>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="grid min-w-0 gap-4">
          <div
            ref={practiceAnchorRef}
            data-testid="dashboard-english-practice-entry"
            style={practiceAnchorStyle}
            className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 text-slate-950"
          >
            <div data-testid="dashboard-practice-dock" className="min-w-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-black text-medace-600">次に仕上げる</p>
                  <h3 className="mt-1 text-lg font-black leading-tight text-slate-950">{practiceRecommendation.title}</h3>
                  <p className="mt-2 line-clamp-2 text-sm font-bold leading-relaxed text-slate-600">{practiceRecommendation.body}</p>
                </div>
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                  <PracticeIcon className="h-5 w-5" />
                </span>
              </div>
              {isPracticePrimary ? (
                <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-700">
                  上のボタンからこの演習を始めます。
                </div>
              ) : (
                <button
                  type="button"
                  data-testid={`dashboard-practice-lane-${practiceRecommendation.lane}`}
                  onClick={() => onSelectPracticeLane(practiceRecommendation.lane)}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition-colors hover:bg-slate-800"
                >
                  {practiceRecommendation.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
              <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs font-black">
                <span className="rounded-full border border-orange-100 bg-orange-50 px-2.5 py-1 text-orange-700">{practiceRecommendation.metricLabel}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">{practiceRecommendation.stateLabel}</span>
              </div>
            </div>
          </div>

          {!isMobileCompact && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="grid min-w-0 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                {compactMetrics.map((metric) => {
                  const MetricIcon = metric.icon;
                  return (
                    <div key={metric.id} className="flex min-w-0 items-center gap-3 rounded-xl bg-white px-3 py-3">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600">
                        <MetricIcon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[11px] font-black text-slate-400">{metric.label}</span>
                        <span className="block truncate text-sm font-black text-slate-950">{metric.value}</span>
                        <span className="block truncate text-xs font-bold text-slate-500">{metric.helper}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </aside>
      </div>

      {!isMobileCompact && (preferenceSummary || primaryRecommendedBookTitle) && (
        <div className="mt-4 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0 text-sm font-bold text-slate-600">
            {preferenceSummary}
          </div>
          {primaryRecommendedBookTitle && onOpenRecommendedCourse && (
            <button
              type="button"
              onClick={onOpenRecommendedCourse}
              className="inline-flex min-h-10 min-w-0 items-center gap-2 rounded-xl border border-sky-100 bg-white px-3 py-2 text-left text-sm font-black text-slate-900 transition-colors hover:border-sky-200"
            >
              <BookOpenText className="h-4 w-4 shrink-0 text-sky-700" />
              <span className="truncate">
                {primaryRecommendedBookTitle}
                {primaryRecommendedBookWordCount ? ` / ${primaryRecommendedBookWordCount}語` : ''}
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
};

export default DashboardHeroSection;
