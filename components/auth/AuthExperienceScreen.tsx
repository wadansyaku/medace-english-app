import React from 'react';
import { ArrowRight, BookOpen, LifeBuoy, Loader2, Lock, LogIn, Mail, User, UserPlus, X } from 'lucide-react';

import { BRAND } from '../../config/brand';
import { getDemoAccessWindowLabel } from '../../utils/demo';
import ModalOverlay from '../ModalOverlay';
import PublicInfoPage from '../PublicInfoPage';
import PublicRolePage from '../public/PublicRolePage';
import { OrganizationRole, UserRole, type PublicMotivationSnapshot } from '../../types';
import { PUBLIC_BUSINESS_ROLE_CONFIGS, type PublicBusinessRoleKey } from '../../shared/publicBusinessRoles';

export interface AuthExperienceScreenProps {
  currentView: 'login' | 'publicInfo' | 'publicRole';
  publicRole: PublicBusinessRoleKey | null;
  authPanelMode?: 'LOGIN' | 'SIGNUP';
  authMode: 'LOGIN' | 'SIGNUP';
  authSubmitting: boolean;
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
  onOpenAuth: (mode: 'LOGIN' | 'SIGNUP') => void;
  onCloseAuth: () => void;
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

// Keep the form independent of the landing page and its optional explanation.
export const AuthForm: React.FC<AuthExperienceScreenProps> = (props) => {
  const {
    authMode, authSubmitting, displayName, email, password, confirmPassword, authError,
    showPasswordRecovery, passwordRecoveryLoading, passwordRecoveryMessage,
    onChangeAuthMode, onCloseAuth, onDisplayNameChange, onEmailChange, onPasswordChange,
    onConfirmPasswordChange, onSubmitEmailAuth, onOpenPasswordRecovery,
    onClosePasswordRecovery, onRequestPasswordRecovery,
  } = props;
  const busy = authSubmitting || passwordRecoveryLoading;
  const title = showPasswordRecovery ? 'パスワードの再設定' : authMode === 'LOGIN' ? 'ログイン' : '新規登録';
  const emailRef = React.useRef<HTMLInputElement | null>(null);
  const nameRef = React.useRef<HTMLInputElement | null>(null);
  const errorRef = React.useRef<HTMLDivElement | null>(null);
  const previousStepRef = React.useRef(`${authMode}:${showPasswordRecovery}`);

  React.useEffect(() => {
    const step = `${authMode}:${showPasswordRecovery}`;
    if (previousStepRef.current !== step) {
      previousStepRef.current = step;
      (authMode === 'SIGNUP' && !showPasswordRecovery ? nameRef.current : emailRef.current)?.focus({ preventScroll: true });
    }
  }, [authMode, showPasswordRecovery]);

  React.useEffect(() => {
    if (authError) {
      errorRef.current?.focus({ preventScroll: true });
      errorRef.current?.scrollIntoView({ block: 'nearest' });
    }
  }, [authError]);

  return (
    <section data-testid="auth-focused-form" className="rounded-panel border border-medace-200 bg-white p-5 shadow-xl sm:p-7">
      <header className="mb-5 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold text-medace-700">{BRAND.shortName}</p>
          <h2 id="auth-dialog-title" className="mt-1 text-2xl font-black text-steady-ink">{title}</h2>
        </div>
        <button type="button" data-testid="auth-close" onClick={onCloseAuth} disabled={busy}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 hover:bg-medace-50 disabled:opacity-50" aria-label="認証画面を閉じる">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </header>

      {!showPasswordRecovery && (
        <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-medace-200 bg-medace-50 p-1" aria-label="アカウントの操作">
          {(['LOGIN', 'SIGNUP'] as const).map((mode) => (
            <button key={mode} type="button" onClick={() => onChangeAuthMode(mode)} disabled={busy} aria-pressed={authMode === mode}
              className={`min-h-11 rounded-lg px-3 py-2 text-sm font-bold disabled:opacity-50 ${authMode === mode ? 'bg-white text-medace-950 shadow-sm' : 'text-medace-800 hover:bg-white/60'}`}>
              {mode === 'LOGIN' ? 'ログイン' : '新規登録'}
            </button>
          ))}
        </div>
      )}
      <p id="auth-form-description" className="mb-5 text-sm leading-relaxed text-slate-600">
        {showPasswordRecovery
          ? '登録したメールアドレスを入力してください。再設定の依頼を受け付けます。'
          : authMode === 'LOGIN'
            ? '生徒・講師とも、登録済みのアカウントで入れます。'
            : '生徒用アカウントを作ります。講師の方は教室から案内されたアカウントでログインしてください。'}
      </p>

      <form onSubmit={showPasswordRecovery ? (event) => { event.preventDefault(); onRequestPasswordRecovery(); } : onSubmitEmailAuth}
        aria-describedby="auth-form-description" aria-busy={busy} className="space-y-4">
        {authMode === 'SIGNUP' && !showPasswordRecovery && (
          <div>
            <label htmlFor="auth-display-name" className="ui-form-label mb-2">表示名</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input ref={nameRef} id="auth-display-name" name="name" type="text" value={displayName} required data-auth-initial-focus autoComplete="nickname" disabled={busy}
                onChange={(event) => onDisplayNameChange(event.target.value)} data-testid="auth-display-name-input" className="ui-input pl-11 pr-4" placeholder="学習で使う名前" aria-describedby="auth-display-name-help" />
            </div>
            <p id="auth-display-name-help" className="mt-1 text-xs text-slate-500">プロフィールやランキングに表示されます</p>
          </div>
        )}
        <div>
          <label htmlFor="auth-email" className="ui-form-label mb-2">メールアドレス</label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input ref={emailRef} id="auth-email" name="email" data-auth-initial-focus={authMode === 'LOGIN' || showPasswordRecovery ? true : undefined} type="email" value={email} required disabled={busy}
              onChange={(event) => onEmailChange(event.target.value)} data-testid="auth-email-input" className="ui-input pl-11 pr-4"
              placeholder="name@example.com" autoComplete={authMode === 'LOGIN' ? 'username' : 'email'} autoCapitalize="none" spellCheck={false} inputMode="email" />
          </div>
        </div>
        {!showPasswordRecovery && (
          <>
            <div>
              <label htmlFor="auth-password" className="ui-form-label mb-2">パスワード</label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                <input id="auth-password" name="password" type="password" value={password} required disabled={busy} minLength={authMode === 'SIGNUP' ? 6 : undefined}
                  onChange={(event) => onPasswordChange(event.target.value)} data-testid="auth-password-input" className="ui-input pl-11 pr-4"
                  placeholder={authMode === 'SIGNUP' ? '6文字以上で設定' : 'パスワードを入力'} autoComplete={authMode === 'LOGIN' ? 'current-password' : 'new-password'} />
              </div>
            </div>
            {authMode === 'SIGNUP' && (
              <div>
                <label htmlFor="auth-confirm-password" className="ui-form-label mb-2">パスワード確認</label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                  <input id="auth-confirm-password" name="confirm-password" type="password" value={confirmPassword} required disabled={busy} minLength={6}
                    onChange={(event) => onConfirmPasswordChange(event.target.value)} data-testid="auth-confirm-password-input" className="ui-input pl-11 pr-4"
                    placeholder="確認用にもう一度入力" autoComplete="new-password" />
                </div>
              </div>
            )}
          </>
        )}
        {authError && <div ref={errorRef} tabIndex={-1} role="alert" data-testid="auth-error" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{authError}</div>}
        {showPasswordRecovery && passwordRecoveryMessage && (
          <div role="status" data-testid="password-recovery-message" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800">{passwordRecoveryMessage}</div>
        )}
        <button type="submit" disabled={busy} data-testid={showPasswordRecovery ? 'submit-password-recovery' : 'auth-submit'}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-steady-action px-4 py-3 text-base font-bold text-steady-on-action shadow-sm transition-colors hover:bg-steady-action-hover disabled:cursor-wait disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : showPasswordRecovery ? <LifeBuoy className="h-4 w-4" aria-hidden="true" /> : authMode === 'LOGIN' ? <LogIn className="h-4 w-4" aria-hidden="true" /> : <UserPlus className="h-4 w-4" aria-hidden="true" />}
          {busy ? '送信中...' : showPasswordRecovery ? passwordRecoveryMessage ? 'もう一度依頼する' : '再設定を依頼する' : authMode === 'LOGIN' ? 'ログイン' : '登録して診断へ'}
        </button>
        {authMode === 'LOGIN' && !showPasswordRecovery && (
          <button type="button" onClick={onOpenPasswordRecovery} disabled={busy} data-testid="open-password-recovery" className="min-h-11 w-full rounded-lg text-sm font-bold text-medace-800 hover:bg-medace-50 disabled:opacity-50">パスワードを忘れた方</button>
        )}
        {showPasswordRecovery ? (
          <div data-testid="password-recovery-panel">
            <p className="text-xs leading-relaxed text-slate-500">アカウントの有無は画面に表示しません。再設定リクエストの受付です。即時のメール送信を保証するものではありません。</p>
            <button type="button" onClick={onClosePasswordRecovery} disabled={busy} className="mt-2 min-h-11 w-full rounded-lg text-sm font-bold text-medace-800 hover:bg-medace-50 disabled:opacity-50">ログインに戻る</button>
          </div>
        ) : authMode === 'SIGNUP' && <p className="text-xs leading-relaxed text-slate-500">登録後は初回診断で、学習のスタートレベルを確認します</p>}
      </form>
    </section>
  );
};

const AuthExperienceScreen: React.FC<AuthExperienceScreenProps> = (props) => {
  const { currentView, publicRole, authPanelMode, authMode, authSubmitting, passwordRecoveryLoading, authError,
    motivationSnapshot, motivationLoading, motivationError, onClosePublicInfo, onOpenPublicRole,
    onClosePublicRole, onDemoLogin, onOpenAuth, onCloseAuth } = props;
  const busy = authSubmitting || passwordRecoveryLoading;

  const content = currentView === 'publicRole' && publicRole ? (
    <PublicRolePage roleKey={publicRole} onDemoLogin={onDemoLogin} onBack={onClosePublicRole}
      onLogin={() => onOpenAuth('LOGIN')} busy={authSubmitting} authError={authPanelMode ? null : authError} />
  ) : currentView === 'publicInfo' ? (
    <PublicInfoPage onBack={onClosePublicInfo} motivationSnapshot={motivationSnapshot} motivationLoading={motivationLoading}
      motivationError={motivationError} onOpenRole={onOpenPublicRole} />
  ) : (
    <div className="mx-auto mt-4 max-w-5xl space-y-5 sm:mt-6 lg:mt-10">
      <section data-testid="start-first-home" className="rounded-panel border border-medace-200 bg-white p-5 shadow-sm sm:p-8 lg:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-medace-200 bg-medace-50 text-xl font-black text-medace-700">{BRAND.mark}</div>
        <p className="mt-5 text-sm font-bold text-medace-700">英単語学習スペース</p>
        <h1 className="mt-2 text-2xl font-black leading-tight text-steady-ink sm:text-4xl">今日の学習を、ここから</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 sm:text-base">アカウントで学習を続けるか、登録なしの体験から始められます。</p>
        <div className="mt-6 grid gap-3 sm:max-w-xl sm:grid-cols-2">
          <button type="button" onClick={() => onOpenAuth('LOGIN')} data-testid="start-first-login" disabled={busy}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-steady-action px-5 py-3 text-base font-black text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50"><LogIn className="h-4 w-4" aria-hidden="true" /> ログイン</button>
          <button type="button" onClick={() => onOpenAuth('SIGNUP')} data-testid="start-first-signup" disabled={busy}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-medace-200 bg-white px-5 py-3 text-base font-bold text-medace-900 hover:bg-medace-50 disabled:opacity-50"><UserPlus className="h-4 w-4" aria-hidden="true" /> 新規登録</button>
        </div>
        <div className="mt-5 border-t border-slate-100 pt-5">
          <button type="button" onClick={() => onDemoLogin(UserRole.STUDENT)} data-testid="demo-login-student" disabled={busy}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-bold text-medace-800 hover:bg-medace-50 disabled:opacity-50"><BookOpen className="h-4 w-4" aria-hidden="true" /> {authSubmitting ? '体験を準備中...' : '登録なしで生徒画面を体験する'} <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
          <p className="mt-1 text-xs leading-relaxed text-slate-500">{getDemoAccessWindowLabel()} 限定の体験です。自分のアカウントに保存するには登録してください。</p>
        </div>
        {!authPanelMode && authError && <p role="alert" data-testid="auth-demo-error" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{authError}</p>}
      </section>
      <section className="rounded-panel border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="role-entry-heading">
        <h2 id="role-entry-heading" className="text-base font-black text-steady-ink">講師・教室の方へ</h2>
        <p className="mt-1 text-sm text-slate-600">登録済みの講師は上のログインから入れます。画面の案内はこちら。</p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {PUBLIC_BUSINESS_ROLE_CONFIGS.map((role) => (
            <button key={role.key} type="button" data-testid={role.cardActionTestId} onClick={() => onOpenPublicRole(role.key)} disabled={busy}
              className="flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-3 text-left text-sm font-bold text-slate-700 hover:border-medace-200 hover:bg-medace-50 disabled:opacity-50"><span className="min-w-0 break-words">{role.title}</span><ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" /></button>
          ))}
        </div>
        <details data-testid="auth-product-explanation" className="mt-4 border-t border-slate-100 pt-3">
          <summary className="cursor-pointer py-2 text-sm font-bold text-medace-800">学習の流れを見る</summary>
          <ol className="mt-2 list-inside list-decimal space-y-2 text-sm leading-relaxed text-slate-600">
            <li>生徒用アカウントを登録する、またはログインする</li>
            <li>初回診断でスタートレベルを確認する</li>
            <li>教材ホームで今日の学習や復習を選ぶ</li>
          </ol>
        </details>
      </section>
    </div>
  );

  return <>
    {currentView === 'publicInfo' && !authPanelMode && (authSubmitting || authError) && (
      <p role={authError ? 'alert' : 'status'} className={`mx-auto mt-4 max-w-5xl rounded-xl border p-3 text-sm ${authError ? 'border-red-200 bg-red-50 text-red-700' : 'border-medace-200 bg-medace-50 text-medace-900'}`}>{authError || '体験を準備中...'}</p>
    )}
    {content}{authPanelMode && (
    <ModalOverlay onClose={() => { if (!busy) onCloseAuth(); }} closeOnOverlayClick={!busy} zIndexClassName="z-[60]"
      panelClassName="max-w-lg" ariaLabelledBy="auth-dialog-title" initialFocusSelector="[data-auth-initial-focus]"
      returnFocusSelector={currentView === 'publicRole' ? '[data-testid=public-role-login]' : authPanelMode === 'SIGNUP' ? '[data-testid=start-first-signup]' : '[data-testid=start-first-login]'}>
      <AuthForm {...props} authMode={authPanelMode || authMode} />
    </ModalOverlay>
  )}</>;
};

export default AuthExperienceScreen;
