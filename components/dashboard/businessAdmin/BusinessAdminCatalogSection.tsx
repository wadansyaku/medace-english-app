import React, { Suspense, lazy } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

import { BusinessAdminWorkspaceView, type UserProfile } from '../../../types';

const OfficialCatalogAccessPanel = lazy(() => import('../../OfficialCatalogAccessPanel'));

interface BusinessAdminCatalogSectionProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  onChangeView: (view: BusinessAdminWorkspaceView) => void;
}

const BusinessAdminCatalogSection: React.FC<BusinessAdminCatalogSectionProps> = ({
  user,
  onSelectBook,
  onChangeView,
}) => (
  <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Catalog Access</p>
        <h3 className="mt-1 text-2xl font-black tracking-tight text-slate-950">教材カタログは必要なときだけ開く</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">
          管理者の主作業は組織運用です。教材閲覧は独立ビューに分け、教材の中身やテスト導線の確認が必要なときだけ使います。
        </p>
      </div>
      <button
        type="button"
        onClick={() => onChangeView(BusinessAdminWorkspaceView.OVERVIEW)}
        className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
      >
        概要へ戻る <ArrowRight className="h-4 w-4" />
      </button>
    </div>
    <div className="mt-6">
      <Suspense
        fallback={
          <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[28px] border border-dashed border-slate-200 bg-slate-50 text-slate-500">
            <Loader2 className="h-7 w-7 animate-spin text-medace-500" />
            <div className="mt-3 text-sm font-medium">単語帳一覧を読み込み中...</div>
          </div>
        }
      >
        <OfficialCatalogAccessPanel
          user={user}
          onSelectBook={onSelectBook}
          eyebrow="Business Demo Catalog"
          title="ビジネス版の既存単語帳を確認する"
          description="学校管理者体験でも、既存の公式単語帳をそのまま開けます。組織運用を見ながら、教材の中身やテスト導線まで確認できます。"
        />
      </Suspense>
    </div>
  </section>
);

export default BusinessAdminCatalogSection;
