import {
  type ProductEvent,
  type ProductEventName,
  type SubscriptionPlan,
  type UserRole,
} from '../../types';
import type { AppEnv, DbUserRow } from './types';
import { readAll } from './storage-support';

export const PRODUCT_EVENT_FEATURE_AREAS: Record<ProductEventName, string> = {
  student_dashboard_start_task: 'student_dashboard',
  study_session_started: 'study',
  study_session_finished: 'study',
  quiz_session_started: 'quiz',
  spelling_check_started: 'quiz',
  word_hint_example_cache_hit: 'word_hint',
  word_hint_example_generated: 'word_hint',
  word_hint_example_failed: 'word_hint',
  word_hint_image_cache_hit: 'word_hint',
  word_hint_image_generated: 'word_hint',
  word_hint_image_failed: 'word_hint',
  commercial_form_opened: 'commercial',
  commercial_request_submitted: 'commercial',
  group_admin_created_cohort: 'organization_activation',
  group_admin_assigned_student: 'organization_activation',
  group_admin_created_first_mission: 'organization_activation',
  instructor_notification_sent: 'organization_activation',
  writing_assignment_created: 'writing',
  writing_submission_received: 'writing',
  writing_review_completed: 'writing',
};

const PRODUCT_EVENT_NAMES = new Set<ProductEventName>(Object.keys(PRODUCT_EVENT_FEATURE_AREAS) as ProductEventName[]);

export interface RecordProductEventInput {
  eventName: ProductEventName;
  userId?: string | null;
  organizationId?: string | null;
  subscriptionPlan?: SubscriptionPlan | null;
  userRole?: UserRole | null;
  subjectType?: string | null;
  subjectId?: string | null;
  status?: string | null;
  usedAi?: boolean;
  estimatedCostMilliYen?: number;
  metadata?: Record<string, unknown> | null;
  createdAt?: number;
}

export const isProductEventName = (value: unknown): value is ProductEventName => (
  typeof value === 'string' && PRODUCT_EVENT_NAMES.has(value as ProductEventName)
);

const normalizeMetadata = (value: Record<string, unknown> | null | undefined): string => {
  if (!value || Object.keys(value).length === 0) return '{}';
  return JSON.stringify(value);
};

export const recordProductEvent = async (
  env: AppEnv,
  input: RecordProductEventInput,
): Promise<void> => {
  await env.DB.prepare(`
    INSERT INTO product_events (
      event_name,
      feature_area,
      user_id,
      organization_id,
      subscription_plan,
      user_role,
      subject_type,
      subject_id,
      status,
      used_ai,
      estimated_cost_milli_yen,
      metadata_json,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    input.eventName,
    PRODUCT_EVENT_FEATURE_AREAS[input.eventName],
    input.userId || null,
    input.organizationId || null,
    input.subscriptionPlan || null,
    input.userRole || null,
    input.subjectType || null,
    input.subjectId || null,
    input.status || null,
    input.usedAi ? 1 : 0,
    Math.max(0, Math.trunc(input.estimatedCostMilliYen || 0)),
    normalizeMetadata(input.metadata),
    input.createdAt || Date.now(),
  ).run();
};

export const recordProductEventForUser = async (
  env: AppEnv,
  user: DbUserRow,
  input: Omit<RecordProductEventInput, 'userId' | 'organizationId' | 'subscriptionPlan' | 'userRole'>,
): Promise<void> => recordProductEvent(env, {
  ...input,
  userId: user.id,
  organizationId: user.organization_id,
  subscriptionPlan: user.subscription_plan as SubscriptionPlan | null,
  userRole: user.role as UserRole | null,
});

interface DbProductEventRow {
  id: number;
  event_name: ProductEventName;
  feature_area: string;
  user_id: string | null;
  organization_id: string | null;
  subscription_plan: SubscriptionPlan | null;
  user_role: UserRole | null;
  subject_type: string | null;
  subject_id: string | null;
  status: string | null;
  used_ai: number;
  estimated_cost_milli_yen: number;
  metadata_json: string | null;
  created_at: number;
}

export const listProductEvents = async (
  env: AppEnv,
  limit = 100,
): Promise<ProductEvent[]> => {
  const rows = await readAll<DbProductEventRow>(
    env,
    `SELECT *
     FROM product_events
     ORDER BY created_at DESC
     LIMIT ?`,
    Math.max(1, Math.min(500, Math.trunc(limit))),
  );
  return rows.map((row) => ({
    id: Number(row.id || 0),
    eventName: row.event_name,
    featureArea: row.feature_area,
    userId: row.user_id || undefined,
    organizationId: row.organization_id || undefined,
    subscriptionPlan: row.subscription_plan || undefined,
    userRole: row.user_role || undefined,
    subjectType: row.subject_type || undefined,
    subjectId: row.subject_id || undefined,
    status: row.status || undefined,
    usedAi: Boolean(row.used_ai),
    estimatedCostMilliYen: Number(row.estimated_cost_milli_yen || 0),
    metadata: row.metadata_json ? JSON.parse(row.metadata_json) : undefined,
    createdAt: Number(row.created_at || 0),
  }));
};
