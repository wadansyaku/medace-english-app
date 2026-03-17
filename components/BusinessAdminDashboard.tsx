import React, { useMemo } from 'react';
import { Building2, CheckCircle2, Loader2, ShieldCheck, Users } from 'lucide-react';

import {
  BusinessAdminWorkspaceView,
  SUBSCRIPTION_PLAN_LABELS,
  type UserProfile,
} from '../types';
import { useBusinessAdminDashboardData } from '../hooks/useBusinessAdminDashboardData';
import { useBusinessAdminDashboardController } from '../hooks/useBusinessAdminDashboardController';
import { resolveStorageMode } from '../shared/storageMode';
import B2BStorageModeBanner from './workspace/B2BStorageModeBanner';
import BusinessAdminDashboardSections from './dashboard/BusinessAdminDashboardSections';

interface BusinessAdminDashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  activeView: BusinessAdminWorkspaceView;
  onChangeView: (view: BusinessAdminWorkspaceView) => void;
}

const VIEW_COPY: Record<BusinessAdminWorkspaceView, { eyebrow: string; title: string; body: string }> = {
  [BusinessAdminWorkspaceView.OVERVIEW]: {
    eyebrow: 'Organization Overview',
    title: '組織運用の詰まりを先に掴む',
    body: '要フォロー生徒、担当割当の滞留、講師負荷、自由英作文の滞留を分けて見ながら、今優先する作業を決めます。',
  },
  [BusinessAdminWorkspaceView.ASSIGNMENTS]: {
    eyebrow: 'Assignments',
    title: '担当割当だけを一覧と詳細で更新する',
    body: '生徒一覧から対象を絞り、右側で担当講師、要フォロー理由、最新履歴を見ながら割当を調整します。',
  },
  [BusinessAdminWorkspaceView.INSTRUCTORS]: {
    eyebrow: 'Instructor Load',
    title: '講師ごとの負荷と稼働を比較する',
    body: '通知数、担当生徒数、接触生徒数を並べて、偏りや詰まりを確認します。',
  },
  [BusinessAdminWorkspaceView.SETTINGS]: {
    eyebrow: 'Organization Settings',
    title: '組織情報と監査履歴を tenant 単位で管理する',
    body: '表示名の更新、メンバー確認、最近の変更履歴を分けて見せ、組織名変更後も運用導線が崩れない状態を作ります。',
  },
  [BusinessAdminWorkspaceView.WRITING]: {
    eyebrow: 'Writing Management',
    title: '自由英作文の進行状況と返却滞留を確認する',
    body: '問題作成、配布、添削キュー、返却履歴を学校運用の流れとして見える化します。',
  },
  [BusinessAdminWorkspaceView.WORKSHEETS]: {
    eyebrow: 'Worksheet Ops',
    title: '配布用PDF問題の作成に集中する',
    body: '生徒向け配布物は他の情報と切り離し、紙問題作成だけを素早く進めます。',
  },
  [BusinessAdminWorkspaceView.CATALOG]: {
    eyebrow: 'Catalog Access',
    title: '教材カタログは必要時だけ確認する',
    body: '運用画面を整理するため、教材確認は独立ビューで必要な時だけ開きます。',
  },
};

const BusinessAdminDashboard: React.FC<BusinessAdminDashboardProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
}) => {
  const {
    snapshot,
    settingsSnapshot,
    missionBoard,
    books,
    writingAssignments,
    writingQueue,
    loading,
    error,
    refresh,
  } = useBusinessAdminDashboardData();
  const controller = useBusinessAdminDashboardController({
    snapshot,
    settingsSnapshot,
    missionBoard,
    books,
    writingAssignments,
    refresh,
  });
  const storageMode = useMemo(() => resolveStorageMode(import.meta.env.VITE_STORAGE_MODE), []);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center text-slate-500">
        <Loader2 className="h-10 w-10 animate-spin text-medace-500" />
        <p className="mt-3 text-sm font-medium">組織データを集計中...</p>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
        {error || '組織データがありません。'}
      </div>
    );
  }

  const viewCopy = VIEW_COPY[activeView];
  const isLocalMockData = storageMode.capabilities.organization.usesMockData;

  return (
    <div data-testid="business-admin-dashboard" className="space-y-8 pb-12">
      {controller.notice && (
        <div className={`rounded-[24px] border px-5 py-4 text-sm font-medium ${
          controller.notice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {controller.notice.message}
        </div>
      )}

      {isLocalMockData && <B2BStorageModeBanner />}

      <section className="relative overflow-hidden rounded-[32px] bg-medace-500 p-8 text-white shadow-[0_24px_60px_rgba(255,130,22,0.22)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.26),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_22%)]"></div>
        <div className="relative">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
                {SUBSCRIPTION_PLAN_LABELS[snapshot.subscriptionPlan]}
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
                グループ管理者
              </span>
            </div>
            <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
              {user.displayName}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3 text-medace-100">
            <Building2 className="h-5 w-5" />
            <span className="text-sm font-bold">{snapshot.organizationName}</span>
          </div>
          <div className="mt-6 max-w-3xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{viewCopy.eyebrow}</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight">{viewCopy.title}</h2>
            <p className="mt-4 text-sm leading-relaxed text-white/75">{viewCopy.body}</p>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => onChangeView(BusinessAdminWorkspaceView.ASSIGNMENTS)}
              className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-medace-900 transition-colors hover:bg-medace-50"
            >
              <Users className="h-4 w-4" />
              割当を確認する
            </button>
            <button
              type="button"
              onClick={() => onChangeView(BusinessAdminWorkspaceView.INSTRUCTORS)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              <ShieldCheck className="h-4 w-4" />
              講師負荷を見る
            </button>
            <button
              type="button"
              onClick={() => onChangeView(BusinessAdminWorkspaceView.WRITING)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              <CheckCircle2 className="h-4 w-4" />
              作文進捗を見る
            </button>
            <button
              type="button"
              onClick={() => onChangeView(BusinessAdminWorkspaceView.SETTINGS)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-white/15"
            >
              <Building2 className="h-4 w-4" />
              組織設定を開く
            </button>
          </div>
        </div>
      </section>

      <BusinessAdminDashboardSections
        user={user}
        onSelectBook={onSelectBook}
        activeView={activeView}
        onChangeView={onChangeView}
        controller={controller}
        snapshot={snapshot}
        settingsSnapshot={settingsSnapshot}
        books={books}
        writingAssignments={writingAssignments}
        writingQueue={writingQueue}
        isLocalMockData={isLocalMockData}
      />
    </div>
  );
};

export default BusinessAdminDashboard;
