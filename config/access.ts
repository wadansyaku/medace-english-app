import { OrganizationRole, ORGANIZATION_ROLE_LABELS, UserProfile, UserRole } from '../types';
import { isBusinessPlan } from './subscription';

export const getHomeViewForUser = (user: UserProfile | null): string => {
  if (!user) return 'login';
  if (user.role === UserRole.ADMIN) return 'admin';
  if (user.role === UserRole.INSTRUCTOR) return 'instructor';
  return 'dashboard';
};

export const isServiceAdmin = (user: UserProfile | null | undefined): boolean => {
  return user?.role === UserRole.ADMIN;
};

export const isGroupAdmin = (user: UserProfile | null | undefined): boolean => {
  return user?.role === UserRole.INSTRUCTOR && user?.organizationRole === OrganizationRole.GROUP_ADMIN;
};

export const isGroupInstructor = (user: UserProfile | null | undefined): boolean => {
  return user?.role === UserRole.INSTRUCTOR && user?.organizationRole !== OrganizationRole.GROUP_ADMIN;
};

export const isBusinessStudent = (user: UserProfile | null | undefined): boolean => {
  return Boolean(
    user?.role === UserRole.STUDENT &&
      isBusinessPlan(user?.subscriptionPlan) &&
      user?.organizationName
  );
};

export const getWorkspaceRoleLabel = (user: UserProfile | null | undefined): string => {
  if (!user) return 'ゲスト';
  if (isServiceAdmin(user)) return 'サービス管理者';
  if (user.organizationRole) return ORGANIZATION_ROLE_LABELS[user.organizationRole];
  if (isBusinessStudent(user)) return ORGANIZATION_ROLE_LABELS[OrganizationRole.STUDENT];
  if (user.role === UserRole.INSTRUCTOR) return '講師';
  return '個人学習';
};

export const getWorkspaceNavLabel = (user: UserProfile | null | undefined): string => {
  if (!user) return 'ホーム';
  if (isServiceAdmin(user)) return 'サービス運営';
  if (isGroupAdmin(user)) return '組織管理';
  if (user.role === UserRole.INSTRUCTOR) return '生徒管理';
  return 'ホーム';
};
