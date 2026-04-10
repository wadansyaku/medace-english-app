import { apiPost } from './apiClient';

export interface BootstrapDemoOrganizationResult {
  organizationId: string;
  actorUserId: string;
  createdCohort: boolean;
  createdMission: boolean;
  assignedMission: boolean;
  cohortId: string;
  missionId: string;
  studentUid: string;
  instructorUid: string;
}

export const bootstrapDemoOrganization = async (
  organizationId?: string,
): Promise<BootstrapDemoOrganizationResult> => apiPost<BootstrapDemoOrganizationResult>(
  '/api/runtime-admin/bootstrap-demo-organization',
  organizationId ? { organizationId } : {},
);

