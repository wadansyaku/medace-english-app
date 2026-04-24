import { GoogleGenAI, Type } from '@google/genai';

import { GeneratedAssetAuditStatus, WordHintAssetType, type WordData } from '../../types';
import { AI_ACTION_ESTIMATES } from '../../config/subscription';
import { resolveExampleTranslation, shouldAuditGeneratedAsset } from '../../shared/wordHintAssets';
import { generateMeteredGeminiSentence, generateMeteredWordImage } from './ai-actions';
import { HttpError } from './http';
import { recordProductEventForUser } from './product-events';
import {
  assertBookReadAccess,
  buildWordHintImageUrl,
  readAll,
  readFirst,
  toWordData,
  type DbWordRow,
} from './storage-support';
import type { AppEnv, DbUserRow } from './types';

interface DbWordHintAssetRow extends DbWordRow {
  source_context: string | null;
}

interface GenerateWordHintAssetInput {
  wordId: string;
  assetType: WordHintAssetType;
  forceRefresh?: boolean;
}

interface AuditDecision {
  status: GeneratedAssetAuditStatus.APPROVED | GeneratedAssetAuditStatus.REVIEW_REQUIRED;
  reason: string;
}

export interface WordHintAuditSweepResult {
  limit: number;
  staleAfterHours: number;
  auditedCount: number;
  exampleAudits: number;
  imageAudits: number;
  approvedCount: number;
  reviewRequiredCount: number;
  failedCount: number;
}

const DEFAULT_AUDIT_LIMIT = 12;
const DEFAULT_AUDIT_STALE_AFTER_HOURS = 168;
const WORD_HINT_AUDIT_MODEL = 'gemini-2.5-flash';

const getAiClient = (env: AppEnv): GoogleGenAI => {
  if (!env.GEMINI_API_KEY) {
    throw new HttpError(503, 'GEMINI_API_KEY が未設定です。');
  }
  return new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
};

const readWordHintAssetRow = async (
  env: AppEnv,
  wordId: string,
): Promise<DbWordHintAssetRow | null> => readFirst<DbWordHintAssetRow>(
  env,
  `SELECT w.*, b.source_context
   FROM words w
   JOIN books b ON b.id = w.book_id
   WHERE w.id = ?`,
  wordId,
);

const base64ToUint8Array = (base64: string): Uint8Array => {
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const parseDataUrl = (dataUrl: string): { mimeType: string; bytes: Uint8Array } => {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new HttpError(502, '画像生成レスポンスの形式が不正です。');
  }

  return {
    mimeType: match[1],
    bytes: base64ToUint8Array(match[2]),
  };
};

const buildWordHintImageKey = (wordId: string, mimeType: string): string => {
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  return `word-hints/${wordId}/example-image.${extension}`;
};

const persistWordExample = async (
  env: AppEnv,
  wordId: string,
  sentence: string,
  translation: string,
): Promise<void> => {
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE words
    SET example_sentence = ?,
        example_meaning = ?,
        example_generated_at = ?,
        example_audit_status = ?,
        example_audit_note = NULL,
        example_audited_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).bind(
    sentence,
    translation,
    now,
    GeneratedAssetAuditStatus.PENDING,
    now,
    wordId,
  ).run();
};

const persistWordImage = async (
  env: AppEnv,
  wordId: string,
  dataUrl: string,
): Promise<void> => {
  if (!env.WRITING_ASSETS) {
    throw new HttpError(503, 'WRITING_ASSETS が設定されていません。');
  }

  const { mimeType, bytes } = parseDataUrl(dataUrl);
  const key = buildWordHintImageKey(wordId, mimeType);
  await env.WRITING_ASSETS.put(key, bytes, {
    httpMetadata: {
      contentType: mimeType,
    },
  });

  const now = Date.now();
  await env.DB.prepare(`
    UPDATE words
    SET example_image_key = ?,
        example_image_content_type = ?,
        example_image_generated_at = ?,
        example_image_audit_status = ?,
        example_image_audit_note = NULL,
        example_image_audited_at = NULL,
        updated_at = ?
    WHERE id = ?
  `).bind(
    key,
    mimeType,
    now,
    GeneratedAssetAuditStatus.PENDING,
    now,
    wordId,
  ).run();
};

const rereadWordData = async (env: AppEnv, wordId: string): Promise<WordData> => {
  const refreshed = await readFirst<DbWordRow>(env, 'SELECT * FROM words WHERE id = ?', wordId);
  if (!refreshed) {
    throw new HttpError(404, '対象の単語が見つかりません。');
  }
  return toWordData(refreshed);
};

const markExampleAuditResult = async (
  env: AppEnv,
  wordId: string,
  status: GeneratedAssetAuditStatus,
  note: string,
): Promise<void> => {
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE words
    SET example_audit_status = ?,
        example_audit_note = ?,
        example_audited_at = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(status, note, now, now, wordId).run();
};

const markImageAuditResult = async (
  env: AppEnv,
  wordId: string,
  status: GeneratedAssetAuditStatus,
  note: string,
): Promise<void> => {
  const now = Date.now();
  await env.DB.prepare(`
    UPDATE words
    SET example_image_audit_status = ?,
        example_image_audit_note = ?,
        example_image_audited_at = ?,
        updated_at = ?
    WHERE id = ?
  `).bind(status, note, now, now, wordId).run();
};

const auditExampleSentence = async (
  env: AppEnv,
  row: DbWordHintAssetRow,
): Promise<AuditDecision> => {
  const ai = getAiClient(env);
  const translation = resolveExampleTranslation({
    definition: row.definition,
    exampleMeaning: row.example_meaning,
  });
  const response = await ai.models.generateContent({
    model: WORD_HINT_AUDIT_MODEL,
    contents: `
      You are auditing a learner-facing English vocabulary example.
      Decide whether the example sentence is natural, uses the target word correctly, matches the intended meaning, and whether the Japanese translation is appropriate.

      Target word: "${row.word}"
      Intended meaning: "${row.definition}"
      Example sentence: "${row.example_sentence || ''}"
      Japanese translation: "${translation}"
      Source context: "${row.source_context || ''}"

      Return JSON:
      {
        "status": "APPROVED" or "REVIEW_REQUIRED",
        "reason": "Short Japanese explanation"
      }
    `,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['status', 'reason'],
      },
    },
  });

  if (!response.text) {
    throw new HttpError(502, '例文監査レスポンスが空です。');
  }

  const parsed = JSON.parse(response.text) as { status?: string; reason?: string };
  return {
    status: parsed.status === GeneratedAssetAuditStatus.REVIEW_REQUIRED
      ? GeneratedAssetAuditStatus.REVIEW_REQUIRED
      : GeneratedAssetAuditStatus.APPROVED,
    reason: typeof parsed.reason === 'string' && parsed.reason.trim().length > 0
      ? parsed.reason.trim()
      : '監査理由を取得できませんでした。',
  };
};

const auditExampleImage = async (
  env: AppEnv,
  row: DbWordHintAssetRow,
): Promise<AuditDecision> => {
  if (!env.WRITING_ASSETS) {
    throw new HttpError(503, 'WRITING_ASSETS が設定されていません。');
  }
  if (!row.example_image_key || !row.example_image_content_type) {
    return {
      status: GeneratedAssetAuditStatus.REVIEW_REQUIRED,
      reason: '画像キャッシュが見つかりません。',
    };
  }

  const object = await env.WRITING_ASSETS.get(row.example_image_key);
  if (!object) {
    return {
      status: GeneratedAssetAuditStatus.REVIEW_REQUIRED,
      reason: 'R2 上の画像キャッシュが見つかりません。',
    };
  }

  const ai = getAiClient(env);
  const imageBase64 = arrayBufferToBase64(await object.arrayBuffer());
  const response = await ai.models.generateContent({
    model: WORD_HINT_AUDIT_MODEL,
    contents: [
      {
        inlineData: {
          mimeType: row.example_image_content_type,
          data: imageBase64,
        },
      },
      {
        text: `
          You are auditing a learner-facing mnemonic image for vocabulary study.
          Decide whether the image clearly matches the target word and its intended meaning, and whether it would help a Japanese student remember the word.

          Target word: "${row.word}"
          Intended meaning: "${row.definition}"
          Source context: "${row.source_context || ''}"

          Return JSON:
          {
            "status": "APPROVED" or "REVIEW_REQUIRED",
            "reason": "Short Japanese explanation"
          }
        `,
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['status', 'reason'],
      },
    },
  });

  if (!response.text) {
    throw new HttpError(502, '画像監査レスポンスが空です。');
  }

  const parsed = JSON.parse(response.text) as { status?: string; reason?: string };
  return {
    status: parsed.status === GeneratedAssetAuditStatus.REVIEW_REQUIRED
      ? GeneratedAssetAuditStatus.REVIEW_REQUIRED
      : GeneratedAssetAuditStatus.APPROVED,
    reason: typeof parsed.reason === 'string' && parsed.reason.trim().length > 0
      ? parsed.reason.trim()
      : '監査理由を取得できませんでした。',
  };
};

const isExampleAuditDue = (row: DbWordHintAssetRow, cutoffMs: number): boolean => {
  if (!row.example_sentence?.trim()) return false;
  return shouldAuditGeneratedAsset(
    row.example_generated_at,
    row.example_audited_at,
    Date.now(),
    Math.max(0, Date.now() - cutoffMs),
  );
};

const isImageAuditDue = (row: DbWordHintAssetRow, cutoffMs: number): boolean => {
  if (!row.example_image_key?.trim() || !row.example_image_content_type?.trim()) return false;
  return shouldAuditGeneratedAsset(
    row.example_image_generated_at,
    row.example_image_audited_at,
    Date.now(),
    Math.max(0, Date.now() - cutoffMs),
  );
};

export const handleGenerateWordHintAsset = async (
  env: AppEnv,
  user: DbUserRow,
  input: GenerateWordHintAssetInput,
): Promise<WordData> => {
  const row = await readWordHintAssetRow(env, input.wordId);
  if (!row) {
    throw new HttpError(404, '対象の単語が見つかりません。');
  }
  await assertBookReadAccess(env, user, row.book_id);

  if (input.assetType === WordHintAssetType.EXAMPLE) {
    if (!input.forceRefresh && row.example_sentence?.trim()) {
      await recordProductEventForUser(env, user, {
        eventName: 'word_hint_example_cache_hit',
        subjectType: 'word',
        subjectId: row.id,
        status: 'CACHE_HIT',
        metadata: {
          bookId: row.book_id,
          forceRefresh: Boolean(input.forceRefresh),
        },
      });
      return toWordData(row);
    }

    try {
      const context = await generateMeteredGeminiSentence(env, user, {
        word: row.word,
        definition: row.definition,
        userLevel: user.english_level as any || undefined,
        sourceContext: row.source_context || undefined,
      });
      await persistWordExample(env, row.id, context.english, context.japanese);
      await recordProductEventForUser(env, user, {
        eventName: 'word_hint_example_generated',
        subjectType: 'word',
        subjectId: row.id,
        status: 'GENERATED',
        usedAi: true,
        estimatedCostMilliYen: AI_ACTION_ESTIMATES.generateGeminiSentence.estimatedCostMilliYen,
        metadata: {
          bookId: row.book_id,
          forceRefresh: Boolean(input.forceRefresh),
        },
      });
      return rereadWordData(env, row.id);
    } catch (error) {
      await recordProductEventForUser(env, user, {
        eventName: 'word_hint_example_failed',
        subjectType: 'word',
        subjectId: row.id,
        status: 'FAILED',
        usedAi: true,
        estimatedCostMilliYen: AI_ACTION_ESTIMATES.generateGeminiSentence.estimatedCostMilliYen,
        metadata: {
          bookId: row.book_id,
          forceRefresh: Boolean(input.forceRefresh),
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }

  if (!input.forceRefresh && row.example_image_key?.trim() && row.example_image_generated_at) {
    await recordProductEventForUser(env, user, {
      eventName: 'word_hint_image_cache_hit',
      subjectType: 'word',
      subjectId: row.id,
      status: 'CACHE_HIT',
      metadata: {
        bookId: row.book_id,
        forceRefresh: Boolean(input.forceRefresh),
      },
    });
    return toWordData(row);
  }

  try {
    const dataUrl = await generateMeteredWordImage(env, user, {
      word: row.word,
      definition: row.definition,
    });
    if (!dataUrl) {
      throw new HttpError(502, '画像生成に失敗しました。');
    }

    await persistWordImage(env, row.id, dataUrl);
    await recordProductEventForUser(env, user, {
      eventName: 'word_hint_image_generated',
      subjectType: 'word',
      subjectId: row.id,
      status: 'GENERATED',
      usedAi: true,
      estimatedCostMilliYen: AI_ACTION_ESTIMATES.generateWordImage.estimatedCostMilliYen,
      metadata: {
        bookId: row.book_id,
        forceRefresh: Boolean(input.forceRefresh),
      },
    });
    return rereadWordData(env, row.id);
  } catch (error) {
    await recordProductEventForUser(env, user, {
      eventName: 'word_hint_image_failed',
      subjectType: 'word',
      subjectId: row.id,
      status: 'FAILED',
      usedAi: true,
      estimatedCostMilliYen: AI_ACTION_ESTIMATES.generateWordImage.estimatedCostMilliYen,
      metadata: {
        bookId: row.book_id,
        forceRefresh: Boolean(input.forceRefresh),
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
};

export const handleGetWordHintImageResponse = async (
  env: AppEnv,
  user: DbUserRow,
  wordId: string,
): Promise<Response> => {
  if (!env.WRITING_ASSETS) {
    throw new HttpError(503, 'WRITING_ASSETS が設定されていません。');
  }

  const row = await readFirst<Pick<
    DbWordHintAssetRow,
    'id' | 'book_id' | 'example_image_key' | 'example_image_content_type' | 'example_image_generated_at'
  >>(env, 'SELECT id, book_id, example_image_key, example_image_content_type, example_image_generated_at FROM words WHERE id = ?', wordId);
  if (!row) {
    throw new HttpError(404, '対象の単語が見つかりません。');
  }
  await assertBookReadAccess(env, user, row.book_id);

  if (!row.example_image_key || !row.example_image_content_type) {
    throw new HttpError(404, '画像ヒントはまだ生成されていません。');
  }

  const object = await env.WRITING_ASSETS.get(row.example_image_key);
  if (!object) {
    throw new HttpError(404, '画像ヒントのキャッシュが見つかりません。');
  }

  return new Response(object.body ?? await object.arrayBuffer(), {
    headers: {
      'Content-Type': row.example_image_content_type,
      'Cache-Control': 'private, max-age=3600',
      'X-Word-Hint-Image-Url': buildWordHintImageUrl(wordId, row.example_image_generated_at),
    },
  });
};

export const runWordHintAuditSweep = async (
  env: AppEnv,
  options?: {
    limit?: number;
    staleAfterHours?: number;
  },
): Promise<WordHintAuditSweepResult> => {
  const limit = Math.max(1, Math.min(50, Math.trunc(options?.limit ?? DEFAULT_AUDIT_LIMIT)));
  const staleAfterHours = Math.max(24, Math.min(24 * 30, Math.trunc(options?.staleAfterHours ?? DEFAULT_AUDIT_STALE_AFTER_HOURS)));
  const cutoffMs = Date.now() - (staleAfterHours * 60 * 60 * 1000);

  const candidates = await readAll<DbWordHintAssetRow>(
    env,
    `SELECT w.*, b.source_context
     FROM words w
     JOIN books b ON b.id = w.book_id
     WHERE (
       w.example_generated_at IS NOT NULL
       AND w.example_sentence IS NOT NULL
       AND TRIM(w.example_sentence) != ''
     ) OR (
       w.example_image_generated_at IS NOT NULL
       AND w.example_image_key IS NOT NULL
       AND TRIM(w.example_image_key) != ''
       AND w.example_image_content_type IS NOT NULL
       AND TRIM(w.example_image_content_type) != ''
     )
     ORDER BY MIN(
       CASE
         WHEN w.example_generated_at IS NOT NULL
           AND w.example_sentence IS NOT NULL
           AND TRIM(w.example_sentence) != ''
         THEN COALESCE(w.example_audited_at, w.example_generated_at)
         ELSE 9223372036854775807
       END,
       CASE
         WHEN w.example_image_generated_at IS NOT NULL
           AND w.example_image_key IS NOT NULL
           AND TRIM(w.example_image_key) != ''
           AND w.example_image_content_type IS NOT NULL
           AND TRIM(w.example_image_content_type) != ''
         THEN COALESCE(w.example_image_audited_at, w.example_image_generated_at)
         ELSE 9223372036854775807
       END
     ) ASC
     LIMIT ?`,
    limit * 4,
  );

  const summary: WordHintAuditSweepResult = {
    limit,
    staleAfterHours,
    auditedCount: 0,
    exampleAudits: 0,
    imageAudits: 0,
    approvedCount: 0,
    reviewRequiredCount: 0,
    failedCount: 0,
  };

  for (const row of candidates) {
    if (summary.auditedCount >= limit) break;

    if (isExampleAuditDue(row, cutoffMs) && summary.auditedCount < limit) {
      try {
        const decision = await auditExampleSentence(env, row);
        await markExampleAuditResult(env, row.id, decision.status, decision.reason);
        summary.auditedCount += 1;
        summary.exampleAudits += 1;
        if (decision.status === GeneratedAssetAuditStatus.APPROVED) {
          summary.approvedCount += 1;
        } else {
          summary.reviewRequiredCount += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || 'Unknown example audit failure');
        await markExampleAuditResult(env, row.id, GeneratedAssetAuditStatus.FAILED, message);
        summary.auditedCount += 1;
        summary.exampleAudits += 1;
        summary.failedCount += 1;
      }
    }

    if (isImageAuditDue(row, cutoffMs) && summary.auditedCount < limit) {
      try {
        const decision = await auditExampleImage(env, row);
        await markImageAuditResult(env, row.id, decision.status, decision.reason);
        summary.auditedCount += 1;
        summary.imageAudits += 1;
        if (decision.status === GeneratedAssetAuditStatus.APPROVED) {
          summary.approvedCount += 1;
        } else {
          summary.reviewRequiredCount += 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error || 'Unknown image audit failure');
        await markImageAuditResult(env, row.id, GeneratedAssetAuditStatus.FAILED, message);
        summary.auditedCount += 1;
        summary.imageAudits += 1;
        summary.failedCount += 1;
      }
    }
  }

  return summary;
};
