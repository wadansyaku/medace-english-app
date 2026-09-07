import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WRITING_UPLOAD_MAX_BYTES } from '../shared/writingUploadPolicy';
import type { AppEnv, D1PreparedStatement } from '../functions/_shared/types';

const mocks = vi.hoisted(() => ({
  readSubmissionAssetRowByUploadToken: vi.fn(),
}));

vi.mock('../functions/_shared/writing-actions/repository', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/writing-actions/repository')>(
    '../functions/_shared/writing-actions/repository',
  );
  return {
    ...actual,
    readSubmissionAssetRowByUploadToken: mocks.readSubmissionAssetRowByUploadToken,
  };
});

import { handleWritingAssetUpload } from '../functions/_shared/writing-actions/mutations';

const assetRow = {
  id: 'asset-1',
  assignment_id: 'assignment-1',
  submission_id: null,
  attempt_no: 1,
  asset_order: 1,
  file_name: 'answer.png',
  mime_type: 'image/png',
  byte_size: 0,
  expected_byte_size: 4,
  expected_sha256_base64: null,
  r2_key: 'writing/asset-1.png',
  upload_token: 'token-1',
  upload_expires_at: Date.now() + 60_000,
  upload_consumed_at: null,
  uploaded_at: null,
  uploaded_etag: null,
  uploaded_sha256_base64: null,
};

const createDb = (options: { finalizeChanges?: number } = {}) => {
  const state = {
    reserved: false,
    uploaded: false,
  };
  const queries: string[] = [];
  const prepare = vi.fn((sql: string) => {
    queries.push(sql);
    const statement = {
      bind: (..._bindings: unknown[]) => statement,
      run: async () => {
        if (sql.includes('SET upload_consumed_at = ?, updated_at = ?')) {
          if (state.reserved || state.uploaded) return { success: true, meta: { changes: 0 } };
          state.reserved = true;
          return { success: true, meta: { changes: 1 } };
        }
        if (sql.includes('SET byte_size = ?, uploaded_at = ?')) {
          const changes = options.finalizeChanges ?? (state.reserved && !state.uploaded ? 1 : 0);
          if (changes === 1) state.uploaded = true;
          return { success: true, meta: { changes } };
        }
        if (sql.includes('SET upload_consumed_at = NULL')) {
          const changes = state.reserved && !state.uploaded ? 1 : 0;
          if (changes === 1) state.reserved = false;
          return { success: true, meta: { changes } };
        }
        return { success: true, meta: { changes: 0 } };
      },
    } as unknown as D1PreparedStatement;
    return statement;
  });
  return {
    db: { prepare, batch: vi.fn() },
    prepare,
    queries,
    state,
  };
};

const createRequest = (
  body: Uint8Array,
  headers: Record<string, string> = {},
) => new Request('https://example.test/api/writing/upload/token-1', {
  method: 'PUT',
  headers: {
    'Content-Type': 'image/png',
    ...headers,
  },
  body,
});

const createEnv = (
  db: ReturnType<typeof createDb>['db'],
  put = vi.fn(async () => ({ etag: 'etag-1' })),
): AppEnv => ({
  DB: db,
  WRITING_ASSETS: {
    put,
    get: vi.fn(),
    delete: vi.fn(),
  },
} as unknown as AppEnv);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readSubmissionAssetRowByUploadToken.mockResolvedValue({ ...assetRow });
});

describe('writing upload security boundaries', () => {
  it('rejects an oversized Content-Length before reserving the token or reading the body', async () => {
    const db = createDb();
    const put = vi.fn();
    const env = createEnv(db.db, put);

    await expect(handleWritingAssetUpload(
      env,
      'token-1',
      createRequest(new Uint8Array([1]), {
        'Content-Length': String(WRITING_UPLOAD_MAX_BYTES + 1),
      }),
    )).rejects.toMatchObject({ status: 413 });

    expect(db.prepare).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('bounds a chunked body by the reserved size, releases the token, and permits a valid retry', async () => {
    const db = createDb();
    const put = vi.fn(async () => ({ etag: 'etag-1' }));
    const env = createEnv(db.db, put);
    const oversizedRequest = createRequest(new Uint8Array([1, 2, 3, 4, 5]));
    expect(oversizedRequest.headers.get('Content-Length')).toBeNull();

    await expect(handleWritingAssetUpload(env, 'token-1', oversizedRequest)).rejects.toMatchObject({
      status: 413,
    });
    expect(db.state).toEqual({ reserved: false, uploaded: false });
    expect(put).not.toHaveBeenCalled();

    const response = await handleWritingAssetUpload(
      env,
      'token-1',
      createRequest(new Uint8Array([1, 2, 3, 4])),
    );
    expect(response.status).toBe(204);
    expect(db.state).toEqual({ reserved: true, uploaded: true });
    expect(put).toHaveBeenCalledTimes(1);
  });

  it('allows only one concurrent request to consume and finalize the same token', async () => {
    const db = createDb();
    let markPutStarted!: () => void;
    let finishPut!: () => void;
    const putStarted = new Promise<void>((resolve) => { markPutStarted = resolve; });
    const putGate = new Promise<void>((resolve) => { finishPut = resolve; });
    const put = vi.fn(async () => {
      markPutStarted();
      await putGate;
      return { etag: 'etag-1' };
    });
    const env = createEnv(db.db, put);

    const firstUpload = handleWritingAssetUpload(
      env,
      'token-1',
      createRequest(new Uint8Array([1, 2, 3, 4])),
    );
    await putStarted;

    await expect(handleWritingAssetUpload(
      env,
      'token-1',
      createRequest(new Uint8Array([1, 2, 3, 4])),
    )).rejects.toMatchObject({ status: 409 });
    finishPut();

    await expect(firstUpload).resolves.toMatchObject({ status: 204 });
    expect(put).toHaveBeenCalledTimes(1);
    expect(db.state).toEqual({ reserved: true, uploaded: true });
  });

  it('keeps a token consumed when the owning finalize CAS is lost', async () => {
    const db = createDb({ finalizeChanges: 0 });
    const env = createEnv(db.db);

    await expect(handleWritingAssetUpload(
      env,
      'token-1',
      createRequest(new Uint8Array([1, 2, 3, 4])),
    )).rejects.toMatchObject({ status: 409 });
    expect(db.state).toEqual({ reserved: true, uploaded: false });

    await expect(handleWritingAssetUpload(
      env,
      'token-1',
      createRequest(new Uint8Array([1, 2, 3, 4])),
    )).rejects.toMatchObject({ status: 409 });
  });
});
