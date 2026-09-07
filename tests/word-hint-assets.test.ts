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
    assertBookReadAccessMock.mockReset();
    assertBookWriteAccessMock.mockReset();
    generateContentMock.mockReset();
    generateMeteredGeminiSentenceMock.mockReset();
    generateMeteredWordImageMock.mockReset();
    readAllMock.mockReset();
    readFirstMock.mockReset();
  });

  it('returns a fresh approved cached example without calling AI again', async () => {
    const now = Date.now();
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_meaning: null,
      example_generated_at: now - 1_000,
      example_audit_status: GeneratedAssetAuditStatus.APPROVED,
      example_audited_at: now,
    }));

    const result = await handleGenerateWordHintAsset(createEnv(), createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
    });

    expect(generateMeteredGeminiSentenceMock).not.toHaveBeenCalled();
    expect(assertBookReadAccessMock).toHaveBeenCalled();
    expect(result.exampleSentence).toBe('The patient felt acute pain in her leg.');
    expect(result.exampleMeaning).toBeNull();
  });

  it('rejects a learner force refresh before mutating an existing shared example', async () => {
    const now = Date.now();
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_generated_at: now - 1_000,
      example_audit_status: GeneratedAssetAuditStatus.APPROVED,
      example_audited_at: now,
    }));
    assertBookWriteAccessMock.mockRejectedValueOnce(Object.assign(
      new Error('この単語帳を編集できません。'),
      { status: 403 },
    ));

    await expect(handleGenerateWordHintAsset(createEnv(), createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
      forceRefresh: true,
    })).rejects.toMatchObject({ status: 403 });

    expect(assertBookWriteAccessMock).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'book-1');
    expect(generateMeteredGeminiSentenceMock).not.toHaveBeenCalled();
  });

  it('allows a book owner or global admin to replace an existing example', async () => {
    const now = Date.now();
    readFirstMock
      .mockResolvedValueOnce(createWordRow({
        example_generated_at: now - 1_000,
        example_audit_status: GeneratedAssetAuditStatus.APPROVED,
        example_audited_at: now,
      }))
      .mockResolvedValueOnce(createWordRow({
        example_sentence: 'Owner refreshed example.',
        example_meaning: '所有者が更新した例文。',
        example_generated_at: now,
        example_audit_status: GeneratedAssetAuditStatus.PENDING,
        example_audited_at: null,
      }));
    generateMeteredGeminiSentenceMock.mockResolvedValueOnce({
      english: 'Owner refreshed example.',
      japanese: '所有者が更新した例文。',
    });

    const result = await handleGenerateWordHintAsset(createEnv(), createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
      forceRefresh: true,
    });

    expect(assertBookWriteAccessMock).toHaveBeenCalled();
    expect(result).toMatchObject({
      exampleSentence: null,
      exampleMeaning: null,
      exampleAuditStatus: GeneratedAssetAuditStatus.PENDING,
    });
  });

  it('fails an example generation race instead of overwriting the winning shared value', async () => {
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_sentence: null,
      example_meaning: null,
      example_generated_at: null,
      example_audit_status: null,
    }));
    generateMeteredGeminiSentenceMock.mockResolvedValueOnce({
      english: 'Losing generated example.',
      japanese: '競合に負けた例文。',
    });

    await expect(handleGenerateWordHintAsset(createEnv(0), createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
    })).rejects.toMatchObject({
      status: 409,
      message: '例文ヒントが別の操作で更新されました。最新状態でやり直してください。',
    });
  });

  it('uses a unique image key and removes the losing object after an image generation race', async () => {
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_image_key: null,
      example_image_content_type: null,
      example_image_generated_at: null,
      example_image_audit_status: null,
    }));
    generateMeteredWordImageMock.mockResolvedValueOnce('data:image/png;base64,AQID');
    const env = createEnv(0);

    await expect(handleGenerateWordHintAsset(env, createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.IMAGE,
    })).rejects.toMatchObject({ status: 409 });

    const writtenKey = env.WRITING_ASSETS.put.mock.calls[0]?.[0];
    expect(writtenKey).toMatch(/^word-hints\/word-1\/[0-9a-f-]+\.png$/);
    expect(env.WRITING_ASSETS.delete).toHaveBeenCalledWith(writtenKey);
  });

  it('removes only the superseded image after a successful owner refresh', async () => {
    const now = Date.now();
    readFirstMock
      .mockResolvedValueOnce(createWordRow({
        example_image_key: 'word-hints/word-1/approved-old.png',
        example_image_content_type: 'image/png',
        example_image_generated_at: now - 1_000,
        example_image_audit_status: GeneratedAssetAuditStatus.APPROVED,
        example_image_audited_at: now,
      }))
      .mockResolvedValueOnce(createWordRow({
        example_image_key: 'word-hints/word-1/new-generation.png',
        example_image_content_type: 'image/png',
        example_image_generated_at: now,
        example_image_audit_status: GeneratedAssetAuditStatus.PENDING,
        example_image_audited_at: null,
      }));
    generateMeteredWordImageMock.mockResolvedValueOnce('data:image/png;base64,AQID');
    const env = createEnv();

    await handleGenerateWordHintAsset(env, createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.IMAGE,
      forceRefresh: true,
    });

    const committedKey = env.WRITING_ASSETS.put.mock.calls[0]?.[0];
    expect(assertBookWriteAccessMock).toHaveBeenCalled();
    expect(env.WRITING_ASSETS.delete).toHaveBeenCalledWith('word-hints/word-1/approved-old.png');
    expect(env.WRITING_ASSETS.delete).not.toHaveBeenCalledWith(committedKey);
  });

  it('withholds a cached generated example while its audit is pending', async () => {
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_audit_status: GeneratedAssetAuditStatus.PENDING,
      example_audited_at: null,
    }));

    const result = await handleGenerateWordHintAsset(createEnv(), createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
    });

    expect(generateMeteredGeminiSentenceMock).not.toHaveBeenCalled();
    expect(result.exampleSentence).toBeNull();
    expect(result.exampleMeaning).toBeNull();
    expect(result.exampleAuditStatus).toBe(GeneratedAssetAuditStatus.PENDING);
  });

  it('withholds a cloud example whose audit state exists but generation provenance is missing', async () => {
    readFirstMock.mockResolvedValueOnce(createWordRow({
      example_generated_at: null,
      example_audit_status: GeneratedAssetAuditStatus.PENDING,
      example_audited_at: null,
    }));

    const result = await handleGenerateWordHintAsset(createEnv(), createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
    });

    expect(generateMeteredGeminiSentenceMock).not.toHaveBeenCalled();
    expect(result.exampleSentence).toBeNull();
    expect(result.exampleMeaning).toBeNull();
    expect(result.exampleAuditStatus).toBe(GeneratedAssetAuditStatus.REVIEW_REQUIRED);
  });

  it('withholds a newly generated example until a later audit approves it', async () => {
    const generatedAt = Date.now();
    readFirstMock
      .mockResolvedValueOnce(createWordRow({
        example_sentence: null,
        example_meaning: null,
        example_generated_at: null,
        example_audit_status: null,
      }))
      .mockResolvedValueOnce(createWordRow({
        example_sentence: 'A newly generated sentence.',
        example_meaning: '新しく生成された例文。',
        example_generated_at: generatedAt,
        example_audit_status: GeneratedAssetAuditStatus.PENDING,
        example_audited_at: null,
      }));
    generateMeteredGeminiSentenceMock.mockResolvedValueOnce({
      english: 'A newly generated sentence.',
      japanese: '新しく生成された例文。',
    });

    const result = await handleGenerateWordHintAsset(createEnv(), createUser() as any, {
      wordId: 'word-1',
      assetType: WordHintAssetType.EXAMPLE,
    });

    expect(result.exampleSentence).toBeNull();
    expect(result.exampleMeaning).toBeNull();
    expect(result.exampleAuditStatus).toBe(GeneratedAssetAuditStatus.PENDING);
  });

  it('audits due example and image hints in a single sweep even when exampleMeaning is missing', async () => {
    readAllMock.mockResolvedValueOnce([createWordRow({
      example_meaning: null,
    })]);
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
    expect(String(generateContentMock.mock.calls[0]?.[0]?.contents || '')).toContain('Japanese translation: "語義: 鋭い"');
  });

  it('orders audit candidates by the stalest available asset timestamp without requiring exampleMeaning', async () => {
    readAllMock.mockResolvedValueOnce([]);

    await runWordHintAuditSweep(createEnv(), {
      limit: 1,
      staleAfterHours: 168,
    });

    expect(readAllMock).toHaveBeenCalledTimes(1);
    expect(String(readAllMock.mock.calls[0]?.[1] || '')).toContain('ORDER BY MIN(');
    expect(String(readAllMock.mock.calls[0]?.[1] || '')).toContain('COALESCE(w.example_image_audited_at, w.example_image_generated_at)');
    expect(String(readAllMock.mock.calls[0]?.[1] || '')).not.toContain('example_meaning IS NOT NULL');
  });

  it('treats an unknown model audit status as review required instead of approved', async () => {
    readAllMock.mockResolvedValueOnce([createWordRow({
      example_image_key: null,
      example_image_content_type: null,
      example_image_generated_at: null,
    })]);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ status: 'MAYBE', reason: 'モデルが予期外の判定を返しました。' }),
    });

    const result = await runWordHintAuditSweep(createEnv(), {
      limit: 1,
      staleAfterHours: 168,
    });

    expect(result.approvedCount).toBe(0);
    expect(result.reviewRequiredCount).toBe(1);
    expect(result.failedCount).toBe(0);
  });

  it('does not approve or count an audit result after the generated payload loses its CAS', async () => {
    readAllMock.mockResolvedValueOnce([createWordRow({
      example_image_key: null,
      example_image_content_type: null,
      example_image_generated_at: null,
      example_image_audit_status: null,
    })]);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ status: GeneratedAssetAuditStatus.APPROVED, reason: '古いpayloadの監査結果。' }),
    });
    const env = createEnv(0);

    const result = await runWordHintAuditSweep(env, {
      limit: 1,
      staleAfterHours: 168,
    });

    expect(result).toMatchObject({
      auditedCount: 0,
      exampleAudits: 0,
      approvedCount: 0,
      reviewRequiredCount: 0,
      failedCount: 0,
    });
    const auditUpdateSql = env.DB.prepare.mock.calls
      .map(([sql]: [string]) => sql)
      .find((sql: string) => sql.includes('SET example_audit_status'));
    expect(auditUpdateSql).toContain('example_sentence IS ?');
    expect(auditUpdateSql).toContain('example_generated_at IS ?');
    expect(auditUpdateSql).toContain('example_audited_at IS ?');
  });

  it('does not approve or count an image audit after its key loses the audit CAS', async () => {
    readAllMock.mockResolvedValueOnce([createWordRow({
      example_sentence: null,
      example_meaning: null,
      example_generated_at: null,
      example_audit_status: null,
    })]);
    generateContentMock.mockResolvedValueOnce({
      text: JSON.stringify({ status: GeneratedAssetAuditStatus.APPROVED, reason: '古い画像の監査結果。' }),
    });
    const env = createEnv(0);

    const result = await runWordHintAuditSweep(env, {
      limit: 1,
      staleAfterHours: 168,
    });

    expect(result).toMatchObject({
      auditedCount: 0,
      imageAudits: 0,
      approvedCount: 0,
      reviewRequiredCount: 0,
      failedCount: 0,
    });
    const auditUpdateSql = env.DB.prepare.mock.calls
      .map(([sql]: [string]) => sql)
      .find((sql: string) => sql.includes('SET example_image_audit_status'));
    expect(auditUpdateSql).toContain('example_image_key IS ?');
    expect(auditUpdateSql).toContain('example_image_content_type IS ?');
    expect(auditUpdateSql).toContain('example_image_generated_at IS ?');
    expect(auditUpdateSql).toContain('example_image_audit_status IS ?');
    expect(auditUpdateSql).toContain('example_image_audited_at IS ?');
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
