import {
  BusinessAdminWorkspaceView,
  type OrganizationDashboardSnapshot,
} from '../types';

export interface BusinessActivationChecklistItem {
  id: string;
  label: string;
  detail: string;
  done: boolean;
  targetView: BusinessAdminWorkspaceView;
}

export interface BusinessActivationProgress {
  items: BusinessActivationChecklistItem[];
  completedCount: number;
  totalCount: number;
  progressPercent: number;
  currentItem: BusinessActivationChecklistItem | null;
}

interface BuildBusinessActivationProgressParams {
  snapshot: OrganizationDashboardSnapshot;
}

export const buildBusinessActivationProgress = ({
  snapshot,
}: BuildBusinessActivationProgressParams): BusinessActivationProgress => {
  const items: BusinessActivationChecklistItem[] = snapshot.activationSteps.map((step) => ({
    id: step.id,
    label: step.label,
    detail: step.description,
    done: step.done,
    targetView: step.target?.targetView || BusinessAdminWorkspaceView.OVERVIEW,
  }));

  const completedCount = items.filter((item) => item.done).length;
  const totalCount = items.length;

  return {
    items,
    completedCount,
    totalCount,
    progressPercent: totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0,
    currentItem: items.find((item) => !item.done) || null,
  };
};
