import React from 'react';
import { Building2, Lock, Settings, ShieldCheck, Users } from 'lucide-react';
import { OrganizationRole, UserRole } from '../../types';

interface BusinessRolePreviewSectionProps {
  enableLiveDemo: boolean;
  enableAdminDemo?: boolean;
  onOpenGuide: () => void;
  onDemoLogin: (role: UserRole, organizationRole?: OrganizationRole) => void;
}

const PREVIEWS = [
  {
    cardTestId: 'business-role-preview-student',
    actionTestId: 'demo-login-business-student',
    title: 'ビジネス版 生徒',
    description: '講師フォロー通知と教材配信の前提で学習画面を確認します。',
    detail: '授業運用に乗る生徒導線、配布教材、添削返却の受け取りを確認',
    icon: <Users className="h-5 w-5" />,
    role: UserRole.STUDENT,
    organizationRole: OrganizationRole.STUDENT,
  },
  {
    cardTestId: 'business-role-preview-instructor',
    actionTestId: 'demo-login-instructor',
    title: '講師',
    description: '優先生徒の抽出、通知文の作成、添削キューを確認します。',
    detail: '生徒一覧、通知、英作文 review の代表画面を確認',
    icon: <Building2 className="h-5 w-5" />,
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.INSTRUCTOR,
  },
  {
    cardTestId: 'business-role-preview-admin',
    actionTestId: 'demo-login-group-admin',
    title: '学校管理者',
    description: '担当割当、導入運用、KPI の見え方を確認します。',
    detail: '組織ダッシュボード、担当割当、運用指標の代表画面を確認',
    icon: <ShieldCheck className="h-5 w-5" />,
    role: UserRole.INSTRUCTOR,
    organizationRole: OrganizationRole.GROUP_ADMIN,
  },
];

const BusinessRolePreviewSection: React.FC<BusinessRolePreviewSectionProps> = ({
  enableLiveDemo,
  enableAdminDemo = false,
  onOpenGuide,
  onDemoLogin,
}) => {
  const previews = enableAdminDemo
    ? [
        ...PREVIEWS,
        {
          cardTestId: 'business-role-preview-service-admin',
          actionTestId: 'demo-login-admin',
          title: 'サービス管理者',
          description: '導入相談キュー、お知らせ配信、教材運用の管理画面を確認します。',
          detail: 'AdminPanel、運用設定、全体お知らせの配信画面を確認',
          icon: <Settings className="h-5 w-5" />,
          role: UserRole.ADMIN,
          organizationRole: undefined,
        },
      ]
    : PREVIEWS;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm" data-testid="business-role-preview-section">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">School / Classroom</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">学校・教室向け導入をここから確認する</h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">
            live demo が閉じている本番でも、講師・学校管理者・ビジネス版生徒の代表画面を read-only の情報として確認できます。
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

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        {previews.map((preview) => (
          <div key={preview.cardTestId} className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5" data-testid={preview.cardTestId}>
            <div className="flex items-center gap-2 text-medace-700">
              {preview.icon}
              <span className="text-sm font-bold">{preview.title}</span>
            </div>
            <div className="mt-3 text-sm leading-relaxed text-slate-600">{preview.description}</div>
            <div className="mt-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">{preview.detail}</div>
            <button
              type="button"
              data-testid={preview.actionTestId}
              onClick={() => (
                enableLiveDemo
                  ? onDemoLogin(preview.role, preview.organizationRole)
                  : onOpenGuide()
              )}
              className={`mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ${
                enableLiveDemo
                  ? 'bg-medace-600 text-white'
                  : 'border border-slate-200 bg-white text-slate-700'
              }`}
            >
              {!enableLiveDemo && <Lock className="h-4 w-4" />}
              {enableLiveDemo ? 'この役割を試す' : '導入相談へ進む'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
};

export default BusinessRolePreviewSection;
