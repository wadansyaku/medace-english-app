import React from 'react';
import { AlertTriangle, ArrowLeft, BookOpen, Building2, Sparkles } from 'lucide-react';
import getClientRuntimeFlags from '../config/runtime';
import { type PublicMotivationSnapshot } from '../types';
import PublicMotivationPanel from './PublicMotivationPanel';
import BusinessRolePreviewSection from './commercial/BusinessRolePreviewSection';
import type { PublicBusinessRoleKey } from '../shared/publicBusinessRoles';

interface PublicInfoPageProps {
  onBack: () => void;
  motivationSnapshot: PublicMotivationSnapshot | null;
  motivationLoading: boolean;
  motivationError: string | null;
  onOpenRole: (roleKey: PublicBusinessRoleKey) => void;
}

const PLATFORM_HIGHLIGHTS = [
  {
    icon: <BookOpen className="h-4 w-4" />,
    label: '個人学習',
    detail: '初回診断から今日の復習、学習プランまでを1つの流れで始められます。',
  },
  {
    icon: <Building2 className="h-4 w-4" />,
    label: '学校・教室運用',
    detail: '講師のフォロー、担当の割り当て、教材の権限を同じ画面で管理できます。',
  },
  {
    icon: <Sparkles className="h-4 w-4" />,
    label: '教材活用',
    detail: '既存の公式単語帳とMy単語帳を目的に応じて切り替えられます。',
  },
];

const PublicInfoPage: React.FC<PublicInfoPageProps> = ({
  onBack,
  motivationSnapshot,
  motivationLoading,
  motivationError,
  onOpenRole,
}) => {
  const runtimeFlags = getClientRuntimeFlags();

  return (
    <div className="mx-auto mt-6 max-w-5xl space-y-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-3 text-base font-bold text-slate-700 transition-colors hover:bg-slate-50"
      >
        <ArrowLeft className="h-4 w-4" /> 最初の画面へ
      </button>

      <PublicMotivationPanel
        snapshot={motivationSnapshot}
        loading={motivationLoading}
        error={motivationError}
        title="ログイン前に見られる学習状況"
        description="ログイン前でも、現在の学習量とアプリ全体の学習の累計を確認できます。"
      />

      {(runtimeFlags.appOnlineOnly || !runtimeFlags.enablePublicBusinessDemo) && (
        <section className="rounded-[28px] border border-amber-200 bg-amber-50 px-6 py-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="rounded-full bg-white p-2 text-amber-700 shadow-sm">
              <AlertTriangle className="h-4 w-4" />
            </div>
            <div className="space-y-2 text-sm leading-relaxed text-amber-900">
              {runtimeFlags.appOnlineOnly && (
                <p>
                  現在の試験運用ではオンライン接続が必要です。ホーム画面への追加やオフライン同期は、公開前の段階的な実装が終わるまで対象外です。
                </p>
              )}
              {!runtimeFlags.enablePublicBusinessDemo && (
                <p>
                  学校・教室向けアカウントは公開画面からは発行せず、招待または手動発行の案内に沿って手続きを進めます。
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <div className="overflow-hidden rounded-[32px] border border-medace-100 bg-white shadow-[0_28px_90px_rgba(255,130,22,0.12)]">
        <div className="border-b border-slate-100 bg-medace-50 p-8 md:p-10">
          <div className="max-w-3xl">
            <p className="text-sm font-bold tracking-[0.12em] text-medace-500">役割別の案内</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">
              役割別の
              <br />
              専用リンク
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 md:text-[1.05rem]">
              Steady Studyでは、生徒・講師・学校管理者・サービス管理者がそれぞれの作業画面を直接開けます。
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            {PLATFORM_HIGHLIGHTS.map((item) => (
              <div key={item.label} className="rounded-3xl border border-slate-200 bg-white/90 px-5 py-5 shadow-sm">
                <div className="flex items-center gap-2 text-medace-600">
                  {item.icon}
                  <span className="text-sm font-bold">{item.label}</span>
                </div>
                <p className="mt-3 text-base leading-relaxed text-slate-600">{item.detail}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8 p-6 md:p-8">
          <BusinessRolePreviewSection
            onOpenRole={onOpenRole}
          />

        </div>
      </div>
    </div>
  );
};

export default PublicInfoPage;
