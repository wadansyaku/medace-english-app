import type {
  ProductAnnouncementUpsertPayload,
} from '../../contracts/storage';
import {
  AnnouncementAudienceRole,
  AnnouncementSeverity,
  type AnnouncementReceipt,
  type ProductAnnouncement,
  type ProductAnnouncementFeed,
  type ProductAnnouncementWithReceipt,
  SubscriptionPlan,
} from '../../types';
import { buildAnnouncementFeed, isAnnouncementVisibleToUser } from '../../shared/announcements';
import { HttpError } from './http';
import { getUserOrganizationRole, getUserSubscriptionPlan, readAll, readFirst } from './storage-support';
import type { AppEnv, DbUserRow } from './types';

interface DbProductAnnouncementRow {
  id: string;
  title: string;
  body: string;
  severity: string;
  subscription_plans_json: string;
  audience_roles_json: string;
  starts_at: number | null;
  ends_at: number | null;
  published_at: number;
  created_at: number;
  updated_at: number;
}

interface DbAnnouncementReceiptRow {
  announcement_id: string;
  user_id: string;
  seen_at: number | null;
  acknowledged_at: number | null;
  updated_at: number;
}

const createAnnouncementId = (): string => `announce-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const parseJsonArray = <T extends string>(value: string | null | undefined): T[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is T => typeof item === 'string') : [];
  } catch {
    return [];
  }
};

const mapAnnouncementRow = (row: DbProductAnnouncementRow): ProductAnnouncement => ({
  id: row.id,
  title: row.title,
  body: row.body,
  severity: row.severity as AnnouncementSeverity,
  subscriptionPlans: parseJsonArray<SubscriptionPlan>(row.subscription_plans_json),
  audienceRoles: parseJsonArray<AnnouncementAudienceRole>(row.audience_roles_json),
  startsAt: Number(row.starts_at || 0) || undefined,
  endsAt: Number(row.ends_at || 0) || undefined,
  publishedAt: Number(row.published_at || 0),
  createdAt: Number(row.created_at || 0),
  updatedAt: Number(row.updated_at || 0),
});

const mapReceiptRow = (row: DbAnnouncementReceiptRow): AnnouncementReceipt => ({
  announcementId: row.announcement_id,
  userUid: row.user_id,
  seenAt: Number(row.seen_at || 0) || undefined,
  acknowledgedAt: Number(row.acknowledged_at || 0) || undefined,
  updatedAt: Number(row.updated_at || 0),
});

const getAudienceRoleForUser = (user: DbUserRow): AnnouncementAudienceRole => {
  if (user.role === 'ADMIN') return AnnouncementAudienceRole.ADMIN;
  if (user.role === 'INSTRUCTOR') {
    return getUserOrganizationRole(user) === 'GROUP_ADMIN'
      ? AnnouncementAudienceRole.GROUP_ADMIN
      : AnnouncementAudienceRole.INSTRUCTOR;
  }
  return AnnouncementAudienceRole.STUDENT;
};

const assertAnnouncementPayload = (payload: ProductAnnouncementUpsertPayload): ProductAnnouncementUpsertPayload => {
  const title = String(payload.title || '').trim();
  const body = String(payload.body || '').trim();
  if (!title) throw new HttpError(400, 'お知らせタイトルを入力してください。');
  if (!body) throw new HttpError(400, 'お知らせ本文を入力してください。');
  if (!Object.values(AnnouncementSeverity).includes(payload.severity)) {
    throw new HttpError(400, 'お知らせ種別が不正です。');
  }
  if (payload.subscriptionPlans.some((plan) => !Object.values<SubscriptionPlan>(SubscriptionPlan).includes(plan))) {
    throw new HttpError(400, '対象プランの指定が不正です。');
  }
  if (payload.audienceRoles.some((role) => !Object.values(AnnouncementAudienceRole).includes(role))) {
    throw new HttpError(400, '対象ユーザー種別の指定が不正です。');
  }
  return {
    ...payload,
    title,
    body,
  };
};

export const handleListProductAnnouncements = async (
  env: AppEnv,
  user: DbUserRow,
): Promise<ProductAnnouncementFeed> => {
  const [announcementRows, receiptRows] = await Promise.all([
    readAll<DbProductAnnouncementRow>(
      env,
      `SELECT *
         FROM product_announcements
        ORDER BY published_at DESC, updated_at DESC`,
    ),
    readAll<DbAnnouncementReceiptRow>(
      env,
      `SELECT *
         FROM product_announcement_receipts
        WHERE user_id = ?`,
      user.id,
    ),
  ]);

  const receiptMap = new Map(receiptRows.map((row) => [row.announcement_id, mapReceiptRow(row)]));
  const plan = getUserSubscriptionPlan(user);
  const audienceRole = getAudienceRoleForUser(user);
  const visibleAnnouncements = announcementRows
    .map((row) => ({
      ...mapAnnouncementRow(row),
      receipt: receiptMap.get(row.id),
    }))
    .filter((announcement) => isAnnouncementVisibleToUser(announcement, plan, audienceRole));

  return buildAnnouncementFeed(visibleAnnouncements);
};

export const handleMarkAnnouncementSeen = async (
  env: AppEnv,
  user: DbUserRow,
  announcementId: string,
): Promise<void> => {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO product_announcement_receipts (
      announcement_id, user_id, seen_at, acknowledged_at, updated_at
    )
    VALUES (?, ?, ?, NULL, ?)
    ON CONFLICT(announcement_id, user_id) DO UPDATE SET
      seen_at = COALESCE(product_announcement_receipts.seen_at, excluded.seen_at),
      updated_at = excluded.updated_at
  `).bind(
    announcementId,
    user.id,
    now,
    now,
  ).run();
};

export const handleAcknowledgeAnnouncement = async (
  env: AppEnv,
  user: DbUserRow,
  announcementId: string,
): Promise<void> => {
  const now = Date.now();
  await env.DB.prepare(`
    INSERT INTO product_announcement_receipts (
      announcement_id, user_id, seen_at, acknowledged_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(announcement_id, user_id) DO UPDATE SET
      seen_at = COALESCE(product_announcement_receipts.seen_at, excluded.seen_at),
      acknowledged_at = excluded.acknowledged_at,
      updated_at = excluded.updated_at
  `).bind(
    announcementId,
    user.id,
    now,
    now,
    now,
  ).run();
};

export const handleListProductAnnouncementsAdmin = async (
  env: AppEnv,
): Promise<ProductAnnouncement[]> => {
  const rows = await readAll<DbProductAnnouncementRow>(
    env,
    `SELECT *
       FROM product_announcements
      ORDER BY updated_at DESC, published_at DESC`,
  );
  return rows.map(mapAnnouncementRow);
};

export const handleUpsertProductAnnouncement = async (
  env: AppEnv,
  user: DbUserRow,
  payload: ProductAnnouncementUpsertPayload,
): Promise<ProductAnnouncement> => {
  const input = assertAnnouncementPayload(payload);
  const now = Date.now();
  const id = input.id || createAnnouncementId();

  await env.DB.prepare(`
    INSERT INTO product_announcements (
      id, title, body, severity, subscription_plans_json, audience_roles_json,
      starts_at, ends_at, published_at,
      created_by_user_id, updated_by_user_id, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      body = excluded.body,
      severity = excluded.severity,
      subscription_plans_json = excluded.subscription_plans_json,
      audience_roles_json = excluded.audience_roles_json,
      starts_at = excluded.starts_at,
      ends_at = excluded.ends_at,
      published_at = excluded.published_at,
      updated_by_user_id = excluded.updated_by_user_id,
      updated_at = excluded.updated_at
  `).bind(
    id,
    input.title,
    input.body,
    input.severity,
    JSON.stringify(input.subscriptionPlans),
    JSON.stringify(input.audienceRoles),
    input.startsAt || null,
    input.endsAt || null,
    now,
    user.id,
    user.id,
    now,
    now,
  ).run();

  const row = await readFirst<DbProductAnnouncementRow>(
    env,
    `SELECT * FROM product_announcements WHERE id = ?`,
    id,
  );
  if (!row) {
    throw new HttpError(500, 'お知らせの保存に失敗しました。');
  }
  return mapAnnouncementRow(row);
};
