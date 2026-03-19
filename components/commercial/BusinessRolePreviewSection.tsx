import React from 'react';
import { Building2, Settings, ShieldCheck, Users } from 'lucide-react';
import {
  PUBLIC_BUSINESS_ROLE_CONFIGS,
  type PublicBusinessRoleKey,
} from '../../shared/publicBusinessRoles';

interface BusinessRolePreviewSectionProps {
  onOpenGuide: () => void;
  onOpenRole: (roleKey: PublicBusinessRoleKey) => void;
}

const ROLE_ICONS = {
  student: <Users className="h-5 w-5" />,
  instructor: <Building2 className="h-5 w-5" />,
  'group-admin': <ShieldCheck className="h-5 w-5" />,
  'service-admin': <Settings className="h-5 w-5" />,
} as const;

const BusinessRolePreviewSection: React.FC<BusinessRolePreviewSectionProps> = ({
  onOpenGuide,
  onOpenRole,
}) => {
  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm" data-testid="business-role-preview-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">School / Classroom</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">学校・教室向け導入をここから確認する</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            生徒、講師、学校管理者、サービス管理者の 4 役割それぞれに専用ページを用意し、体験導線と導入相談を分けて確認できるようにしています。
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenGuide}
          className="inline-flex min-h-11 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
        >
          導入ガイドと相談フォームを見る
        </button>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {PUBLIC_BUSINESS_ROLE_CONFIGS.map((preview) => (
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
              この役割を見る
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default BusinessRolePreviewSection;
