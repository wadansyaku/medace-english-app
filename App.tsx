
import React, { useState, useEffect } from 'react';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import StudyMode from './components/StudyMode';
import QuizMode from './components/QuizMode';
import AdminPanel from './components/AdminPanel';
import InstructorDashboard from './components/InstructorDashboard';
import BusinessAdminDashboard from './components/BusinessAdminDashboard';
import Onboarding from './components/Onboarding';
import { OrganizationRole, SubscriptionPlan, UserRole, UserProfile } from './types';
import { storage } from './services/storage';
import { AUTH_COPY, BRAND } from './config/brand';
import { getHomeViewForUser, isGroupAdmin } from './config/access';
import { getSubscriptionPolicy } from './config/subscription';
import { ArrowRight, BookOpen, Building2, CheckCircle2, ChevronDown, ChevronUp, Loader2, Lock, LogIn, Mail, Sparkles, User, UserPlus } from 'lucide-react';

const LOGIN_PLAN_PREVIEWS = [
  SubscriptionPlan.TOC_FREE,
  SubscriptionPlan.TOC_PAID,
  SubscriptionPlan.TOB_PAID,
].map((plan) => getSubscriptionPolicy(plan));

const PLATFORM_HIGHLIGHTS = [
  {
    icon: <BookOpen className="h-4 w-4" />,
    label: '個人学習',
    detail: '診断、復習、学習プランまでを1つの流れで進められます。',
  },
  {
    icon: <Building2 className="h-4 w-4" />,
    label: '学校・教室運用',
    detail: '講師フォロー、担当割当、教材権限まで同じ画面群で管理できます。',
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    label: '教材活用',
    detail: '既存の公式単語帳と My単語帳の両方を使い分けられます。',
  },
];

const BUSINESS_DEMO_OPTIONS: Array<{
  title: string;
  description: string;
  role: UserRole;
  organizationRole?: OrganizationRole;
  compact?: boolean;
}> = [
  {
    title: 'ビジネス版 生徒体験',
    description: '既存の公式単語帳を開き、学習とテスト導線をそのまま確認できます。',
    role: UserRole.STUDENT,
    organizationRole: OrganizationRole.STUDENT,
  },
  {
    title: '先生',
    description: '講師フォロー導線に加えて、既存単語帳の中身とテスト導線まで確認できます。',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.INSTRUCTOR,
  },
  {
    title: '学校管理者',
    description: '組織ダッシュボード、担当割当、既存単語帳へのアクセスをまとめて確認できます。',
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.GROUP_ADMIN,
  },
  {
    title: 'サービス管理者',
    description: '教材カタログ全体とサービス運用画面を確認できます。',
    role: UserRole.ADMIN,
    compact: true,
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

  const handleDemoLogin = async (role: UserRole, organizationRole?: OrganizationRole) => {
    let demoPassword: string | undefined;
    if (role === UserRole.ADMIN) {
      const passwordInput = window.prompt("管理用パスワード:");
      if (!passwordInput) return;
      demoPassword = passwordInput;
    }

    setAuthError(null);
    setAuthLoading(true);
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
      return (
        <div className="max-w-5xl mx-auto mt-6 lg:mt-10 overflow-hidden rounded-[32px] border border-medace-100 bg-white shadow-[0_28px_90px_rgba(246,109,11,0.12)]">
          <div className="grid lg:grid-cols-[1.04fr_0.96fr]">
            <div className="relative overflow-hidden bg-[linear-gradient(145deg,#66321A_0%,#F66D0B_58%,#FFBF52_100%)] p-8 md:p-10 text-white">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.3),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.18),_transparent_28%)]"></div>
              <div className="relative space-y-8">
                <div>
                  <div className="w-16 h-16 rounded-2xl bg-white/15 border border-white/20 backdrop-blur-sm flex items-center justify-center mb-5 shadow-lg">
                    <span className="text-white text-2xl font-black">{BRAND.mark}</span>
                  </div>
                  <p className="text-white/82 text-sm font-bold tracking-[0.18em] uppercase">{AUTH_COPY.eyebrow}</p>
                  <h1 className="mt-3 text-3xl md:text-4xl font-black leading-tight">
                    {AUTH_COPY.title[0]}
                    <br />
                    {AUTH_COPY.title[1]}
                    <br />
                    {AUTH_COPY.title[2]}
                  </h1>
                  <p className="mt-4 text-white/85 text-sm md:text-base leading-relaxed max-w-md">
                    {AUTH_COPY.body}
                  </p>
                </div>

                <div className="grid gap-3">
                  {(authMode === 'SIGNUP' ? AUTH_COPY.signupSteps : AUTH_COPY.loginSteps).map((step) => (
                    <div key={step} className="flex items-center gap-3 rounded-2xl bg-white/10 border border-white/15 px-4 py-3 backdrop-blur-sm">
                      <CheckCircle2 className="w-5 h-5 text-white shrink-0" />
                      <span className="text-sm font-medium">{step}</span>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl border border-white/15 bg-medace-900/15 p-5">
                  <p className="text-xs font-bold tracking-[0.18em] uppercase text-white/70">{AUTH_COPY.demoEyebrow}</p>
                  <p className="mt-2 text-sm text-white/85">
                    生徒の学習導線だけでなく、学校・教室向けのビジネス版デモもこの画面からそのまま確認できます。
                  </p>
                  <button
                    onClick={() => handleDemoLogin(UserRole.STUDENT)}
                    className="mt-4 w-full rounded-2xl bg-white py-3.5 text-sm font-bold text-medace-700 shadow-sm transition-colors hover:bg-orange-50"
                  >
                    生徒としてすぐ試す
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAlternateAccess((prev) => !prev)}
                    className="mt-3 flex w-full items-center justify-between rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-bold text-white/88 transition-colors hover:bg-white/10"
                  >
                    <span>学校・先生向けの体験メニュー</span>
                    {showAlternateAccess ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                  {showAlternateAccess && (
                    <div className="mt-3 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs font-medium leading-relaxed text-white/75">
                        ここから先はすべてビジネス版デモです。既存の公式単語帳、学校向け運用画面、講師通知導線までそのまま確認できます。
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {BUSINESS_DEMO_OPTIONS.map((option) => (
                          <button
                            key={option.title}
                            onClick={() => handleDemoLogin(option.role, option.organizationRole)}
                            className={`rounded-2xl border border-white/20 bg-white/10 px-4 py-4 text-left text-white transition-colors hover:bg-white/15 ${
                              option.compact ? 'md:col-span-2' : ''
                            }`}
                          >
                            <div className="text-sm font-bold">{option.title}</div>
                            <div className="mt-2 text-xs leading-relaxed text-white/72">{option.description}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[linear-gradient(180deg,#fffdf9_0%,#ffffff_100%)] p-6 md:p-8 lg:p-10">
              <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-medace-100 bg-medace-50 p-1.5">
                <button
                  type="button"
                  onClick={() => switchAuthMode('LOGIN')}
                  className={`rounded-xl px-4 py-3 text-sm font-bold transition-all ${authMode === 'LOGIN' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
                >
                  ログイン
                </button>
                <button
                  type="button"
                  onClick={() => switchAuthMode('SIGNUP')}
                  className={`rounded-xl px-4 py-3 text-sm font-bold transition-all ${authMode === 'SIGNUP' ? 'bg-white text-medace-700 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
                >
                  新規登録
                </button>
              </div>

              <div className="mb-6">
                <h2 className="text-2xl font-bold text-slate-900">
                  {authMode === 'LOGIN' ? AUTH_COPY.loginHeading : AUTH_COPY.signupHeading}
                </h2>
                <p className="mt-2 text-sm text-slate-500 leading-relaxed">
                  {authMode === 'LOGIN' ? AUTH_COPY.loginBody : AUTH_COPY.signupBody}
                </p>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                {authMode === 'SIGNUP' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">表示名</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medace-500 focus:border-medace-500 outline-none transition-all"
                        placeholder="例: 田中 はるか"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">メールアドレス</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <input 
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medace-500 focus:border-medace-500 outline-none transition-all"
                      placeholder="name@example.com"
                      autoComplete="email"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase">パスワード</label>
                    {authMode === 'SIGNUP' && <span className="text-[11px] font-bold text-slate-400">6文字以上</span>}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                    <input 
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medace-500 focus:border-medace-500 outline-none transition-all"
                      placeholder={authMode === 'SIGNUP' ? '6文字以上で設定' : 'パスワードを入力'}
                      autoComplete={authMode === 'LOGIN' ? 'current-password' : 'new-password'}
                    />
                  </div>
                </div>

                {authMode === 'SIGNUP' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1.5">パスワード確認</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-medace-500 focus:border-medace-500 outline-none transition-all"
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_100%)] py-3.5 font-bold text-white shadow-md transition-transform hover:scale-[1.01]"
                >
                  {authMode === 'LOGIN' ? (
                    <><LogIn className="w-4 h-4" /> ログイン</>
                  ) : (
                    <><UserPlus className="w-4 h-4" /> 登録してはじめる <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <div className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-3 text-sm text-medace-900/80">
                  {authMode === 'LOGIN' ? AUTH_COPY.helperLogin : AUTH_COPY.helperSignup}
                </div>
              </form>

              <div className="mt-6 border-t border-slate-100 pt-6">
                <div className="grid gap-3 md:grid-cols-3">
                  {PLATFORM_HIGHLIGHTS.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4 shadow-sm">
                      <div className="flex items-center gap-2 text-medace-600">
                        {item.icon}
                        <span className="text-xs font-bold uppercase tracking-[0.16em]">{item.label}</span>
                      </div>
                      <div className="mt-3 text-sm leading-relaxed text-slate-600">{item.detail}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-5 rounded-[28px] border border-slate-200 bg-slate-50/80 p-5">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Plan Overview</div>
                  <h3 className="mt-2 text-lg font-black text-slate-950">料金体系の考え方</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">
                    個人利用はすぐ始められる導線、ビジネス利用は教材配信と運用画面まで含めた個別ご案内を前提にしています。
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {LOGIN_PLAN_PREVIEWS.map((plan) => (
                      <div key={plan.plan} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{plan.audienceLabel}</div>
                        <div className="mt-2 text-base font-black text-slate-950">{plan.label}</div>
                        <div className="mt-1 text-sm font-bold text-medace-700">{plan.priceLabel}</div>
                        <div className="mt-2 text-sm leading-relaxed text-slate-500">{plan.pricingNote}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
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
    <Layout 
      user={user} 
      onLogout={handleLogout}
      currentView={currentView}
      onChangeView={setCurrentView}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;
