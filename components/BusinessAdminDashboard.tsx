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
import WorkspaceDashboardShell from './dashboard/WorkspaceDashboardShell';

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
    <WorkspaceDashboardShell
      testId="business-admin-dashboard"
      notice={controller.notice && (
        <div className={`rounded-[24px] border px-5 py-4 text-sm font-medium ${
          controller.notice.tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
            : 'border-red-200 bg-red-50 text-red-700'
        }`}>
          {controller.notice.message}
        </div>
      )}
      banner={isLocalMockData ? <B2BStorageModeBanner /> : undefined}
      context={(
        <>
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
            {SUBSCRIPTION_PLAN_LABELS[snapshot.subscriptionPlan]}
          </span>
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
            グループ管理者
          </span>
        </>
      )}
      userBadge={(
        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
          {user.displayName}
        </div>
      )}
      eyebrow={viewCopy.eyebrow}
      title={viewCopy.title}
      body={viewCopy.body}
      actions={[
        {
          label: '割当を確認する',
          icon: Users,
          onClick: () => onChangeView(BusinessAdminWorkspaceView.ASSIGNMENTS),
          variant: 'primary',
        },
        {
          label: '講師負荷を見る',
          icon: ShieldCheck,
          onClick: () => onChangeView(BusinessAdminWorkspaceView.INSTRUCTORS),
          variant: 'secondary',
        },
        {
          label: '作文進捗を見る',
          icon: CheckCircle2,
          onClick: () => onChangeView(BusinessAdminWorkspaceView.WRITING),
          variant: 'secondary',
        },
        {
          label: '組織設定を開く',
          icon: Building2,
          onClick: () => onChangeView(BusinessAdminWorkspaceView.SETTINGS),
          variant: 'secondary',
        },
      ]}
    >
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
    </WorkspaceDashboardShell>
  );
};

export default BusinessAdminDashboard;
