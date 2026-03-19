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

const PublicRolePage: React.FC<PublicRolePageProps> = ({
  roleKey,
  onBack,
  onDemoLogin,
}) => {
  const runtimeFlags = getClientRuntimeFlags();
  const requestSectionRef = useRef<HTMLDivElement | null>(null);
  const role = useMemo(() => getPublicBusinessRoleConfig(roleKey), [roleKey]);
  const primaryAction = useMemo(
    () => getPublicBusinessRolePrimaryAction(roleKey, runtimeFlags),
    [roleKey, runtimeFlags],
  );

  const openConsultation = () => {
    requestSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handlePrimaryAction = () => {
    if (primaryAction.kind === 'demo') {
      onDemoLogin(role.demoRole, role.demoOrganizationRole);
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
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {primaryAction.kind === 'request' && <Lock className="h-4 w-4" />}
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
            <p className="text-sm font-bold tracking-[0.12em] text-slate-500">Representative Views</p>
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

          <section className="rounded-[28px] border border-slate-200 bg-slate-50 px-6 py-5">
            <p className="text-sm font-bold tracking-[0.12em] text-slate-500">Demo Policy</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">体験開始は明示クリックで行います</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">
              ページを開いた時点では自動ログインしません。案内を読んだうえで、必要なら体験開始、またはそのまま導入相談へ進めます。
            </p>
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
