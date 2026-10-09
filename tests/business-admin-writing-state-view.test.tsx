import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import BusinessAdminDashboardSections from '../components/dashboard/BusinessAdminDashboardSections';
import WorkspaceDashboardShell from '../components/dashboard/WorkspaceDashboardShell';
import BusinessAdminOverviewSection from '../components/dashboard/businessAdmin/BusinessAdminOverviewSection';
import BusinessAdminWritingSection from '../components/dashboard/businessAdmin/BusinessAdminWritingSection';
import BusinessAdminWritingNotice from '../components/dashboard/businessAdmin/BusinessAdminWritingNotice';
import type { BusinessAdminDashboardController } from '../components/dashboard/businessAdmin/shared';
import {
  getBusinessAdminWritingNotice,
  type BusinessAdminWritingState,
} from '../shared/businessAdminWritingState';
import { buildOrganizationDashboardSnapshot } from '../shared/organizationDashboard';
import {
  BusinessAdminWorkspaceView,
  OrganizationRole,
  SubscriptionPlan,
  UserRole,
  type OrganizationActivationState,
  type UserProfile,
  type WritingAssignment,
  type WritingQueueItem,
} from '../types';

const writingOps = vi.hoisted(() => ({ render: vi.fn() }));
vi.mock('../components/WritingOpsPanel', () => ({
  default: () => {
    writingOps.render();
    return <div data-testid="mock-writing-ops">取得済み作文の操作</div>;
  },
}));

const noop = () => {};
const user: UserProfile = {
  uid: 'synthetic-writing-state-manager',
  displayName: 'Synthetic manager',
  email: 'manager@example.invalid',
  role: UserRole.INSTRUCTOR,
  organizationRole: OrganizationRole.GROUP_ADMIN,
  subscriptionPlan: SubscriptionPlan.TOB_FREE,
};
const snapshot = buildOrganizationDashboardSnapshot({
  organizationId: 'synthetic-writing-state-organization',
  organizationName: 'Synthetic organization',
  subscriptionPlan: SubscriptionPlan.TOB_FREE,
  totalMembers: 0,
  totalInstructors: 0,
  learningPlanCount: 0,
  cohortCount: 0,
  studentAssignmentCount: 0,
  missionAssignmentCount: 0,
  notifications7d: 0,
  totalNotificationCount: 0,
  instructors: [],
  students: [],
  missionAssignments: [],
  assignmentEvents: [],
  reactivatedStudents7d: 0,
  notifiedStudents7d: 0,
  trend: [],
  now: 1_780_000_000_000,
});
const nonReadyStates: Exclude<BusinessAdminWritingState, 'READY'>[] = [
  'NOT_INCLUDED', 'UNAVAILABLE', 'LOADING', 'ERROR',
];
const assignments = [
  { id: 'issued-one', status: 'ISSUED' },
  { id: 'issued-two', status: 'ISSUED' },
  { id: 'revision-one', status: 'REVISION_REQUESTED' },
  { id: 'completed-one', status: 'COMPLETED' },
] as WritingAssignment[];
const queue = [{ id: 'review-one' }] as unknown as WritingQueueItem[];

const renderOverview = (writingState: BusinessAdminWritingState, withData = false) => renderToStaticMarkup(
  <BusinessAdminOverviewSection
    snapshot={{ ...snapshot, subscriptionPlan: writingState === 'READY' ? SubscriptionPlan.TOB_PAID : SubscriptionPlan.TOB_FREE }}
    writingAssignments={withData ? assignments : []}
    writingQueue={withData ? queue : []}
    writingState={writingState}
    isLocalMockData={false}
    nextActionView={BusinessAdminWorkspaceView.SETTINGS}
    onChangeView={noop}
    onFollowActivationTarget={noop}
    activationNotificationPending={false}
    onSendActivationNotification={noop}
    policyFeatureSummary={[]}
    canBootstrap={false}
    bootstrapPending={false}
    onBootstrap={noop}
  />,
);

const controller = {
  activationNotificationPending: false,
  bootstrapPending: false,
  handleSendActivationNotification: noop,
  handleActivationBootstrap: noop,
} as unknown as BusinessAdminDashboardController;
const renderWritingRoute = (writingState: BusinessAdminWritingState, activationState: OrganizationActivationState) => renderToStaticMarkup(
  <BusinessAdminDashboardSections
    user={writingState === 'READY' ? { ...user, subscriptionPlan: SubscriptionPlan.TOB_PAID } : user}
    onSelectBook={noop}
    activeView={BusinessAdminWorkspaceView.WRITING}
    onChangeView={noop}
    onFollowActivationTarget={noop}
    controller={controller}
    snapshot={{ ...snapshot, activationState, subscriptionPlan: writingState === 'READY' ? SubscriptionPlan.TOB_PAID : SubscriptionPlan.TOB_FREE }}
    settingsSnapshot={null}
    books={[]}
    writingAssignments={[]}
    writingQueue={[]}
    writingState={writingState}
    isLocalMockData={false}
  />,
);

beforeEach(() => vi.clearAllMocks());

describe('business admin writing availability in rendered views', () => {
  it('shows the unavailable notice once without repeating hero information or navigation actions', () => {
    const notice = getBusinessAdminWritingNotice('NOT_INCLUDED')!;
    const html = renderToStaticMarkup(<WorkspaceDashboardShell
      testId="business-admin-dashboard" eyebrow="作文機能" title={notice.title} body={notice.description}
      hideHero actions={[{ label: 'Repeated writing action', onClick: noop }]}
    ><BusinessAdminWritingSection user={user} writingAssignments={[]} writingQueue={[]} writingState="NOT_INCLUDED" /></WorkspaceDashboardShell>);
    expect(html.split(notice.title)).toHaveLength(2);
    expect(html.split(notice.description)).toHaveLength(2);
    expect(html).not.toContain('Repeated writing action');
    expect(html).toContain('business-admin-writing-state');
  });
  it.each(nonReadyStates)('does not display empty or stale counts or mount writing operations when %s', writingState => {
    const html = renderToStaticMarkup(<BusinessAdminWritingSection
      user={user} writingAssignments={assignments} writingQueue={queue} writingState={writingState}
    />);
    const notice = getBusinessAdminWritingNotice(writingState)!;
    expect(html).toContain(`data-writing-state="${writingState}"`);
    expect(html).toContain(notice.title);
    expect(html).toContain(notice.description);
    expect(html).not.toContain('配布済み');
    expect(html).not.toContain('添削待ち');
    expect(html).not.toContain('完了済み');
    expect(html).not.toContain('0件');
    expect(html).not.toContain('mock-writing-ops');
    expect(writingOps.render).not.toHaveBeenCalled();
    expect(html).toContain(`role="${writingState === 'ERROR' ? 'alert' : 'status'}"`);
  });

  it('retains confirmed zero counts and writing operations after paid retrieval', () => {
    const html = renderToStaticMarkup(<BusinessAdminWritingSection
      user={{ ...user, subscriptionPlan: SubscriptionPlan.TOB_PAID }} writingAssignments={[]} writingQueue={[]} writingState="READY"
    />);
    expect(html).not.toContain('business-admin-writing-state');
    expect(html.match(/>0件<\/div>/g)).toHaveLength(4);
    expect(html).toContain('mock-writing-ops');
    expect(writingOps.render).toHaveBeenCalledOnce();
  });

  it('retains received assignment and review counts', () => {
    const html = renderToStaticMarkup(<BusinessAdminWritingSection
      user={{ ...user, subscriptionPlan: SubscriptionPlan.TOB_PAID }} writingAssignments={assignments} writingQueue={queue} writingState="READY"
    />);
    expect(html).toMatch(/配布済み<\/div><div[^>]*>2件<\/div>/);
    expect(html).toMatch(/添削待ち<\/div><div[^>]*>1件<\/div>/);
    expect(html).toMatch(/再提出待ち<\/div><div[^>]*>1件<\/div>/);
    expect(html).toMatch(/完了済み<\/div><div[^>]*>1件<\/div>/);
    expect(writingOps.render).toHaveBeenCalledOnce();
  });

  it.each(nonReadyStates)('shows %s rather than a zero return rate and queue in overview', writingState => {
    const html = renderOverview(writingState, true);
    const notice = getBusinessAdminWritingNotice(writingState)!;
    expect(html).toContain(`data-writing-state="${writingState}"`);
    expect(html).toMatch(new RegExp(`作文返却率</div><div[^>]*>${notice.value}</div>`));
    expect(html).not.toContain('business-admin-writing-queue');
    expect(html).not.toContain('作文ワークスペースへ');
  });

  it('shows an actual empty writing queue and zero return rate after retrieval', () => {
    const html = renderOverview('READY');
    expect(html).toContain('business-admin-writing-queue');
    expect(html).toMatch(/作文返却率<\/div><div[^>]*>0%<\/div>/);
    expect(html).toMatch(/添削待ち<\/div><div[^>]*>0<\/div>/);
    expect(html).toContain('作文ワークスペースへ');
    expect(html).not.toContain('business-admin-writing-state');
  });

  it.each(nonReadyStates)('prioritizes %s over activation prerequisites on the writing route', writingState => {
    for (const activationState of ['CREATE_COHORT', 'ASSIGN_STUDENTS', 'CREATE_FIRST_MISSION', 'SEND_FIRST_NOTIFICATION'] as const) {
      const html = renderWritingRoute(writingState, activationState);
      expect(html).toContain(getBusinessAdminWritingNotice(writingState)!.title);
      expect(html).not.toContain('組織設定へ進む');
      expect(html).not.toContain('割当ビューへ進む');
      expect(html).not.toContain('講師導線を確認する');
      expect(html).not.toContain('mock-writing-ops');
    }
    expect(writingOps.render).not.toHaveBeenCalled();
  });

  it('retains paid activation prerequisites before opening writing operations', () => {
    const html = renderWritingRoute('READY', 'CREATE_COHORT');
    expect(html).toContain('作文運用の前にクラスを作成する');
    expect(html).not.toContain('business-admin-writing-state');
    expect(writingOps.render).not.toHaveBeenCalled();
  });

  it('opens ready writing operations once activation prerequisites are met', () => {
    const html = renderWritingRoute('READY', 'ACTIVE');
    expect(html).toContain('mock-writing-ops');
    expect(html.match(/>0件<\/div>/g)).toHaveLength(4);
    expect(writingOps.render).toHaveBeenCalledOnce();
  });
});

it('offers a writing-only retry for failed retrieval and keeps loading status distinct', () => {
  const retry = async () => {};
  const failed = renderToStaticMarkup(<BusinessAdminWritingNotice state="ERROR" onRetry={retry} />);
  expect(failed).toContain('作文情報を再取得');
  expect(failed).toContain('role="alert"');
  expect(failed).toContain('tabindex="-1"');
  const loading = renderToStaticMarkup(<BusinessAdminWritingNotice state="LOADING" onRetry={retry} />);
  expect(loading).toContain('role="status"');
  expect(loading).not.toContain('<button');
  expect(loading).not.toContain('0件');
});
