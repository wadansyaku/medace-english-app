import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  LogIn,
  Mail,
  User,
  UserPlus,
} from 'lucide-react';

import { AUTH_COPY, BRAND } from '../../config/brand';
import getClientRuntimeFlags from '../../config/runtime';
import useIsMobileViewport from '../../hooks/useIsMobileViewport';
import { getDemoAccessWindowLabel } from '../../utils/demo';
import BusinessRolePreviewSection from '../commercial/BusinessRolePreviewSection';
import PublicMotivationPanel from '../PublicMotivationPanel';
import PublicInfoPage from '../PublicInfoPage';
import PublicRolePage from '../public/PublicRolePage';
import { OrganizationRole, UserRole, type PublicMotivationSnapshot } from '../../types';
import type { PublicBusinessRoleKey } from '../../shared/publicBusinessRoles';

interface AuthExperienceScreenProps {
  currentView: 'login' | 'publicInfo' | 'publicRole';
  publicRole: PublicBusinessRoleKey | null;
  authMode: 'LOGIN' | 'SIGNUP';
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
  authError: string | null;
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
  onDemoLogin: (role: UserRole, organizationRole?: OrganizationRole) => void;
  onToggleAlternateAccess: () => void;
  onOpenPublicInfo: () => void;
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
  onDemoLogin,
  onToggleAlternateAccess,
  onOpenPublicInfo,
  onClosePublicInfo,
  onOpenPublicRole,
  onClosePublicRole,
}) => {
  const runtimeFlags = getClientRuntimeFlags();
  const isMobileViewport = useIsMobileViewport();

  if (currentView === 'publicRole' && publicRole) {
    return (
      <PublicRolePage
        roleKey={publicRole}
        onBack={onClosePublicRole}
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

  const motivationPanel = (
    <PublicMotivationPanel
      snapshot={motivationSnapshot}
      loading={motivationLoading}
      error={motivationError}
      compact
    />
  );

  const authCard = (
    <div className="overflow-hidden rounded-[32px] border border-medace-100 bg-white shadow-[0_28px_90px_rgba(255,130,22,0.12)]">
        <div className="grid lg:grid-cols-[1.04fr_0.96fr]">
          <div className="relative overflow-hidden bg-medace-500 p-9 text-white md:p-11">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.3),_transparent_34%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.16),_transparent_28%)]"></div>
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
                {isMobileViewport && (
                  <div className="mt-5 grid gap-3">
                    <button
                      onClick={() => onDemoLogin(UserRole.STUDENT)}
                      data-testid="demo-login-student"
                      className="w-full rounded-2xl bg-white py-4 text-base font-bold text-medace-700 shadow-sm transition-colors hover:bg-orange-50"
                    >
                      生徒としてすぐ試す
                    </button>
                    <button
                      type="button"
                      onClick={onOpenPublicInfo}
                      data-testid="open-business-guide-mobile"
                      className="w-full rounded-2xl border border-white/20 bg-white/10 py-3 text-sm font-bold text-white"
                    >
                      学校・教室向け導入を見る
                    </button>
                  </div>
                )}
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
                {runtimeFlags.appOnlineOnly && (
                  <p className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-relaxed text-white/78">
                    現在の導入 pilot はオンライン接続前提です。ホーム画面追加やオフライン同期は段階導入前の対象外です。
                  </p>
                )}
                {!isMobileViewport && (
                  <div className="mt-4 grid gap-3">
                    <button
                      onClick={() => onDemoLogin(UserRole.STUDENT)}
                      data-testid="demo-login-student"
                      className="w-full rounded-2xl bg-white py-4 text-base font-bold text-medace-700 shadow-sm transition-colors hover:bg-orange-50"
                    >
                      生徒としてすぐ試す
                    </button>
                    <button
                      type="button"
                      onClick={onOpenPublicInfo}
                      data-testid="open-business-guide-desktop"
                      className="w-full rounded-2xl border border-white/20 bg-white/10 py-3 text-sm font-bold text-white"
                    >
                      学校・教室向け導入を見る
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="bg-[#fffdf9] p-7 md:p-9 lg:p-11">
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-2xl border border-medace-100 bg-medace-50 p-1.5">
              <button
                type="button"
                onClick={() => onChangeAuthMode('LOGIN')}
                className={`rounded-xl px-4 py-3.5 text-base font-bold transition-all ${authMode === 'LOGIN' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
              >
                ログイン
              </button>
              <button
                type="button"
                onClick={() => onChangeAuthMode('SIGNUP')}
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
                    onChange={(event) => onPasswordChange(event.target.value)}
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
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 py-4 text-base font-bold text-white shadow-md transition-colors hover:bg-medace-700"
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
                  onClick={onOpenPublicInfo}
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-base font-bold text-slate-700 transition-colors hover:bg-slate-100"
                >
                  アプリの説明・料金を見る <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
    </div>
  );

  return (
    <div className="mx-auto mt-6 max-w-6xl space-y-6 lg:mt-10">
      {isMobileViewport ? authCard : motivationPanel}
      {isMobileViewport ? motivationPanel : authCard}
      <BusinessRolePreviewSection
        onOpenGuide={onOpenPublicInfo}
        onOpenRole={onOpenPublicRole}
      />
    </div>
  );
};

export default AuthExperienceScreen;
