
import React from 'react';
import { BookOpen, LogOut, Zap, Star, Trophy } from 'lucide-react';
import { UserRole, UserProfile, UserStudyMode, type WorkspaceSectionDefinition } from '../types';
import { BRAND } from '../config/brand';
import { getHomeViewForUser, getWorkspaceNavLabel, getWorkspaceRoleLabel } from '../config/access';
import { getDemoAccessWindowLabel, isDemoEmail } from '../utils/demo';

interface LayoutProps {
  children: React.ReactNode;
  user: UserProfile | null;
  onLogout: () => void;
  onResetDemo?: () => void;
  currentView: string;
  onChangeView: (view: string) => void;
  workspaceSections?: WorkspaceSectionDefinition[];
  activeWorkspaceSection?: string;
  onSelectWorkspaceSection?: (section: string) => void;
}

const Layout: React.FC<LayoutProps> = ({
  children,
  user,
  onLogout,
  onResetDemo,
  currentView,
  onChangeView,
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

  return (
    <div className="min-h-screen bg-medace-50/40 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white/88 backdrop-blur-xl border-b border-medace-100 sticky top-0 z-50 shadow-[0_14px_34px_rgba(246,109,11,0.08)]">
        {isDemoUser && (
          <div className="border-b border-amber-200/80 bg-[#fff4df]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Limited Demo Access</p>
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
          </div>
        )}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-[80px] flex items-center justify-between py-2">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => onChangeView(homeView)}>
            <div className="rounded-2xl bg-medace-300 p-3 shadow-lg shadow-medace-200/70">
              <BookOpen className="text-medace-900 w-6 h-6" />
            </div>
            <div className="hidden sm:block">
              <h1 className="text-[1.35rem] font-black tracking-tight text-medace-900">{BRAND.officialName}</h1>
              <p className="text-xs text-medace-700/70 font-bold tracking-[0.14em]">{BRAND.productLabel}</p>
            </div>
          </div>

          {user && (
            <div className="flex items-center gap-4 flex-1 justify-end">
              
              {/* Gamification HUD */}
              {user.role === UserRole.STUDENT && isGameMode && (
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
              </nav>

              <div className="flex items-center gap-2">
                <div className="text-right hidden lg:block">
                  <p className="text-[0.95rem] font-bold text-medace-900">{user.displayName}</p>
                  <p className="text-xs font-bold tracking-[0.12em] uppercase text-medace-700/55">{workspaceLabel}</p>
                </div>
                <button 
                  onClick={onLogout}
                  className="p-3 text-medace-700/45 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors border border-transparent hover:border-red-100"
                  title="ログアウト"
                >
                  <LogOut className="w-5 h-5" />
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

      {/* Main Content */}
      <main className="flex-grow container mx-auto px-4 sm:px-6 lg:px-8 py-10">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white/85 backdrop-blur border-t border-medace-100 py-6 mt-auto">
        <div className="max-w-7xl mx-auto px-4 text-center text-medace-800/45 text-[0.95rem] font-medium">
          &copy; {new Date().getFullYear()} {BRAND.footerLabel}.
        </div>
      </footer>
    </div>
  );
};

export default Layout;
