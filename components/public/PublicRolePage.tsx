import React, { useMemo, useRef } from 'react';
import { ArrowLeft, ArrowRight, Building2, Lock, Settings, ShieldCheck, Users } from 'lucide-react';

import getClientRuntimeFlags from '../../config/runtime';
import { CommercialRequestKind, type OrganizationRole, UserRole } from '../../types';
import {
  getPublicBusinessRoleConfig,
  getPublicBusinessRolePrimaryAction,
  type PublicBusinessRoleKey,
} from '../../shared/publicBusinessRoles';
import CommercialRequestForm from '../commercial/CommercialRequestForm';
import { submitPublicCommercialRequest } from '../../services/commercial';

interface PublicRolePageProps {
  roleKey: PublicBusinessRoleKey;
  onBack: () => void;
  onDemoLogin: (role: UserRole, organizationRole?: OrganizationRole) => void;
}

const ROLE_ICONS = {
  student: <Users className="h-5 w-5" />,
  instructor: <Building2 className="h-5 w-5" />,
  'group-admin': <ShieldCheck className="h-5 w-5" />,
  'service-admin': <Settings className="h-5 w-5" />,
} as const;

const ROLE_PAGE_STEPS = [
  '対象塾か判断する',
  '役割ごとの見え方を確認する',
  '導入相談を送る',
  '招待または手動発行で開始する',
];

const PublicRolePage: React.FC<PublicRolePageProps> = ({
  roleKey,
  onBack,
  onDemoLogin,
}) => {
  const runtimeFlags = getClientRuntimeFlags();
  const previewSectionRef = useRef<HTMLDivElement | null>(null);
  const requestSectionRef = useRef<HTMLDivElement | null>(null);
  const role = useMemo(() => getPublicBusinessRoleConfig(roleKey), [roleKey]);
  const primaryAction = useMemo(
    () => getPublicBusinessRolePrimaryAction(roleKey, runtimeFlags),
    [roleKey, runtimeFlags],
  );

  const openPreview = () => {
    previewSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const openConsultation = () => {
    requestSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
    openConsultation();
  };

  return (
    <div className="mx-auto mt-6 max-w-5xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-base font-bold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" /> 導入ガイドに戻る
      </button>

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
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold ${
                primaryAction.kind === 'demo'
                  ? 'bg-medace-600 text-white'
                  : primaryAction.kind === 'preview'
                    ? 'border border-medace-200 bg-white text-medace-700'
                    : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {primaryAction.kind === 'request' && <Lock className="h-4 w-4" />}
              {primaryAction.kind === 'preview' && <Settings className="h-4 w-4" />}
              {primaryAction.label}
            </button>
            <button
              type="button"
              onClick={openConsultation}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700"
            >
              導入相談フォームへ <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <p className="mt-4 text-sm leading-relaxed text-slate-600">{primaryAction.note}</p>
        </div>

        <div className="space-y-8 p-6 md:p-8">
          <section>
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
              ref={previewSectionRef}
              data-testid={`public-role-preview-${role.key}`}
              className="rounded-[28px] border border-medace-100 bg-gradient-to-br from-white via-medace-50/60 to-slate-50 px-6 py-6 shadow-[0_18px_44px_rgba(255,130,22,0.10)]"
            >
              <p className="text-sm font-bold text-medace-700">ロール別UIプレビュー</p>
              <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">実権限を開かずに画面構成だけ確認できます</h2>
              <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-600">
                本番公開環境では service admin の実データや更新操作には入れません。代わりに、導入相談、配信、お知らせ運用で見る代表 UI をこの場で確認できます。
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
            <p className="text-sm font-bold text-slate-500">体験ポリシー</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">体験開始は明示クリックで行います</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              ページを開いた時点では自動ログインしません。案内を読んだうえで、必要なら体験開始、またはそのまま導入相談へ進めます。
            </p>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white px-6 py-5">
            <p className="text-sm font-bold tracking-[0.12em] text-slate-500">導入フロー</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">半セルフ導入の流れ</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {ROLE_PAGE_STEPS.map((step, index) => (
                <div key={step} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold text-slate-400">手順 {index + 1}</div>
                  <div className="mt-1 text-sm font-bold text-slate-900">{step}</div>
                </div>
              ))}
            </div>
          </section>

          <div ref={requestSectionRef}>
            <CommercialRequestForm
              title={role.requestTitle}
              description={role.requestDescription}
              source={role.requestSource}
              submitLabel="導入相談を送る"
              availableKinds={[CommercialRequestKind.BUSINESS_TRIAL, CommercialRequestKind.BUSINESS_ROLE_CONVERSION]}
              defaultKind={CommercialRequestKind.BUSINESS_TRIAL}
              onSubmit={submitPublicCommercialRequest}
            />
          </div>
        </div>
      </section>
    </div>
  );
};

export default PublicRolePage;
