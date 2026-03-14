import {
  CommercialRequest,
  CommercialRequestKind,
  CommercialRequestStatus,
  type CommercialWorkspaceRole,
  type OrganizationRole,
  type SubscriptionPlan,
  type UserProfile,
  UserRole,
} from '../types';

export interface CommercialRequestInput {
  kind: CommercialRequestKind;
  contactName: string;
  contactEmail: string;
  organizationName?: string;
  requestedWorkspaceRole?: CommercialWorkspaceRole;
  seatEstimate?: string;
  message: string;
  source: string;
}

export interface CommercialProvisioningDraft {
  status: CommercialRequestStatus;
  resolutionNote?: string;
  linkedUserUid?: string;
  targetSubscriptionPlan?: SubscriptionPlan;
  targetOrganizationName?: string;
  targetOrganizationRole?: OrganizationRole;
}

export const normalizeCommercialEmail = (value: string): string => value.trim().toLowerCase();

export const isOpenCommercialRequestStatus = (status: CommercialRequestStatus): boolean => (
  status === CommercialRequestStatus.OPEN
  || status === CommercialRequestStatus.CONTACTED
  || status === CommercialRequestStatus.APPROVED
);

export const hasDuplicateOpenRequest = (
  requests: CommercialRequest[],
  email: string,
  kind: CommercialRequestKind,
  requestedByUid?: string,
): boolean => {
  const normalizedEmail = normalizeCommercialEmail(email);
  return requests.some((request) => {
    if (request.kind !== kind || !isOpenCommercialRequestStatus(request.status)) return false;
    if (requestedByUid && request.requestedByUid) return request.requestedByUid === requestedByUid;
    return normalizeCommercialEmail(request.contactEmail) === normalizedEmail;
  });
};

export const getRecommendedCommercialRequestKind = (user: UserProfile): CommercialRequestKind => {
  if (user.role === UserRole.STUDENT && !user.organizationName) {
    return CommercialRequestKind.PERSONAL_UPGRADE;
  }

  if (user.role === UserRole.INSTRUCTOR || user.organizationRole) {
    return CommercialRequestKind.BUSINESS_ROLE_CONVERSION;
  }

  return CommercialRequestKind.BUSINESS_TRIAL;
};
