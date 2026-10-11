import { captureWorkspaceRequest, isWorkspaceRequestCurrent, releaseWorkspaceRequest } from './workspaceContext';

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number, readonly details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
};

const isJsonResponse = (response: Response): boolean => {
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json');
};

const parseError = async (response: Response): Promise<never> => {
  let message = `Request failed with status ${response.status}`;
  let details: unknown;

  try {
    if (isJsonResponse(response)) {
      const payload = await response.json() as { error?: string; message?: string };
      details = payload;
      message = payload.message || payload.error || message;
    } else {
      const text = await response.text();
      if (text) {
        message = text.trim().startsWith('<!DOCTYPE')
          ? 'API が HTML を返しました。`wrangler pages dev dist` を使って Functions 付きで起動してください。'
          : text;
      }
    }
  } catch {
    const text = await response.text();
    if (text) message = text;
  }

  throw new ApiError(message, response.status, details);
};

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const normalizedMethod = (init?.method || 'GET').toUpperCase();
  const context = captureWorkspaceRequest();
  const abortFromCaller = () => context.controller.abort();
  if (init?.signal?.aborted) abortFromCaller();
  init?.signal?.addEventListener('abort', abortFromCaller, { once: true });
  try {
    const response = await fetch(path, {
      credentials: 'include',
      cache: init?.cache ?? (normalizedMethod === 'GET' ? 'no-store' : undefined),
      ...init,
      signal: context.controller.signal,
      headers: {
        ...DEFAULT_HEADERS,
        ...context.headers,
        ...(init?.headers || {}),
      },
    });

    if (!isWorkspaceRequestCurrent(context)) throw new DOMException('業務画面が切り替わりました。', 'AbortError');

    if (!response.ok) {
      return await parseError(response);
    }

    if (response.status === 204) {
      return undefined as T;
    }

    if (!isJsonResponse(response)) {
      const text = await response.text();
      throw new ApiError(
        text.trim().startsWith('<!DOCTYPE')
          ? 'API が HTML を返しました。`vite preview` ではなく `wrangler pages dev dist` を利用してください。'
          : 'API が JSON 以外のレスポンスを返しました。',
        response.status,
      );
    }

    const result = await response.json() as T;
    if (!isWorkspaceRequestCurrent(context)) throw new DOMException('業務画面が切り替わりました。', 'AbortError');
    return result;
  } catch (error) {
    if (!isWorkspaceRequestCurrent(context)) throw new DOMException('業務画面が切り替わりました。', 'AbortError');
    throw error;
  } finally {
    init?.signal?.removeEventListener('abort', abortFromCaller);
    releaseWorkspaceRequest(context);
  }
};

export const apiGet = <T>(path: string): Promise<T> => request<T>(path, { method: 'GET' });

export const apiPost = <T>(path: string, body?: unknown, options?: Pick<RequestInit, 'signal'>): Promise<T> => request<T>(path, {
  ...options,
  method: 'POST',
  body: body === undefined ? undefined : JSON.stringify(body),
});

export const apiDelete = <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' });

export { ApiError };
