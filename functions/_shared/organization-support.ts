import { InterventionKind, RecommendedActionType } from '../../types';
import type { AppEnv } from './types';
import { readFirst } from './storage-support';

export interface ActiveOrganizationMemberRow {
  id: string;
  display_name: string;
  role: string;
  organization_role: string | null;
  organization_id: string | null;
  organization_name: string | null;
}

export const isInterventionKind = (value: string): value is InterventionKind => (
  Object.values(InterventionKind).includes(value as InterventionKind)
);

export const isRecommendedActionType = (value: string): value is RecommendedActionType => (
  Object.values(RecommendedActionType).includes(value as RecommendedActionType)
);

export const readActiveOrganizationMember = async (
  env: AppEnv,
  userId: string,
): Promise<ActiveOrganizationMemberRow | null> => readFirst(
  env,
  `SELECT
     u.id AS id,
     u.display_name AS display_name,
     u.role AS role,
     m.role AS organization_role,
     m.organization_id AS organization_id,
     o.display_name AS organization_name
   FROM users u
   LEFT JOIN organization_memberships m
     ON m.user_id = u.id
    AND m.status = 'ACTIVE'
   LEFT JOIN organizations o ON o.id = m.organization_id
   WHERE u.id = ?`,
  userId,
);
