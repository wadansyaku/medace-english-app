import React from 'react';

type DashboardQuickNavKind = 'today' | 'englishPractice' | 'weakness' | 'mission' | 'writing' | 'coach' | 'plan' | 'library';

interface DashboardQuickNavItem {
  id: string;
  label: string;
  kind: DashboardQuickNavKind;
  ref: React.RefObject<HTMLDivElement | null>;
}

interface UseDashboardSectionNavigationParams {
  isStudentMobileShell: boolean;
  hasPrimaryMission: boolean;
  hasActionableWriting: boolean;
  canShowWritingSection: boolean;
  hasCoachNotification: boolean;
}

export const useDashboardSectionNavigation = ({
  isStudentMobileShell,
  hasPrimaryMission,
  hasActionableWriting,
  canShowWritingSection,
  hasCoachNotification,
}: UseDashboardSectionNavigationParams) => {
  const heroSectionRef = React.useRef<HTMLDivElement | null>(null);
  const englishPracticeSectionRef = React.useRef<HTMLDivElement | null>(null);
  const weaknessSectionRef = React.useRef<HTMLDivElement | null>(null);
  const missionSectionRef = React.useRef<HTMLDivElement | null>(null);
  const writingSectionRef = React.useRef<HTMLDivElement | null>(null);
  const coachSectionRef = React.useRef<HTMLDivElement | null>(null);
  const planSectionRef = React.useRef<HTMLDivElement | null>(null);
  const librarySectionRef = React.useRef<HTMLDivElement | null>(null);
  const [activeQuickNavId, setActiveQuickNavId] = React.useState('today');

  const missionQuickNavTarget = React.useMemo<DashboardQuickNavItem | null>(() => (
    hasPrimaryMission
      ? { id: 'mission', label: '課題', kind: 'mission', ref: missionSectionRef }
      : null
  ), [hasPrimaryMission]);

  const writingQuickNavTarget = React.useMemo<DashboardQuickNavItem | null>(() => (
    canShowWritingSection
      ? {
          id: 'writing',
          label: hasActionableWriting ? '提出' : '作文',
          kind: 'writing',
          ref: writingSectionRef,
        }
      : null
  ), [canShowWritingSection, hasActionableWriting]);

  const fallbackQuickNavTarget = React.useMemo<DashboardQuickNavItem | null>(() => (
    !hasPrimaryMission && !canShowWritingSection
      ? hasCoachNotification
        ? { id: 'coach', label: '講師', kind: 'coach', ref: coachSectionRef }
        : { id: 'plan', label: 'プラン', kind: 'plan', ref: planSectionRef }
      : null
  ), [canShowWritingSection, hasCoachNotification, hasPrimaryMission]);

  const mobileQuickNavItems = React.useMemo<DashboardQuickNavItem[]>(() => ([
    { id: 'today', label: '今日', kind: 'today', ref: heroSectionRef },
    { id: 'english-practice', label: '演習', kind: 'englishPractice', ref: englishPracticeSectionRef },
    ...(missionQuickNavTarget ? [missionQuickNavTarget] : []),
    { id: 'weakness', label: '弱点', kind: 'weakness', ref: weaknessSectionRef },
    ...(writingQuickNavTarget ? [writingQuickNavTarget] : []),
    ...(fallbackQuickNavTarget ? [fallbackQuickNavTarget] : []),
    { id: 'library', label: '教材', kind: 'library', ref: librarySectionRef },
  ]), [fallbackQuickNavTarget, missionQuickNavTarget, writingQuickNavTarget]);

  const scrollToSection = React.useCallback((ref: React.RefObject<HTMLDivElement | null>) => {
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  React.useEffect(() => {
    if (!isStudentMobileShell || typeof window === 'undefined') return undefined;

    const updateActiveQuickNav = () => {
      const threshold = 132;
      let nextActiveId = mobileQuickNavItems[0]?.id || 'today';

      mobileQuickNavItems.forEach((item) => {
        const top = item.ref.current?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY;
        if (top <= threshold) {
          nextActiveId = item.id;
        }
      });

      setActiveQuickNavId((previous) => (previous === nextActiveId ? previous : nextActiveId));
    };

    updateActiveQuickNav();
    window.addEventListener('scroll', updateActiveQuickNav, { passive: true });
    window.addEventListener('resize', updateActiveQuickNav);
    return () => {
      window.removeEventListener('scroll', updateActiveQuickNav);
      window.removeEventListener('resize', updateActiveQuickNav);
    };
  }, [isStudentMobileShell, mobileQuickNavItems]);

  return {
    heroSectionRef,
    englishPracticeSectionRef,
    weaknessSectionRef,
    missionSectionRef,
    writingSectionRef,
    coachSectionRef,
    planSectionRef,
    librarySectionRef,
    activeQuickNavId,
    mobileQuickNavItems,
    scrollToSection,
    mobileAnchorStyle: isStudentMobileShell
      ? { scrollMarginTop: 'calc(5.5rem + var(--safe-top))' }
      : undefined,
  };
};

export default useDashboardSectionNavigation;
