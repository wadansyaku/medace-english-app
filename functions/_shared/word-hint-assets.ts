import { GeneratedAssetAuditStatus, type WordData, type WordHintAssetType } from '../../types';
import { isGeneratedAssetVisibleToLearner } from '../../shared/wordHintAssets';
import { HttpError } from './http';
import { assertBookReadAccess, buildWordHintImageUrl, readFirst, type DbWordRow } from './storage-support';
import type { AppEnv, DbUserRow } from './types';

interface DbWordHintAssetRow extends DbWordRow {
  source_context: string | null;
}

interface GenerateWordHintAssetInput {
  wordId: string;
  assetType: WordHintAssetType;
  forceRefresh?: boolean;
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

// Keep the legacy action callable only to return a clear retirement response.
// Reading saved examples and images never enters a generation path.
export const handleGenerateWordHintAsset = async (
  _env: AppEnv,
  _user: DbUserRow,
  _input: GenerateWordHintAssetInput,
): Promise<WordData> => {
  throw new HttpError(410, '学習中の例文・画像生成は終了しました。保存済みの内容をご利用ください。');
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
    | 'id'
    | 'book_id'
    | 'example_image_key'
    | 'example_image_content_type'
    | 'example_image_generated_at'
    | 'example_image_audit_status'
    | 'example_image_audited_at'
  >>(
    env,
    `SELECT id,
            book_id,
            example_image_key,
            example_image_content_type,
            example_image_generated_at,
            example_image_audit_status,
            example_image_audited_at
     FROM words
     WHERE id = ?`,
    wordId,
  );
  if (!row) {
    throw new HttpError(404, '対象の単語が見つかりません。');
  }
  await assertBookReadAccess(env, user, row.book_id);

  if (!row.example_image_key || !row.example_image_content_type) {
    throw new HttpError(404, '画像ヒントはまだ保存されていません。');
  }

  if (!row.example_image_generated_at || !isGeneratedAssetVisibleToLearner({
    generatedAt: row.example_image_generated_at,
    auditedAt: row.example_image_audited_at,
    auditStatus: (row.example_image_audit_status as GeneratedAssetAuditStatus | null) || null,
  })) {
    throw new HttpError(404, '画像ヒントは内容確認中です。');
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

// The scheduled paid audit operation is retired. Existing audit records remain intact.
export const runWordHintAuditSweep = async (
  _env: AppEnv,
  _options?: { limit?: number; staleAfterHours?: number },
): Promise<WordHintAuditSweepResult> => {
  throw new HttpError(410, '単語ヒントのAI自動監査は終了しました。保存済みの監査結果は保持されています。');
};
