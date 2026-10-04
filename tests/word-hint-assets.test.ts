import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GeneratedAssetAuditStatus, WordHintAssetType } from '../types';

const {
  assertBookReadAccessMock,
  assertBookWriteAccessMock,
  generateContentMock,
  generateMeteredGeminiSentenceMock,
  generateMeteredWordImageMock,
  readAllMock,
  readFirstMock,
} = vi.hoisted(() => ({
  assertBookReadAccessMock: vi.fn(),
  assertBookWriteAccessMock: vi.fn(),
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
    assertBookWriteAccess: assertBookWriteAccessMock,
    readAll: readAllMock,
    readFirst: readFirstMock,
  };
});

import {
  handleGenerateWordHintAsset,
  handleGetWordHintImageResponse,
  runWordHintAuditSweep,
} from '../functions/_shared/word-hint-assets';

const createWordRow = (overrides: Record<string, unknown> = {}) => ({
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
  ...overrides,
});

const createEnv = (changes = 1) => {
  const runMock = vi.fn().mockResolvedValue({ success: true, meta: { changes } });
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
      put: vi.fn().mockResolvedValue({ etag: 'test-etag' }),
      delete: vi.fn().mockResolvedValue(undefined),
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
    vi.clearAllMocks();
    readFirstMock.mockReset();
  });

  it.each(['STUDENT', 'INSTRUCTOR', 'ADMIN'])('retires every legacy generation variant for %s before any access, provider or mutation', async (role) => {
    for (const assetType of [WordHintAssetType.EXAMPLE, WordHintAssetType.IMAGE]) {
      for (const forceRefresh of [false, true]) {
        const env = createEnv();
        await expect(handleGenerateWordHintAsset(env, { ...createUser(), role } as any, {
          wordId: 'word-1', assetType, forceRefresh,
        })).rejects.toMatchObject({ status: 410 });
        expect(env.DB.prepare).not.toHaveBeenCalled();
        expect(env.WRITING_ASSETS.put).not.toHaveBeenCalled();
        expect(env.WRITING_ASSETS.delete).not.toHaveBeenCalled();
      }
    }
    expect(readFirstMock).not.toHaveBeenCalled();
    expect(assertBookReadAccessMock).not.toHaveBeenCalled();
    expect(assertBookWriteAccessMock).not.toHaveBeenCalled();
    expect(generateMeteredGeminiSentenceMock).not.toHaveBeenCalled();
    expect(generateMeteredWordImageMock).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('retires the internal paid audit without reading or changing saved approvals', async () => {
    const env = createEnv();
    await expect(runWordHintAuditSweep(env, { limit: 2, staleAfterHours: 168 })).rejects.toMatchObject({ status: 410 });
    expect(readAllMock).not.toHaveBeenCalled();
    expect(env.DB.prepare).not.toHaveBeenCalled();
    expect(env.WRITING_ASSETS.get).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('serves saved approved image bytes with read authorization and no generation or R2 mutation', async () => {
    const now = Date.now();
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_image_audit_status: GeneratedAssetAuditStatus.APPROVED,
      example_image_generated_at: now - 1000,
      example_image_audited_at: now,
    }));
    const env = createEnv();
    const response = await handleGetWordHintImageResponse(env, createUser() as any, 'word-1');
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(Uint8Array.from([1, 2, 3, 4]));
    expect(assertBookReadAccessMock).toHaveBeenCalledWith(env, expect.anything(), 'book-1');
    expect(env.WRITING_ASSETS.get).toHaveBeenCalledWith('word-hints/word-1/example-image.jpg');
    expect(env.WRITING_ASSETS.put).not.toHaveBeenCalled();
    expect(env.WRITING_ASSETS.delete).not.toHaveBeenCalled();
    expect(generateContentMock).not.toHaveBeenCalled();
  });

  it('rejects a saved image when the reader lacks book access', async () => {
    readFirstMock.mockResolvedValueOnce(createWordRow());
    assertBookReadAccessMock.mockRejectedValueOnce(Object.assign(new Error('access denied'), { status: 403 }));
    const env = createEnv();
    await expect(handleGetWordHintImageResponse(env, createUser() as any, 'word-1')).rejects.toMatchObject({ status: 403 });
    expect(env.WRITING_ASSETS.get).not.toHaveBeenCalled();
  });

  it('does not read or serve a generated image before its audit is approved', async () => {
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_image_audit_status: GeneratedAssetAuditStatus.PENDING,
      example_image_audited_at: null,
    }));
    const env = createEnv();

    await expect(handleGetWordHintImageResponse(env, createUser() as any, 'word-1')).rejects.toMatchObject({
      status: 404,
      message: '画像ヒントは内容確認中です。',
    });
    expect(env.WRITING_ASSETS.get).not.toHaveBeenCalled();
  });

  it('does not serve an image with missing generation provenance even if marked approved', async () => {
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_image_generated_at: null,
      example_image_audit_status: GeneratedAssetAuditStatus.APPROVED,
      example_image_audited_at: Date.now(),
    }));
    const env = createEnv();

    await expect(handleGetWordHintImageResponse(env, createUser() as any, 'word-1')).rejects.toMatchObject({
      status: 404,
      message: '画像ヒントは内容確認中です。',
    });
    expect(env.WRITING_ASSETS.get).not.toHaveBeenCalled();
  });
});
