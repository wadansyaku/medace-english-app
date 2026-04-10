import React from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

import getClientRuntimeFlags from '../../config/runtime';
import { getSubscriptionPolicy } from '../../config/subscription';
import {
  BusinessAdminWorkspaceView,
  type BookMetadata,
  type OrganizationActivationState,
  type OrganizationDashboardSnapshot,
  type OrganizationSettingsSnapshot,
  type UserProfile,
  type WritingAssignment,
  type WritingQueueItem,
} from '../../types';
import type { BusinessAdminDashboardController } from './businessAdmin/shared';
import BusinessAdminAssignmentsSection from './businessAdmin/BusinessAdminAssignmentsSection';
import BusinessAdminCatalogSection from './businessAdmin/BusinessAdminCatalogSection';
import BusinessAdminInstructorsSection from './businessAdmin/BusinessAdminInstructorsSection';
import BusinessAdminOverviewSection from './businessAdmin/BusinessAdminOverviewSection';
import BusinessAdminSettingsSection from './businessAdmin/BusinessAdminSettingsSection';
import BusinessAdminWorksheetsSection from './businessAdmin/BusinessAdminWorksheetsSection';
import BusinessAdminWritingSection from './businessAdmin/BusinessAdminWritingSection';

interface BusinessAdminDashboardSectionsProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  activeView: BusinessAdminWorkspaceView;
  onChangeView: (view: BusinessAdminWorkspaceView) => void;
  controller: BusinessAdminDashboardController;
  snapshot: OrganizationDashboardSnapshot;
  settingsSnapshot: OrganizationSettingsSnapshot | null;
  books: BookMetadata[];
  writingAssignments: WritingAssignment[];
  writingQueue: WritingQueueItem[];
  isLocalMockData: boolean;
}

interface ActivationGateDefinition {
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  targetView: BusinessAdminWorkspaceView;
  allowBootstrap?: boolean;
}

const resolveNextActionView = (
  activationState: OrganizationActivationState,
): BusinessAdminWorkspaceView => {
  if (activationState === 'CREATE_COHORT') return BusinessAdminWorkspaceView.SETTINGS;
  if (activationState === 'SEND_FIRST_NOTIFICATION') return BusinessAdminWorkspaceView.INSTRUCTORS;
  return BusinessAdminWorkspaceView.ASSIGNMENTS;
};

const resolveViewGate = (
  activeView: BusinessAdminWorkspaceView,
  activationState: OrganizationActivationState,
): ActivationGateDefinition | null => {
  if (activeView === BusinessAdminWorkspaceView.ASSIGNMENTS && activationState === 'CREATE_COHORT') {
    return {
      eyebrow: 'Step 1 / Cohort',
      title: '先に cohort を作成する',
      body: '生徒割当は cohort 作成後に整理します。最初に 1 つ作ると、担当・ミッション・通知の導線が崩れません。',
      ctaLabel: '組織設定へ進む',
      targetView: BusinessAdminWorkspaceView.SETTINGS,
      allowBootstrap: true,
    };
  }

  if (activeView === BusinessAdminWorkspaceView.INSTRUCTORS) {
    if (activationState === 'CREATE_COHORT') {
      return {
        eyebrow: 'Step 1 / Cohort',
        title: '講師負荷を見る前に cohort を用意する',
        body: '可視範囲と担当の単位がない状態では、講師負荷を比べても判断材料が揃いません。',
        ctaLabel: '組織設定へ進む',
        targetView: BusinessAdminWorkspaceView.SETTINGS,
        allowBootstrap: true,
      };
    }
    if (activationState === 'ASSIGN_STUDENTS') {
      return {
        eyebrow: 'Step 2 / Assignment',
        title: '最初の生徒担当を決める',
        body: '講師負荷の偏りは、少なくとも 1 件の担当割当が入ってから見たほうが意味のある比較になります。',
        ctaLabel: '割当ビューへ進む',
        targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
        allowBootstrap: true,
      };
    }
    if (activationState === 'CREATE_FIRST_MISSION') {
      return {
        eyebrow: 'Step 3 / Mission',
        title: '初回ミッションを配布してから講師負荷を確認する',
        body: '週次課題が入って初めて、講師の backlog と再開待ちの意味が揃います。',
        ctaLabel: '割当ビューへ進む',
        targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
        allowBootstrap: true,
      };
    }
  }

  if (activeView === BusinessAdminWorkspaceView.WRITING) {
    if (activationState === 'CREATE_COHORT') {
      return {
        eyebrow: 'Step 1 / Cohort',
        title: '作文運用の前に cohort を作成する',
        body: '作文の配布・返却は、まずクラス単位が揃ってから始めると空振りしません。',
        ctaLabel: '組織設定へ進む',
        targetView: BusinessAdminWorkspaceView.SETTINGS,
        allowBootstrap: true,
      };
    }
    if (activationState === 'ASSIGN_STUDENTS') {
      return {
        eyebrow: 'Step 2 / Assignment',
        title: '最初の担当割当を決める',
        body: '作文キューは、誰がどの生徒を追うかが決まってからでないと運用に使えません。',
        ctaLabel: '割当ビューへ進む',
        targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
        allowBootstrap: true,
      };
    }
    if (activationState === 'CREATE_FIRST_MISSION') {
      return {
        eyebrow: 'Step 3 / Mission',
        title: '初回ミッションを配布する',
        body: '作文は主課題とセットで配る前提です。先に今週ミッションを 1 本固定してください。',
        ctaLabel: '割当ビューへ進む',
        targetView: BusinessAdminWorkspaceView.ASSIGNMENTS,
        allowBootstrap: true,
      };
    }
    if (activationState === 'SEND_FIRST_NOTIFICATION') {
      return {
        eyebrow: 'Step 4 / Notification',
        title: '最初のフォロー通知を送ってから作文運用へ進む',
        body: '通知が 1 件入ると、作文の進行と再開導線を実データで見分けられます。demo では導入セットでここまで自動投入できます。',
        ctaLabel: '講師導線を確認する',
        targetView: BusinessAdminWorkspaceView.INSTRUCTORS,
        allowBootstrap: true,
      };
    }
  }

  return null;
};

interface ActivationGateCardProps {
  gate: ActivationGateDefinition;
  onChangeView: (view: BusinessAdminWorkspaceView) => void;
  canBootstrap: boolean;
  controller: BusinessAdminDashboardController;
}

const ActivationGateCard: React.FC<ActivationGateCardProps> = ({
  gate,
  onChangeView,
  canBootstrap,
  controller,
}) => (
  <section data-testid="business-admin-activation-gate" className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{gate.eyebrow}</p>
    <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{gate.title}</h3>
    <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600">{gate.body}</p>
    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
      <button
        type="button"
        onClick={() => onChangeView(gate.targetView)}
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800"
      >
        {gate.ctaLabel} <ArrowRight className="h-4 w-4" />
      </button>
      {gate.allowBootstrap && canBootstrap && (
        <button
          type="button"
          data-testid="bootstrap-demo-organization"
          onClick={() => void controller.handleActivationBootstrap()}
          disabled={controller.bootstrapPending}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-700 disabled:opacity-60"
        >
          {controller.bootstrapPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          導入セットを自動投入する
        </button>
      )}
    </div>
  </section>
);

const BusinessAdminDashboardSections: React.FC<BusinessAdminDashboardSectionsProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
  controller,
  snapshot,
  settingsSnapshot,
  books,
  writingAssignments,
  writingQueue,
  isLocalMockData,
}) => {
  const policy = getSubscriptionPolicy(snapshot.subscriptionPlan);
  const runtimeFlags = getClientRuntimeFlags();
  const nextActionView = resolveNextActionView(snapshot.nextRequiredAction);
  const gate = resolveViewGate(activeView, snapshot.activationState);
  const canBootstrap = !runtimeFlags.deployment.isProductionLike && snapshot.activationState !== 'ACTIVE';

  if (gate) {
    return (
      <ActivationGateCard
        gate={gate}
        onChangeView={onChangeView}
        canBootstrap={canBootstrap}
        controller={controller}
      />
    );
  }

  if (activeView === BusinessAdminWorkspaceView.OVERVIEW) {
    return (
      <BusinessAdminOverviewSection
        snapshot={snapshot}
        settingsSnapshot={settingsSnapshot}
        books={books}
        writingAssignments={writingAssignments}
        writingQueue={writingQueue}
        isLocalMockData={isLocalMockData}
        nextActionView={nextActionView}
        onChangeView={onChangeView}
        policyFeatureSummary={policy.featureSummary}
        canBootstrap={canBootstrap}
        bootstrapPending={controller.bootstrapPending}
        onBootstrap={() => void controller.handleActivationBootstrap()}
      />
    );
  }

  if (activeView === BusinessAdminWorkspaceView.ASSIGNMENTS) {
    return (
      <BusinessAdminAssignmentsSection
        controller={controller}
        snapshot={snapshot}
        settingsSnapshot={settingsSnapshot}
        books={books}
        writingAssignments={writingAssignments}
      />
    );
  }

  if (activeView === BusinessAdminWorkspaceView.INSTRUCTORS) {
    return (
      <BusinessAdminInstructorsSection
        snapshot={snapshot}
        isLocalMockData={isLocalMockData}
      />
    );
  }

  if (activeView === BusinessAdminWorkspaceView.SETTINGS) {
    return settingsSnapshot ? (
      <BusinessAdminSettingsSection
        controller={controller}
        settingsSnapshot={settingsSnapshot}
      />
    ) : (
      <div className="rounded-[28px] border border-slate-200 bg-white px-6 py-5 text-sm text-slate-600">
        組織設定を読み込めませんでした。
      </div>
    );
  }

  if (activeView === BusinessAdminWorkspaceView.WRITING) {
    return (
      <BusinessAdminWritingSection
        user={user}
        writingAssignments={writingAssignments}
        writingQueue={writingQueue}
      />
    );
  }

  if (activeView === BusinessAdminWorkspaceView.WORKSHEETS) {
    return <BusinessAdminWorksheetsSection user={user} />;
  }

  if (activeView === BusinessAdminWorkspaceView.CATALOG) {
    return (
      <BusinessAdminCatalogSection
        user={user}
        onSelectBook={onSelectBook}
        onChangeView={onChangeView}
      />
    );
  }

  return null;
};

export default BusinessAdminDashboardSections;
