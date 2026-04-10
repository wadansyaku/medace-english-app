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

export const readJson = async <T>(request: Request): Promise<T> => {
  try {
    return await request.json() as T;
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
