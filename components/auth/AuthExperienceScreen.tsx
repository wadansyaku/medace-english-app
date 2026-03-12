import React from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
import PublicMotivationPanel from '../PublicMotivationPanel';
import PublicInfoPage from '../PublicInfoPage';
import { OrganizationRole, UserRole, type PublicMotivationSnapshot } from '../../types';

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

interface AuthExperienceScreenProps {
  currentView: 'login' | 'publicInfo';
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
}

const AuthExperienceScreen: React.FC<AuthExperienceScreenProps> = ({
  currentView,
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
}) => {
  const runtimeFlags = getClientRuntimeFlags();
  const isMobileViewport = useIsMobileViewport();
  const businessDemoOptions = BUSINESS_DEMO_OPTIONS.filter((option) => (
    runtimeFlags.enableAdminDemo || option.role !== UserRole.ADMIN
  ));

  if (currentView === 'publicInfo') {
    return (
      <PublicInfoPage
        onBack={onClosePublicInfo}
        motivationSnapshot={motivationSnapshot}
        motivationLoading={motivationLoading}
        motivationError={motivationError}
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
                  <button
                    onClick={() => onDemoLogin(UserRole.STUDENT)}
                    data-testid="demo-login-student"
                    className="mt-5 w-full rounded-2xl bg-white py-4 text-base font-bold text-medace-700 shadow-sm transition-colors hover:bg-orange-50"
                  >
                    生徒としてすぐ試す
                  </button>
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
                  <button
                    onClick={() => onDemoLogin(UserRole.STUDENT)}
                    data-testid="demo-login-student"
                    className="mt-4 w-full rounded-2xl bg-white py-4 text-base font-bold text-medace-700 shadow-sm transition-colors hover:bg-orange-50"
                  >
                    生徒としてすぐ試す
                  </button>
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

  const schoolDemoSection = (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">School Demo</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
              {runtimeFlags.enablePublicBusinessDemo ? '学校・教室向けの体験は別ブロックで選ぶ' : '学校・教室向け導入は個別案内で進める'}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600">
              {runtimeFlags.enablePublicBusinessDemo
                ? 'ビジネス版は、講師フォロー、組織運用、紙提出の自由英作文までを役割別ワークスペースで確認できます。学生向けの体験開始とは分けて案内します。'
                : '本番 pilot では学校・教室向けアカウントを手動発行し、preview か個別案内でのみ体験セッションを提供します。'}
            </p>
          </div>
          {runtimeFlags.enablePublicBusinessDemo && (
            <button
              type="button"
              onClick={onToggleAlternateAccess}
              className="inline-flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700"
            >
              <span>学校・先生向けの体験メニュー</span>
              {showAlternateAccess ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>

        {runtimeFlags.enablePublicBusinessDemo && showAlternateAccess && (
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {businessDemoOptions.map((option) => (
              <button
                key={option.title}
                onClick={() => onDemoLogin(option.role, option.organizationRole)}
                data-testid={option.testId}
                className={`rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5 text-left transition-colors hover:border-medace-200 hover:bg-medace-50/60 ${
                  option.compact ? 'md:col-span-2' : ''
                }`}
              >
                <div className="text-base font-bold text-slate-950">{option.title}</div>
                <div className="mt-2 text-sm leading-relaxed text-slate-600">{option.description}</div>
                <div className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-medace-600">
                  {getDemoAccessWindowLabel()} の体験セッション
                </div>
              </button>
            ))}
          </div>
        )}

        {!runtimeFlags.enablePublicBusinessDemo && (
          <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-5 py-5 text-sm leading-relaxed text-amber-900">
            学校・教室向けデモは公開本番では非表示です。講師・管理者アカウントは手動発行し、導入案内とセットで案内してください。
          </div>
        )}
    </section>
  );

  return (
    <div className="mx-auto mt-6 max-w-6xl space-y-6 lg:mt-10">
      {isMobileViewport ? authCard : motivationPanel}
      {isMobileViewport ? motivationPanel : authCard}
      {schoolDemoSection}
    </div>
  );
};

export default AuthExperienceScreen;
