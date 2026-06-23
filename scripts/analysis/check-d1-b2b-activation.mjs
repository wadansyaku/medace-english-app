#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  extractWranglerJson,
  unwrapD1Results,
} from './run-d1-content-qa.mjs';

const DEFAULT_DATABASE = 'medace-db';
const WRANGLER_PATH = 'node_modules/wrangler/bin/wrangler.js';

export const parseCliArgs = (argv) => {
  const options = {
    database: DEFAULT_DATABASE,
    mode: null,
    outputPath: null,
    persistTo: null,
    maxActivationWarningOrgs: null,
    maxProductEventWarningRows: null,
    requireActiveB2BLoop: false,
    compact: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextValue = () => {
      index += 1;
      if (index >= argv.length) throw new Error(`${arg} requires a value.`);
      return argv[index];
    };

    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--database') {
      options.database = nextValue();
    } else if (arg === '--remote' || arg === '--local') {
      const mode = arg.slice(2);
      if (options.mode && options.mode !== mode) throw new Error('Pass only one of --remote or --local.');
      options.mode = mode;
    } else if (arg === '--output' || arg === '-o') {
      options.outputPath = nextValue();
    } else if (arg === '--persist-to') {
      options.persistTo = nextValue();
    } else if (arg === '--max-activation-warning-orgs') {
      options.maxActivationWarningOrgs = Number.parseInt(nextValue(), 10);
    } else if (arg === '--max-product-event-warning-rows') {
      options.maxProductEventWarningRows = Number.parseInt(nextValue(), 10);
    } else if (arg === '--require-active-b2b-loop') {
      options.requireActiveB2BLoop = true;
    } else if (arg === '--compact') {
      options.compact = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (options.help) return options;
  if (!options.database) throw new Error('--database must not be empty.');
  if (!options.mode) throw new Error('Pass either --remote or --local explicitly.');
  if (options.mode === 'remote' && options.persistTo) {
    throw new Error('--persist-to can only be used with --local.');
  }
  if (
    options.maxActivationWarningOrgs !== null
    && (!Number.isFinite(options.maxActivationWarningOrgs) || options.maxActivationWarningOrgs < 0)
  ) {
    throw new Error('--max-activation-warning-orgs must be a non-negative number.');
  }
  if (
    options.maxProductEventWarningRows !== null
    && (!Number.isFinite(options.maxProductEventWarningRows) || options.maxProductEventWarningRows < 0)
  ) {
    throw new Error('--max-product-event-warning-rows must be a non-negative number.');
  }

  return options;
};

export const buildB2BActivationIntegritySql = () => `
WITH
active_members AS (
  SELECT user_id, organization_id, role
  FROM organization_memberships
  WHERE status = 'ACTIVE'
),
active_student_orgs AS (
  SELECT organization_id, COUNT(DISTINCT user_id) AS active_students
  FROM active_members
  WHERE role = 'STUDENT'
  GROUP BY organization_id
),
orgs_with_cohort AS (
  SELECT DISTINCT organization_id
  FROM organization_cohorts
),
student_assignments AS (
  SELECT
    a.student_user_id,
    a.instructor_user_id,
    sm.organization_id AS student_organization_id,
    sm.role AS student_role,
    im.organization_id AS instructor_organization_id,
    im.role AS instructor_role
  FROM student_instructor_assignments a
  LEFT JOIN active_members sm ON sm.user_id = a.student_user_id
  LEFT JOIN active_members im ON im.user_id = a.instructor_user_id
),
orgs_with_assignment AS (
  SELECT DISTINCT student_organization_id AS organization_id
  FROM student_assignments
  WHERE student_organization_id IS NOT NULL
),
cohort_student_rows AS (
  SELECT
    cs.student_user_id,
    c.organization_id AS cohort_organization_id,
    sm.organization_id AS student_organization_id,
    sm.role AS student_role
  FROM organization_cohort_students cs
  LEFT JOIN organization_cohorts c ON c.id = cs.cohort_id
  LEFT JOIN active_members sm ON sm.user_id = cs.student_user_id
),
cohort_instructor_rows AS (
  SELECT
    ci.instructor_user_id,
    c.organization_id AS cohort_organization_id,
    im.organization_id AS instructor_organization_id,
    im.role AS instructor_role
  FROM organization_cohort_instructors ci
  LEFT JOIN organization_cohorts c ON c.id = ci.cohort_id
  LEFT JOIN active_members im ON im.user_id = ci.instructor_user_id
),
mission_assignment_rows AS (
  SELECT
    a.id,
    a.mission_id,
    a.student_user_id,
    a.assigned_by_user_id,
    m.organization_id AS mission_organization_id,
    sm.organization_id AS student_organization_id,
    sm.role AS student_role,
    am.organization_id AS assigned_by_organization_id,
    am.role AS assigned_by_role
  FROM weekly_mission_assignments a
  LEFT JOIN weekly_missions m ON m.id = a.mission_id
  LEFT JOIN active_members sm ON sm.user_id = a.student_user_id
  LEFT JOIN active_members am ON am.user_id = a.assigned_by_user_id
),
orgs_with_mission AS (
  SELECT DISTINCT mission_organization_id AS organization_id
  FROM mission_assignment_rows
  WHERE mission_organization_id IS NOT NULL
),
notification_rows AS (
  SELECT
    n.id,
    sm.organization_id AS student_organization_id,
    sm.role AS student_role,
    im.organization_id AS instructor_organization_id,
    im.role AS instructor_role
  FROM instructor_notifications n
  LEFT JOIN active_members sm ON sm.user_id = n.student_user_id
  LEFT JOIN active_members im ON im.user_id = n.instructor_user_id
),
orgs_with_notification AS (
  SELECT DISTINCT student_organization_id AS organization_id
  FROM notification_rows
  WHERE student_organization_id IS NOT NULL
),
writing_assignment_rows AS (
  SELECT
    w.id,
    w.status,
    COALESCE(w.organization_id, o.id) AS resolved_organization_id,
    sm.organization_id AS student_organization_id,
    sm.role AS student_role,
    im.organization_id AS instructor_organization_id,
    im.role AS instructor_role
  FROM writing_assignments w
  LEFT JOIN organizations o
    ON w.organization_id IS NULL
   AND LOWER(TRIM(w.organization_name)) = o.name_key
  LEFT JOIN active_members sm ON sm.user_id = w.student_user_id
  LEFT JOIN active_members im ON im.user_id = w.instructor_user_id
),
orgs_with_writing_assignment AS (
  SELECT DISTINCT resolved_organization_id AS organization_id
  FROM writing_assignment_rows
  WHERE resolved_organization_id IS NOT NULL
    AND status != 'DRAFT'
),
writing_submission_rows AS (
  SELECT
    s.id,
    s.submitted_by_user_id,
    w.id AS assignment_id,
    w.student_user_id,
    COALESCE(w.organization_id, o.id) AS resolved_organization_id
  FROM writing_submissions s
  LEFT JOIN writing_assignments w ON w.id = s.assignment_id
  LEFT JOIN organizations o
    ON w.organization_id IS NULL
   AND LOWER(TRIM(w.organization_name)) = o.name_key
),
teacher_review_rows AS (
  SELECT
    r.id,
    r.submission_id,
    r.reviewer_user_id,
    r.selected_evaluation_id,
    s.id AS existing_submission_id,
    e.id AS existing_evaluation_id,
    e.submission_id AS selected_evaluation_submission_id,
    COALESCE(w.organization_id, o.id) AS resolved_organization_id,
    rm.organization_id AS reviewer_organization_id,
    rm.role AS reviewer_role
  FROM writing_teacher_reviews r
  LEFT JOIN writing_submissions s ON s.id = r.submission_id
  LEFT JOIN writing_ai_evaluations e ON e.id = r.selected_evaluation_id
  LEFT JOIN writing_assignments w ON w.id = s.assignment_id
  LEFT JOIN organizations o
    ON w.organization_id IS NULL
   AND LOWER(TRIM(w.organization_name)) = o.name_key
  LEFT JOIN active_members rm ON rm.user_id = r.reviewer_user_id
),
b2b_product_event_rows AS (
  SELECT
    p.id,
    p.event_name,
    p.feature_area,
    p.organization_id,
    p.subject_type,
    p.subject_id,
    CASE
      WHEN p.event_name IN ('group_admin_created_cohort', 'group_admin_assigned_student', 'group_admin_created_first_mission', 'instructor_notification_sent') THEN 'organization_activation'
      WHEN p.event_name IN ('writing_assignment_created', 'writing_assignment_issued', 'writing_submission_received', 'writing_review_completed') THEN 'writing'
      ELSE NULL
    END AS expected_feature_area,
    CASE
      WHEN p.event_name = 'group_admin_created_cohort' THEN 'cohort'
      WHEN p.event_name IN ('group_admin_assigned_student', 'instructor_notification_sent') THEN 'student'
      WHEN p.event_name = 'group_admin_created_first_mission' THEN 'mission'
      WHEN p.event_name IN ('writing_assignment_created', 'writing_assignment_issued') THEN 'writing_assignment'
      WHEN p.event_name IN ('writing_submission_received', 'writing_review_completed') THEN 'writing_submission'
      ELSE NULL
    END AS expected_subject_type,
    CASE
      WHEN p.event_name = 'group_admin_created_cohort' AND pe_cohort.id IS NOT NULL THEN 1
      WHEN p.event_name IN ('group_admin_assigned_student', 'instructor_notification_sent') AND pe_student.id IS NOT NULL THEN 1
      WHEN p.event_name = 'group_admin_created_first_mission' AND pe_mission.id IS NOT NULL THEN 1
      WHEN p.event_name IN ('writing_assignment_created', 'writing_assignment_issued') AND pe_assignment.id IS NOT NULL THEN 1
      WHEN p.event_name IN ('writing_submission_received', 'writing_review_completed') AND pe_submission.id IS NOT NULL THEN 1
      ELSE 0
    END AS subject_exists,
    CASE
      WHEN p.event_name = 'group_admin_created_cohort' THEN pe_cohort.organization_id
      WHEN p.event_name IN ('group_admin_assigned_student', 'instructor_notification_sent') THEN pe_student_member.organization_id
      WHEN p.event_name = 'group_admin_created_first_mission' THEN pe_mission.organization_id
      WHEN p.event_name IN ('writing_assignment_created', 'writing_assignment_issued') THEN COALESCE(pe_assignment.organization_id, pe_assignment_org.id)
      WHEN p.event_name IN ('writing_submission_received', 'writing_review_completed') THEN COALESCE(pe_submission_assignment.organization_id, pe_submission_org.id)
      ELSE NULL
    END AS subject_organization_id
  FROM product_events p
  LEFT JOIN organization_cohorts pe_cohort
    ON p.event_name = 'group_admin_created_cohort'
   AND pe_cohort.id = p.subject_id
  LEFT JOIN users pe_student
    ON p.event_name IN ('group_admin_assigned_student', 'instructor_notification_sent')
   AND pe_student.id = p.subject_id
  LEFT JOIN active_members pe_student_member ON pe_student_member.user_id = pe_student.id
  LEFT JOIN weekly_missions pe_mission
    ON p.event_name = 'group_admin_created_first_mission'
   AND pe_mission.id = p.subject_id
  LEFT JOIN writing_assignments pe_assignment
    ON p.event_name IN ('writing_assignment_created', 'writing_assignment_issued')
   AND pe_assignment.id = p.subject_id
  LEFT JOIN organizations pe_assignment_org
    ON pe_assignment.organization_id IS NULL
   AND LOWER(TRIM(pe_assignment.organization_name)) = pe_assignment_org.name_key
  LEFT JOIN writing_submissions pe_submission
    ON p.event_name IN ('writing_submission_received', 'writing_review_completed')
   AND pe_submission.id = p.subject_id
  LEFT JOIN writing_assignments pe_submission_assignment ON pe_submission_assignment.id = pe_submission.assignment_id
  LEFT JOIN organizations pe_submission_org
    ON pe_submission_assignment.organization_id IS NULL
   AND LOWER(TRIM(pe_submission_assignment.organization_name)) = pe_submission_org.name_key
  WHERE p.event_name IN (
    'group_admin_created_cohort',
    'group_admin_assigned_student',
    'group_admin_created_first_mission',
    'instructor_notification_sent',
    'writing_assignment_created',
    'writing_assignment_issued',
    'writing_submission_received',
    'writing_review_completed'
  )
),
orgs_with_writing_submission AS (
  SELECT DISTINCT resolved_organization_id AS organization_id
  FROM writing_submission_rows
  WHERE resolved_organization_id IS NOT NULL
),
orgs_with_writing_review AS (
  SELECT DISTINCT resolved_organization_id AS organization_id
  FROM teacher_review_rows
  WHERE resolved_organization_id IS NOT NULL
)
SELECT
  (SELECT COUNT(*) FROM organizations) AS total_organizations,
  (SELECT COUNT(*) FROM organizations WHERE status = 'ACTIVE') AS active_organizations,
  (SELECT COUNT(*) FROM active_student_orgs) AS orgs_with_active_students,
  (SELECT COALESCE(SUM(active_students), 0) FROM active_student_orgs) AS active_student_memberships,
  (SELECT COUNT(*) FROM orgs_with_cohort) AS orgs_with_cohort,
  (SELECT COUNT(*) FROM orgs_with_assignment) AS orgs_with_assignment,
  (SELECT COUNT(*) FROM orgs_with_mission) AS orgs_with_mission,
  (SELECT COUNT(*) FROM orgs_with_notification) AS orgs_with_notification,
  (SELECT COUNT(*) FROM orgs_with_writing_assignment) AS orgs_with_writing_assignment,
  (SELECT COUNT(*) FROM orgs_with_writing_submission) AS orgs_with_writing_submission,
  (SELECT COUNT(*) FROM orgs_with_writing_review) AS orgs_with_writing_review,
  (SELECT COUNT(*) FROM users WHERE organization_id IS NOT NULL) AS org_users,
  (SELECT COUNT(*) FROM users u WHERE u.organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.user_id = u.id
      AND m.organization_id = u.organization_id
      AND m.status = 'ACTIVE'
  )) AS org_users_without_active_membership,
  (SELECT COUNT(*) FROM users u WHERE u.organization_id IS NULL AND u.role IN ('INSTRUCTOR', 'STUDENT') AND u.subscription_plan IN ('TOB_FREE', 'TOB_PAID')) AS business_plan_users_without_org,
  (SELECT COUNT(*) FROM organization_memberships m LEFT JOIN users u ON u.id = m.user_id WHERE m.status = 'ACTIVE' AND u.id IS NULL) AS active_membership_missing_user,
  (SELECT COUNT(*) FROM organization_memberships m LEFT JOIN organizations o ON o.id = m.organization_id WHERE m.status = 'ACTIVE' AND o.id IS NULL) AS active_membership_missing_org,
  (SELECT COUNT(*) FROM organization_memberships m JOIN organizations o ON o.id = m.organization_id WHERE m.status = 'ACTIVE' AND o.status != 'ACTIVE') AS active_membership_inactive_org,
  (SELECT COUNT(*) FROM organization_memberships m JOIN users u ON u.id = m.user_id WHERE m.status = 'ACTIVE' AND (u.organization_id IS NULL OR u.organization_id != m.organization_id)) AS active_membership_user_org_mismatch,
  (SELECT COUNT(*) FROM organization_memberships m JOIN users u ON u.id = m.user_id WHERE m.status = 'ACTIVE' AND COALESCE(u.organization_role, '') != COALESCE(m.role, '')) AS active_membership_role_mismatch,
  (SELECT COUNT(*) FROM student_instructor_assignments) AS student_assignment_rows,
  (SELECT COUNT(*) FROM student_assignments WHERE student_organization_id IS NULL) AS student_assignment_without_student_membership,
  (SELECT COUNT(*) FROM student_assignments WHERE student_organization_id IS NOT NULL AND student_role != 'STUDENT') AS student_assignment_student_role_mismatch,
  (SELECT COUNT(*) FROM student_assignments WHERE instructor_organization_id IS NULL) AS student_assignment_without_instructor_membership,
  (SELECT COUNT(*) FROM student_assignments WHERE instructor_organization_id IS NOT NULL AND instructor_role NOT IN ('INSTRUCTOR', 'GROUP_ADMIN')) AS student_assignment_instructor_role_mismatch,
  (SELECT COUNT(*) FROM student_assignments WHERE student_organization_id IS NOT NULL AND instructor_organization_id IS NOT NULL AND student_organization_id != instructor_organization_id) AS student_assignment_cross_org,
  (SELECT COUNT(*) FROM cohort_student_rows WHERE cohort_organization_id IS NULL) AS cohort_student_without_cohort,
  (SELECT COUNT(*) FROM cohort_student_rows WHERE student_organization_id IS NULL) AS cohort_student_without_membership,
  (SELECT COUNT(*) FROM cohort_student_rows WHERE student_organization_id IS NOT NULL AND student_role != 'STUDENT') AS cohort_student_role_mismatch,
  (SELECT COUNT(*) FROM cohort_student_rows WHERE cohort_organization_id IS NOT NULL AND student_organization_id IS NOT NULL AND cohort_organization_id != student_organization_id) AS cohort_student_cross_org,
  (SELECT COUNT(*) FROM cohort_instructor_rows WHERE cohort_organization_id IS NULL) AS cohort_instructor_without_cohort,
  (SELECT COUNT(*) FROM cohort_instructor_rows WHERE instructor_organization_id IS NULL) AS cohort_instructor_without_membership,
  (SELECT COUNT(*) FROM cohort_instructor_rows WHERE instructor_organization_id IS NOT NULL AND instructor_role NOT IN ('INSTRUCTOR', 'GROUP_ADMIN')) AS cohort_instructor_role_mismatch,
  (SELECT COUNT(*) FROM cohort_instructor_rows WHERE cohort_organization_id IS NOT NULL AND instructor_organization_id IS NOT NULL AND cohort_organization_id != instructor_organization_id) AS cohort_instructor_cross_org,
  (SELECT COUNT(*) FROM weekly_mission_assignments) AS mission_assignment_rows,
  (SELECT COUNT(*) FROM mission_assignment_rows WHERE mission_organization_id IS NULL AND mission_id IS NOT NULL) AS mission_assignment_missing_org,
  (SELECT COUNT(*) FROM mission_assignment_rows WHERE mission_id IS NULL) AS mission_assignment_without_mission,
  (SELECT COUNT(*) FROM mission_assignment_rows WHERE student_organization_id IS NULL) AS mission_assignment_without_student_membership,
  (SELECT COUNT(*) FROM mission_assignment_rows WHERE student_organization_id IS NOT NULL AND student_role != 'STUDENT') AS mission_assignment_student_role_mismatch,
  (SELECT COUNT(*) FROM mission_assignment_rows WHERE mission_organization_id IS NOT NULL AND student_organization_id IS NOT NULL AND mission_organization_id != student_organization_id) AS mission_assignment_cross_org,
  (SELECT COUNT(*) FROM mission_assignment_rows WHERE assigned_by_organization_id IS NULL) AS mission_assignment_without_assigner_membership,
  (SELECT COUNT(*) FROM mission_assignment_rows WHERE assigned_by_organization_id IS NOT NULL AND assigned_by_role NOT IN ('INSTRUCTOR', 'GROUP_ADMIN')) AS mission_assignment_assigner_role_mismatch,
  (SELECT COUNT(*) FROM mission_assignment_rows WHERE mission_organization_id IS NOT NULL AND assigned_by_organization_id IS NOT NULL AND mission_organization_id != assigned_by_organization_id) AS mission_assignment_assigner_cross_org,
  (SELECT COUNT(*) FROM instructor_notifications) AS notification_rows,
  (SELECT COUNT(*) FROM notification_rows WHERE student_organization_id IS NULL) AS notification_without_student_membership,
  (SELECT COUNT(*) FROM notification_rows WHERE student_organization_id IS NOT NULL AND student_role != 'STUDENT') AS notification_student_role_mismatch,
  (SELECT COUNT(*) FROM notification_rows WHERE instructor_organization_id IS NULL) AS notification_without_instructor_membership,
  (SELECT COUNT(*) FROM notification_rows WHERE instructor_organization_id IS NOT NULL AND instructor_role NOT IN ('INSTRUCTOR', 'GROUP_ADMIN')) AS notification_instructor_role_mismatch,
  (SELECT COUNT(*) FROM notification_rows WHERE student_organization_id IS NOT NULL AND instructor_organization_id IS NOT NULL AND student_organization_id != instructor_organization_id) AS notification_cross_org,
  (SELECT COUNT(*) FROM writing_assignments) AS writing_assignment_rows,
  (SELECT COUNT(*) FROM writing_assignment_rows WHERE resolved_organization_id IS NULL AND status != 'DRAFT') AS writing_assignment_missing_resolved_org,
  (SELECT COUNT(*) FROM writing_assignment_rows WHERE student_organization_id IS NULL) AS writing_assignment_without_student_membership,
  (SELECT COUNT(*) FROM writing_assignment_rows WHERE student_organization_id IS NOT NULL AND student_role != 'STUDENT') AS writing_assignment_student_role_mismatch,
  (SELECT COUNT(*) FROM writing_assignment_rows WHERE instructor_organization_id IS NULL) AS writing_assignment_without_instructor_membership,
  (SELECT COUNT(*) FROM writing_assignment_rows WHERE instructor_organization_id IS NOT NULL AND instructor_role NOT IN ('INSTRUCTOR', 'GROUP_ADMIN')) AS writing_assignment_instructor_role_mismatch,
  (SELECT COUNT(*) FROM writing_assignment_rows WHERE resolved_organization_id IS NOT NULL AND student_organization_id IS NOT NULL AND resolved_organization_id != student_organization_id) AS writing_assignment_student_cross_org,
  (SELECT COUNT(*) FROM writing_assignment_rows WHERE resolved_organization_id IS NOT NULL AND instructor_organization_id IS NOT NULL AND resolved_organization_id != instructor_organization_id) AS writing_assignment_instructor_cross_org,
  (SELECT COUNT(*) FROM writing_submissions) AS writing_submission_rows,
  (SELECT COUNT(*) FROM writing_submission_rows WHERE assignment_id IS NULL) AS writing_submission_without_assignment,
  (SELECT COUNT(*) FROM writing_submission_rows WHERE assignment_id IS NOT NULL AND submitted_by_user_id != student_user_id) AS writing_submission_submitter_mismatch,
  (SELECT COUNT(*) FROM writing_teacher_reviews) AS writing_review_rows,
  (SELECT COUNT(*) FROM teacher_review_rows WHERE existing_submission_id IS NULL) AS writing_review_without_submission,
  (SELECT COUNT(*) FROM teacher_review_rows WHERE existing_evaluation_id IS NULL) AS writing_review_without_selected_evaluation,
  (SELECT COUNT(*) FROM teacher_review_rows WHERE existing_evaluation_id IS NOT NULL AND selected_evaluation_submission_id != submission_id) AS writing_review_selected_evaluation_submission_mismatch,
  (SELECT COUNT(*) FROM teacher_review_rows WHERE reviewer_organization_id IS NULL) AS writing_review_without_reviewer_membership,
  (SELECT COUNT(*) FROM teacher_review_rows WHERE reviewer_organization_id IS NOT NULL AND reviewer_role NOT IN ('INSTRUCTOR', 'GROUP_ADMIN')) AS writing_review_reviewer_role_mismatch,
  (SELECT COUNT(*) FROM teacher_review_rows WHERE resolved_organization_id IS NOT NULL AND reviewer_organization_id IS NOT NULL AND resolved_organization_id != reviewer_organization_id) AS writing_review_reviewer_cross_org,
  (SELECT COUNT(*) FROM active_student_orgs aso WHERE NOT EXISTS (SELECT 1 FROM orgs_with_cohort c WHERE c.organization_id = aso.organization_id)) AS orgs_with_active_students_without_cohort,
  (SELECT COUNT(*) FROM active_student_orgs aso WHERE NOT EXISTS (SELECT 1 FROM orgs_with_assignment a WHERE a.organization_id = aso.organization_id)) AS orgs_with_active_students_without_assignment,
  (SELECT COUNT(*) FROM active_student_orgs aso WHERE NOT EXISTS (SELECT 1 FROM orgs_with_mission m WHERE m.organization_id = aso.organization_id)) AS orgs_with_active_students_without_mission,
  (SELECT COUNT(*) FROM active_student_orgs aso WHERE NOT EXISTS (SELECT 1 FROM orgs_with_notification n WHERE n.organization_id = aso.organization_id)) AS orgs_with_active_students_without_notification,
  (SELECT COUNT(*) FROM active_student_orgs aso WHERE NOT EXISTS (SELECT 1 FROM orgs_with_writing_assignment w WHERE w.organization_id = aso.organization_id)) AS orgs_with_active_students_without_writing_assignment,
  (SELECT COUNT(*) FROM active_student_orgs aso WHERE NOT EXISTS (SELECT 1 FROM orgs_with_writing_submission w WHERE w.organization_id = aso.organization_id)) AS orgs_with_active_students_without_writing_submission,
  (SELECT COUNT(*) FROM commercial_requests WHERE status IN ('OPEN', 'IN_PROGRESS')) AS open_commercial_requests,
  (SELECT COUNT(*) FROM b2b_product_event_rows) AS product_event_b2b_rows,
  (SELECT COUNT(*) FROM b2b_product_event_rows WHERE feature_area != expected_feature_area) AS product_event_feature_area_mismatch,
  (SELECT COUNT(*) FROM b2b_product_event_rows WHERE COALESCE(subject_type, '') != expected_subject_type) AS product_event_subject_type_mismatch,
  (SELECT COUNT(*) FROM b2b_product_event_rows WHERE organization_id IS NULL) AS product_event_missing_org,
  (SELECT COUNT(*) FROM b2b_product_event_rows WHERE subject_id IS NULL OR subject_exists = 0) AS product_event_missing_subject,
  (SELECT COUNT(*) FROM b2b_product_event_rows WHERE organization_id IS NOT NULL AND subject_organization_id IS NULL AND subject_exists = 1) AS product_event_missing_subject_org,
  (SELECT COUNT(*) FROM b2b_product_event_rows WHERE organization_id IS NOT NULL AND subject_organization_id IS NOT NULL AND organization_id != subject_organization_id) AS product_event_subject_org_mismatch;
`;

const runWranglerQuery = (options, sql) => {
  const args = [
    WRANGLER_PATH,
    'd1',
    'execute',
    options.database,
    '--command',
    sql,
    '--json',
  ];
  if (options.mode === 'remote') args.splice(4, 0, '--remote');
  if (options.mode === 'local') args.splice(4, 0, '--local');
  if (options.mode === 'local' && options.persistTo) {
    args.push('--persist-to', options.persistTo);
  }

  let raw;
  try {
    raw = execFileSync(process.execPath, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        CI: '1',
        FORCE_COLOR: '0',
      },
      maxBuffer: 128 * 1024 * 1024,
    });
  } catch (error) {
    const details = [
      error?.message,
      error?.stdout,
      error?.stderr,
    ].filter(Boolean).join('\n');
    throw new Error(details || 'Failed to query D1 B2B activation integrity.');
  }

  return unwrapD1Results(extractWranglerJson(raw));
};

const toNumber = (summary, key) => Number(summary?.[key] || 0);
const ACTIVATION_WARNING_GAP_KEYS = [
  'mission_assignment_missing_org',
  'writing_assignment_missing_resolved_org',
  'orgs_with_active_students_without_cohort',
  'orgs_with_active_students_without_assignment',
  'orgs_with_active_students_without_mission',
  'orgs_with_active_students_without_notification',
  'orgs_with_active_students_without_writing_assignment',
  'orgs_with_active_students_without_writing_submission',
  'open_commercial_requests',
];
const PRODUCT_EVENT_WARNING_KEYS = [
  'product_event_feature_area_mismatch',
  'product_event_subject_type_mismatch',
  'product_event_missing_org',
  'product_event_missing_subject',
  'product_event_missing_subject_org',
  'product_event_subject_org_mismatch',
];

const addCountMessage = (messages, summary, key, label) => {
  const count = toNumber(summary, key);
  if (count > 0) {
    messages.push(`${count} ${label}.`);
  }
};

export const evaluateB2BActivationIntegritySummary = (summary, thresholds = {}) => {
  const errors = [];
  const warnings = [];

  [
    ['org_users_without_active_membership', 'organization user(s) lack an active membership matching users.organization_id'],
    ['business_plan_users_without_org', 'business-plan instructor/student user(s) lack an organization'],
    ['active_membership_missing_user', 'active membership row(s) reference missing users'],
    ['active_membership_missing_org', 'active membership row(s) reference missing organizations'],
    ['active_membership_inactive_org', 'active membership row(s) reference inactive organizations'],
    ['active_membership_user_org_mismatch', 'active membership row(s) disagree with users.organization_id'],
    ['active_membership_role_mismatch', 'active membership row(s) disagree with users.organization_role'],
    ['student_assignment_without_student_membership', 'student assignment row(s) reference students without active memberships'],
    ['student_assignment_student_role_mismatch', 'student assignment row(s) reference users whose active membership role is not STUDENT'],
    ['student_assignment_without_instructor_membership', 'student assignment row(s) reference instructors without active memberships'],
    ['student_assignment_instructor_role_mismatch', 'student assignment row(s) reference assigners whose active membership role is not INSTRUCTOR/GROUP_ADMIN'],
    ['student_assignment_cross_org', 'student assignment row(s) connect users from different organizations'],
    ['cohort_student_without_cohort', 'cohort student row(s) reference missing cohorts'],
    ['cohort_student_without_membership', 'cohort student row(s) reference students without active memberships'],
    ['cohort_student_role_mismatch', 'cohort student row(s) reference users whose active membership role is not STUDENT'],
    ['cohort_student_cross_org', 'cohort student row(s) place students in another organization'],
    ['cohort_instructor_without_cohort', 'cohort instructor row(s) reference missing cohorts'],
    ['cohort_instructor_without_membership', 'cohort instructor row(s) reference instructors without active memberships'],
    ['cohort_instructor_role_mismatch', 'cohort instructor row(s) reference users whose active membership role is not INSTRUCTOR/GROUP_ADMIN'],
    ['cohort_instructor_cross_org', 'cohort instructor row(s) place instructors in another organization'],
    ['mission_assignment_without_mission', 'mission assignment row(s) reference missing missions'],
    ['mission_assignment_without_student_membership', 'mission assignment row(s) reference students without active memberships'],
    ['mission_assignment_student_role_mismatch', 'mission assignment row(s) reference users whose active membership role is not STUDENT'],
    ['mission_assignment_cross_org', 'mission assignment row(s) assign missions across organizations'],
    ['mission_assignment_without_assigner_membership', 'mission assignment row(s) reference assigners without active memberships'],
    ['mission_assignment_assigner_role_mismatch', 'mission assignment row(s) reference assigners whose active membership role is not INSTRUCTOR/GROUP_ADMIN'],
    ['mission_assignment_assigner_cross_org', 'mission assignment row(s) use assigners from another organization'],
    ['notification_without_student_membership', 'notification row(s) reference students without active memberships'],
    ['notification_student_role_mismatch', 'notification row(s) reference users whose active membership role is not STUDENT'],
    ['notification_without_instructor_membership', 'notification row(s) reference instructors without active memberships'],
    ['notification_instructor_role_mismatch', 'notification row(s) reference instructors whose active membership role is not INSTRUCTOR/GROUP_ADMIN'],
    ['notification_cross_org', 'notification row(s) connect users from different organizations'],
    ['writing_assignment_without_student_membership', 'writing assignment row(s) reference students without active memberships'],
    ['writing_assignment_student_role_mismatch', 'writing assignment row(s) reference users whose active membership role is not STUDENT'],
    ['writing_assignment_without_instructor_membership', 'writing assignment row(s) reference instructors without active memberships'],
    ['writing_assignment_instructor_role_mismatch', 'writing assignment row(s) reference instructors whose active membership role is not INSTRUCTOR/GROUP_ADMIN'],
    ['writing_assignment_student_cross_org', 'writing assignment row(s) target students outside the resolved organization'],
    ['writing_assignment_instructor_cross_org', 'writing assignment row(s) use instructors outside the resolved organization'],
    ['writing_submission_without_assignment', 'writing submission row(s) reference missing assignments'],
    ['writing_submission_submitter_mismatch', 'writing submission row(s) were submitted by a user other than the assigned student'],
    ['writing_review_without_submission', 'writing teacher review row(s) reference missing submissions'],
    ['writing_review_without_selected_evaluation', 'writing teacher review row(s) reference missing selected evaluations'],
    ['writing_review_selected_evaluation_submission_mismatch', 'writing teacher review row(s) select evaluations from another submission'],
    ['writing_review_without_reviewer_membership', 'writing teacher review row(s) reference reviewers without active memberships'],
    ['writing_review_reviewer_role_mismatch', 'writing teacher review row(s) reference reviewers whose active membership role is not INSTRUCTOR/GROUP_ADMIN'],
    ['writing_review_reviewer_cross_org', 'writing teacher review row(s) use reviewers outside the resolved organization'],
  ].forEach(([key, label]) => addCountMessage(errors, summary, key, label));

  [
    ['mission_assignment_missing_org', 'mission assignment row(s) cannot be attributed to an organization'],
    ['writing_assignment_missing_resolved_org', 'non-draft writing assignment row(s) cannot be attributed to an organization'],
    ['orgs_with_active_students_without_cohort', 'organization(s) have active students but no cohort'],
    ['orgs_with_active_students_without_assignment', 'organization(s) have active students but no instructor assignment'],
    ['orgs_with_active_students_without_mission', 'organization(s) have active students but no mission assignment'],
    ['orgs_with_active_students_without_notification', 'organization(s) have active students but no instructor notification'],
    ['orgs_with_active_students_without_writing_assignment', 'organization(s) have active students but no writing assignment'],
    ['orgs_with_active_students_without_writing_submission', 'organization(s) have active students but no writing submission'],
    ['open_commercial_requests', 'commercial request(s) remain open or in progress'],
    ['product_event_feature_area_mismatch', 'B2B product event row(s) have unexpected feature_area values'],
    ['product_event_subject_type_mismatch', 'B2B product event row(s) have unexpected subject_type values'],
    ['product_event_missing_org', 'B2B product event row(s) are missing organization_id'],
    ['product_event_missing_subject', 'B2B product event row(s) reference missing subjects'],
    ['product_event_missing_subject_org', 'B2B product event row(s) reference subjects without resolvable organizations'],
    ['product_event_subject_org_mismatch', 'B2B product event row(s) disagree with subject organization'],
  ].forEach(([key, label]) => addCountMessage(warnings, summary, key, label));

  const maxActivationWarningOrgs = thresholds.maxActivationWarningOrgs;
  const activationWarningGaps = ACTIVATION_WARNING_GAP_KEYS.reduce((total, key) => total + toNumber(summary, key), 0);
  if (
    maxActivationWarningOrgs !== undefined
    && maxActivationWarningOrgs !== null
    && activationWarningGaps > maxActivationWarningOrgs
  ) {
    errors.push(`Activation warning org/gap count ${activationWarningGaps} exceeds maximum ${maxActivationWarningOrgs}.`);
  }

  if (
    thresholds.requireActiveB2BLoop
    && toNumber(summary, 'orgs_with_active_students') > 0
    && toNumber(summary, 'orgs_with_writing_review') < 1
  ) {
    errors.push('At least one organization has active students, but no organization has reached the writing review/returned loop.');
  }
  const maxProductEventWarningRows = thresholds.maxProductEventWarningRows;
  const productEventWarningRows = PRODUCT_EVENT_WARNING_KEYS.reduce((total, key) => total + toNumber(summary, key), 0);
  if (
    maxProductEventWarningRows !== undefined
    && maxProductEventWarningRows !== null
    && productEventWarningRows > maxProductEventWarningRows
  ) {
    errors.push(`B2B product event warning rows ${productEventWarningRows} exceeds maximum ${maxProductEventWarningRows}.`);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    summary,
  };
};

const usage = () => `Usage: node scripts/analysis/check-d1-b2b-activation.mjs --remote|--local [--database medace-db]

Reads D1 B2B workspace integrity and activation funnel health. Release-blocking errors are reserved for broken organization membership, assignment, mission, notification, and writing references. Funnel drop-offs are warning-only unless explicitly hardened.
Options:
  --database <name>                       D1 database name. Default: medace-db.
  --remote                                Query remote D1. Must be explicit.
  --local                                 Query local D1. Must be explicit.
  -o, --output <path>                     Write JSON result to file.
  --persist-to <dir>                      Local D1 persist directory. Only with --local.
  --max-activation-warning-orgs <num>     Fail if activation warning org/gap count exceeds this value. Default: report only.
  --max-product-event-warning-rows <num>  Fail if B2B product event warning rows exceed this value. Default: report only.
  --require-active-b2b-loop               Fail when active-student organizations exist but none has reached the writing review/returned loop.
  --compact                               Print compact JSON.
  --help                                  Show this help.
`;

export const runCli = async (argv = process.argv.slice(2), runQuery = runWranglerQuery) => {
  const options = parseCliArgs(argv);
  if (options.help) {
    process.stdout.write(usage());
    return 0;
  }

  const [summary = {}] = runQuery(options, buildB2BActivationIntegritySql());
  const evaluation = evaluateB2BActivationIntegritySummary(summary, {
    maxActivationWarningOrgs: options.maxActivationWarningOrgs,
    maxProductEventWarningRows: options.maxProductEventWarningRows,
    requireActiveB2BLoop: options.requireActiveB2BLoop,
  });
  const json = JSON.stringify(evaluation, null, options.compact ? 0 : 2);

  if (options.outputPath) {
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${json}\n`, 'utf8');
  } else {
    process.stdout.write(`${json}\n`);
  }

  return evaluation.ok ? 0 : 1;
};

const isMain = process.argv[1]?.endsWith('/check-d1-b2b-activation.mjs')
  || process.argv[1]?.endsWith('\\check-d1-b2b-activation.mjs');

if (isMain) {
  runCli().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`${error?.message || error}\n`);
    process.exitCode = 1;
  });
}
