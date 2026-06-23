import { describe, expect, it } from 'vitest';

import {
  buildB2BActivationIntegritySql,
  evaluateB2BActivationIntegritySummary,
  parseCliArgs,
} from '../scripts/analysis/check-d1-b2b-activation.mjs';

describe('check-d1-b2b-activation', () => {
  it('requires explicit D1 mode and validates hardening flags', () => {
    expect(parseCliArgs(['--help'])).toEqual(expect.objectContaining({
      help: true,
    }));
    expect(() => parseCliArgs([])).toThrow('Pass either --remote or --local');
    expect(parseCliArgs(['--remote'])).toEqual(expect.objectContaining({
      database: 'medace-db',
      mode: 'remote',
      maxActivationWarningOrgs: null,
      maxProductEventWarningRows: null,
      requireActiveB2BLoop: false,
    }));
    expect(parseCliArgs(['--remote', '--max-activation-warning-orgs', '0'])).toEqual(expect.objectContaining({
      maxActivationWarningOrgs: 0,
    }));
    expect(parseCliArgs(['--remote', '--max-product-event-warning-rows', '0'])).toEqual(expect.objectContaining({
      maxProductEventWarningRows: 0,
    }));
    expect(parseCliArgs(['--remote', '--require-active-b2b-loop'])).toEqual(expect.objectContaining({
      requireActiveB2BLoop: true,
    }));
    expect(parseCliArgs(['--local', '--persist-to', '/tmp/d1'])).toEqual(expect.objectContaining({
      mode: 'local',
      persistTo: '/tmp/d1',
    }));
    expect(() => parseCliArgs(['--remote', '--persist-to', '/tmp/d1'])).toThrow('--persist-to');
    expect(() => parseCliArgs(['--remote', '--max-activation-warning-orgs', '-1'])).toThrow('--max-activation-warning-orgs');
    expect(() => parseCliArgs(['--remote', '--max-product-event-warning-rows', '-1'])).toThrow('--max-product-event-warning-rows');
  });

  it('builds a SELECT-only B2B activation integrity query', () => {
    const sql = buildB2BActivationIntegritySql();

    expect(sql).toContain('organization_memberships');
    expect(sql).toContain('student_instructor_assignments');
    expect(sql).toContain('weekly_mission_assignments');
    expect(sql).toContain('instructor_notifications');
    expect(sql).toContain('writing_assignments');
    expect(sql).toContain('writing_teacher_reviews');
    expect(sql).toContain('product_events');
    expect(sql).toContain('writing_assignment_issued');
    expect(sql).toContain('product_event_subject_org_mismatch');
    expect(sql).toContain('orgs_with_writing_review');
    expect(sql).toContain('orgs_with_active_students_without_writing_assignment');
    expect(sql).not.toMatch(/\b(UPDATE|INSERT|DELETE|DROP|ALTER)\b/i);
  });

  it('passes clean integrity while keeping activation gaps warning-only by default', () => {
    const result = evaluateB2BActivationIntegritySummary({
      total_organizations: 3,
      active_organizations: 3,
      orgs_with_active_students: 2,
      orgs_with_writing_assignment: 1,
      orgs_with_active_students_without_cohort: 1,
      orgs_with_active_students_without_writing_assignment: 1,
      open_commercial_requests: 2,
      product_event_missing_subject: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.warnings.join('\n')).toContain('active students but no cohort');
    expect(result.warnings.join('\n')).toContain('commercial request');
    expect(result.warnings.join('\n')).toContain('missing subjects');
  });

  it('fails organization membership and workflow reference blockers', () => {
    const result = evaluateB2BActivationIntegritySummary({
      org_users_without_active_membership: 1,
      active_membership_user_org_mismatch: 2,
      student_assignment_cross_org: 3,
      mission_assignment_without_mission: 4,
      notification_without_instructor_membership: 5,
      writing_assignment_instructor_cross_org: 6,
      writing_submission_without_assignment: 7,
      writing_review_selected_evaluation_submission_mismatch: 8,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('lack an active membership');
    expect(result.errors.join('\n')).toContain('disagree with users.organization_id');
    expect(result.errors.join('\n')).toContain('different organizations');
    expect(result.errors.join('\n')).toContain('missing missions');
    expect(result.errors.join('\n')).toContain('instructors without active memberships');
    expect(result.errors.join('\n')).toContain('outside the resolved organization');
    expect(result.errors.join('\n')).toContain('missing assignments');
    expect(result.errors.join('\n')).toContain('evaluations from another submission');
  });

  it('can harden activation warning organizations for release days that require a complete loop', () => {
    const result = evaluateB2BActivationIntegritySummary({
      orgs_with_active_students: 4,
      orgs_with_active_students_without_writing_assignment: 2,
      orgs_with_writing_assignment: 1,
    }, {
      maxActivationWarningOrgs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Activation warning org/gap count 2 exceeds maximum 1');
  });

  it('counts non-writing activation warning gaps under the strict release maximum', () => {
    const result = evaluateB2BActivationIntegritySummary({
      orgs_with_active_students: 3,
      orgs_with_active_students_without_cohort: 1,
      orgs_with_active_students_without_notification: 1,
      orgs_with_active_students_without_writing_assignment: 0,
    }, {
      maxActivationWarningOrgs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('Activation warning org/gap count 2 exceeds maximum 1');
  });

  it('fails the strict active B2B loop gate when organizations only reached writing assignment distribution', () => {
    const result = evaluateB2BActivationIntegritySummary({
      orgs_with_active_students: 2,
      orgs_with_writing_assignment: 1,
      orgs_with_writing_review: 0,
    }, {
      requireActiveB2BLoop: true,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('no organization has reached the writing review/returned loop');
  });

  it('passes the strict active B2B loop gate when at least one organization reached writing review return', () => {
    const result = evaluateB2BActivationIntegritySummary({
      orgs_with_active_students: 2,
      orgs_with_writing_assignment: 1,
      orgs_with_writing_review: 1,
    }, {
      requireActiveB2BLoop: true,
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('can harden B2B product event warning rows when telemetry integrity must be strict', () => {
    const result = evaluateB2BActivationIntegritySummary({
      product_event_feature_area_mismatch: 1,
      product_event_subject_org_mismatch: 2,
    }, {
      maxProductEventWarningRows: 2,
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join('\n')).toContain('B2B product event warning rows 3 exceeds maximum 2');
  });
});
