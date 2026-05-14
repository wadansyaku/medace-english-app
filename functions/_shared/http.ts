export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const json = (data: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(JSON.stringify(data), { ...init, headers });
};

export const noContent = (init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  if (!headers.has('Cache-Control')) {
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(null, { ...init, status: init.status || 204, headers });
};

export const DEFAULT_JSON_BODY_LIMIT_BYTES = 4 * 1024 * 1024;

const getUtf8ByteLength = (value: string): number => new TextEncoder().encode(value).byteLength;

export const readJson = async <T>(
  request: Request,
  options: { maxBytes?: number } = {},
): Promise<T> => {
  const maxBytes = options.maxBytes ?? DEFAULT_JSON_BODY_LIMIT_BYTES;
  const contentLength = request.headers.get('Content-Length');
  if (contentLength) {
    const parsedLength = Number(contentLength);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      throw new HttpError(413, 'リクエストJSONのサイズが上限を超えています。');
    }
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    throw new HttpError(400, 'リクエストJSONの解析に失敗しました。');
  }

  if (getUtf8ByteLength(rawBody) > maxBytes) {
    throw new HttpError(413, 'リクエストJSONのサイズが上限を超えています。');
  }

  try {
    return JSON.parse(rawBody) as T;
  } catch {
    throw new HttpError(400, 'リクエストJSONの解析に失敗しました。');
  }
};

export const handleError = (error: unknown): Response => {
  if (error instanceof HttpError) {
    return json({ error: error.message, message: error.message }, { status: error.status });
  }

  console.error(error);
  return json({ error: 'サーバーエラーが発生しました。', message: 'サーバーエラーが発生しました。' }, { status: 500 });
};
