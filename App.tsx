
import React, { Suspense, lazy, useEffect, useState } from 'react';
import Layout from './components/Layout';
import ModalOverlay from './components/ModalOverlay';
import { OrganizationRole, UserRole, UserProfile } from './types';
import { storage } from './services/storage';
import { AUTH_COPY, BRAND } from './config/brand';
import { getHomeViewForUser, isGroupAdmin } from './config/access';
import { applyDisplayPreferences, getStoredDisplayPreferences } from './utils/displayPreferences';
import { getDemoAccessWindowLabel, isDemoEmail } from './utils/demo';
import { usePublicMotivationSnapshot } from './hooks/usePublicMotivationSnapshot';
import { ArrowRight, CheckCircle2, ChevronDown, ChevronUp, Loader2, Lock, LogIn, Mail, User, UserPlus } from 'lucide-react';
import PublicMotivationPanel from './components/PublicMotivationPanel';

const Dashboard = lazy(() => import('./components/Dashboard'));
const StudyMode = lazy(() => import('./components/StudyMode'));
const QuizMode = lazy(() => import('./components/QuizMode'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
const InstructorDashboard = lazy(() => import('./components/InstructorDashboard'));
const BusinessAdminDashboard = lazy(() => import('./components/BusinessAdminDashboard'));
const Onboarding = lazy(() => import('./components/Onboarding'));
const PublicInfoPage = lazy(() => import('./components/PublicInfoPage'));

const BUSINESS_DEMO_OPTIONS: Array<{
  title: string;
  description: string;
  role: UserRole;
  organizationRole?: OrganizationRole;
  compact?: boolean;
  testId: string;
}> = [
  {
    title: 'ビジネス版 生徒体験',
    description: '既存の公式単語帳を開き、学習とテスト導線をそのまま確認できます。',
    role: UserRole.STUDENT,
    organizationRole: OrganizationRole.STUDENT,
    testId: 'demo-login-business-student',
  },
  {
    title: '先生',
    description: '講師フォロー導線に加えて、既存単語帳の中身とテスト導線まで確認できます。',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.INSTRUCTOR,
    testId: 'demo-login-instructor',
  },
  {
    title: '学校管理者',
    description: '組織ダッシュボード、担当割当、既存単語帳へのアクセスをまとめて確認できます。',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.GROUP_ADMIN,
    testId: 'demo-login-group-admin',
  },
  {
    title: 'サービス管理者',
    description: '教材カタログ全体とサービス運用画面を確認できます。',
    role: UserRole.ADMIN,
    compact: true,
    testId: 'demo-login-admin',
  },
];

const App: React.FC = () => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [currentView, setCurrentView] = useState('login'); 
  const [returnView, setReturnView] = useState('dashboard');
  const [selectedBookId, setSelectedBookId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Login Form State
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [authMode, setAuthMode] = useState<'LOGIN' | 'SIGNUP'>('LOGIN');
  const [authError, setAuthError] = useState<string | null>(null);
  const [showAlternateAccess, setShowAlternateAccess] = useState(false);
  const [showPublicInfo, setShowPublicInfo] = useState(false);
  const [showAdminDemoPrompt, setShowAdminDemoPrompt] = useState(false);
  const [adminDemoPassword, setAdminDemoPassword] = useState('');
  const [pendingAdminDemoRole, setPendingAdminDemoRole] = useState<{
    role: UserRole;
    organizationRole?: OrganizationRole;
  } | null>(null);
  const {
    snapshot: publicMotivationSnapshot,
    loading: publicMotivationLoading,
    error: publicMotivationError,
  } = usePublicMotivationSnapshot(!user);

  // --- Restore Session (Async) ---
  useEffect(() => {
    const initSession = async () => {
      try {
        const sessionUser = await storage.getSession();
        if (sessionUser) {
          setUser(sessionUser);
          setCurrentView(getHomeViewForUser(sessionUser));
        }
      } catch (e) {
        console.error("Session restore failed", e);
      } finally {
        setAuthLoading(false);
      }
    };
    initSession();
  }, []);

  useEffect(() => {
    applyDisplayPreferences(getStoredDisplayPreferences(user?.uid));
  }, [user?.uid]);

  const performDemoLogin = async (
    role: UserRole,
    organizationRole?: OrganizationRole,
    demoPassword?: string,
  ) => {
    setAuthError(null);
    setAuthLoading(true);
    setSelectedBookId(null);
    setReturnView('dashboard');
    try {
      const loggedInUser = await storage.login(role, demoPassword, organizationRole);
      if (loggedInUser) {
        setUser(loggedInUser);
        setCurrentView(getHomeViewForUser(loggedInUser));
      } else {
        setAuthError("ログインに失敗しました。");
      }
    } catch (e: any) {
      console.error("Login failed", e);
      setAuthError(e?.message || "ログインエラーが発生しました。");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleDemoLogin = async (role: UserRole, organizationRole?: OrganizationRole) => {
    if (role === UserRole.ADMIN) {
      setPendingAdminDemoRole({ role, organizationRole });
      setAdminDemoPassword('');
      setAuthError(null);
      setShowAdminDemoPrompt(true);
      return;
    }

    await performDemoLogin(role, organizationRole);
  };

  const handleAdminDemoSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!pendingAdminDemoRole || !adminDemoPassword.trim()) {
      setAuthError('管理用パスワードを入力してください。');
      return;
    }

    setShowAdminDemoPrompt(false);
    await performDemoLogin(
      pendingAdminDemoRole.role,
      pendingAdminDemoRole.organizationRole,
      adminDemoPassword.trim(),
    );
    setAdminDemoPassword('');
    setPendingAdminDemoRole(null);
  };

  const handleResetDemo = async () => {
    if (!user || !isDemoEmail(user.email)) return;
    await handleDemoLogin(user.role, user.organizationRole);
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
      e.preventDefault();
      setAuthError(null);
      if(!email || !password) {
          setAuthError("メールアドレスとパスワードを入力してください。");
          return;
      }

      if (authMode === 'SIGNUP') {
          if (!displayName.trim()) {
              setAuthError("表示名を入力してください。");
              return;
          }
          if (password.length < 6) {
              setAuthError("パスワードは6文字以上にしてください。");
              return;
          }
          if (password !== confirmPassword) {
              setAuthError("確認用パスワードが一致していません。");
              return;
          }
      }
      
      setAuthLoading(true);
      try {
          const loggedInUser = await storage.authenticate(
            email,
            password,
            authMode === 'SIGNUP',
            undefined,
            authMode === 'SIGNUP' ? displayName.trim() : undefined
          );
          if (loggedInUser) {
              setUser(loggedInUser);
              setCurrentView(getHomeViewForUser(loggedInUser));
          }
      } catch (err: any) {
          setAuthError(err.message || "認証エラーが発生しました。");
      } finally {
          setAuthLoading(false);
      }
  };

  const switchAuthMode = (mode: 'LOGIN' | 'SIGNUP') => {
    setAuthMode(mode);
    setAuthError(null);
    setPassword('');
    setConfirmPassword('');
  };

  const handleLogout = async () => {
    setUser(null);
    await storage.clearSession();
    setCurrentView('login');
    setReturnView('dashboard');
    setSelectedBookId(null);
    setDisplayName('');
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setAuthError(null);
    setShowAlternateAccess(false);
    setShowPublicInfo(false);
    setShowAdminDemoPrompt(false);
    setAdminDemoPassword('');
    setPendingAdminDemoRole(null);
  };

  const handleBookSelect = (bookId: string, mode: 'study' | 'quiz') => {
    setReturnView(currentView);
    setSelectedBookId(bookId);
    setCurrentView(mode);
  };

  const handleSessionComplete = (updatedUser: UserProfile) => {
    setUser(updatedUser);
    setCurrentView(returnView);
  };

  // --- Render Views ---
  const renderContent = () => {
    if (authLoading) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <Loader2 className="w-12 h-12 text-medace-500 animate-spin mb-4" />
          <p className="text-slate-500">認証中...</p>
        </div>
      );
    }

    if (!user) {
      if (showPublicInfo) {
        return (
          <PublicInfoPage
            onBack={() => setShowPublicInfo(false)}
            motivationSnapshot={publicMotivationSnapshot}
            motivationLoading={publicMotivationLoading}
            motivationError={publicMotivationError}
          />
        );
      }

      return (
        <div className="mx-auto mt-6 max-w-6xl space-y-6 lg:mt-10">
          <div className="overflow-hidden rounded-[32px] border border-medace-100 bg-white shadow-[0_28px_90px_rgba(246,109,11,0.12)]">
            <div className="grid lg:grid-cols-[1.04fr_0.96fr]">
              <div className="relative overflow-hidden bg-[linear-gradient(145deg,#66321A_0%,#F66D0B_58%,#FFBF52_100%)] p-9 text-white md:p-11">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.3),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.18),_transparent_28%)]"></div>
                <div className="relative space-y-9">
                  <div>
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/20 bg-white/15 shadow-lg backdrop-blur-sm">
                      <span className="text-2xl font-black text-white">{BRAND.mark}</span>
                    </div>
                    <p className="text-[0.98rem] font-bold tracking-[0.12em] text-white/84">{AUTH_COPY.eyebrow}</p>
                    <h1 className="mt-3 text-3xl font-black leading-tight md:text-4xl">
                      {AUTH_COPY.title[0]}
                      <br />
                      {AUTH_COPY.title[1]}
                      <br />
                      {AUTH_COPY.title[2]}
                    </h1>
                    <p className="mt-4 max-w-lg text-base leading-relaxed text-white/88 md:text-[1.05rem]">
                      {AUTH_COPY.body}
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {(authMode === 'SIGNUP' ? AUTH_COPY.signupSteps : AUTH_COPY.loginSteps).map((step) => (
                      <div key={step} className="flex items-center gap-3 rounded-2xl border border-white/15 bg-white/10 px-4 py-3.5 backdrop-blur-sm">
                        <CheckCircle2 className="h-5 w-5 shrink-0 text-white" />
                        <span className="text-base font-medium leading-relaxed">{step}</span>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-2xl border border-white/15 bg-medace-900/15 p-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-bold tracking-[0.12em] text-white/78">{AUTH_COPY.demoEyebrow}</p>
                      <span className="rounded-full border border-white/20 bg-white/10 px-4 py-1.5 text-xs font-black tracking-[0.12em] text-white/92">
                        {getDemoAccessWindowLabel()} 限定
                      </span>
                    </div>
                    <p className="mt-3 text-[0.98rem] leading-relaxed text-white/88">
                      生徒の学習導線だけでなく、学校・教室向けのビジネス版デモもこの画面からそのまま確認できます。体験用アカウントは期間限定で、別端末では別の体験セッションが作られます。
                    </p>
                    <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/78">
                      初回診断やテストを最初から試せるよう、体験ログインごとに新しいデモ環境を作成します。前回の demo 状態は別ブラウザや別端末へ共有されません。
                    </p>
                    <button
                      onClick={() => handleDemoLogin(UserRole.STUDENT)}
                      data-testid="demo-login-student"
                      className="mt-4 w-full rounded-2xl bg-white py-4 text-base font-bold text-medace-700 shadow-sm transition-colors hover:bg-orange-50"
                    >
                      生徒としてすぐ試す
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowAlternateAccess((prev) => !prev)}
                      className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/20 bg-white/5 px-4 py-3.5 text-base font-bold text-white/90 transition-colors hover:bg-white/10"
                    >
                      <span>学校・先生向けの体験メニュー</span>
                      {showAlternateAccess ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    {showAlternateAccess && (
                      <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-medium leading-relaxed text-white/78">
                          ここから先はすべてビジネス版デモです。既存の公式単語帳、学校向け運用画面、講師通知導線までそのまま確認できます。各デモは {getDemoAccessWindowLabel()} の期間限定で、別端末とは共有されません。
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {BUSINESS_DEMO_OPTIONS.map((option) => (
                            <button
                              key={option.title}
                              onClick={() => handleDemoLogin(option.role, option.organizationRole)}
                              data-testid={option.testId}
                              className={`rounded-2xl border border-white/20 bg-white/10 px-4 py-4 text-left text-white transition-colors hover:bg-white/15 ${
                                option.compact ? 'md:col-span-2' : ''
                              }`}
                            >
                              <div className="text-base font-bold">{option.title}</div>
                              <div className="mt-2 text-sm leading-relaxed text-white/78">{option.description}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-[linear-gradient(180deg,#fffdf9_0%,#ffffff_100%)] p-7 md:p-9 lg:p-11">
                <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-medace-100 bg-medace-50 p-1.5">
                  <button
                    type="button"
                    onClick={() => switchAuthMode('LOGIN')}
                    className={`rounded-xl px-4 py-3.5 text-base font-bold transition-all ${authMode === 'LOGIN' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
                  >
                    ログイン
                  </button>
                  <button
                    type="button"
                    onClick={() => switchAuthMode('SIGNUP')}
                    className={`rounded-xl px-4 py-3.5 text-base font-bold transition-all ${authMode === 'SIGNUP' ? 'bg-white text-medace-700 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
                  >
                    新規登録
                  </button>
                </div>

                <div className="mb-6">
                  <h2 className="text-[2rem] font-bold text-slate-900">
                    {authMode === 'LOGIN' ? AUTH_COPY.loginHeading : AUTH_COPY.signupHeading}
                  </h2>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">
                    {authMode === 'LOGIN' ? AUTH_COPY.loginBody : AUTH_COPY.signupBody}
                  </p>
                </div>

                <form onSubmit={handleEmailAuth} className="space-y-4">
                  {authMode === 'SIGNUP' && (
                    <div>
                      <label className="ui-form-label mb-2">表示名</label>
                      <div className="relative">
                        <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          value={displayName}
                          onChange={(e) => setDisplayName(e.target.value)}
                          className="ui-input pl-11 pr-4"
                          placeholder="例: 田中 はるか"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="ui-form-label mb-2">メールアドレス</label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="ui-input pl-11 pr-4"
                        placeholder="name@example.com"
                        autoComplete="email"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <label className="ui-form-label mb-0">パスワード</label>
                      {authMode === 'SIGNUP' && <span className="text-sm font-bold text-slate-500">6文字以上</span>}
                    </div>
                    <div className="relative">
                      <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="ui-input pl-11 pr-4"
                        placeholder={authMode === 'SIGNUP' ? '6文字以上で設定' : 'パスワードを入力'}
                        autoComplete={authMode === 'LOGIN' ? 'current-password' : 'new-password'}
                      />
                    </div>
                  </div>

                  {authMode === 'SIGNUP' && (
                    <div>
                      <label className="ui-form-label mb-2">パスワード確認</label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <input
                          type="password"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          className="ui-input pl-11 pr-4"
                          placeholder="確認用にもう一度入力"
                          autoComplete="new-password"
                        />
                      </div>
                    </div>
                  )}

                  {authError && (
                    <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                      {authError}
                    </div>
                  )}

                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_100%)] py-4 text-base font-bold text-white shadow-md transition-transform hover:scale-[1.01]"
                  >
                    {authMode === 'LOGIN' ? (
                      <><LogIn className="h-4 w-4" /> ログイン</>
                    ) : (
                      <><UserPlus className="h-4 w-4" /> 登録してはじめる <ArrowRight className="h-4 w-4" /></>
                    )}
                  </button>

                  <div className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-3 text-[0.98rem] leading-relaxed text-medace-900/80">
                    {authMode === 'LOGIN' ? AUTH_COPY.helperLogin : AUTH_COPY.helperSignup}
                  </div>
                </form>

                <div className="mt-6 border-t border-slate-100 pt-6">
                  <div className="ui-panel-subtle">
                    <div className="text-sm font-bold text-slate-500">Public Guide</div>
                    <h3 className="mt-2 text-xl font-black text-slate-950">詳しい説明と料金は別ページへ</h3>
                    <p className="mt-2 text-[0.98rem] leading-relaxed text-slate-600">
                      ホーム画面はログインと体験開始に絞り、アプリ説明や料金の考え方は公開ページにまとめています。
                    </p>
                    <button
                      type="button"
                      onClick={() => setShowPublicInfo(true)}
                      className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-base font-bold text-slate-700 transition-colors hover:bg-slate-100"
                    >
                      アプリの説明・料金を見る <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <PublicMotivationPanel
            snapshot={publicMotivationSnapshot}
            loading={publicMotivationLoading}
            error={publicMotivationError}
          />
        </div>
      );
    }

    // --- Onboarding Check ---
    if (user.needsOnboarding) {
      return (
        <Onboarding 
          user={user} 
          onComplete={(updated) => {
            setUser(updated);
            setCurrentView('dashboard');
          }} 
        />
      );
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard user={user} onSelectBook={handleBookSelect} onUserUpdate={setUser} />;
      case 'study':
        return selectedBookId ? (
          <StudyMode 
            user={user} 
            bookId={selectedBookId} 
            onBack={() => setCurrentView(returnView)}
            onSessionComplete={handleSessionComplete}
          />
        ) : null;
      case 'quiz':
        return selectedBookId ? (
          <QuizMode 
            user={user} 
            bookId={selectedBookId} 
            onBack={() => setCurrentView(returnView)} 
          />
        ) : null;
      case 'admin':
        return user.role === UserRole.ADMIN ? <AdminPanel /> : <div className="p-8 text-center text-red-500">アクセス権限がありません</div>;
      case 'instructor':
        return user.role === UserRole.INSTRUCTOR
          ? (isGroupAdmin(user)
            ? <BusinessAdminDashboard user={user} onSelectBook={handleBookSelect} />
            : <InstructorDashboard user={user} onSelectBook={handleBookSelect} />)
          : <div className="p-8 text-center text-red-500">アクセス権限がありません</div>;
      default:
        return <Dashboard user={user} onSelectBook={handleBookSelect} onUserUpdate={setUser} />;
    }
  };

  return (
    <>
      <Layout 
        user={user} 
        onLogout={handleLogout}
        onResetDemo={isDemoEmail(user?.email) ? handleResetDemo : undefined}
        currentView={currentView}
        onChangeView={setCurrentView}
      >
        <Suspense
          fallback={
            <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-500">
              <Loader2 className="h-10 w-10 animate-spin text-medace-500" />
              <p className="mt-3 text-sm font-medium">画面を準備中...</p>
            </div>
          }
        >
          {renderContent()}
        </Suspense>
      </Layout>

      {showAdminDemoPrompt && (
        <ModalOverlay
          onClose={() => {
            setShowAdminDemoPrompt(false);
            setAdminDemoPassword('');
            setPendingAdminDemoRole(null);
          }}
          panelClassName="max-w-md"
          align="center"
        >
          <form
            onSubmit={handleAdminDemoSubmit}
            className="rounded-[28px] border border-medace-100 bg-white p-6 shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
          >
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Admin Demo</div>
            <h2 className="mt-3 text-2xl font-black text-slate-950">管理者デモを開く</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              サービス管理者デモには管理用パスワードが必要です。ローカルでは `admin` が既定値です。
            </p>
            <label className="mt-5 block">
              <span className="ui-form-label mb-2 block">管理用パスワード</span>
              <input
                type="password"
                value={adminDemoPassword}
                onChange={(event) => setAdminDemoPassword(event.target.value)}
                className="ui-input"
                autoFocus
              />
            </label>
            {authError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                {authError}
              </div>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowAdminDemoPrompt(false);
                  setAdminDemoPassword('');
                  setPendingAdminDemoRole(null);
                }}
                className="flex-1 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"
              >
                キャンセル
              </button>
              <button
                type="submit"
                className="flex-1 rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-700"
              >
                デモを開く
              </button>
            </div>
          </form>
        </ModalOverlay>
      )}
    </>
  );
};

export default App;
