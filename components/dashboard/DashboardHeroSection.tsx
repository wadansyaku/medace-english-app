import React from 'react';
import { ArrowRight, Brain, Play, Settings } from 'lucide-react';
import type { LearningPlan, UserGrade } from '../../types';
import type { StudentDashboardHeroMetric, StudentDashboardLearningRouteId, StudentDashboardPracticeRecommendation } from '../../hooks/useStudentDashboardViewModel';

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
  primaryPracticeLane?: FocusedPracticeLane;
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

const DashboardHeroSection: React.FC<DashboardHeroSectionProps> = ({
  heroTitle, heroCopy, heroEyebrow = '今日やること', heroMetrics,
  hasStudyBooks, questButtonLabel, dueCount, todayCount, todayWordGoal, todayProgressPercent,
  primaryLearningRouteId, primaryPracticeLane, practiceRecommendation, practiceAnchorRef, practiceAnchorStyle,
  onOpenSettings, onStartQuest, onSelectPracticeLane,
}) => {
  const progress = Math.max(0, Math.min(100, Math.round(todayProgressPercent)));
  const isGrammarPrimary = primaryPracticeLane === 'grammar'
    || (primaryLearningRouteId === 'englishPractice' && practiceRecommendation.lane === 'grammar');
  const importantMetrics = (heroMetrics || []).filter(metric => metric.icon === 'mission' || metric.icon === 'writing' || metric.id.endsWith('-due'));
  return (
    <section data-testid="dashboard-command-center" className="study-focus-panel min-w-0 rounded-panel border border-medace-200 bg-white p-5 shadow-sm sm:p-7">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-medace-900">{heroEyebrow}</p>
        <button type="button" onClick={onOpenSettings} data-testid="student-hero-settings" aria-label="学習の設定を開く" className="flex min-h-11 min-w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-50"><Settings className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <h2 className="mt-2 text-2xl font-black leading-snug text-steady-ink sm:text-3xl">{heroTitle}</h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">{heroCopy}</p>
      {hasStudyBooks && (
        <div data-testid="dashboard-command-metrics" className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
          <span>今日 <strong className="text-steady-ink">{todayCount} / {todayWordGoal}語</strong></span>
          <span>期限が来た復習 <strong className="text-steady-ink">{dueCount}語</strong></span>
        </div>
      )}
      {importantMetrics.length > 0 && <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {importantMetrics.map(metric => <div key={metric.id} className="flex gap-2"><dt className="text-slate-600">{metric.label}</dt><dd className="font-bold text-steady-ink">{metric.value}{metric.id.endsWith('-due') && metric.helper === '期限超過' ? '（期限超過）' : ''}</dd></div>)}
      </dl>}
      <button type="button" onClick={onStartQuest} data-testid="student-hero-primary-cta" className="study-primary-action mt-5 inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-steady-action px-5 py-3.5 text-base font-bold text-steady-on-action hover:bg-steady-action-hover sm:w-auto">
        <Play className="h-4 w-4 fill-current" aria-hidden="true" /><span>{questButtonLabel}</span><ArrowRight className="h-4 w-4" aria-hidden="true" />
      </button>
      {hasStudyBooks && <div role="progressbar" aria-label="今日の学習目標" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`${todayWordGoal}語の目標に対して${todayCount}語、${progress}%`} className="mt-4 h-1.5 overflow-hidden rounded-full bg-medace-50"><div className="h-full rounded-full bg-medace-500" style={{width:`${progress}%`}} /></div>}
      <div ref={practiceAnchorRef} data-testid="dashboard-english-practice-entry" style={practiceAnchorStyle} className="mt-4">
        <div data-testid="dashboard-practice-dock">
          {!isGrammarPrimary && <button type="button" data-testid="dashboard-practice-lane-grammar" onClick={() => onSelectPracticeLane('grammar')} className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-steady-ink"><Brain className="h-4 w-4" aria-hidden="true" /> 文法を解く <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /></button>}
        </div>
      </div>
    </section>
  );
};

export default DashboardHeroSection;
