import { OrganizationRole, UserRole, type UserProfile } from '../types';
import type { PublicBusinessRoleKey } from './publicBusinessRoles';

export type StaffLoginEntry = 'instructor' | 'group-admin' | 'service-admin';
export const isStaffLoginEntry = (value: unknown): value is StaffLoginEntry => value === 'instructor' || value === 'group-admin' || value === 'service-admin';

/** Entry intent restricts an existing account; it never assigns a role. */
export const matchesStaffEntryRole = (entry: PublicBusinessRoleKey, user: UserProfile): boolean => {
  if (entry === 'service-admin') return user.role === UserRole.ADMIN;
  if (entry === 'group-admin') return user.role === UserRole.INSTRUCTOR && user.organizationRole === OrganizationRole.GROUP_ADMIN;
  if (entry === 'instructor') return user.role === UserRole.INSTRUCTOR && user.organizationRole === OrganizationRole.INSTRUCTOR;
  return user.role === UserRole.STUDENT;
};
