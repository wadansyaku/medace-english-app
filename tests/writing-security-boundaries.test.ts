import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  OrganizationRole,
  SubscriptionPlan,
  UserRole,
  WritingAssignmentStatus,
  WritingExamCategory,
  WritingSubmissionSource,
  type WritingEvaluation,
} from '../types';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';

const mocks = vi.hoisted(() => ({
  commitFinalizedSubmission: vi.fn(),
  commitTeacherReviewDecision: vi.fn(),
  enqueueWritingActivitySideEffect: vi.fn(),
  readActiveOrganizationContextForUser: vi.fn(),
  readAssignmentRow: vi.fn(),
  readLatestSubmissionRowForAssignment: vi.fn(),
  readSubmissionAssetRowsByIdsForAttempt: vi.fn(),
  readSubmissionAssetRowsBySubmissionIds: vi.fn(),
  readSubmissionDetailBaseRow: vi.fn(),
  readSubmissionEvaluationRowsBySubmissionIds: vi.fn(),
  readSubmissionRowByAssignmentAttempt: vi.fn(),
  readTeacherReviewRowsBySubmissionIds: vi.fn(),
  readVisibleStudentIds: vi.fn(),
  recordProductEventForUser: vi.fn(),
  resolveWritingAiMode: vi.fn(),
  runSideEffectJobById: vi.fn(),
  runWritingEvaluations: vi.fn(),
  runWritingOcr: vi.fn(),
}));

vi.mock('../functions/_shared/writing-actions/repository', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/writing-actions/repository')>(
    '../functions/_shared/writing-actions/repository',
  );
  return {
    ...actual,
    readAssignmentRow: mocks.readAssignmentRow,
    readLatestSubmissionRowForAssignment: mocks.readLatestSubmissionRowForAssignment,
    readSubmissionAssetRowsByIdsForAttempt: mocks.readSubmissionAssetRowsByIdsForAttempt,
    readSubmissionAssetRowsBySubmissionIds: mocks.readSubmissionAssetRowsBySubmissionIds,
    readSubmissionDetailBaseRow: mocks.readSubmissionDetailBaseRow,
    readSubmissionEvaluationRowsBySubmissionIds: mocks.readSubmissionEvaluationRowsBySubmissionIds,
    readSubmissionRowByAssignmentAttempt: mocks.readSubmissionRowByAssignmentAttempt,
    readTeacherReviewRowsBySubmissionIds: mocks.readTeacherReviewRowsBySubmissionIds,
  };
});

vi.mock('../functions/_shared/writing-ai', () => ({
  generateWritingPrompt: vi.fn(),
  resolveWritingAiMode: mocks.resolveWritingAiMode,
  runWritingEvaluations: mocks.runWritingEvaluations,
  runWritingOcr: mocks.runWritingOcr,
}));

vi.mock('../functions/_shared/writing-actions/mutation-state', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/writing-actions/mutation-state')>(
    '../functions/_shared/writing-actions/mutation-state',
  );
  return {
    ...actual,
    commitFinalizedSubmission: mocks.commitFinalizedSubmission,
    commitTeacherReviewDecision: mocks.commitTeacherReviewDecision,
  };
});

vi.mock('../functions/_shared/side-effect-jobs', () => ({
  enqueueWritingActivitySideEffect: mocks.enqueueWritingActivitySideEffect,
  runSideEffectJobById: mocks.runSideEffectJobById,
}));

vi.mock('../functions/_shared/product-events', () => ({
  recordProductEventForUser: mocks.recordProductEventForUser,
}));

vi.mock('../functions/_shared/organization-memberships', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/organization-memberships')>(
    '../functions/_shared/organization-memberships',
  );
  return {
    ...actual,
    readActiveOrganizationContextForUser: mocks.readActiveOrganizationContextForUser,
  };
});

vi.mock('../functions/_shared/student-visibility', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/student-visibility')>(
    '../functions/_shared/student-visibility',
  );
  return {
    ...actual,
    readVisibleStudentIds: mocks.readVisibleStudentIds,
  };
});

import {
  handleApproveWritingReturn,
  handleCompleteWritingAssignment,
  handleFinalizeWritingSubmission,
  handleIssueWritingAssignment,
} from '../functions/_shared/writing-actions/mutations';
import {
  handleGetWritingPrintableFeedback,
  handleGetWritingSubmissionDetail,
} from '../functions/_shared/writing-actions/reads';

const ASSIGNMENT_ID = 'assignment-org-a';
const SUBMISSION_ID = 'submission-1';
const STUDENT_ID = 'student-1';
const SELECTED_EVALUATION_ID = 'evaluation-selected';
const PRIVATE_MEMO = '生徒には見せない校舎内メモ';
const STUDENT_EVALUATION_KEYS = [
  'correctedDraft',
  'improvementPoints',
  'modelAnswer',
  'overallScore',
  'rubric',
  'sentenceCorrections',
  'strengths',
].sort();
const STUDENT_RECEIPT_SUBMISSION_KEYS = [
  'assets',
  'assignmentId',
  'attemptNo',
  'evaluations',
  'id',
  'submissionSource',
  'submittedAt',
  'transcript',
].sort();
const STUDENT_RELEASED_SUBMISSION_KEYS = [
  ...STUDENT_RECEIPT_SUBMISSION_KEYS,
  'teacherReview',
].sort();
const STUDENT_ASSIGNMENT_KEYS = [
  'id',
  'promptTitle',
  'status',
].sort();

const createUser = ({
  id,
  role,
  organizationId,
  organizationRole,
}: {
  id: string;
  role: UserRole;
  organizationId: string;
  organizationRole: OrganizationRole;
}): DbUserRow => ({
  id,
  email: `${id}@example.test`,
  password_hash: null,
  display_name: id,
  role,
  grade: null,
  english_level: null,
  subscription_plan: SubscriptionPlan.TOB_PAID,
  organization_id: organizationId,
  organization_name: organizationId,
  organization_role: organizationRole,
  study_mode: null,
  stats_xp: 0,
  stats_level: 1,
  stats_current_streak: 0,
  stats_last_login_date: null,
  created_at: 1,
  updated_at: 1,
});

const student = createUser({
  id: STUDENT_ID,
  role: UserRole.STUDENT,
  organizationId: 'org-a',
  organizationRole: OrganizationRole.STUDENT,
});

const createAssignmentRow = (status: WritingAssignmentStatus = WritingAssignmentStatus.ISSUED) => ({
  id: ASSIGNMENT_ID,
  organization_id: 'org-a',
  organization_name: 'Organization A',
  instructor_user_id: 'instructor-org-a',
  student_user_id: STUDENT_ID,
  template_id: 'template-1',
  exam_category: WritingExamCategory.EIKEN,
  template_type: 'OPINION',
  prompt_title: 'School uniforms',
  prompt_text: 'Do you think school uniforms are useful?',
  guidance: 'Give two reasons.',
  word_count_min: 50,
  word_count_max: 60,
  submission_code: 'ABC123',
  prompt_snapshot: JSON.stringify({
    templateId: 'template-1',
    examCategory: WritingExamCategory.EIKEN,
    templateType: 'OPINION',
    title: 'School uniforms',
    promptText: 'Do you think school uniforms are useful?',
    guidance: 'Give two reasons.',
    wordCountMin: 50,
    wordCountMax: 60,
    submissionCode: 'ABC123',
    markerValue: 'marker',
  }),
  status,
  attempt_count: status === WritingAssignmentStatus.ISSUED ? 0 : 1,
  max_attempts: 2,
  created_at: 100,
  issued_at: 110,
  last_submitted_at: status === WritingAssignmentStatus.ISSUED ? null : 120,
  last_returned_at: status === WritingAssignmentStatus.RETURNED ? 140 : null,
  updated_at: 140,
  instructor_name: 'Instructor A',
  student_name: 'Student One',
});

const createSubmissionBaseRow = (status: WritingAssignmentStatus) => ({
  ...createAssignmentRow(status),
  submission_id: SUBMISSION_ID,
  submission_attempt_no: 1,
  submission_source: WritingSubmissionSource.STUDENT_MOBILE,
  submitted_by_user_id: STUDENT_ID,
  transcript: 'I think school uniforms are useful.',
  transcript_confidence: 0.96,
  ocr_provider: 'CLOUDFLARE',
  ocr_meta: JSON.stringify({
    provenance: {
      mode: 'fixture',
      provider: 'CLOUDFLARE',
    },
  }),
  selected_evaluation_id: SELECTED_EVALUATION_ID,
  processing_state: 'EVALUATED',
  submitted_at: 120,
});

const evaluations: WritingEvaluation[] = [
  {
    id: 'evaluation-hidden',
    provider: 'GEMINI',
    overallScore: 12,
    rubric: [],
    strengths: ['hidden strength'],
    improvementPoints: ['hidden improvement'],
    sentenceCorrections: [],
    correctedDraft: 'Unselected corrected draft',
    modelAnswer: 'Unselected model answer',
    confidence: 0.8,
    transcriptAlignment: 0.8,
    rubricConsistency: 0.8,
    structureScore: 0.8,
    selectionScore: 0.8,
    costMilliYen: 2,
    latencyMs: 20,
    isDefault: true,
  },
  {
    id: SELECTED_EVALUATION_ID,
    provider: 'CLOUDFLARE',
    overallScore: 14,
    rubric: [],
    strengths: ['selected strength'],
    improvementPoints: ['selected improvement'],
    sentenceCorrections: [],
    correctedDraft: 'Selected corrected draft',
    modelAnswer: 'Selected model answer',
    confidence: 0.9,
    transcriptAlignment: 0.9,
    rubricConsistency: 0.9,
    structureScore: 0.9,
    selectionScore: 0.9,
    costMilliYen: 3,
    latencyMs: 30,
    isDefault: false,
  },
];

const evaluationRows = evaluations.map((evaluation) => ({
  id: evaluation.id,
  submission_id: SUBMISSION_ID,
  provider: evaluation.provider,
  overall_score: evaluation.overallScore,
  rubric_json: JSON.stringify(evaluation.rubric),
  strengths_json: JSON.stringify(evaluation.strengths),
  improvement_points_json: JSON.stringify(evaluation.improvementPoints),
  sentence_corrections_json: JSON.stringify(evaluation.sentenceCorrections),
  corrected_draft: evaluation.correctedDraft,
  model_answer: evaluation.modelAnswer,
  confidence: evaluation.confidence,
  transcript_alignment: evaluation.transcriptAlignment,
  rubric_consistency: evaluation.rubricConsistency,
  structure_score: evaluation.structureScore,
  selection_score: evaluation.selectionScore,
  cost_milli_yen: evaluation.costMilliYen,
  latency_ms: evaluation.latencyMs,
  raw_payload: null,
  is_default: evaluation.isDefault ? 1 : 0,
}));

const uploadedAssetRow = {
  id: 'asset-1',
  assignment_id: ASSIGNMENT_ID,
  submission_id: null,
  attempt_no: 1,
  asset_order: 0,
  file_name: 'answer.jpg',
  mime_type: 'image/jpeg',
  byte_size: 4,
  expected_byte_size: 4,
  expected_sha256_base64: null,
  r2_key: 'writing-submissions/org-a/answer.jpg',
  upload_token: null,
  upload_expires_at: null,
  upload_consumed_at: 115,
  uploaded_at: 115,
  uploaded_etag: 'etag',
  uploaded_sha256_base64: null,
};

const createReviewRow = () => ({
  id: 'review-1',
  submission_id: SUBMISSION_ID,
  reviewer_user_id: 'instructor-org-a',
  reviewer_name: 'Instructor A',
  selected_evaluation_id: SELECTED_EVALUATION_ID,
  public_comment: 'Two reasons are clear.',
  private_memo: PRIVATE_MEMO,
  review_decision: 'APPROVED_RETURN',
  created_at: 135,
  updated_at: 140,
  released_at: 140,
});

const createEnv = (changes = 1): AppEnv => {
  const run = vi.fn().mockResolvedValue({ success: true, meta: { changes } });
  const statement = {
    bind: vi.fn(),
    first: vi.fn(),
    all: vi.fn(),
    run,
  };
  statement.bind.mockReturnValue(statement);
  return {
    DB: {
      prepare: vi.fn().mockReturnValue(statement),
      batch: vi.fn(),
    },
  } as unknown as AppEnv;
};

const setSubmissionDetail = ({
  status,
  released,
}: {
  status: WritingAssignmentStatus;
  released: boolean;
}) => {
  mocks.readSubmissionDetailBaseRow.mockResolvedValue(createSubmissionBaseRow(status));
  mocks.readSubmissionAssetRowsBySubmissionIds.mockResolvedValue(new Map([
    [SUBMISSION_ID, [{ ...uploadedAssetRow, submission_id: SUBMISSION_ID }]],
  ]));
  mocks.readSubmissionEvaluationRowsBySubmissionIds.mockResolvedValue(new Map([
    [SUBMISSION_ID, evaluationRows],
  ]));
  mocks.readTeacherReviewRowsBySubmissionIds.mockResolvedValue(
    released ? new Map([[SUBMISSION_ID, createReviewRow()]]) : new Map(),
  );
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readAssignmentRow.mockResolvedValue(createAssignmentRow());
  mocks.readLatestSubmissionRowForAssignment.mockResolvedValue({
    id: SUBMISSION_ID,
    assignment_id: ASSIGNMENT_ID,
    attempt_no: 1,
    submission_source: WritingSubmissionSource.STUDENT_MOBILE,
    submitted_by_user_id: STUDENT_ID,
    transcript: 'I think school uniforms are useful.',
    transcript_confidence: 0.96,
    ocr_provider: 'CLOUDFLARE',
    ocr_meta: null,
    selected_evaluation_id: SELECTED_EVALUATION_ID,
    processing_state: 'EVALUATED',
    submitted_at: 120,
  });
  mocks.readSubmissionRowByAssignmentAttempt.mockResolvedValue(null);
  mocks.readSubmissionAssetRowsByIdsForAttempt.mockResolvedValue([uploadedAssetRow]);
  mocks.readVisibleStudentIds.mockResolvedValue(new Set([STUDENT_ID]));
  mocks.readActiveOrganizationContextForUser.mockImplementation(async (_env, userId: string) => ({
    organizationId: userId === STUDENT_ID ? 'org-a' : 'org-b',
    organizationName: userId === STUDENT_ID ? 'Organization A' : 'Organization B',
    subscriptionPlan: SubscriptionPlan.TOB_PAID,
    organizationRole: userId === STUDENT_ID ? OrganizationRole.STUDENT : OrganizationRole.INSTRUCTOR,
  }));
  mocks.resolveWritingAiMode.mockReturnValue('fixture');
  mocks.runWritingOcr.mockResolvedValue({
    transcript: 'I think school uniforms are useful.',
    confidence: 0.96,
    provider: 'CLOUDFLARE',
    provenance: {
      mode: 'fixture',
      provider: 'CLOUDFLARE',
    },
  });
  mocks.runWritingEvaluations.mockResolvedValue(evaluations);
  mocks.commitFinalizedSubmission.mockResolvedValue(undefined);
  mocks.commitTeacherReviewDecision.mockResolvedValue(undefined);
  mocks.recordProductEventForUser.mockResolvedValue(undefined);
  mocks.enqueueWritingActivitySideEffect.mockResolvedValue({ id: 'job-1' });
  mocks.runSideEffectJobById.mockResolvedValue({
    jobId: 'job-1',
    status: 'FAILED',
    attemptCount: 3,
    lastError: 'internal D1 details must not be exposed to the student',
  });
  setSubmissionDetail({
    status: WritingAssignmentStatus.REVIEW_READY,
    released: false,
  });
});

describe('writing student response security boundaries', () => {
  it('returns a receipt without AI evaluations or teacher-only fields after student finalize', async () => {
    const response = await handleFinalizeWritingSubmission(
      createEnv(),
      student,
      {
        assignmentId: ASSIGNMENT_ID,
        source: WritingSubmissionSource.STUDENT_MOBILE,
        assetIds: [uploadedAssetRow.id],
        attemptNo: 1,
      },
    );

    expect(response.submission.evaluations).toEqual([]);
    expect(Object.keys(response.submission).sort()).toEqual(STUDENT_RECEIPT_SUBMISSION_KEYS);
    expect(Object.keys(response.assignment).sort()).toEqual(STUDENT_ASSIGNMENT_KEYS);
    expect(response.sideEffectJob).toEqual({ status: 'FAILED' });
  });

  it('rejects student detail and printable feedback GETs before teacher return', async () => {
    await expect(handleGetWritingSubmissionDetail(createEnv(), student, SUBMISSION_ID)).rejects.toMatchObject({
      status: 403,
    });
    await expect(handleGetWritingPrintableFeedback(createEnv(), student, SUBMISSION_ID)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('returns only the teacher-selected evaluation and never exposes privateMemo after release', async () => {
    setSubmissionDetail({
      status: WritingAssignmentStatus.RETURNED,
      released: true,
    });

    const response = await handleGetWritingSubmissionDetail(createEnv(), student, SUBMISSION_ID);
    const teacherReview = 'teacherReview' in response.submission
      ? response.submission.teacherReview
      : undefined;

    expect(response.submission.evaluations).toHaveLength(1);
    expect(response.submission.evaluations[0]).toMatchObject({
      overallScore: 14,
      correctedDraft: 'Selected corrected draft',
      modelAnswer: 'Selected model answer',
    });
    expect(Object.keys(response.submission.evaluations[0] || {}).sort()).toEqual(STUDENT_EVALUATION_KEYS);
    expect(teacherReview).toEqual({
      publicComment: 'Two reasons are clear.',
      releasedAt: 140,
    });
    expect(Object.keys(response.submission).sort()).toEqual(STUDENT_RELEASED_SUBMISSION_KEYS);
    expect(Object.keys(response.assignment).sort()).toEqual(STUDENT_ASSIGNMENT_KEYS);
    expect(JSON.stringify(response)).not.toContain(PRIVATE_MEMO);
    expect(JSON.stringify(response)).not.toContain('Unselected corrected draft');
  });

  it('keeps full evaluation, OCR, and private review metadata for an authorized instructor', async () => {
    setSubmissionDetail({
      status: WritingAssignmentStatus.RETURNED,
      released: true,
    });
    mocks.readActiveOrganizationContextForUser.mockResolvedValue({
      organizationId: 'org-a',
      organizationName: 'Organization A',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationRole: OrganizationRole.INSTRUCTOR,
    });
    const instructor = createUser({
      id: 'instructor-org-a',
      role: UserRole.INSTRUCTOR,
      organizationId: 'org-a',
      organizationRole: OrganizationRole.INSTRUCTOR,
    });

    const response = await handleGetWritingSubmissionDetail(createEnv(), instructor, SUBMISSION_ID);
    const selectedEvaluation = (response.submission.evaluations as WritingEvaluation[]).find((evaluation) => (
      evaluation.id === SELECTED_EVALUATION_ID
    ));
    const teacherReview = 'teacherReview' in response.submission
      ? response.submission.teacherReview
      : undefined;

    expect(selectedEvaluation).toMatchObject({
      provider: 'CLOUDFLARE',
      confidence: 0.9,
      transcriptAlignment: 0.9,
      rubricConsistency: 0.9,
      structureScore: 0.9,
      selectionScore: 0.9,
      costMilliYen: 3,
      latencyMs: 30,
      isDefault: false,
    });
    expect(response.submission).toMatchObject({
      ocrProvider: 'CLOUDFLARE',
      ocrMeta: {
        mode: 'fixture',
        provider: 'CLOUDFLARE',
      },
    });
    expect(teacherReview).toHaveProperty('privateMemo', PRIVATE_MEMO);
  });
});

describe('writing assignment tenant boundary after a student transfer', () => {
  it("keeps the student's own released history visible after moving to another organization", async () => {
    setSubmissionDetail({
      status: WritingAssignmentStatus.RETURNED,
      released: true,
    });
    mocks.readActiveOrganizationContextForUser.mockResolvedValue({
      organizationId: 'org-b',
      organizationName: 'Organization B',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationRole: OrganizationRole.STUDENT,
    });
    mocks.readVisibleStudentIds.mockResolvedValue(new Set([STUDENT_ID]));

    const response = await handleGetWritingSubmissionDetail(createEnv(), student, SUBMISSION_ID);

    expect(response.assignment.id).toBe(ASSIGNMENT_ID);
    expect(response.submission.evaluations).toHaveLength(1);
  });

  it.each([
    OrganizationRole.INSTRUCTOR,
    OrganizationRole.GROUP_ADMIN,
  ])('rejects an org-B %s using a known org-A assignment ID', async (organizationRole) => {
    mocks.readActiveOrganizationContextForUser.mockResolvedValue({
      organizationId: 'org-b',
      organizationName: 'Organization B',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationRole,
    });
    mocks.readVisibleStudentIds.mockResolvedValue(new Set([STUDENT_ID]));
    mocks.readAssignmentRow.mockResolvedValue(createAssignmentRow(WritingAssignmentStatus.DRAFT));
    const orgBStaff = createUser({
      id: `org-b-${organizationRole.toLowerCase()}`,
      role: UserRole.INSTRUCTOR,
      organizationId: 'org-b',
      organizationRole,
    });
    const env = createEnv();

    await expect(handleIssueWritingAssignment(env, orgBStaff, ASSIGNMENT_ID)).rejects.toMatchObject({
      status: 403,
    });
    expect(env.DB.prepare).not.toHaveBeenCalled();
  });
});

describe('writing assignment completion state machine', () => {
  const instructor = createUser({
    id: 'instructor-org-a',
    role: UserRole.INSTRUCTOR,
    organizationId: 'org-a',
    organizationRole: OrganizationRole.INSTRUCTOR,
  });

  const allowInstructorOrganizationAccess = () => {
    mocks.readActiveOrganizationContextForUser.mockResolvedValue({
      organizationId: 'org-a',
      organizationName: 'Organization A',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationRole: OrganizationRole.INSTRUCTOR,
    });
    mocks.readVisibleStudentIds.mockResolvedValue(new Set([STUDENT_ID]));
  };

  it.each([
    WritingAssignmentStatus.DRAFT,
    WritingAssignmentStatus.ISSUED,
    WritingAssignmentStatus.SUBMITTED,
    WritingAssignmentStatus.REVIEW_READY,
    WritingAssignmentStatus.REVISION_REQUESTED,
  ])('rejects completion from %s without writing or dispatching side effects', async (status) => {
    allowInstructorOrganizationAccess();
    mocks.readAssignmentRow.mockResolvedValue(createAssignmentRow(status));
    const env = createEnv();

    await expect(handleCompleteWritingAssignment(env, instructor, ASSIGNMENT_ID)).rejects.toMatchObject({
      status: 409,
    });
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(mocks.enqueueWritingActivitySideEffect).not.toHaveBeenCalled();
  });

  it('returns an already completed assignment idempotently without writes or side effects', async () => {
    allowInstructorOrganizationAccess();
    mocks.readAssignmentRow.mockResolvedValue(createAssignmentRow(WritingAssignmentStatus.COMPLETED));
    const env = createEnv();

    const result = await handleCompleteWritingAssignment(env, instructor, ASSIGNMENT_ID);

    expect(result.status).toBe(WritingAssignmentStatus.COMPLETED);
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(mocks.enqueueWritingActivitySideEffect).not.toHaveBeenCalled();
  });
});

describe('writing assignment issue state machine', () => {
  const instructor = createUser({
    id: 'instructor-org-a',
    role: UserRole.INSTRUCTOR,
    organizationId: 'org-a',
    organizationRole: OrganizationRole.INSTRUCTOR,
  });

  const allowInstructorOrganizationAccess = () => {
    mocks.readActiveOrganizationContextForUser.mockResolvedValue({
      organizationId: 'org-a',
      organizationName: 'Organization A',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationRole: OrganizationRole.INSTRUCTOR,
    });
    mocks.readVisibleStudentIds.mockResolvedValue(new Set([STUDENT_ID]));
  };

  it.each([
    WritingAssignmentStatus.SUBMITTED,
    WritingAssignmentStatus.REVIEW_READY,
    WritingAssignmentStatus.RETURNED,
    WritingAssignmentStatus.REVISION_REQUESTED,
    WritingAssignmentStatus.COMPLETED,
  ])('does not rewind %s to ISSUED', async (status) => {
    allowInstructorOrganizationAccess();
    mocks.readAssignmentRow.mockResolvedValue(createAssignmentRow(status));
    const env = createEnv();

    await expect(handleIssueWritingAssignment(env, instructor, ASSIGNMENT_ID)).rejects.toMatchObject({
      status: 409,
    });
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(mocks.recordProductEventForUser).not.toHaveBeenCalled();
  });

  it('treats an already issued assignment as an idempotent read', async () => {
    allowInstructorOrganizationAccess();
    mocks.readAssignmentRow.mockResolvedValue(createAssignmentRow(WritingAssignmentStatus.ISSUED));
    const env = createEnv();

    const result = await handleIssueWritingAssignment(env, instructor, ASSIGNMENT_ID);

    expect(result.status).toBe(WritingAssignmentStatus.ISSUED);
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(mocks.recordProductEventForUser).not.toHaveBeenCalled();
  });

  it('returns 409 when the DRAFT to ISSUED CAS loses a race', async () => {
    allowInstructorOrganizationAccess();
    mocks.readAssignmentRow.mockResolvedValue(createAssignmentRow(WritingAssignmentStatus.DRAFT));
    const env = createEnv(0);

    await expect(handleIssueWritingAssignment(env, instructor, ASSIGNMENT_ID)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.recordProductEventForUser).not.toHaveBeenCalled();
  });
});

describe('writing teacher review state machine', () => {
  const instructor = createUser({
    id: 'instructor-org-a',
    role: UserRole.INSTRUCTOR,
    organizationId: 'org-a',
    organizationRole: OrganizationRole.INSTRUCTOR,
  });
  const payload = {
    selectedEvaluationId: SELECTED_EVALUATION_ID,
    publicComment: 'Two reasons are clear.',
    privateMemo: PRIVATE_MEMO,
  };

  const allowInstructorOrganizationAccess = () => {
    mocks.readActiveOrganizationContextForUser.mockResolvedValue({
      organizationId: 'org-a',
      organizationName: 'Organization A',
      subscriptionPlan: SubscriptionPlan.TOB_PAID,
      organizationRole: OrganizationRole.INSTRUCTOR,
    });
    mocks.readVisibleStudentIds.mockResolvedValue(new Set([STUDENT_ID]));
  };

  it('rejects a stale submission before any review write or side effect', async () => {
    allowInstructorOrganizationAccess();
    mocks.readLatestSubmissionRowForAssignment.mockResolvedValue({
      ...(await mocks.readLatestSubmissionRowForAssignment()),
      id: 'submission-2',
      attempt_no: 2,
    });
    const env = createEnv();

    await expect(handleApproveWritingReturn(env, instructor, SUBMISSION_ID, payload)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.commitTeacherReviewDecision).not.toHaveBeenCalled();
    expect(mocks.recordProductEventForUser).not.toHaveBeenCalled();
    expect(mocks.enqueueWritingActivitySideEffect).not.toHaveBeenCalled();
  });

  it('keeps an exact approved-return retry idempotent without writes or side effects', async () => {
    allowInstructorOrganizationAccess();
    setSubmissionDetail({
      status: WritingAssignmentStatus.RETURNED,
      released: true,
    });
    const env = createEnv();

    const result = await handleApproveWritingReturn(env, instructor, SUBMISSION_ID, payload);

    expect(result.assignment.status).toBe(WritingAssignmentStatus.RETURNED);
    expect(mocks.commitTeacherReviewDecision).not.toHaveBeenCalled();
    expect(mocks.recordProductEventForUser).not.toHaveBeenCalled();
    expect(mocks.enqueueWritingActivitySideEffect).not.toHaveBeenCalled();
  });

  it('rejects a conflicting review after return without writes or side effects', async () => {
    allowInstructorOrganizationAccess();
    setSubmissionDetail({
      status: WritingAssignmentStatus.RETURNED,
      released: true,
    });
    const env = createEnv();

    await expect(handleApproveWritingReturn(env, instructor, SUBMISSION_ID, {
      ...payload,
      publicComment: 'Changed after release.',
    })).rejects.toMatchObject({ status: 409 });
    expect(mocks.commitTeacherReviewDecision).not.toHaveBeenCalled();
    expect(mocks.recordProductEventForUser).not.toHaveBeenCalled();
    expect(mocks.enqueueWritingActivitySideEffect).not.toHaveBeenCalled();
  });

  it('does not dispatch events or side effects after a lost review CAS', async () => {
    allowInstructorOrganizationAccess();
    mocks.commitTeacherReviewDecision.mockRejectedValue(Object.assign(new Error('conflict'), { status: 409 }));
    const env = createEnv();

    await expect(handleApproveWritingReturn(env, instructor, SUBMISSION_ID, payload)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.recordProductEventForUser).not.toHaveBeenCalled();
    expect(mocks.enqueueWritingActivitySideEffect).not.toHaveBeenCalled();
  });
});
