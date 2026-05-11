
import React from 'react';
import { BookOpen, ChevronDown, ChevronUp, Languages, LogOut, Zap } from 'lucide-react';
import { UserRole, UserProfile, UserStudyMode, type WorkspaceSectionDefinition } from '../types';
import { BRAND } from '../config/brand';
import getClientRuntimeFlags from '../config/runtime';
import { getHomeViewForUser, getWorkspaceNavLabel, getWorkspaceRoleLabel } from '../config/access';
import useNetworkStatus from '../hooks/useNetworkStatus';
import { getDemoAccessWindowLabel, isDemoEmail } from '../utils/demo';
import useIsStandalone from '../hooks/useIsStandalone';
import useIsStudentMobileShell from '../hooks/useIsStudentMobileShell';

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
  const runtimeFlags = getClientRuntimeFlags();
  const isOnline = useNetworkStatus();
  const [showDemoBannerDetails, setShowDemoBannerDetails] = React.useState(!compactStudentShell);
  const showOfflineBlocker = runtimeFlags.appOnlineOnly && !isOnline;
  const isPreviewDeployment = runtimeFlags.deployment.isPagesPreviewHost;
  const usePracticeWorkspaceShell = Boolean(user?.role === UserRole.STUDENT && currentView === 'englishPractice');

  React.useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.displayMode = isStandalone ? 'standalone' : 'browser';
    return () => {
      delete document.body.dataset.displayMode;
    };
  }, [isStandalone]);

  React.useEffect(() => {
    setShowDemoBannerDetails(!compactStudentShell);
  }, [compactStudentShell, user?.email]);

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
    <div className="min-h-screen bg-medace-50/40 flex flex-col font-sans">
      {showOfflineBlocker && (
        <div
          data-testid="offline-blocking-banner"
          className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/72 px-4"
        >
          <div className="max-w-lg rounded-[28px] border border-white/15 bg-slate-950 px-6 py-6 text-white shadow-2xl">
            <p className="text-xs font-black text-amber-300">オンライン専用テスト</p>
            <h2 className="mt-3 text-2xl font-black">オフラインでは操作を継続できません</h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-200">
              この導入 pilot はオンライン接続前提です。ネットワーク接続を戻してから、学習・教材更新・履歴保存を再開してください。
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 inline-flex items-center justify-center rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-900"
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
            <div className="rounded-full border border-sky-400 bg-white px-3 py-1 text-xs font-black text-sky-700">
              noindex
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {!usePracticeWorkspaceShell && (
      <header className={`bg-white/88 backdrop-blur-xl border-b border-medace-100 sticky top-0 z-50 shadow-[0_14px_34px_rgba(246,109,11,0.08)] ${
        compactStudentShell ? 'safe-pad-top' : ''
      }`}>
        {isDemoUser && (
          <div className="border-b border-amber-200/80 bg-[#fff4df]">
            {compactStudentShell ? (
              <div className="max-w-7xl mx-auto px-4 py-2.5 sm:px-6 lg:px-8">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-amber-700">体験版アクセス</p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      体験は <span className="font-black text-slate-950">{getDemoAccessWindowLabel()}</span> 限定です。
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="demo-banner-toggle"
                    onClick={() => setShowDemoBannerDetails((previous) => !previous)}
                    className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-white px-3 py-2 text-xs font-black text-amber-800 transition-colors hover:bg-amber-50"
                  >
                    {showDemoBannerDetails ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    {showDemoBannerDetails ? '閉じる' : '詳細'}
                  </button>
                </div>
                {showDemoBannerDetails && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-white/80 px-4 py-3 text-sm leading-relaxed text-slate-700">
                    別端末では別の体験セッションが作成され、一定時間後に自動でリセットされます。
                    {onResetDemo && (
                      <button
                        type="button"
                        onClick={onResetDemo}
                        className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full border border-amber-300 bg-white px-4 py-2.5 text-sm font-black text-amber-800 transition-colors hover:bg-amber-50"
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
                  <p className="text-xs font-black text-amber-700">体験版アクセス</p>
                  <p className="mt-1 text-[0.95rem] font-medium leading-relaxed text-slate-700">
                    体験用アカウントは <span className="font-black text-slate-950">{getDemoAccessWindowLabel()} 限定</span> です。別端末では別の体験セッションが作成され、一定時間後に自動でリセットされます。
                  </p>
                </div>
                {onResetDemo && (
                  <button
                    type="button"
                    onClick={onResetDemo}
                    className="inline-flex items-center justify-center rounded-full border border-amber-300 bg-white px-5 py-2.5 text-[0.95rem] font-black text-amber-800 transition-colors hover:bg-amber-50"
                  >
                    新しい体験を開始
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between ${
          compactStudentShell ? 'min-h-[62px] py-1' : 'min-h-[80px] py-2'
        }`}>
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onChangeView(homeView)}>
            <div className={`bg-medace-300 shadow-lg shadow-medace-200/70 ${compactStudentShell ? 'rounded-2xl p-2.5' : 'rounded-2xl p-3'}`}>
              <BookOpen className={`text-medace-900 ${compactStudentShell ? 'h-5 w-5' : 'w-6 h-6'}`} />
            </div>
            <div className={compactStudentShell ? 'block' : 'hidden sm:block'}>
              <h1 className={`font-black tracking-tight text-medace-900 ${compactStudentShell ? 'text-[1.02rem]' : 'text-[1.35rem]'}`}>
                {compactStudentShell ? BRAND.productLabel : BRAND.officialName}
              </h1>
              <p className={`font-bold tracking-[0.14em] text-medace-700/70 ${compactStudentShell ? 'text-[10px]' : 'text-xs'}`}>
                {compactStudentShell ? '生徒モバイル' : BRAND.productLabel}
              </p>
            </div>
          </div>

          {user && (
            <div className={`flex items-center flex-1 justify-end ${compactStudentShell ? 'gap-2' : 'gap-4'}`}>
              
              {/* Gamification HUD */}
              {user.role === UserRole.STUDENT && isGameMode && !compactStudentShell && (
                  <div className="flex items-center gap-3 md:gap-6 bg-white/90 px-4 py-2.5 rounded-full border border-medace-100 mr-2 shadow-sm">
                      {/* Streak */}
                      <div className="flex items-center gap-1.5" title={`${stats.currentStreak}日連続学習中！`}>
                          <Zap className={`w-4 h-4 ${stats.currentStreak > 0 ? 'text-orange-500 fill-orange-500' : 'text-slate-300'}`} />
                          <span className={`text-sm font-bold ${stats.currentStreak > 0 ? 'text-orange-600' : 'text-slate-400'}`}>
                              {stats.currentStreak}
                          </span>
                      </div>

                      {/* Divider */}
                      <div className="w-px h-4 bg-medace-100"></div>

                      {/* Level & XP */}
                      <div className="flex items-center gap-2">
                          <div className="flex items-center justify-center w-6 h-6 bg-medace-100 text-medace-700 rounded-full text-xs font-bold border border-medace-200">
                              {stats.level}
                          </div>
                          <div className="flex flex-col w-20 md:w-32">
                              <div className="flex justify-between text-[10px] text-medace-800/65 font-bold mb-0.5">
                                  <span>LVL {stats.level}</span>
                                  <span>{stats.xp}/{xpToNext}</span>
                              </div>
                              <div className="h-1.5 bg-medace-100 rounded-full overflow-hidden">
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
                  className={`px-4 py-3 rounded-full text-[0.95rem] font-bold transition-colors ${currentView === homeView ? 'bg-medace-700 text-white' : 'text-medace-900/75 hover:text-medace-600 hover:bg-medace-50'}`}
                >
                  {navLabel}
                </button>
                {user.role === UserRole.STUDENT && (
                  <button
                    type="button"
                    onClick={() => onChangeView('englishPractice')}
                    className={`inline-flex items-center gap-2 px-4 py-3 rounded-full text-[0.95rem] font-bold transition-colors ${
                      currentView === 'englishPractice'
                        ? 'bg-medace-700 text-white'
                        : 'text-medace-900/75 hover:text-medace-600 hover:bg-medace-50'
                    }`}
                  >
                    <Languages className="h-4 w-4" />
                    英語演習
                  </button>
                )}
              </nav>

              <div className="flex items-center gap-2">
                <div className={`text-right ${compactStudentShell ? 'hidden' : 'hidden lg:block'}`}>
                  <p className="text-[0.95rem] font-bold text-medace-900">{user.displayName}</p>
                  <p className="text-xs font-bold tracking-[0.12em] uppercase text-medace-700/55">{workspaceLabel}</p>
                </div>
                <button 
                  onClick={onLogout}
                  className={`text-medace-700/45 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors border border-transparent hover:border-red-100 ${
                    compactStudentShell ? 'p-2.5' : 'p-3'
                  }`}
                  title="ログアウト"
                >
                  <LogOut className={compactStudentShell ? 'h-[18px] w-[18px]' : 'w-5 h-5'} />
                </button>
              </div>
            </div>
          )}
        </div>
        {user && workspaceSections.length > 0 && onSelectWorkspaceSection && activeWorkspaceSection && (
          <div className="border-t border-medace-100/80 bg-white/82 backdrop-blur-xl">
            <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto px-4 py-3 sm:px-6 lg:px-8">
              {workspaceSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => onSelectWorkspaceSection(section.id)}
                  data-testid={`workspace-tab-${section.id.toLowerCase()}`}
                  className={`shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors ${
                    activeWorkspaceSection === section.id
                      ? 'border-medace-700 bg-medace-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-medace-200 hover:text-medace-700'
                  }`}
                >
                  <div className="text-sm font-bold">{section.label}</div>
                  {section.description && (
                    <div className={`mt-1 text-xs leading-relaxed ${activeWorkspaceSection === section.id ? 'text-white/72' : 'text-slate-400'}`}>
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
      <main className={usePracticeWorkspaceShell
        ? 'flex-grow'
        : `flex-grow container mx-auto px-4 sm:px-6 lg:px-8 ${compactStudentShell ? 'py-3 sm:py-8' : 'py-10'}`
      }>
        {children}
      </main>

      {/* Footer */}
      {!usePracticeWorkspaceShell && (
      <footer className={`bg-white/85 backdrop-blur border-t border-medace-100 mt-auto ${
        compactStudentShell ? 'safe-pad-bottom py-2' : 'py-6'
      }`}>
        {compactStudentShell ? (
          <div className="max-w-7xl mx-auto px-4 text-center text-[11px] font-semibold tracking-[0.12em] text-medace-800/35 uppercase">
            {BRAND.productLabel}
          </div>
        ) : (
          <div className="max-w-7xl mx-auto px-4 text-center text-medace-800/45 text-[0.95rem] font-medium">
            &copy; {new Date().getFullYear()} {BRAND.footerLabel}.
          </div>
        )}
      </footer>
      )}
    </div>
  );
};

export default Layout;
