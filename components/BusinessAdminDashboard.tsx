import React, { useMemo } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BellRing,
  Building2,
  CheckCircle2,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';

import {
  BusinessAdminWorkspaceView,
  SUBSCRIPTION_PLAN_LABELS,
  type UserProfile,
} from '../types';
import { useBusinessAdminDashboardData } from '../hooks/useBusinessAdminDashboardData';
import { useBusinessAdminDashboardController } from '../hooks/useBusinessAdminDashboardController';
import type {
  BusinessAdminDecisionAction,
  BusinessAdminDecisionFocusItem,
  BusinessAdminDecisionMetric,
  BusinessAdminDecisionModel,
  BusinessAdminDecisionTone,
} from '../utils/businessAdminDashboard';
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
    eyebrow: '組織ダッシュボード',
    title: '組織運用の詰まりを先に掴む',
    body: '要フォロー生徒、担当割当の滞留、講師負荷、自由英作文の滞留を分けて見ながら、今優先する作業を決めます。',
  },
  [BusinessAdminWorkspaceView.ASSIGNMENTS]: {
    eyebrow: '担当割当',
    title: '担当割当だけを一覧と詳細で更新する',
    body: '生徒一覧から対象を絞り、右側で担当講師、要フォロー理由、最新履歴を見ながら割当を調整します。',
  },
  [BusinessAdminWorkspaceView.INSTRUCTORS]: {
    eyebrow: '講師負荷',
    title: '講師ごとの負荷と稼働を比較する',
    body: '通知数、担当生徒数、接触生徒数を並べて、偏りや詰まりを確認します。',
  },
  [BusinessAdminWorkspaceView.SETTINGS]: {
    eyebrow: '組織設定',
    title: '組織情報と監査履歴を tenant 単位で管理する',
    body: '表示名の更新、メンバー確認、最近の変更履歴を分けて見せ、組織名変更後も運用導線が崩れない状態を作ります。',
  },
  [BusinessAdminWorkspaceView.WRITING]: {
    eyebrow: '英作文管理',
    title: '自由英作文の進行状況と返却滞留を確認する',
    body: '問題作成、配布、添削キュー、返却履歴を学校運用の流れとして見える化します。',
  },
  [BusinessAdminWorkspaceView.WORKSHEETS]: {
    eyebrow: 'PDF問題作成',
    title: '配布用PDF問題の作成に集中する',
    body: '生徒向け配布物は他の情報と切り離し、紙問題作成だけを素早く進めます。',
  },
  [BusinessAdminWorkspaceView.CATALOG]: {
    eyebrow: '教材カタログ',
    title: '教材カタログは必要時だけ確認する',
    body: '運用画面を整理するため、教材確認は独立ビューで必要な時だけ開きます。',
  },
};

const DECISION_PANEL_CLASS: Record<BusinessAdminDecisionTone, string> = {
  default: 'border-slate-200 bg-white',
  accent: 'border-medace-200 bg-medace-50',
  warning: 'border-amber-200 bg-amber-50',
  danger: 'border-red-200 bg-red-50',
  success: 'border-emerald-200 bg-emerald-50',
};

const DECISION_BADGE_CLASS: Record<BusinessAdminDecisionTone, string> = {
  default: 'border-slate-200 bg-white text-slate-600',
  accent: 'border-medace-200 bg-white text-medace-800',
  warning: 'border-amber-200 bg-white text-amber-800',
  danger: 'border-red-200 bg-white text-red-800',
  success: 'border-emerald-200 bg-white text-emerald-800',
};

const DECISION_METRIC_CLASS: Record<BusinessAdminDecisionTone, string> = {
  default: 'border-slate-200 bg-white text-slate-950',
  accent: 'border-medace-200 bg-white text-medace-900',
  warning: 'border-amber-200 bg-white text-amber-950',
  danger: 'border-red-200 bg-white text-red-950',
  success: 'border-emerald-200 bg-white text-emerald-950',
};

const renderDecisionMetric = (metric: BusinessAdminDecisionMetric) => (
  <div key={metric.label} className={`rounded-[24px] border px-4 py-4 shadow-sm ${DECISION_METRIC_CLASS[metric.tone]}`}>
    <div className="text-xs font-bold text-slate-500">{metric.label}</div>
    <div className="mt-2 text-2xl font-black tracking-tight">{metric.value}</div>
    <div className="mt-1 text-sm leading-relaxed text-slate-600">{metric.detail}</div>
  </div>
);

const renderDecisionFocusItem = (item: BusinessAdminDecisionFocusItem) => (
  <div key={item.label} className="min-w-0 border-t border-slate-200 pt-4">
    <div className="flex flex-wrap items-center gap-2">
      <span className={`rounded-full border px-2.5 py-1 text-[11px] font-bold ${DECISION_BADGE_CLASS[item.tone]}`}>
        {item.label}
      </span>
      <span className="min-w-0 break-words text-sm font-black text-slate-950">{item.value}</span>
    </div>
    <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.detail}</p>
  </div>
);

interface BusinessAdminDecisionPanelProps {
  model: BusinessAdminDecisionModel;
  actionPending: boolean;
  onAction: (action: BusinessAdminDecisionAction) => void;
}

const BusinessAdminDecisionPanel: React.FC<BusinessAdminDecisionPanelProps> = ({
  model,
  actionPending,
  onAction,
}) => (
  <section data-testid="business-admin-decision-panel" className={`rounded-[32px] border p-5 shadow-sm sm:p-6 ${DECISION_PANEL_CLASS[model.tone]}`}>
    <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-bold text-slate-500">{model.eyebrow}</p>
        <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{model.title}</h3>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-slate-700">{model.body}</p>
        {model.emptyState && (
          <div className="mt-4 rounded-[24px] border border-dashed border-slate-300 bg-white/70 px-4 py-4">
            <div className="text-sm font-black text-slate-950">{model.emptyState.title}</div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{model.emptyState.body}</p>
          </div>
        )}
      </div>

      <div className="flex w-full flex-col gap-3 sm:flex-row xl:w-auto xl:flex-col">
        <button
          type="button"
          data-testid="business-admin-primary-decision-action"
          onClick={() => onAction(model.primaryAction)}
          disabled={model.primaryAction.kind === 'SEND_FIRST_NOTIFICATION' && actionPending}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        >
          {model.primaryAction.kind === 'SEND_FIRST_NOTIFICATION' && actionPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : model.primaryAction.kind === 'SEND_FIRST_NOTIFICATION' ? (
            <BellRing className="h-4 w-4" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}
          {model.primaryAction.label}
        </button>
        {model.secondaryAction && (
          <button
            type="button"
            onClick={() => onAction(model.secondaryAction!)}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700 sm:w-auto"
          >
            {model.secondaryAction.label}
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>

    <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {model.metrics.map(renderDecisionMetric)}
    </div>

    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      {model.focusItems.map(renderDecisionFocusItem)}
    </div>
  </section>
);

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
    writingQueue,
    activeView,
    refresh,
  });
  const storageMode = useMemo(() => resolveStorageMode(import.meta.env.VITE_STORAGE_MODE), []);

  if (loading) {
    return (
      <div className="space-y-5 pb-12">
        <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-medace-50 text-medace-700">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-400">組織管理</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">組織データを集計中</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                次アクション、割当、講師負荷、作文キューをまとめて読み込んでいます。
              </p>
            </div>
          </div>
        </section>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-[28px] border border-slate-200 bg-slate-100" />
          ))}
        </div>
      </div>
    );
  }

  if (error || !snapshot) {
    return (
      <section className="rounded-[32px] border border-red-200 bg-red-50 p-6 text-red-800 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <h2 className="text-xl font-black tracking-tight">管理者ワークスペースを読み込めません</h2>
              <p className="mt-2 text-sm leading-relaxed">{error || '組織データがありません。'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-800 transition-colors hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" />
            再読み込み
          </button>
        </div>
      </section>
    );
  }

  const viewCopy = VIEW_COPY[activeView];
  const isLocalMockData = storageMode.capabilities.organization.usesMockData;
  const decisionModel = controller.decisionModel;
  const handleDecisionAction = (action: BusinessAdminDecisionAction) => {
    if (action.assignmentFilter) {
      controller.setAssignmentFilter(action.assignmentFilter);
    }

    if (action.kind === 'SEND_FIRST_NOTIFICATION') {
      void controller.handleSendActivationNotification(snapshot.nextRequiredActionTarget);
      return;
    }

    onChangeView(action.targetView);
  };

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
      {decisionModel && (
        <BusinessAdminDecisionPanel
          model={decisionModel}
          actionPending={controller.activationNotificationPending}
          onAction={handleDecisionAction}
        />
      )}
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
