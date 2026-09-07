import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneratedAssetAuditStatus, UserRole } from '../types';

const {
  canAccessVisibleStudentMock,
  readActiveOrganizationMemberMock,
  readAllMock,
  readFirstMock,
  readVisibleLearningBookRowsMock,
} = vi.hoisted(() => ({
  canAccessVisibleStudentMock: vi.fn(),
  readActiveOrganizationMemberMock: vi.fn(),
  readAllMock: vi.fn(),
  readFirstMock: vi.fn(),
  readVisibleLearningBookRowsMock: vi.fn(),
}));

vi.mock('../functions/_shared/organization-support', () => ({
  readActiveOrganizationMember: readActiveOrganizationMemberMock,
}));

vi.mock('../functions/_shared/student-visibility', () => ({
  canAccessVisibleStudent: canAccessVisibleStudentMock,
}));

vi.mock('../functions/_shared/storage-support', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/storage-support')>(
    '../functions/_shared/storage-support',
  );
  return {
    ...actual,
    readAll: readAllMock,
    readFirst: readFirstMock,
    readVisibleLearningBookRows: readVisibleLearningBookRowsMock,
  };
});

import { handleGetStudentWorksheetSnapshot } from '../functions/_shared/organization-worksheet-actions';

const DAY_MS = 24 * 60 * 60 * 1000;

const createCurrentUser = () => ({
  id: 'instructor-1',
  role: UserRole.INSTRUCTOR,
  organization_role: 'INSTRUCTOR',
  organization_id: 'org-1',
});

const createExampleAuditCases = (now: number) => [
  {
    id: 'source-authored',
    sentence: 'A source-authored example.',
    meaning: '教材由来の例文。',
    generatedAt: null,
    auditStatus: null,
    auditedAt: null,
    visible: true,
  },
  {
    id: 'fresh-approved',
    sentence: 'A fresh approved example.',
    meaning: '承認済みの例文。',
    generatedAt: now - 2_000,
    auditStatus: GeneratedAssetAuditStatus.APPROVED,
    auditedAt: now - 1_000,
    visible: true,
  },
  {
    id: 'pending',
    sentence: 'A pending generated example.',
    meaning: '確認中の例文。',
    generatedAt: now - 2_000,
    auditStatus: GeneratedAssetAuditStatus.PENDING,
    auditedAt: null,
    visible: false,
  },
  {
    id: 'review-required',
    sentence: 'A rejected generated example.',
    meaning: '要見直しの例文。',
    generatedAt: now - 2_000,
    auditStatus: GeneratedAssetAuditStatus.REVIEW_REQUIRED,
    auditedAt: now - 1_000,
    visible: false,
  },
  {
    id: 'failed',
    sentence: 'A failed-audit generated example.',
    meaning: '監査失敗の例文。',
    generatedAt: now - 2_000,
    auditStatus: GeneratedAssetAuditStatus.FAILED,
    auditedAt: now - 1_000,
    visible: false,
  },
  {
    id: 'stale-approved',
    sentence: 'A stale approved example.',
    meaning: '承認期限切れの例文。',
    generatedAt: now - (16 * DAY_MS),
    auditStatus: GeneratedAssetAuditStatus.APPROVED,
    auditedAt: now - (15 * DAY_MS),
    visible: false,
  },
];

const expectSafeExamples = (
  words: Array<{ wordId: string; exampleSentence?: string | null; exampleMeaning?: string | null }>,
  cases: ReturnType<typeof createExampleAuditCases>,
) => {
  cases.forEach((item) => {
    const word = words.find((candidate) => candidate.wordId === item.id);
    expect(word, `missing worksheet word: ${item.id}`).toBeDefined();
    expect(word?.exampleSentence).toBe(item.visible ? item.sentence : null);
    expect(word?.exampleMeaning).toBe(item.visible ? item.meaning : null);
  });
};

describe('organization worksheet generated hint projection', () => {
  beforeEach(() => {
    canAccessVisibleStudentMock.mockReset().mockResolvedValue(true);
    readActiveOrganizationMemberMock.mockReset().mockResolvedValue({
      id: 'student-1',
      display_name: 'Student',
      role: UserRole.STUDENT,
      organization_role: 'STUDENT',
      organization_id: 'org-1',
      organization_name: 'Test School',
    });
    readAllMock.mockReset();
    readFirstMock.mockReset().mockResolvedValue({ id: 'student-1', role: UserRole.STUDENT });
    readVisibleLearningBookRowsMock.mockReset().mockResolvedValue([{ id: 'book-1', title: 'Book 1' }]);
  });

  it('withholds held and stale generated examples from history-based staff worksheets', async () => {
    const cases = createExampleAuditCases(Date.now());
    readAllMock.mockResolvedValueOnce(cases.map((item, index) => ({
      word_id: item.id,
      book_id: 'book-1',
      book_title: 'Book 1',
      word: `word-${index + 1}`,
      definition: `definition-${index + 1}`,
      example_sentence: item.sentence,
      example_meaning: item.meaning,
      example_generated_at: item.generatedAt,
      example_audit_status: item.auditStatus,
      example_audited_at: item.auditedAt,
      status: 'learning',
      last_studied_at: Date.now() - index,
      attempt_count: 2,
      correct_count: 1,
    })));

    const result = await handleGetStudentWorksheetSnapshot(
      {} as any,
      createCurrentUser() as any,
      'student-1',
    );

    expect(result.source).toBe('history');
    expectSafeExamples(result.words, cases);
    expect(String(readAllMock.mock.calls[0]?.[1] || '')).toContain('w.example_audited_at AS example_audited_at');
  });

  it('applies the same fail-closed projection to catalog fallback worksheets', async () => {
    const cases = createExampleAuditCases(Date.now());
    readAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(cases.map((item, index) => ({
        id: item.id,
        book_id: 'book-1',
        word_number: index + 1,
        word: `word-${index + 1}`,
        definition: `definition-${index + 1}`,
        example_sentence: item.sentence,
        example_meaning: item.meaning,
        example_generated_at: item.generatedAt,
        example_audit_status: item.auditStatus,
        example_audited_at: item.auditedAt,
      })));

    const result = await handleGetStudentWorksheetSnapshot(
      {} as any,
      createCurrentUser() as any,
      'student-1',
    );

    expect(result.source).toBe('catalog_fallback');
    expectSafeExamples(result.words, cases);
  });
});
