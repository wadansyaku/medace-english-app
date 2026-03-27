import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneratedAssetAuditStatus, WordHintAssetType } from '../types';

const {
  assertBookReadAccessMock,
  generateContentMock,
  generateMeteredGeminiSentenceMock,
  generateMeteredWordImageMock,
  readAllMock,
  readFirstMock,
} = vi.hoisted(() => ({
  assertBookReadAccessMock: vi.fn(),
  generateContentMock: vi.fn(),
  generateMeteredGeminiSentenceMock: vi.fn(),
  generateMeteredWordImageMock: vi.fn(),
  readAllMock: vi.fn(),
  readFirstMock: vi.fn(),
}));

vi.mock('../functions/_shared/ai-actions', () => ({
  generateMeteredGeminiSentence: generateMeteredGeminiSentenceMock,
  generateMeteredWordImage: generateMeteredWordImageMock,
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    models = {
      generateContent: generateContentMock,
    };
  },
  Type: {
    OBJECT: 'OBJECT',
    STRING: 'STRING',
  },
}));

vi.mock('../functions/_shared/storage-support', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/storage-support')>('../functions/_shared/storage-support');
  return {
    ...actual,
    assertBookReadAccess: assertBookReadAccessMock,
    readAll: readAllMock,
    readFirst: readFirstMock,
  };
});

import { handleGenerateWordHintAsset, runWordHintAuditSweep } from '../functions/_shared/word-hint-assets';

const createWordRow = () => ({
  id: 'word-1',
  book_id: 'book-1',
  word_number: 1,
  word: 'acute',
  definition: '鋭い',
  search_key: 'acute',
  example_sentence: 'The patient felt acute pain in her leg.',
  example_meaning: '患者は脚に鋭い痛みを感じた。',
  example_generated_at: 1700000000000,
  example_audit_status: null,
  example_audit_note: null,
  example_audited_at: null,
  example_image_key: 'word-hints/word-1/example-image.jpg',
  example_image_content_type: 'image/jpeg',
  example_image_generated_at: 1700000005000,
  example_image_audit_status: null,
  example_image_audit_note: null,
  example_image_audited_at: null,
  is_reported: 0,
  source_context: 'Medical English',
});

const createEnv = () => {
  const runMock = vi.fn().mockResolvedValue({ success: true });
  const bindMock = vi.fn(() => ({ run: runMock }));
  const prepareMock = vi.fn(() => ({ bind: bindMock }));

  return {
    DB: {
      prepare: prepareMock,
    },
    GEMINI_API_KEY: 'test-key',
    WRITING_ASSETS: {
      get: vi.fn().mockResolvedValue({
        arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
        body: null,
      }),
    },
  } as any;
};

const createUser = () => ({
  id: 'user-1',
  email: 'user@example.com',
  password_hash: null,
  display_name: 'User',
  role: 'STUDENT',
  grade: null,
  english_level: 'B1',
  subscription_plan: 'TOB_PAID',
  organization_id: null,
  organization_name: null,
  organization_role: null,
  study_mode: null,
  stats_xp: 0,
  stats_level: 1,
  stats_current_streak: 0,
  stats_last_login_date: null,
  created_at: 0,
  updated_at: 0,
});

describe('word hint assets', () => {
  beforeEach(() => {
    assertBookReadAccessMock.mockReset();
    generateContentMock.mockReset();
    generateMeteredGeminiSentenceMock.mockReset();
    generateMeteredWordImageMock.mockReset();
    readAllMock.mockReset();
    readFirstMock.mockReset();
  });

  it('returns the cached example without calling AI again', async () => {
    readFirstMock.mockResolvedValueOnce(createWordRow());

    const result = await handleGenerateWordHintAsset(createEnv(), createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
    });

    expect(generateMeteredGeminiSentenceMock).not.toHaveBeenCalled();
    expect(assertBookReadAccessMock).toHaveBeenCalled();
    expect(result.exampleSentence).toBe('The patient felt acute pain in her leg.');
  });

  it('audits due example and image hints in a single sweep', async () => {
    readAllMock.mockResolvedValueOnce([createWordRow()]);
    generateContentMock
      .mockResolvedValueOnce({ text: JSON.stringify({ status: GeneratedAssetAuditStatus.APPROVED, reason: '問題ありません。' }) })
      .mockResolvedValueOnce({ text: JSON.stringify({ status: GeneratedAssetAuditStatus.REVIEW_REQUIRED, reason: '画像が意味を十分に示していません。' }) });

    const result = await runWordHintAuditSweep(createEnv(), {
      limit: 2,
      staleAfterHours: 168,
    });

    expect(result.auditedCount).toBe(2);
    expect(result.exampleAudits).toBe(1);
    expect(result.imageAudits).toBe(1);
    expect(result.approvedCount).toBe(1);
    expect(result.reviewRequiredCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(generateContentMock).toHaveBeenCalledTimes(2);
  });
});
