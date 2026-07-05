import type { LearningTaskIntent, ProductEventName } from '../types';
import { getTaskRouteBookId } from '../shared/learningTask';
import { apiPost } from './apiClient';

export interface RecordClientProductEventInput {
  eventName: ProductEventName;
  subjectType?: string;
  subjectId?: string;
  status?: string;
  usedAi?: boolean;
  estimatedCostMilliYen?: number;
  metadata?: Record<string, unknown>;
}

export const recordClientProductEvent = async (
  input: RecordClientProductEventInput,
): Promise<void> => {
  await apiPost('/api/public/product-events', input);
};

export const buildDashboardStartTaskEventInput = (
  task: LearningTaskIntent,
): RecordClientProductEventInput => ({
  eventName: 'student_dashboard_start_task',
  subjectType: 'learning_task',
  subjectId: task.intentType,
  status: 'STARTED',
  metadata: {
    mode: task.mode,
    bookId: getTaskRouteBookId(task),
    intentType: task.intentType,
    targetQuestionModes: task.targetQuestionModes || [],
  },
});

export const recordDashboardStartTaskEvent = (
  task: LearningTaskIntent,
  recorder: (input: RecordClientProductEventInput) => Promise<void> = recordClientProductEvent,
): void => {
  void recorder(buildDashboardStartTaskEventInput(task)).catch(() => undefined);
};
