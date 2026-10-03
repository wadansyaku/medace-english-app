
import React from 'react';
import { BookOpen, ChevronDown, ChevronUp, LogOut, Zap } from 'lucide-react';
import { UserRole, UserProfile, UserStudyMode, type WorkspaceSectionDefinition } from '../types';
import { BRAND } from '../config/brand';
import getClientRuntimeFlags from '../config/runtime';
import { getHomeViewForUser, getWorkspaceNavLabel, getWorkspaceRoleLabel } from '../config/access';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { getDemoAccessWindowLabel, isDemoEmail } from '../utils/demo';
import useIsStandalone from '../hooks/useIsStandalone';
import useIsStudentMobileShell from '../hooks/useIsStudentMobileShell';
import useIsMobileViewport from '../hooks/useIsMobileViewport';

interface LayoutProps {
  children: React.ReactNode;
  user: UserProfile | null;
  onLogout: () => void;
  onResetDemo?: () => void;
  currentView: string;
  onChangeView: (view: string) => void;
  forceNoIndex?: boolean;
  workspaceSections?: WorkspaceSectionDefinition[];
  activeWorkspaceSection?: string;
  onSelectWorkspaceSection?: (section: string) => void;
  immersiveContent?: boolean;
}

export const getManagedRobotsContent = ({
  isPreviewDeployment,
  forceNoIndex,
}: {
  isPreviewDeployment: boolean;
  forceNoIndex: boolean;
}): string | null => (
  isPreviewDeployment || forceNoIndex
    ? 'noindex, nofollow, noarchive'
    : null
);

const Layout: React.FC<LayoutProps> = ({
  children,
  user,
  onLogout,
  onResetDemo,
  currentView,
  onChangeView,
  forceNoIndex = false,
  workspaceSections = [],
  activeWorkspaceSection,
  onSelectWorkspaceSection,
  immersiveContent = false,
}) => {
  // Calculate progress to next level (Level * 100 XP)
  const stats = user?.stats || { xp: 0, level: 1, currentStreak: 0 };
  const xpToNext = stats.level * 100;
  const progressPercent = Math.min(100, (stats.xp / xpToNext) * 100);
  const homeView = getHomeViewForUser(user);
  const navLabel = getWorkspaceNavLabel(user);
  const workspaceLabel = getWorkspaceRoleLabel(user);
  const isGameMode = (user?.studyMode || UserStudyMode.FOCUS) === UserStudyMode.GAME;
  const isDemoUser = isDemoEmail(user?.email);
  const isStandalone = useIsStandalone();
  const compactStudentShell = useIsStudentMobileShell(user);
  const compactHeader = useIsMobileViewport('(max-width: 767px), (max-height: 500px)') || compactStudentShell;
  const runtimeFlags = getClientRuntimeFlags();
  const isOnline = useNetworkStatus();
  const [showDemoBannerDetails, setShowDemoBannerDetails] = React.useState(!compactHeader);
  const showOfflineBlocker = runtimeFlags.appOnlineOnly && !isOnline;
  const isPreviewDeployment = runtimeFlags.deployment.isPagesPreviewHost;
  const isStudentPracticeView = user?.role === UserRole.STUDENT && currentView === 'englishPractice';

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.displayMode = isStandalone ? 'standalone' : 'browser';
    return () => {
      delete document.body.dataset.displayMode;
    };
  }, [isStandalone]);

  React.useEffect(() => {
    setShowDemoBannerDetails(!compactHeader);
  }, [compactHeader, user?.email]);

  React.useEffect(() => {
    if (typeof document === 'undefined') return;

    const managedMetaSelector = 'meta[data-runtime-managed="runtime-robots"]';
    const existing = document.head.querySelector<HTMLMetaElement>(managedMetaSelector);
    const robotsContent = getManagedRobotsContent({
      isPreviewDeployment,
      forceNoIndex,
    });

    if (!robotsContent) {
      existing?.remove();
      return;
    }

    const robotsMeta = existing || document.createElement('meta');
    robotsMeta.setAttribute('name', 'robots');
    robotsMeta.setAttribute('content', robotsContent);
    robotsMeta.setAttribute('data-runtime-managed', 'runtime-robots');
    if (!existing) {
      document.head.appendChild(robotsMeta);
    }

    return () => {
      const current = document.head.querySelector<HTMLMetaElement>(managedMetaSelector);
      current?.remove();
    };
  }, [forceNoIndex, isPreviewDeployment]);

  return (
    <div data-testid="app-shell" className="flex min-h-screen flex-col bg-steady-canvas font-sans">
      <a href="#study-main-content" className="skip-to-content">本文へ移動</a>
      {showOfflineBlocker && (
        <div
          data-testid="offline-blocking-banner"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/72 px-4"
        >
          <div className="max-w-lg rounded-panel border border-white/15 bg-slate-950 px-6 py-6 text-white shadow-2xl">
            <p className="text-xs font-black text-amber-300">ネットワーク接続を確認してください</p>
            <h2 className="mt-3 text-2xl font-black">オフラインでは操作を継続できません</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              学習記録を保存するにはインターネット接続が必要です。接続が戻ると、この画面から学習を続けられます。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center justify-center rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-900"
            >
              再読み込み
            </button>
          </div>
        </div>
      )}

      {isPreviewDeployment && (
        <div
          data-testid="preview-deployment-banner"
          className="border-b border-sky-300/80 bg-sky-100 px-4 py-3 text-sky-950"
        >
          <div className="mx-auto flex max-w-7xl items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-black text-sky-700">公開プレビュー環境</p>
              <p className="mt-1 text-sm font-semibold leading-relaxed">
                この URL は preview 環境です。検索対象にせず、動作確認と内部レビュー専用として扱ってください。
              </p>
            </div>
            <div className="rounded-lg border border-sky-400 bg-white px-3 py-1 text-xs font-black text-sky-700">
              noindex
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {!immersiveContent && (
      <header data-testid="app-sticky-header" className={`${compactStudentShell ? 'sticky top-0' : 'md:sticky md:top-0'} [@media(max-height:500px)]:static z-50 border-b border-medace-100 bg-white/95 backdrop-blur shadow-[0_4px_16px_rgba(102,50,26,0.035)] ${
        compactStudentShell ? 'safe-pad-top' : ''
      }`}>
        {isDemoUser && (
          <div className="border-b border-[#f3b80a]/40 bg-[#fff9df]">
            {compactHeader ? (
              <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-800">体験版アクセス</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      体験は <span className="font-black text-slate-950">{getDemoAccessWindowLabel()}</span> 限定です。
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="demo-banner-toggle"
                    aria-expanded={showDemoBannerDetails}
                    onClick={() => setShowDemoBannerDetails((previous) => !previous)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-xl border border-[#f3b80a]/70 bg-white px-3 py-2 text-xs font-black text-slate-800 transition-colors hover:bg-[#fff7d4]"
                  >
                    {showDemoBannerDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showDemoBannerDetails ? '閉じる' : '詳細'}
                  </button>
                </div>
                {showDemoBannerDetails && (
                  <div className="mt-3 rounded-xl border border-[#f3b80a]/45 bg-white/80 px-4 py-3 text-sm leading-relaxed text-slate-700">
                    別端末では別の体験セッションが作成され、一定時間後に自動でリセットされます。
                    {onResetDemo && (
                      <button
                        type="button"
                        onClick={onResetDemo}
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-[#f3b80a]/70 bg-white px-4 py-2.5 text-sm font-black text-slate-800 transition-colors hover:bg-[#fff7d4]"
                      >
                        新しい体験を開始
                      </button>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs font-black text-slate-800">体験版アクセス</p>
                  <p className="mt-1 text-[0.95rem] font-medium leading-relaxed text-slate-700">
                    体験用アカウントは <span className="font-black text-slate-950">{getDemoAccessWindowLabel()} 限定</span> です。別端末では別の体験セッションが作成され、一定時間後に自動でリセットされます。
                  </p>
                </div>
                {onResetDemo && (
                  <button
                    type="button"
                    onClick={onResetDemo}
                    className="inline-flex items-center justify-center rounded-xl border border-[#f3b80a]/70 bg-white px-5 py-2.5 text-[0.95rem] font-black text-slate-800 transition-colors hover:bg-[#fff7d4]"
                  >
                    新しい体験を開始
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-3 ${
          compactHeader ? 'min-h-[66px] py-1' : 'min-h-[80px] py-2'
        }`}>
          <button
            type="button"
            className="flex min-h-11 items-center gap-3 rounded-xl text-left transition-colors hover:bg-medace-50 focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-medace-200"
            onClick={() => onChangeView(homeView)}
            aria-label={`${BRAND.officialName} ホームへ戻る`}
          >
            <div className={`border border-medace-200 bg-medace-50 shadow-sm ${compactHeader ? 'rounded-xl p-2.5' : 'rounded-xl p-3'}`}>
              <BookOpen className={`text-medace-700 ${compactHeader ? 'h-5 w-5' : 'w-6 h-6'}`} />
            </div>
            <div className="block">
              <h1 className={`font-black tracking-tight text-medace-900 ${compactHeader ? 'text-[1.02rem]' : 'text-[1.35rem]'}`}>
                {BRAND.officialName}
              </h1>
              <p className={`font-bold tracking-[0.14em] text-steady-muted ${compactHeader ? 'text-[10px]' : 'text-xs'}`}>
                {BRAND.productLabel}
              </p>
            </div>
          </button>

          {user && (
            <div className={`flex items-center flex-1 justify-end ${compactHeader ? 'gap-2' : 'gap-4'}`}>
              
              {/* Gamification HUD */}
              {user.role === UserRole.STUDENT && isGameMode && !compactHeader && (
                  <div className="flex items-center gap-3 rounded-xl border border-medace-200 bg-white/90 px-4 py-2.5 shadow-sm md:gap-6">
                      {/* Streak */}
                      <div className="flex items-center gap-1.5" title={`${stats.currentStreak}日連続学習中！`}>
                          <Zap className={`w-4 h-4 ${stats.currentStreak > 0 ? 'text-[#f3b80a] fill-[#f3b80a]' : 'text-slate-300'}`} />
                          <span className={`text-sm font-bold ${stats.currentStreak > 0 ? 'text-slate-800' : 'text-slate-500'}`}>
                              {stats.currentStreak}
                          </span>
                      </div>

                      {/* Divider */}
                      <div className="h-4 w-px bg-medace-100"></div>

                      {/* Level & XP */}
                      <div className="flex items-center gap-2">
                          <div className="flex h-6 w-6 items-center justify-center rounded-lg border border-medace-200 bg-medace-50 text-xs font-bold text-medace-700">
                              {stats.level}
                          </div>
                          <div className="flex flex-col w-20 md:w-32">
                              <div className="mb-0.5 flex justify-between text-[10px] font-bold text-slate-500">
                                  <span>LVL {stats.level}</span>
                                  <span>{stats.xp}/{xpToNext}</span>
                              </div>
                              <div className="h-1.5 overflow-hidden rounded-full bg-medace-100">
                                  <div 
                                      className="h-full rounded-full bg-medace-500 transition-all duration-1000 ease-out"
                                      style={{ width: `${progressPercent}%` }}
                                  ></div>
                              </div>
                          </div>
                      </div>
                  </div>
              )}

              <nav className="hidden md:flex gap-1">
                <button 
                  onClick={() => onChangeView(homeView)}
                  data-testid="layout-nav-home"
                  aria-current={currentView === homeView ? 'page' : undefined}
                  className={`rounded-xl px-4 py-3 text-[0.95rem] font-bold transition-colors ${
                    currentView === homeView
                      ? 'bg-medace-50 text-medace-950'
                      : 'text-slate-700 hover:bg-medace-50 hover:text-medace-700'
                  }`}
                >
                  {navLabel}
                </button>
                {isStudentPracticeView && (
                  <span
                    data-testid="layout-nav-english-practice-current"
                    aria-current="page"
                    className="rounded-xl bg-medace-50 px-4 py-3 text-[0.95rem] font-bold text-medace-950"
                  >
                    英語演習
                  </span>
                )}
              </nav>

              <div className="flex items-center gap-2">
                <div className={`text-right ${compactHeader ? 'hidden' : 'hidden lg:block'}`}>
                  <p className="text-[0.95rem] font-bold text-slate-900">{user.displayName}</p>
                  <p className="text-xs font-bold tracking-[0.12em] uppercase text-slate-500">{workspaceLabel}</p>
                </div>
                <button 
                  onClick={onLogout}
                  aria-label="ログアウト"
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-transparent text-slate-500 transition-colors hover:border-red-100 hover:bg-red-50 hover:text-red-500 ${
                    compactHeader ? 'p-2.5' : 'p-3'
                  }`}
                  title="ログアウト"
                >
                  <LogOut className={compactHeader ? 'h-[18px] w-[18px]' : 'w-5 h-5'} />
                </button>
              </div>
            </div>
          )}
        </div>
        {user && workspaceSections.length > 0 && onSelectWorkspaceSection && activeWorkspaceSection && (
          <div className="border-t border-medace-200 bg-white/90 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-2 sm:py-3 sm:px-6 lg:px-8">
              {workspaceSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSelectWorkspaceSection(section.id)}
                  onFocus={(event) => {
                    const item = event.currentTarget;
                    const scroller = item.parentElement;
                    if (!scroller) return;
                    const itemBounds = item.getBoundingClientRect();
                    const scrollBounds = scroller.getBoundingClientRect();
                    const focusInset = 8;
                    const delta = itemBounds.left < scrollBounds.left + focusInset
                      ? itemBounds.left - scrollBounds.left - focusInset
                      : itemBounds.right > scrollBounds.right - focusInset
                        ? itemBounds.right - scrollBounds.right + focusInset
                        : 0;
                    if (delta) scroller.scrollBy({ left: delta, behavior: 'auto' });
                  }}
                  data-testid={`workspace-tab-${section.id.toLowerCase()}`}
                  aria-current={activeWorkspaceSection === section.id ? 'page' : undefined}
                  className={`relative min-h-11 shrink-0 rounded-xl border px-4 py-2 sm:py-3 text-left transition-colors ${
                    activeWorkspaceSection === section.id
                      ? 'border-medace-200 bg-medace-50 text-medace-950'
                      : 'border-medace-100 bg-white text-slate-600 hover:border-medace-300 hover:text-medace-700'
                  }`}
                >
                  <div className="text-sm font-bold">{section.label}</div>
                  {section.description && (
                    <div className={`sr-only md:not-sr-only md:mt-1 text-xs leading-relaxed ${activeWorkspaceSection === section.id ? 'text-medace-900' : 'text-slate-500'}`}>
                      {section.description}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
      )}

      {/* Main Content */}
      <main id="study-main-content" tabIndex={-1} className={immersiveContent
        ? 'flex-grow'
        : `flex-grow w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${compactStudentShell ? 'py-4 sm:py-8' : 'py-8 lg:py-10'}`
      }>
        {children}
      </main>

      {/* Footer */}
      {!immersiveContent && (
      <footer className={`mt-auto border-t border-medace-200 bg-white/85 backdrop-blur ${
        compactStudentShell ? 'safe-pad-bottom py-2' : 'py-6'
      }`}>
        {compactStudentShell ? (
          <div className="mx-auto max-w-7xl px-4 text-center text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            {BRAND.productLabel}
          </div>
        ) : (
          <div className="mx-auto max-w-7xl px-4 text-center text-[0.95rem] font-medium text-slate-500">
            &copy; {new Date().getFullYear()} {BRAND.footerLabel}.
          </div>
        )}
      </footer>
      )}
    </div>
  );
};

export default Layout;
