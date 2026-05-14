import React from 'react';
import {
  ArrowRight,
  BookOpenText,
  Brain,
  CheckCircle2,
  Circle,
  Flag,
  Languages,
  LibraryBig,
  NotebookPen,
  Play,
  Route,
  Settings,
  Sparkles,
  Target,
  Trophy,
  type LucideIcon,
} from 'lucide-react';
import { BRAND } from '../../config/brand';
import { GRADE_LABELS, type LearningPlan, type UserGrade } from '../../types';
import type {
  StudentDashboardLearningRouteCard,
  StudentDashboardLearningRouteId,
  StudentDashboardPracticeRecommendation,
} from '../../hooks/useStudentDashboardViewModel';
import ResponsiveMetricRail from '../mobile/ResponsiveMetricRail';
import LearningSessionRibbon, { type LearningSessionRibbonItem } from './LearningSessionRibbon';

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
  learningRouteCards: StudentDashboardLearningRouteCard[];
  primaryLearningRouteId: StudentDashboardLearningRouteId;
  practiceRecommendation: StudentDashboardPracticeRecommendation;
  gameLeagueBadge?: { name: string; color: string };
  isMobileCompact?: boolean;
  practiceAnchorRef?: React.RefObject<HTMLDivElement | null>;
  practiceAnchorStyle?: React.CSSProperties;
  onOpenSettings: () => void;
  onOpenRecommendedCourse?: () => void;
  onStartQuest: () => void;
  onSelectLearningRoute: (routeId: StudentDashboardLearningRouteId) => void;
  onSelectPracticeLane: (lane: FocusedPracticeLane) => void;
  onOpenPlan: () => void;
  onGeneratePlan: () => void;
}

const LEARNING_ROUTE_ICON: Record<StudentDashboardLearningRouteId, LucideIcon> = {
  today: Play,
  mission: Flag,
  weakness: Target,
  englishPractice: Brain,
  writing: NotebookPen,
};

const LEARNING_ROUTE_TONE: Record<StudentDashboardLearningRouteCard['tone'], string> = {
  primary: 'border-medace-200 bg-medace-50 text-medace-800',
  mission: 'border-sky-200 bg-sky-50 text-sky-800',
  weakness: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  practice: 'border-orange-200 bg-orange-50 text-orange-800',
  writing: 'border-violet-200 bg-violet-50 text-violet-800',
};

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
  learningRouteCards,
  primaryLearningRouteId,
  practiceRecommendation,
  gameLeagueBadge,
  isMobileCompact = false,
  practiceAnchorRef,
  practiceAnchorStyle,
  onOpenSettings,
  onOpenRecommendedCourse,
  onStartQuest,
  onSelectLearningRoute,
  onSelectPracticeLane,
  onOpenPlan,
  onGeneratePlan,
}) => {
  const PracticeIcon = PRACTICE_LANE_ICON[practiceRecommendation.lane] || Brain;
  const safeProgressPercent = clampPercent(todayProgressPercent);
  const secondaryRoutes = learningRouteCards
    .filter((card) => !card.isPrimary && card.id !== 'englishPractice')
    .slice(0, 4);
  const primaryRoute = learningRouteCards.find((card) => card.id === primaryLearningRouteId) || null;
  const isPracticePrimary = primaryLearningRouteId === 'englishPractice';
  const sessionRibbonItems: LearningSessionRibbonItem[] = [
    {
      id: 'review',
      kind: 'review',
      label: '復習',
      value: `${dueCount}語`,
      helper: '先に軽く確認',
      active: dueCount > 0,
    },
    {
      id: 'practice',
      kind: 'weakness',
      label: '演習',
      value: practiceRecommendation.stateLabel,
      helper: practiceRecommendation.ctaLabel,
      active: true,
    },
    {
      id: 'mission',
      kind: 'mission',
      label: 'ミッション',
      value: primaryRoute?.id === 'mission' ? '優先' : '確認',
      helper: primaryRoute?.title || '必要なときだけ',
    },
    {
      id: 'record',
      kind: 'streak',
      label: '記録',
      value: `${todayCount}語`,
      helper: '今日の積み上げ',
      active: safeProgressPercent >= 100,
    },
  ];
  const routeSteps = [
    {
      id: 'start',
      label: '1. 始める',
      title: heroTitle,
      helper: heroCopy,
      icon: Play,
      state: 'current' as const,
    },
    {
      id: 'practice',
      label: '2. 仕上げる',
      title: practiceRecommendation.ctaLabel,
      helper: practiceRecommendation.body,
      icon: PracticeIcon,
      state: primaryLearningRouteId === 'englishPractice' ? 'current' as const : 'ready' as const,
    },
    {
      id: 'record',
      label: '3. 記録',
      title: `${todayCount} / ${todayWordGoal}語`,
      helper: safeProgressPercent >= 100 ? '今日はここまでで十分です。' : '終わった分だけ記録に残ります。',
      icon: Trophy,
      state: safeProgressPercent >= 100 ? 'done' as const : 'ready' as const,
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

      <div className={`grid min-w-0 gap-4 ${isMobileCompact ? 'mt-4' : 'mt-5 xl:grid-cols-[minmax(0,1.08fr)_minmax(300px,0.58fr)]'}`}>
        <div className="min-w-0 rounded-2xl bg-medace-600 p-4 text-white sm:p-5 md:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-lg bg-white/12 px-3 py-1.5 text-xs font-black text-white/88">
              <Route className="h-4 w-4" />
              今日のルート
            </span>
            <span className="rounded-lg border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-bold text-white/76">
              今日やることは 1 つだけ
            </span>
            {primaryRoute && (
              <span className="rounded-lg border border-white/10 bg-white/8 px-3 py-1.5 text-xs font-bold text-white/76">
                {primaryRoute.title}
              </span>
            )}
          </div>
          <div className={`mt-4 grid min-w-0 gap-4 ${isMobileCompact ? '' : 'lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.76fr)] lg:items-end'}`}>
            <div className="min-w-0">
              <h2 className={`font-black leading-tight tracking-tight ${isMobileCompact ? 'text-[1.85rem]' : 'text-4xl md:text-5xl'}`}>
                {hasStudyBooks ? '今日のクエストを開始' : '最初の教材を作る'}
              </h2>
              <p className={`mt-2 font-black leading-snug text-white ${isMobileCompact ? 'text-xl' : 'text-2xl'}`}>
                {heroTitle}
              </p>
              <p className={`mt-3 max-w-2xl leading-relaxed text-white/76 ${isMobileCompact ? 'line-clamp-2 text-sm' : 'text-base'}`}>
                {heroCopy}
              </p>
              <div className={`flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap ${isMobileCompact ? 'mt-4' : 'mt-5'}`}>
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
            </div>

            <div
              ref={practiceAnchorRef}
              data-testid="dashboard-english-practice-entry"
              style={practiceAnchorStyle}
              className="min-w-0 rounded-2xl border border-white/12 bg-white p-4 text-slate-950 shadow-[0_12px_30px_rgba(15,23,42,0.12)]"
            >
              <div data-testid="dashboard-practice-dock" className="min-w-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-medace-600">2. 仕上げる</p>
                    <h3 className="mt-1 text-lg font-black leading-tight text-slate-950">{practiceRecommendation.title}</h3>
                    <p className="mt-2 line-clamp-2 text-sm font-bold leading-relaxed text-slate-600">{practiceRecommendation.body}</p>
                  </div>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700">
                    <PracticeIcon className="h-5 w-5" />
                  </span>
                </div>
                {isPracticePrimary ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm font-black text-slate-700">
                    上のボタンからこの演習を開始します。
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
          </div>
        </div>

        {!isMobileCompact && (
        <div className="grid min-w-0 gap-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-black text-slate-900">今日の進み具合</div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-500">{safeProgressPercent}%</span>
            </div>
            <div className="mt-4">
              <ResponsiveMetricRail
                items={[
                  { id: 'remaining', label: '残り', value: `${remainingWords}`, helper: '語' },
                  { id: 'due', label: '復習待ち', value: `${dueCount}`, helper: '語' },
                  { id: 'minutes', label: '目安時間', value: `${estimatedMinutes}`, helper: '分' },
                ]}
              />
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${safeProgressPercent}%` }} />
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="text-xs font-black text-slate-500">学習の個別設定</div>
            <div className="mt-2 line-clamp-3 text-sm font-bold leading-relaxed text-slate-700">{preferenceSummary}</div>
            {primaryRecommendedBookTitle && onOpenRecommendedCourse && (
              <button
                type="button"
                onClick={onOpenRecommendedCourse}
                className="mt-3 flex w-full min-w-0 items-center justify-between gap-3 rounded-xl border border-sky-100 bg-sky-50 px-3 py-3 text-left transition-colors hover:border-sky-200"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-black text-slate-950">{primaryRecommendedBookTitle}</span>
                  <span className="mt-0.5 block text-xs font-bold text-sky-700">
                    {primaryRecommendedBookWordCount ? `${primaryRecommendedBookWordCount}語` : '今日の学習に使えます'}
                  </span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-sky-700" />
              </button>
            )}
          </div>
        </div>
        )}
      </div>

      {!isMobileCompact && (
      <div className="mt-4 grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.42fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-black text-slate-950">今日のルート</h3>
            <span className="text-xs font-bold text-slate-400">始める → 仕上げる → 記録</span>
          </div>
          <div className={`mt-4 grid gap-3 ${isMobileCompact ? '' : 'md:grid-cols-3'}`}>
            {routeSteps.map((step) => {
              const StepIcon = step.state === 'done' ? CheckCircle2 : step.state === 'current' ? step.icon : Circle;
              return (
                <article
                  key={step.id}
                  className={`min-w-0 rounded-2xl border px-4 py-3 ${
                    step.state === 'current'
                      ? 'border-medace-200 bg-medace-50'
                      : step.state === 'done'
                        ? 'border-emerald-200 bg-emerald-50'
                        : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                      step.state === 'current' ? 'bg-medace-600 text-white' : step.state === 'done' ? 'bg-emerald-600 text-white' : 'bg-white text-slate-400'
                    }`}>
                      <StepIcon className={`h-4 w-4 ${step.state === 'current' ? 'fill-current' : ''}`} />
                    </span>
                    <div className="text-sm font-black text-slate-950">{step.label}</div>
                  </div>
                  <div className="mt-3 truncate text-sm font-black text-slate-900">{step.title}</div>
                  <p className="mt-1 line-clamp-2 text-xs font-bold leading-relaxed text-slate-500">{step.helper}</p>
                </article>
              );
            })}
          </div>
        </div>

        <section
          data-testid="dashboard-learning-launch-panel"
          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-black text-slate-950">必要なら切り替え</div>
            <div className="text-[11px] font-bold text-slate-400">迷ったら上の1つだけ</div>
          </div>
          <div className="mt-3 grid min-w-0 gap-2">
            {secondaryRoutes.map((card) => {
              const Icon = LEARNING_ROUTE_ICON[card.id];
              return (
                <div key={card.id} data-testid={`dashboard-learning-route-${card.id}`} className="min-w-0">
                  <button
                    type="button"
                    data-testid={`dashboard-learning-route-${card.id}-cta`}
                    onClick={() => onSelectLearningRoute(card.id)}
                    className="flex min-h-14 w-full min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-slate-300 hover:bg-slate-50"
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${LEARNING_ROUTE_TONE[card.tone]}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-black text-slate-900">{card.title}</span>
                      <span className="block truncate text-xs font-bold text-slate-500">{card.ctaLabel}</span>
                    </span>
                  </button>
                </div>
              );
            })}
            {secondaryRoutes.length === 0 && (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-500">
                今日は上のボタンだけで進められます。
              </div>
            )}
          </div>
        </section>
      </div>
      )}

      {!isMobileCompact && (
      <div className="mt-4">
        <LearningSessionRibbon
          title="今日の材料"
          items={sessionRibbonItems}
          isCompact={isMobileCompact}
        />
      </div>
      )}
    </section>
  );
};

export default DashboardHeroSection;
