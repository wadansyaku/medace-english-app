import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import BusinessAdminSettingsSection from '../components/dashboard/businessAdmin/BusinessAdminSettingsSection';
import type { BusinessAdminDashboardController } from '../components/dashboard/businessAdmin/shared';
import { OrganizationRole, SubscriptionPlan, UserRole, type OrganizationSettingsSnapshot } from '../types';

const snapshot: OrganizationSettingsSnapshot = {
  organizationId: 'picker-org-a', displayName: 'Synthetic classroom', nameKey: 'synthetic-classroom',
  subscriptionPlan: SubscriptionPlan.TOB_PAID, updatedAt: 1,
  members: [{
    userUid: 'picker-owner', displayName: 'Synthetic owner', email: 'owner@picker.example.invalid',
    userRole: UserRole.STUDENT, organizationRole: OrganizationRole.STUDENT,
    subscriptionPlan: SubscriptionPlan.TOB_FREE, joinedAt: 1, updatedAt: 1,
  }, {
    userUid: 'picker-teacher', displayName: 'Synthetic teacher', email: 'teacher@picker.example.invalid',
    userRole: UserRole.INSTRUCTOR, organizationRole: OrganizationRole.INSTRUCTOR,
    subscriptionPlan: SubscriptionPlan.TOB_PAID, joinedAt: 1, updatedAt: 1,
  }],
  cohorts: [{ id: 'picker-cohort-a', organizationId: 'picker-org-a', name: 'Synthetic class A', studentCount: 0, instructorCount: 0, updatedAt: 1 }],
  instructorCohorts: {}, auditEvents: [],
};
const setup = (settingsSnapshot = snapshot) => {
  const actions = {
    toggleInstructorCohort: vi.fn(), handleInstructorCohortsSave: vi.fn(),
    instructorCohortDrafts: { 'picker-owner': ['picker-cohort-a'] },
    instructorCohortSavingUid: null, organizationDisplayName: 'Synthetic classroom',
    newCohortName: '', cohortDrafts: { 'picker-cohort-a': 'Synthetic class A' },
  };
  const controller = actions as unknown as BusinessAdminDashboardController;
  const tree = BusinessAdminSettingsSection({ controller, settingsSnapshot }) as React.ReactElement;
  return { actions, tree, html: renderToStaticMarkup(tree) };
};
const findElement = (node: React.ReactNode, testId: string): React.ReactElement<Record<string, any>> | undefined => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, testId);
      if (found) return found;
    }
  } else if (React.isValidElement<Record<string, any>>(node)) {
    if (node.props['data-testid'] === testId) return node;
    return findElement(node.props.children, testId);
  }
  return undefined;
};

describe('school settings operational instructor picker', () => {
  it('renders grant-backed staff without relabeling the canonical student member', () => {
    const { tree, html } = setup({ ...snapshot, eligibleInstructors: [{
      userUid: 'picker-owner', displayName: 'Synthetic owner', email: 'owner@picker.example.invalid',
    }] });
    expect(findElement(tree, 'instructor-cohort-save-picker-owner')).toBeDefined();
    expect(html).toContain('instructor-cohort-checkbox-picker-owner-picker-cohort-a');
    const members = findElement(tree, 'organization-members-section');
    expect(renderToStaticMarkup(members!)).toContain('生徒');
    expect(snapshot.members[0].userRole).toBe(UserRole.STUDENT);
    expect(snapshot.members[0].organizationRole).toBe(OrganizationRole.STUDENT);
  });

  it('passes the actual grant holder UID and class ID to the existing toggle and save actions', () => {
    const { tree, actions } = setup({ ...snapshot, eligibleInstructors: [{
      userUid: 'picker-owner', displayName: 'Synthetic owner', email: 'owner@picker.example.invalid',
    }] });
    const checkbox = findElement(tree, 'instructor-cohort-checkbox-picker-owner-picker-cohort-a')!;
    expect(checkbox.props.checked).toBe(true);
    checkbox.props.onChange();
    findElement(tree, 'instructor-cohort-save-picker-owner')!.props.onClick();
    expect(actions.toggleInstructorCohort).toHaveBeenCalledWith('picker-owner', 'picker-cohort-a');
    expect(actions.handleInstructorCohortsSave).toHaveBeenCalledWith('picker-owner');
  });

  it('respects a confirmed empty eligibility list instead of reviving canonical members', () => {
    const { tree, html } = setup({ ...snapshot, eligibleInstructors: [] });
    expect(html).toContain('範囲設定対象の講師はまだいません。');
    expect(findElement(tree, 'instructor-cohort-save-picker-teacher')).toBeUndefined();
    expect(findElement(tree, 'instructor-cohort-save-picker-owner')).toBeUndefined();
  });

  it('preserves canonical instructor selection for older and local snapshots that omit eligibility', () => {
    const { tree } = setup();
    expect(findElement(tree, 'instructor-cohort-save-picker-teacher')).toBeDefined();
    expect(findElement(tree, 'instructor-cohort-save-picker-owner')).toBeUndefined();
  });

  it('does not infer instructor authority from an organization label on a raw student', () => {
    const { tree } = setup({ ...snapshot, members: [{ ...snapshot.members[0], organizationRole: OrganizationRole.INSTRUCTOR }] });
    expect(findElement(tree, 'instructor-cohort-save-picker-owner')).toBeUndefined();
  });
});
