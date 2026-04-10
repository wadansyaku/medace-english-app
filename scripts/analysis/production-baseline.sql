-- Production baseline query pack for medace-db.
-- Run with:
-- node node_modules/wrangler/bin/wrangler.js d1 execute medace-db --remote --file=./scripts/analysis/production-baseline.sql --json

-- User and organization mix
SELECT role, subscription_plan, COUNT(*) AS users
FROM users
GROUP BY role, subscription_plan
ORDER BY role, subscription_plan;

SELECT
  o.display_name,
  o.subscription_plan,
  SUM(CASE WHEN m.status = 'ACTIVE' THEN 1 ELSE 0 END) AS active_members,
  SUM(CASE WHEN m.status = 'ACTIVE' AND m.role = 'STUDENT' THEN 1 ELSE 0 END) AS students,
  SUM(CASE WHEN m.status = 'ACTIVE' AND m.role IN ('INSTRUCTOR', 'GROUP_ADMIN') THEN 1 ELSE 0 END) AS staff
FROM organizations o
LEFT JOIN organization_memberships m ON m.organization_id = o.id
GROUP BY o.id, o.display_name, o.subscription_plan
ORDER BY students DESC, active_members DESC;

-- Catalog and hint asset coverage
SELECT catalog_source, access_scope, COUNT(*) AS books, SUM(word_count) AS declared_words
FROM books
GROUP BY catalog_source, access_scope
ORDER BY declared_words DESC;

SELECT
  COUNT(*) AS words,
  SUM(CASE WHEN example_sentence IS NOT NULL AND TRIM(example_sentence) != '' THEN 1 ELSE 0 END) AS words_with_examples,
  SUM(CASE WHEN example_image_key IS NOT NULL AND TRIM(example_image_key) != '' THEN 1 ELSE 0 END) AS words_with_images,
  SUM(CASE WHEN example_audit_status = 'APPROVED' THEN 1 ELSE 0 END) AS examples_approved,
  SUM(CASE WHEN example_audit_status = 'REVIEW_REQUIRED' THEN 1 ELSE 0 END) AS examples_review_required,
  SUM(CASE WHEN example_image_audit_status = 'APPROVED' THEN 1 ELSE 0 END) AS images_approved,
  SUM(CASE WHEN example_image_audit_status = 'REVIEW_REQUIRED' THEN 1 ELSE 0 END) AS images_review_required
FROM words;

SELECT
  SUM(CASE WHEN example_audit_status IS NULL THEN 1 ELSE 0 END) AS example_audit_null,
  SUM(CASE WHEN example_audit_status = 'PENDING' THEN 1 ELSE 0 END) AS example_audit_pending,
  SUM(CASE WHEN example_audit_status = 'FAILED' THEN 1 ELSE 0 END) AS example_audit_failed,
  SUM(CASE WHEN example_generated_at IS NOT NULL AND (example_audited_at IS NULL OR example_audited_at < example_generated_at) THEN 1 ELSE 0 END) AS example_due_or_never_audited,
  SUM(CASE WHEN example_image_audit_status IS NULL THEN 1 ELSE 0 END) AS image_audit_null,
  SUM(CASE WHEN example_image_audit_status = 'PENDING' THEN 1 ELSE 0 END) AS image_audit_pending,
  SUM(CASE WHEN example_image_audit_status = 'FAILED' THEN 1 ELSE 0 END) AS image_audit_failed,
  SUM(CASE WHEN example_image_generated_at IS NOT NULL AND (example_image_audited_at IS NULL OR example_image_audited_at < example_image_generated_at) THEN 1 ELSE 0 END) AS image_due_or_never_audited
FROM words;

-- Learning usage
SELECT COUNT(DISTINCT user_id) AS active_users_7d, COUNT(*) AS events_7d
FROM learning_interaction_events
WHERE created_at >= (strftime('%s', 'now') - 7 * 24 * 60 * 60) * 1000;

SELECT COUNT(DISTINCT user_id) AS active_users_30d, COUNT(*) AS events_30d
FROM learning_interaction_events
WHERE created_at >= (strftime('%s', 'now') - 30 * 24 * 60 * 60) * 1000;

SELECT interaction_source, COALESCE(question_mode, '(none)') AS question_mode, COUNT(*) AS events
FROM learning_interaction_events
GROUP BY interaction_source, question_mode
ORDER BY events DESC;

SELECT
  COUNT(*) AS histories,
  COUNT(DISTINCT user_id) AS learners,
  COUNT(DISTINCT book_id) AS books_touched,
  AVG(correct_count * 1.0 / NULLIF(attempt_count, 0)) AS avg_accuracy
FROM learning_histories;

SELECT status, COUNT(*) AS rows
FROM learning_histories
GROUP BY status
ORDER BY rows DESC;

SELECT
  date(datetime(created_at / 1000, 'unixepoch', 'localtime')) AS day,
  COUNT(DISTINCT user_id) AS active_users,
  COUNT(*) AS events
FROM learning_interaction_events
WHERE created_at >= (strftime('%s', 'now') - 30 * 24 * 60 * 60) * 1000
GROUP BY day
ORDER BY day;

SELECT
  b.title,
  b.catalog_source,
  COUNT(DISTINCT lh.user_id) AS learners,
  COUNT(*) AS history_rows
FROM learning_histories lh
JOIN books b ON b.id = lh.book_id
GROUP BY b.id, b.title, b.catalog_source
ORDER BY learners DESC, history_rows DESC
LIMIT 10;

-- AI usage
SELECT
  month_key,
  action,
  COUNT(*) AS requests,
  SUM(estimated_cost_milli_yen) AS milli_yen,
  SUM(CASE WHEN used_ai = 1 THEN 1 ELSE 0 END) AS used_ai_requests
FROM ai_usage_events
GROUP BY month_key, action
ORDER BY month_key DESC, milli_yen DESC;

SELECT
  u.subscription_plan,
  a.action,
  COUNT(*) AS requests,
  SUM(a.estimated_cost_milli_yen) AS milli_yen
FROM ai_usage_events a
JOIN users u ON u.id = a.user_id
GROUP BY u.subscription_plan, a.action
ORDER BY milli_yen DESC;

-- Business workflow adoption
SELECT kind, status, COALESCE(teaching_format, '(none)') AS teaching_format, source, COUNT(*) AS requests
FROM commercial_requests
GROUP BY kind, status, teaching_format, source
ORDER BY requests DESC, kind;

SELECT COUNT(*) AS assignments, COUNT(DISTINCT student_user_id) AS students_with_assignments
FROM writing_assignments;

SELECT status, COUNT(*) AS assignments
FROM writing_assignments
GROUP BY status
ORDER BY assignments DESC;

SELECT COUNT(*) AS submissions
FROM writing_submissions;

SELECT processing_state, COUNT(*) AS submissions
FROM writing_submissions
GROUP BY processing_state
ORDER BY submissions DESC;

SELECT COUNT(*) AS ai_evaluations, SUM(cost_milli_yen) AS eval_cost_milli_yen
FROM writing_ai_evaluations;

SELECT COUNT(*) AS teacher_reviews
FROM writing_teacher_reviews;

SELECT status, COUNT(*) AS assignments
FROM weekly_mission_assignments
GROUP BY status
ORDER BY assignments DESC;

SELECT COUNT(*) AS missions
FROM weekly_missions;

SELECT COUNT(*) AS plans
FROM learning_plans;

SELECT dimension, level, COUNT(*) AS signals
FROM student_weakness_signals
GROUP BY dimension, level
ORDER BY signals DESC;

SELECT COUNT(*) AS assignment_rows, COUNT(DISTINCT student_user_id) AS assigned_students, COUNT(DISTINCT instructor_user_id) AS active_instructors
FROM student_instructor_assignments;

SELECT COUNT(*) AS notifications, COUNT(DISTINCT student_user_id) AS notified_students
FROM instructor_notifications;

SELECT COUNT(*) AS kpi_snapshots
FROM organization_kpi_daily_snapshots;

-- Data integrity
SELECT
  COUNT(*) AS org_users,
  SUM(CASE WHEN organization_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM organization_memberships m
    WHERE m.user_id = users.id
      AND m.organization_id = users.organization_id
      AND m.status = 'ACTIVE'
  ) THEN 1 ELSE 0 END) AS org_users_without_active_membership,
  SUM(CASE WHEN organization_id IS NULL AND role IN ('INSTRUCTOR', 'STUDENT') AND subscription_plan IN ('TOB_FREE', 'TOB_PAID') THEN 1 ELSE 0 END) AS business_plan_users_without_org
FROM users;

SELECT
  SUM(CASE WHEN m.status = 'ACTIVE' AND (u.organization_id IS NULL OR u.organization_id != m.organization_id) THEN 1 ELSE 0 END) AS active_membership_user_org_mismatch,
  SUM(CASE WHEN m.status = 'ACTIVE' AND COALESCE(u.organization_role, '') != COALESCE(m.role, '') THEN 1 ELSE 0 END) AS active_membership_role_mismatch
FROM organization_memberships m
JOIN users u ON u.id = m.user_id;

SELECT
  COUNT(*) AS books_checked,
  SUM(CASE WHEN COALESCE(word_totals.actual_words, 0) != books.word_count THEN 1 ELSE 0 END) AS mismatched_word_counts,
  SUM(CASE WHEN COALESCE(word_totals.actual_words, 0) = books.word_count THEN 1 ELSE 0 END) AS matched_word_counts
FROM books
LEFT JOIN (
  SELECT book_id, COUNT(*) AS actual_words
  FROM words
  GROUP BY book_id
) AS word_totals ON word_totals.book_id = books.id;

SELECT
  COUNT(*) AS plans,
  SUM(CASE WHEN json_array_length(selected_book_ids) = 0 THEN 1 ELSE 0 END) AS empty_plan_book_arrays
FROM learning_plans;

SELECT COUNT(*) AS plans_with_missing_book_refs
FROM (
  SELECT lp.user_id
  FROM learning_plans lp
  JOIN json_each(lp.selected_book_ids) je
  LEFT JOIN books b ON b.id = je.value
  GROUP BY lp.user_id
  HAVING SUM(CASE WHEN b.id IS NULL THEN 1 ELSE 0 END) > 0
);

-- Recency markers
SELECT 'users' AS table_name, MAX(updated_at) AS latest_ts FROM users;
SELECT 'learning_interaction_events' AS table_name, MAX(created_at) AS latest_ts FROM learning_interaction_events;
SELECT 'ai_usage_events' AS table_name, MAX(created_at) AS latest_ts FROM ai_usage_events;
SELECT 'learning_plans' AS table_name, MAX(updated_at) AS latest_ts FROM learning_plans;
SELECT 'commercial_requests' AS table_name, MAX(updated_at) AS latest_ts FROM commercial_requests;
SELECT 'weekly_missions' AS table_name, MAX(updated_at) AS latest_ts FROM weekly_missions;
SELECT 'writing_assignments' AS table_name, MAX(updated_at) AS latest_ts FROM writing_assignments;
