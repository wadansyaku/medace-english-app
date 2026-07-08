import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  LifeBuoy,
  Lock,
  LogIn,
  Mail,
  Loader2,
  User,
  UserPlus,
} from 'lucide-react';

import { AUTH_COPY, BRAND } from '../../config/brand';
import getClientRuntimeFlags from '../../config/runtime';
import useIsMobileViewport from '../../hooks/useIsMobileViewport';
import { getDemoAccessWindowLabel } from '../../utils/demo';
import PublicInfoPage from '../PublicInfoPage';
import PublicRolePage from '../public/PublicRolePage';
import { OrganizationRole, UserRole, type PublicMotivationSnapshot } from '../../types';
import {
  getPublicBusinessRoleDirectPath,
  PUBLIC_BUSINESS_ROLE_CONFIGS,
  type PublicBusinessRoleKey,
} from '../../shared/publicBusinessRoles';

interface AuthExperienceScreenProps {
  currentView: 'login' | 'publicInfo' | 'publicRole';
  publicRole: PublicBusinessRoleKey | null;
  authMode: 'LOGIN' | 'SIGNUP';
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  authError: string | null;
  showPasswordRecovery: boolean;
  passwordRecoveryLoading: boolean;
  passwordRecoveryMessage: string | null;
  showAlternateAccess: boolean;
  motivationSnapshot: PublicMotivationSnapshot | null;
  motivationLoading: boolean;
  motivationError: string | null;
  onChangeAuthMode: (mode: 'LOGIN' | 'SIGNUP') => void;
  onDisplayNameChange: (value: string) => void;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmitEmailAuth: (event: React.FormEvent) => void;
  onOpenPasswordRecovery: () => void;
  onClosePasswordRecovery: () => void;
  onRequestPasswordRecovery: () => void;
  onDemoLogin: (role: UserRole, organizationRole?: OrganizationRole) => void;
  onToggleAlternateAccess: () => void;
  onClosePublicInfo: () => void;
  onOpenPublicRole: (roleKey: PublicBusinessRoleKey) => void;
  onClosePublicRole: () => void;
}

const AuthExperienceScreen: React.FC<AuthExperienceScreenProps> = ({
  currentView,
  publicRole,
  authMode,
  displayName,
  email,
  password,
  confirmPassword,
  authError,
  showPasswordRecovery,
  passwordRecoveryLoading,
  passwordRecoveryMessage,
  showAlternateAccess,
  motivationSnapshot,
  motivationLoading,
  motivationError,
  onChangeAuthMode,
  onDisplayNameChange,
  onEmailChange,
  onPasswordChange,
  onConfirmPasswordChange,
  onSubmitEmailAuth,
  onOpenPasswordRecovery,
  onClosePasswordRecovery,
  onRequestPasswordRecovery,
  onDemoLogin,
  onToggleAlternateAccess,
  onClosePublicInfo,
  onOpenPublicRole,
}) => {
  const runtimeFlags = getClientRuntimeFlags();
  const isMobileViewport = useIsMobileViewport();
  const authEdgePanelRef = React.useRef<HTMLDetailsElement | null>(null);

  const openAuthEdgePanel = (mode: 'LOGIN' | 'SIGNUP') => {
    onChangeAuthMode(mode);
    if (authEdgePanelRef.current) {
      authEdgePanelRef.current.open = true;
      authEdgePanelRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (currentView === 'publicRole' && publicRole) {
    return (
      <PublicRolePage
        roleKey={publicRole}
        onDemoLogin={onDemoLogin}
      />
    );
  }

  if (currentView === 'publicInfo') {
    return (
      <PublicInfoPage
        onBack={onClosePublicInfo}
        motivationSnapshot={motivationSnapshot}
        motivationLoading={motivationLoading}
        motivationError={motivationError}
        onOpenRole={onOpenPublicRole}
      />
    );
  }

  const roleQuickLinks = PUBLIC_BUSINESS_ROLE_CONFIGS.map((roleConfig) => ({
    ...roleConfig,
    directPath: getPublicBusinessRoleDirectPath(roleConfig.key),
  }));

  const fastStartPanel = authMode === 'LOGIN' && !isMobileViewport ? (
    <div
      data-testid="auth-fast-start-panel"
      className="mb-6 rounded-xl border border-medace-200 bg-white px-4 py-4 shadow-sm"
    >
      <p className="text-sm font-black tracking-[0.12em] text-medace-700">ログイン不要で先に試せます</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        初回の人は登録前に、診断テストを挟まず学習ホームと教材開始を確認できます。
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={() => onDemoLogin(UserRole.STUDENT)}
          data-testid="auth-fast-start-student"
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-medace-600 px-4 py-2.5 text-sm font-bold leading-tight text-slate-950 shadow-sm transition-colors hover:bg-medace-700"
        >
          生徒として体験開始 <ArrowRight className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onChangeAuthMode('SIGNUP')}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold leading-tight text-slate-700 transition-colors hover:bg-slate-50"
        >
          アカウントを作る
        </button>
      </div>
    </div>
  ) : null;

  const authCard = (
    <div className="overflow-hidden rounded-panel border border-medace-200 bg-white shadow-[0_18px_48px_rgba(255,122,0,0.10)]">
        <div className="grid">
          <div className="relative overflow-hidden border-b border-medace-200 bg-medace-50 p-6 text-slate-950 sm:p-8">
            <div className="relative space-y-7">
              <div>
                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-medace-200 bg-white shadow-sm sm:h-16 sm:w-16">
                  <span className="text-2xl font-black text-medace-700">{BRAND.mark}</span>
                </div>
                <p className="text-[0.82rem] font-bold tracking-[0.12em] text-medace-700 sm:text-[0.95rem]">{AUTH_COPY.eyebrow}</p>
                <h1 className="mt-3 text-2xl font-black leading-tight sm:text-3xl md:text-4xl">
                  {AUTH_COPY.title[0]}
                  <br />
                  {AUTH_COPY.title[1]}
                  <br />
                  {AUTH_COPY.title[2]}
                </h1>
                <p className="mt-4 max-w-lg text-[0.98rem] leading-relaxed text-slate-700 md:text-[1.05rem]">
                  {AUTH_COPY.body}
                </p>
                {isMobileViewport && (
                  <div className="mt-5 grid gap-2.5">
                    <button
                      onClick={() => onDemoLogin(UserRole.STUDENT)}
                      data-testid="demo-login-student-edge-mobile"
                      className="flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-[0.98rem] font-bold leading-tight text-medace-800 shadow-sm transition-colors hover:bg-medace-50"
                    >
                      生徒としてすぐ試す
                    </button>
                  </div>
                )}
              </div>

              <div className="grid gap-3">
                {(authMode === 'SIGNUP' ? AUTH_COPY.signupSteps : AUTH_COPY.loginSteps).map((step) => (
                  <div key={step} className="flex items-center gap-3 rounded-xl border border-medace-100 bg-white px-4 py-3">
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-medace-600" />
                    <span className="text-base font-medium leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>

              <div className="rounded-panel border border-medace-200 bg-white p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-sm font-bold tracking-[0.12em] text-medace-700">{AUTH_COPY.demoEyebrow}</p>
                  <span className="rounded-lg border border-medace-200 bg-medace-50 px-3 py-1.5 text-xs font-black tracking-[0.12em] text-medace-800">
                    {getDemoAccessWindowLabel()} 限定
                  </span>
                </div>
                <p className="mt-3 text-[0.98rem] leading-relaxed text-slate-700">
                  生徒向けの画面に加えて、学校・教室向けのビジネス版デモもこの画面からそのまま確認できます。体験用アカウントは期間限定で、別端末では別の体験セッションが作られます。
                </p>
                <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                  体験開始では診断テストを挟まず、教材ホームから始めます。アカウント登録またはログイン後は、レベル調整のために診断が表示されます。
                </p>
                {runtimeFlags.appOnlineOnly && (
                  <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                    現在の導入 pilot はオンライン接続前提です。ホーム画面追加やオフライン同期は段階導入前の対象外です。
                  </p>
                )}
                {!isMobileViewport && (
                  <div className="mt-4 grid gap-3">
                    <button
                      onClick={() => onDemoLogin(UserRole.STUDENT)}
                      data-testid="demo-login-student-edge"
                      className="flex min-h-12 w-full items-center justify-center rounded-xl bg-white px-4 py-3 text-base font-bold text-medace-800 shadow-sm transition-colors hover:bg-medace-50"
                    >
                      生徒としてすぐ試す
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#fffdf9] p-7 md:p-9">
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl border border-medace-200 bg-medace-50 p-1.5">
              <button
                type="button"
                onClick={() => onChangeAuthMode('LOGIN')}
                className={`rounded-lg px-4 py-3 text-base font-bold transition-all ${authMode === 'LOGIN' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
              >
                ログイン
              </button>
              <button
                type="button"
                onClick={() => onChangeAuthMode('SIGNUP')}
                className={`rounded-lg px-4 py-3 text-base font-bold transition-all ${authMode === 'SIGNUP' ? 'bg-white text-medace-700 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
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

            {fastStartPanel}

            <form onSubmit={onSubmitEmailAuth} className="space-y-4">
              {authMode === 'SIGNUP' && (
                <div>
                  <label className="ui-form-label mb-2">表示名</label>
                  <div className="relative">
                    <User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={displayName}
                      onChange={(event) => onDisplayNameChange(event.target.value)}
                      data-testid="auth-display-name-input"
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
                    onChange={(event) => onEmailChange(event.target.value)}
                    data-testid="auth-email-input"
                    className="ui-input pl-11 pr-4"
                    placeholder="name@example.com"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="ui-form-label mb-0">パスワード</label>
                  {authMode === 'LOGIN' ? (
                    <button
                      type="button"
                      onClick={onOpenPasswordRecovery}
                      data-testid="open-password-recovery"
                      className="text-sm font-bold text-medace-800 underline-offset-4 hover:underline"
                    >
                      パスワードを忘れた方
                    </button>
                  ) : (
                    <span className="text-sm font-bold text-slate-500">6文字以上</span>
                  )}
                </div>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => onPasswordChange(event.target.value)}
                    data-testid="auth-password-input"
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
                      onChange={(event) => onConfirmPasswordChange(event.target.value)}
                      data-testid="auth-confirm-password-input"
                      className="ui-input pl-11 pr-4"
                      placeholder="確認用にもう一度入力"
                      autoComplete="new-password"
                    />
                  </div>
                </div>
              )}

              {authMode === 'LOGIN' && showPasswordRecovery && (
                <div
                  data-testid="password-recovery-panel"
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-medace-700">
                      <LifeBuoy className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-slate-900">再設定リクエスト</p>
                      <p className="mt-1 text-sm leading-relaxed text-slate-600">
                        メールアドレス欄を確認して送信してください。アカウントの有無は画面に表示しません。
                      </p>
                      {passwordRecoveryMessage && (
                        <div
                          data-testid="password-recovery-message"
                          className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium leading-relaxed text-emerald-800"
                        >
                          {passwordRecoveryMessage}
                        </div>
                      )}
                      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={onRequestPasswordRecovery}
                          disabled={passwordRecoveryLoading}
                          data-testid="submit-password-recovery"
                          className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                        >
                          {passwordRecoveryLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                          再設定を依頼する
                        </button>
                        <button
                          type="button"
                          onClick={() => onDemoLogin(UserRole.STUDENT)}
                          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100"
                        >
                          今は体験で進む
                        </button>
                        <button
                          type="button"
                          onClick={onClosePasswordRecovery}
                          className="inline-flex min-h-10 items-center justify-center rounded-lg px-3 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-white"
                        >
                          閉じる
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {authError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                data-testid="auth-submit"
                className={`flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-base font-bold leading-tight shadow-sm transition-colors ${
                  authMode === 'LOGIN'
                    ? 'bg-slate-950 text-white hover:bg-slate-800'
                    : 'bg-medace-600 text-slate-950 hover:bg-medace-700'
                }`}
              >
                {authMode === 'LOGIN' ? (
                  <><LogIn className="h-4 w-4" /> ログイン</>
                ) : (
                  <><UserPlus className="h-4 w-4" /> 登録してはじめる <ArrowRight className="h-4 w-4" /></>
                )}
              </button>

              <div className="rounded-xl border border-medace-200 bg-medace-50/70 px-4 py-3 text-[0.98rem] leading-relaxed text-medace-900/80">
                {authMode === 'LOGIN' ? AUTH_COPY.helperLogin : AUTH_COPY.helperSignup}
              </div>
            </form>

          </div>
        </div>
    </div>
  );

  return (
    <div className="mx-auto mt-4 max-w-7xl space-y-5 sm:mt-6 sm:space-y-6 lg:mt-10">
      <section
        data-testid="start-first-home"
        className="grid gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_400px]"
      >
        <div className="rounded-[24px] border border-medace-200 bg-white p-5 shadow-[0_18px_48px_rgba(15,23,42,0.06)] sm:rounded-[28px] sm:p-6 md:p-8 lg:p-10">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-medace-200 bg-medace-50 shadow-sm sm:h-14 sm:w-14">
            <span className="text-xl font-black text-medace-700 sm:text-2xl">{BRAND.mark}</span>
          </div>
          <h1 className="mt-4 max-w-3xl text-2xl font-black leading-tight tracking-tight text-slate-950 sm:mt-6 sm:text-3xl md:text-5xl">
            最初の画面から、すぐ単語学習を始める
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:mt-4 sm:text-base md:text-lg">
            登録や診断テストを後回しにして、教材ホームを先に確認できます。ログインした後は、あなたのレベルに合わせるための診断へ進みます。
          </p>
          <div className="mt-5 flex flex-col gap-2.5 sm:mt-7 sm:flex-row sm:gap-3">
            <button
              type="button"
              onClick={() => onDemoLogin(UserRole.STUDENT)}
              data-testid="demo-login-student"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-2.5 text-base font-black text-slate-950 shadow-sm transition-colors hover:bg-medace-700 sm:min-h-12 sm:px-6 sm:py-3"
            >
              今すぐ学習を始める <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => openAuthEdgePanel('SIGNUP')}
              data-testid="start-first-signup"
              className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-base font-bold text-slate-700 transition-colors hover:bg-slate-50 sm:min-h-12 sm:px-6 sm:py-3"
            >
              登録して診断へ
            </button>
          </div>

        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <details
            ref={authEdgePanelRef}
            data-testid="auth-edge-panel"
            className="rounded-[20px] border border-slate-200 bg-white shadow-sm open:shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:rounded-[24px]"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-left sm:px-5 sm:py-4 [&::-webkit-details-marker]:hidden">
              <span>
                <span className="block text-sm font-black text-slate-950">ログイン / 登録</span>
                <span className="mt-1 block text-xs font-bold text-slate-500">後からアカウントに保存する</span>
              </span>
              <LogIn className="h-4 w-4 text-slate-400" />
            </summary>
            <div className="border-t border-slate-100 p-3">
              {authCard}
            </div>
          </details>
        </aside>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4 lg:col-span-2">
          {roleQuickLinks.map((roleLink) => (
            <button
              key={roleLink.key}
              type="button"
              data-testid={roleLink.cardActionTestId}
              onClick={() => onOpenPublicRole(roleLink.key)}
              className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition-colors hover:border-medace-200 hover:bg-white"
            >
              <span className="block text-sm font-black text-slate-950">{roleLink.title}</span>
              <span className="mt-2 block text-xs font-bold text-medace-700">{roleLink.directPath}</span>
              <span className="mt-3 block text-sm leading-relaxed text-slate-600">{roleLink.cardDetail}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
};

export default AuthExperienceScreen;
