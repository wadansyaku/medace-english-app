import React, { useMemo, useRef } from 'react';
import { ArrowLeft, LogIn, Building2, Settings, ShieldCheck, Users } from 'lucide-react';

import getClientRuntimeFlags from '../../config/runtime';
import { type OrganizationRole, UserRole } from '../../types';
import {
  getPublicBusinessRoleConfig,
  getPublicBusinessRolePrimaryAction,
  type PublicBusinessRoleKey,
} from '../../shared/publicBusinessRoles';

interface PublicRolePageProps {
  roleKey: PublicBusinessRoleKey;
  onBack?: () => void;
  onLogin?: () => void;
  busy?: boolean;
  authError?: string | null;
  onDemoLogin: (role: UserRole, organizationRole?: OrganizationRole) => void;
}

const ROLE_ICONS = {
  student: <Users className="h-5 w-5" />,
  instructor: <Building2 className="h-5 w-5" />,
  'group-admin': <ShieldCheck className="h-5 w-5" />,
  'service-admin': <Settings className="h-5 w-5" />,
} as const;

const PublicRolePage: React.FC<PublicRolePageProps> = ({
  roleKey,
  onDemoLogin,
  onBack,
  onLogin,
  busy = false,
  authError,
}) => {
  const runtimeFlags = getClientRuntimeFlags();
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const role = useMemo(() => getPublicBusinessRoleConfig(roleKey), [roleKey]);
  const primaryAction = useMemo(
    () => getPublicBusinessRolePrimaryAction(roleKey, runtimeFlags),
    [roleKey, runtimeFlags],
  );

  const openPreview = () => {
    previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrimaryAction = () => {
    if (primaryAction.kind === 'demo') {
      onDemoLogin(role.demoRole, role.demoOrganizationRole);
      return;
    }
    if (primaryAction.kind === 'preview') {
      openPreview();
      return;
    }
  };

  return (
    <div className="mx-auto mt-6 max-w-5xl space-y-6">
      {onBack && <button type="button" onClick={onBack} disabled={busy} data-testid="public-role-back" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-medace-800 hover:bg-white disabled:opacity-50"><ArrowLeft className="h-4 w-4" aria-hidden="true" /> 案内に戻る</button>}
      <section
        className="overflow-hidden rounded-[32px] border border-medace-100 bg-white shadow-[0_28px_90px_rgba(255,130,22,0.12)]"
        data-testid={role.pageTestId}
      >
        <div className="border-b border-slate-100 bg-medace-50 p-8 md:p-10">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-medace-700">
              {ROLE_ICONS[role.icon]}
              <p className="text-sm font-bold tracking-[0.12em]">{role.audienceLabel}</p>
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">{role.title}</h1>
            <p className="mt-4 text-base leading-relaxed text-slate-600 md:text-[1.05rem]">
              {role.summary}
            </p>
            <p className="mt-4 rounded-3xl border border-white/80 bg-white/90 px-5 py-4 text-sm leading-relaxed text-slate-700 shadow-sm">
              {role.primaryActionSummary}
            </p>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid={role.primaryActionTestId}
              onClick={handlePrimaryAction}
              disabled={busy}
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold ${
                primaryAction.kind === 'demo'
                  ? 'bg-steady-action text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50'
                  : 'border border-medace-200 bg-white text-medace-700'
              }`}
            >
              {primaryAction.kind === 'preview' && <Settings className="h-4 w-4" />}
              {busy ? '体験を準備中...' : primaryAction.label}
            </button>
            {onLogin && <button type="button" onClick={onLogin} disabled={busy} data-testid="public-role-login" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-medace-200 bg-white px-5 py-3 text-sm font-bold text-medace-800 hover:bg-medace-50 disabled:opacity-50"><LogIn className="h-4 w-4" aria-hidden="true" /> 登録済みのアカウントでログイン</button>}
          </div>
          {authError && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{authError}</p>}

          <p className="mt-4 text-sm leading-relaxed text-slate-600">{primaryAction.note}</p>
        </div>

        <div className="space-y-8 p-6 md:p-8">
          <section ref={previewSectionRef}>
            <p className="text-sm font-bold text-slate-500">代表画面</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">この役割で見える代表画面</h2>
            <div className="mt-5 grid gap-3 md:grid-cols-3">
              {role.highlights.map((highlight) => (
                <div key={highlight.label} className="rounded-3xl border border-slate-200 bg-slate-50/70 px-5 py-5">
                  <div className="text-sm font-bold text-slate-500">{highlight.label}</div>
                  <p className="mt-3 text-base leading-relaxed text-slate-600">{highlight.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {role.previewPanels && role.previewPanels.length > 0 && (
            <section
              data-testid={`public-role-preview-${role.key}`}
              className="rounded-[28px] border border-medace-100 bg-gradient-to-br from-white via-medace-50/60 to-slate-50 px-6 py-6 shadow-[0_18px_44px_rgba(255,130,22,0.10)]"
            >
              <p className="text-sm font-bold text-medace-700">役割別の画面プレビュー</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">実際の権限を使わずに、画面構成だけを確認できます</h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
                本番公開環境では、サービス管理者の実データや更新操作にはアクセスできません。代わりに、受付一覧、配信、お知らせの管理画面の例をこのページで確認できます。
              </p>
              <div className="mt-6 grid gap-4 xl:grid-cols-3">
                {role.previewPanels.map((panel) => (
                  <div key={panel.title} className="rounded-[24px] border border-slate-200 bg-white px-5 py-5 shadow-sm">
                    <p className="text-xs font-bold text-slate-400">{panel.eyebrow}</p>
                    <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">{panel.title}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-slate-600">{panel.body}</p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {panel.metrics.map((metric) => (
                        <span
                          key={metric}
                          className="inline-flex items-center rounded-full border border-medace-100 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700"
                        >
                          {metric}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-5">
            <p className="text-sm font-bold text-slate-500">体験を始めるときのルール</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">ボタンを押すと体験が始まります</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              ページを開いても自動ではログインしません。案内を読んだうえで、必要な役割の画面だけをボタンで開きます。
            </p>
          </section>

          {primaryAction.kind !== 'demo' && (
            <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-5">
              <p className="text-sm font-bold text-slate-500">ログイン入口</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">この役割の実画面は権限確認後に開きます</h2>
              <p className="mt-3 text-base leading-relaxed text-slate-600">
                サービス管理者などの保護された画面は、公開ページ上では代表構成だけを表示します。
              </p>
            </section>
          )}
        </div>
      </section>
    </div>
  );
};

export default PublicRolePage;
