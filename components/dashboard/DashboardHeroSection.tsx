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
import { GRADE_LABELS, type LearningPlan, type UserGrade } from '../../types';
import type {
  StudentDashboardHeroMetric,
  StudentDashboardLearningRouteId,
  StudentDashboardPracticeRecommendation,
} from '../../hooks/useStudentDashboardViewModel';

type FocusedPracticeLane = 'grammar' | 'translation' | 'reading' | 'writing';

interface DashboardHeroSectionProps {
  grade: UserGrade;
  englishLevel?: string;
  heroTitle: string;
  heroCopy: string;
  heroEyebrow?: string;
  heroMetrics?: StudentDashboardHeroMetric[];
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

const HERO_METRIC_ICON: Record<StudentDashboardHeroMetric['icon'], LucideIcon> = {
  target: Target,
  check: CheckCircle2,
  clock: Clock3,
  mission: BookOpenText,
  writing: NotebookPen,
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const DashboardHeroSection: React.FC<DashboardHeroSectionProps> = ({
  grade,
  englishLevel,
  heroTitle,
  heroCopy,
  heroEyebrow = '今日やること',
  heroMetrics,
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
  const showTaskMetrics = hasStudyBooks || Boolean(heroMetrics?.some((metric) => metric.icon === 'mission' || metric.icon === 'writing'));
  const fallbackMetrics: StudentDashboardHeroMetric[] = [
    {
      id: 'remaining',
      label: '残り',
      value: `${remainingWords}語`,
      helper: remainingWords > 0 ? '今日進める' : '完了',
      icon: 'target',
    },
    {
      id: 'due',
      label: '復習',
      value: `${dueCount}語`,
      helper: dueCount > 0 ? '先に復習' : 'なし',
      icon: 'check',
    },
    {
      id: 'minutes',
      label: '時間',
      value: `${estimatedMinutes}分`,
      helper: '目安',
      icon: 'clock',
    },
  ];
  const compactMetrics = (heroMetrics && heroMetrics.length > 0 ? heroMetrics : fallbackMetrics).slice(0, 3);

  return (
    <section data-testid="dashboard-command-center" className="study-focus-panel min-w-0 overflow-hidden rounded-panel border border-medace-200 bg-white shadow-panel">
      <div className="flex items-center justify-between gap-3 border-b border-medace-100 px-5 py-4 sm:px-7">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-2 text-xs font-black tracking-wide text-medace-900"><span className="h-2 w-2 rounded-full bg-medace-500" />{heroEyebrow}</span>
          <span className="rounded-full bg-medace-50 px-2.5 py-1 text-[11px] font-bold text-steady-muted">{GRADE_LABELS[grade]} / {englishLevel || '未診断'}</span>
          {gameLeagueBadge && <span className={'rounded-full border px-2.5 py-1 text-[11px] font-bold ' + gameLeagueBadge.color}>{gameLeagueBadge.name}</span>}
        </div>
        <button type="button" onClick={onOpenSettings} data-testid="student-hero-settings" aria-label="学習の設定を開く" className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl border border-medace-100 bg-white text-steady-muted transition-colors hover:bg-medace-50"><Settings className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="grid min-w-0 gap-6 px-5 py-6 sm:px-7 sm:py-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-10">
        <div className="min-w-0">
          <p className="text-[11px] font-black tracking-[0.16em] text-medace-800">YOUR NEXT STEP</p>
          <h2 className="mt-3 text-[1.85rem] font-black leading-[1.28] tracking-tight text-steady-ink sm:text-4xl lg:text-[2.65rem]">{heroTitle}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-steady-muted sm:text-base">{heroCopy}</p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button type="button" onClick={onStartQuest} data-testid="student-hero-primary-cta" className="study-primary-action inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-ui bg-steady-action px-6 py-3.5 text-base font-black text-steady-on-action transition-colors hover:bg-steady-action-hover sm:w-auto">
              <Play className="h-4 w-4 fill-current" aria-hidden="true" /><span>{questButtonLabel}</span><ArrowRight className="ml-3 h-5 w-5" aria-hidden="true" />
            </button>
            {!isMobileCompact && hasStudyBooks && <button type="button" onClick={learningPlan ? onOpenPlan : onGeneratePlan} disabled={!learningPlan && generatingPlan} className="inline-flex min-h-11 items-center gap-2 rounded-ui px-3 py-2 text-sm font-bold text-steady-muted transition-colors hover:bg-medace-50 disabled:opacity-60"><BookOpenText className="h-4 w-4" aria-hidden="true" />{learningPlan ? '学習プラン' : generatingPlan ? 'プランを作成中…' : 'プランを作る'}</button>}
          </div>
          {showTaskMetrics && <div data-testid="dashboard-command-metrics" className="mt-6 grid min-w-0 grid-cols-3 gap-2 border-t border-medace-100 pt-5 sm:mt-8 sm:gap-4">
            {compactMetrics.map((metric) => {
              const Icon = HERO_METRIC_ICON[metric.icon] || Target;
              return <div key={metric.id} className="min-w-0"><div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold leading-relaxed text-steady-muted sm:text-xs"><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /><span>{metric.label}</span></div><p className="mt-1.5 break-words text-lg font-black text-steady-ink sm:text-2xl">{metric.value}</p><p className="mt-0.5 text-[10px] leading-relaxed text-steady-muted sm:text-xs">{metric.helper}</p></div>;
            })}
          </div>}
        </div>
        <aside className="grid min-w-0 content-start gap-3">
          {hasStudyBooks && <div className="rounded-card border border-medace-100 bg-medace-50 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-steady-muted">今日の積み上げ</p><p className="mt-2 text-3xl font-black tracking-tight text-steady-ink">{todayCount}<span className="ml-1.5 text-sm font-bold text-steady-muted">/ {todayWordGoal}語</span></p></div><span className="flex h-10 w-10 items-center justify-center rounded-full border border-medace-200 bg-white text-medace-800"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /></span></div>
            <div role="progressbar" aria-label="今日の学習目標" aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeProgressPercent} aria-valuetext={todayWordGoal + '語の目標に対して' + todayCount + '語、' + safeProgressPercent + '%'} className="mt-4 h-2.5 overflow-hidden rounded-full bg-medace-100"><div className="h-full rounded-full bg-medace-500 transition-[width]" style={{ width: safeProgressPercent + '%' }} /></div>
            <p className="mt-3 text-xs leading-relaxed text-steady-muted">{safeProgressPercent >= 100 ? '今日の目標達成。おつかれさまでした！' : todayCount > 0 ? '今日の一歩が、次の「わかる」に。' : 'まずは一語。小さな一歩から始めよう。'}</p>
          </div>}
          {(!isMobileCompact || isPracticePrimary) && <div ref={practiceAnchorRef} data-testid="dashboard-english-practice-entry" style={practiceAnchorStyle} className="rounded-card border border-medace-100 bg-white p-4 sm:p-5">
            <div data-testid="dashboard-practice-dock">
              <div className="flex items-start gap-3"><PracticeIcon className="mt-0.5 h-5 w-5 shrink-0 text-medace-800" aria-hidden="true" /><div className="min-w-0"><p className="text-[11px] font-bold text-steady-muted">単語から、使える英語へ</p><h3 className="mt-1 text-sm font-black text-steady-ink">{practiceRecommendation.title}</h3><p className="mt-2 text-xs leading-relaxed text-steady-muted">{practiceRecommendation.body}</p></div></div>
              {!isPracticePrimary && <button type="button" data-testid={'dashboard-practice-lane-' + practiceRecommendation.lane} onClick={() => onSelectPracticeLane(practiceRecommendation.lane)} className="mt-3 inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-xl bg-medace-50 px-3 py-2 text-xs font-black text-medace-900 transition-colors hover:bg-medace-100">{practiceRecommendation.ctaLabel}<ArrowRight className="h-4 w-4" aria-hidden="true" /></button>}
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] font-bold text-steady-muted"><span>{practiceRecommendation.metricLabel}</span><span>{practiceRecommendation.stateLabel}</span></div>
            </div>
          </div>}
        </aside>
      </div>
    </section>
  );
};

export default DashboardHeroSection;
