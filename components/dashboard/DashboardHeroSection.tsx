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
      helper: remainingWords > 0 ? '今日の目安' : '完了',
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

  return (
    <section
      data-testid="dashboard-command-center"
      className={`min-w-0 rounded-lg border border-slate-200 bg-white text-slate-950 shadow-[0_18px_48px_rgba(15,23,42,0.07)] ${
        isMobileCompact ? 'p-4' : 'p-5 md:p-6'
      }`}
    >
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className={`rounded-md border border-medace-100 bg-medace-50 font-black text-medace-700 ${
            isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
          }`}>
            {BRAND.productLabel}
          </span>
          <span className={`rounded-md border border-slate-200 bg-slate-50 font-bold text-slate-600 ${
            isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
          }`}>
            {GRADE_LABELS[grade]} / {englishLevel || '未診断'}
          </span>
          {gameLeagueBadge && (
            <span className={`rounded-md border font-bold ${gameLeagueBadge.color} ${
              isMobileCompact ? 'px-2.5 py-1 text-[10px]' : 'px-3 py-1.5 text-xs'
            }`}>
              {gameLeagueBadge.name}
            </span>
          )}
        </div>
        <button
          onClick={onOpenSettings}
          data-testid="student-hero-settings"
          className={`flex items-center gap-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 ${
            isMobileCompact ? 'px-3 py-2 text-xs' : 'px-4 py-2 text-sm'
          }`}
        >
          <Settings className="h-4 w-4" /> {isMobileCompact ? '設定' : '設定'}
        </button>
      </div>

      <div className={`grid min-w-0 gap-5 ${isMobileCompact ? 'mt-4' : 'mt-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,0.34fr)] xl:items-start'}`}>
        <div className="min-w-0">
          <div className="min-w-0 border-l-4 border-[#f3b80a] pl-4">
            <p className="text-xs font-black text-medace-700">今日はこれだけ</p>
            <h2 className={`mt-2 font-black leading-tight text-slate-950 ${isMobileCompact ? 'text-[2rem]' : 'text-4xl md:text-5xl'}`}>
              {hasStudyBooks ? heroTitle : '最初の教材を作る'}
            </h2>
            {hasStudyBooks && (
              <p className={`mt-2 font-black leading-snug text-medace-700 ${isMobileCompact ? 'text-lg' : 'text-2xl'}`}>
                {questButtonLabel}
              </p>
            )}
            <p className={`mt-3 max-w-2xl leading-relaxed text-slate-600 ${isMobileCompact ? 'line-clamp-2 text-sm' : 'text-base'}`}>
              {heroCopy}
            </p>
          </div>

          <div className="mt-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap">
            <button
              onClick={onStartQuest}
              data-testid="student-hero-primary-cta"
              className={`inline-flex w-full items-center justify-center gap-2 rounded-lg bg-medace-700 font-black text-white transition-colors hover:bg-medace-800 sm:w-auto ${
                isMobileCompact ? 'min-h-12 px-4 py-3 text-sm' : 'px-6 py-3.5 text-base'
              }`}
            >
              <Play className="h-4 w-4 fill-current" /> {questButtonLabel}
            </button>
            {hasStudyBooks && learningPlan ? (
              <button
                onClick={onOpenPlan}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700 sm:w-auto ${
                  isMobileCompact ? 'min-h-12 px-4 py-3 text-sm' : 'px-5 py-3 text-sm'
                }`}
              >
                <BookOpenText className="h-4 w-4" /> プラン
              </button>
            ) : hasStudyBooks ? (
              <button
                onClick={onGeneratePlan}
                disabled={generatingPlan}
                className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700 disabled:opacity-50 sm:w-auto ${
                  isMobileCompact ? 'min-h-12 px-4 py-3 text-sm' : 'px-5 py-3 text-sm'
                }`}
              >
                プランを作る
              </button>
            ) : null}
          </div>

          <div data-testid="dashboard-command-metrics" className={`mt-5 grid min-w-0 gap-2 ${isMobileCompact ? 'grid-cols-3' : 'sm:grid-cols-3'}`}>
            {compactMetrics.map((metric) => {
              const MetricIcon = metric.icon;
              return (
                <div key={metric.id} className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="flex items-center gap-2 text-[11px] font-black text-slate-500">
                    <MetricIcon className="h-3.5 w-3.5" />
                    <span>{metric.label}</span>
                  </div>
                  <div className="mt-1 truncate text-base font-black text-slate-950">{metric.value}</div>
                  <div className="truncate text-xs font-bold text-slate-500">{metric.helper}</div>
                </div>
              );
            })}
          </div>
        </div>

        <aside className="grid min-w-0 gap-3">
          <div className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs font-black text-slate-500">今日の進み具合</div>
                <div className="mt-1 text-3xl font-black text-slate-950">{safeProgressPercent}%</div>
              </div>
              <div className="text-right text-xs font-bold text-slate-500">
                {todayCount} / {todayWordGoal}語
              </div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
              <div className="h-full rounded-full bg-[#e02323]" style={{ width: `${safeProgressPercent}%` }} />
            </div>
          </div>

          <div
            ref={practiceAnchorRef}
            data-testid="dashboard-english-practice-entry"
            style={practiceAnchorStyle}
            className="min-w-0 rounded-lg border border-slate-200 bg-white p-4 text-slate-950"
          >
            <div data-testid="dashboard-practice-dock" className="min-w-0">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-medace-100 bg-medace-50 text-medace-700">
                  <PracticeIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-500">英語演習</p>
                  <h3 className="mt-1 text-base font-black leading-tight text-slate-950">{practiceRecommendation.title}</h3>
                  <p className="mt-1 line-clamp-2 text-sm font-bold leading-relaxed text-slate-600">{practiceRecommendation.body}</p>
                </div>
              </div>
              {!isPracticePrimary && (
                <button
                  type="button"
                  data-testid={`dashboard-practice-lane-${practiceRecommendation.lane}`}
                  onClick={() => onSelectPracticeLane(practiceRecommendation.lane)}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-800 transition-colors hover:border-medace-200 hover:text-medace-700"
                >
                  {practiceRecommendation.ctaLabel}
                  <ArrowRight className="h-4 w-4" />
                </button>
              )}
              <div className="mt-3 flex min-w-0 flex-wrap gap-2 text-xs font-black">
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-700">{practiceRecommendation.metricLabel}</span>
                <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">{practiceRecommendation.stateLabel}</span>
              </div>
            </div>
          </div>

          {!isMobileCompact && (preferenceSummary || primaryRecommendedBookTitle) && (
            <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-4">
              <div className="text-xs font-black text-slate-500">学習条件</div>
              <div className="mt-1 line-clamp-2 text-sm font-bold leading-relaxed text-slate-600">
                {preferenceSummary}
              </div>
              {primaryRecommendedBookTitle && onOpenRecommendedCourse && (
                <button
                  type="button"
                  onClick={onOpenRecommendedCourse}
                  className="mt-3 inline-flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-black text-slate-900 transition-colors hover:border-medace-200"
                >
                  <BookOpenText className="h-4 w-4 shrink-0 text-medace-700" />
                  <span className="truncate">
                    {primaryRecommendedBookTitle}
                    {primaryRecommendedBookWordCount ? ` / ${primaryRecommendedBookWordCount}語` : ''}
                  </span>
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
};

export default DashboardHeroSection;
