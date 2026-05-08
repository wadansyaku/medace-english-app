import { describe, expect, it } from 'vitest';

import {
  getWritingOpsCounts,
  getWritingOpsTriage,
} from '../utils/writingOps';
import {
  WritingAssignmentStatus,
  WritingExamCategory,
  type WritingAssignment,
  type WritingQueueItem,
} from '../types';

const makeAssignment = (
  status: WritingAssignmentStatus,
  id: string = status,
): WritingAssignment => ({
  id,
  organizationId: 'org-1',
  organizationName: 'MedAce School',
  instructorUid: 'instructor-1',
  instructorName: 'Instructor',
  studentUid: `student-${id}`,
  studentName: `Student ${id}`,
  examCategory: WritingExamCategory.EIKEN,
  templateId: 'template-1',
  templateType: 'opinion',
  promptTitle: 'School devices',
  promptText: 'Do you think students should use tablets?',
  guidance: 'Write clearly.',
  wordCountMin: 80,
  wordCountMax: 120,
  submissionCode: `CODE${id}`,
  status,
  attemptCount: 0,
  maxAttempts: 2,
  createdAt: 1,
  updatedAt: 2,
});

const makeQueueItem = (
  status: WritingAssignmentStatus = WritingAssignmentStatus.REVIEW_READY,
): WritingQueueItem => ({
  assignmentId: 'assignment-1',
  submissionId: 'submission-1',
  studentUid: 'student-1',
  studentName: 'Student',
  examCategory: WritingExamCategory.EIKEN,
  promptTitle: 'School devices',
  status,
  attemptNo: 1,
  submittedAt: 3,
  transcriptConfidence: 0.9,
  recommendedProvider: 'GEMINI',
  instructorName: 'Instructor',
});

describe('writing ops triage', () => {
  it('counts workflow states from assignments and the review queue', () => {
    const counts = getWritingOpsCounts([
      makeAssignment(WritingAssignmentStatus.DRAFT, 'draft'),
      makeAssignment(WritingAssignmentStatus.ISSUED, 'issued'),
      makeAssignment(WritingAssignmentStatus.REVISION_REQUESTED, 'revision'),
      makeAssignment(WritingAssignmentStatus.RETURNED, 'returned'),
      makeAssignment(WritingAssignmentStatus.COMPLETED, 'completed'),
    ], [
      makeQueueItem(),
      makeQueueItem(),
    ]);

    expect(counts).toMatchObject({
      draftCount: 1,
      issuedCount: 1,
      reviewReadyCount: 2,
      revisionRequestedCount: 1,
      returnedCount: 1,
      completedCount: 1,
    });
  });

  it('prioritizes review, then issue, then submission waiting, then history', () => {
    expect(getWritingOpsTriage({
      draftCount: 1,
      issuedCount: 1,
      submittedCount: 0,
      reviewReadyCount: 1,
      revisionRequestedCount: 0,
      returnedCount: 0,
      completedCount: 0,
    }).tab).toBe('QUEUE');

    expect(getWritingOpsTriage({
      draftCount: 1,
      issuedCount: 0,
      submittedCount: 0,
      reviewReadyCount: 0,
      revisionRequestedCount: 0,
      returnedCount: 0,
      completedCount: 0,
    }).tab).toBe('PRINT');

    expect(getWritingOpsTriage({
      draftCount: 0,
      issuedCount: 1,
      submittedCount: 0,
      reviewReadyCount: 0,
      revisionRequestedCount: 1,
      returnedCount: 0,
      completedCount: 0,
    }).tab).toBe('PRINT');

    expect(getWritingOpsTriage({
      draftCount: 0,
      issuedCount: 0,
      submittedCount: 0,
      reviewReadyCount: 0,
      revisionRequestedCount: 0,
      returnedCount: 1,
      completedCount: 0,
    }).tab).toBe('HISTORY');
  });
});
