import React from 'react';
import { Building2, Settings, ShieldCheck, Users } from 'lucide-react';
import {
  PUBLIC_BUSINESS_ROLE_CONFIGS,
  type PublicBusinessRoleKey,
} from '../../shared/publicBusinessRoles';

interface BusinessRolePreviewSectionProps {
  onOpenRole: (roleKey: PublicBusinessRoleKey) => void;
  learnerOnly?: boolean;
}

const ROLE_ICONS = {
  student: <Users className="h-5 w-5" />,
  instructor: <Building2 className="h-5 w-5" />,
  'group-admin': <ShieldCheck className="h-5 w-5" />,
  'service-admin': <Settings className="h-5 w-5" />,
} as const;

const BusinessRolePreviewSection: React.FC<BusinessRolePreviewSectionProps> = ({
  onOpenRole,
  learnerOnly = false,
}) => {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm" data-testid="business-role-preview-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{learnerOnly ? '生徒の学習画面' : '4つの専用入口をここから確認する'}</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            {learnerOnly ? '登録済みのアカウントで学習を続けられます。' : '必要な役割の専用ページを直接開けます。'}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PUBLIC_BUSINESS_ROLE_CONFIGS.filter((preview) => !learnerOnly || preview.key === 'student').map((preview) => (
          <div key={preview.cardTestId} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5" data-testid={preview.cardTestId}>
            <div className="flex items-center gap-2 text-medace-700">
              {ROLE_ICONS[preview.icon]}
              <span className="text-sm font-bold">{preview.title}</span>
            </div>
            <div className="mt-3 text-sm leading-relaxed text-slate-600">{preview.cardDescription}</div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{preview.cardDetail}</div>
            <button
              type="button"
              data-testid={preview.cardActionTestId}
              onClick={() => onOpenRole(preview.key)}
              className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              専用リンクを開く
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default BusinessRolePreviewSection;
