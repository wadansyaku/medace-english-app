import { HttpError } from '../http';
import { assertSameOriginMutation } from '../request-guards';
import { handleProductSupport, PRODUCT_SUPPORT_BODY_LIMIT_BYTES, resolveProductSupportActor } from '../product-support-actions';
import { createJsonResponse, type ApiRouteDefinition } from './runtime';

export const readProductSupportBody = async (request: Request): Promise<unknown> => {
  if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) throw new HttpError(415, 'JSONの質問を送信してください。');
  const length = Number(request.headers.get('Content-Length'));
  if (Number.isFinite(length) && length > PRODUCT_SUPPORT_BODY_LIMIT_BYTES) throw new HttpError(413, '質問のサイズが上限を超えています。');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, '質問の形式を確認してください。');
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      total += value.byteLength;
      if (total > PRODUCT_SUPPORT_BODY_LIMIT_BYTES) { await reader.cancel(); throw new HttpError(413, '質問のサイズが上限を超えています。'); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(total); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, '質問の形式を確認してください。');
  } finally { reader.releaseLock(); }
};
export const productSupportRoutes: ApiRouteDefinition[] = [{
  matches: ({ pathname, request }) => pathname === 'product-support' && request.method === 'POST',
  handle: async ({ env, request }) => {
    assertSameOriginMutation(request);
    // The existing guard also allows same-site/none provenance. This public
    // endpoint accepts only exact browser origin/referrer or same-origin.
    const origin = request.headers.get('Origin'); const referer = request.headers.get('Referer');
    const expected = new URL(request.url).origin;
    if (!(origin === expected || !origin && referer && new URL(referer).origin === expected
      || !origin && !referer && request.headers.get('Sec-Fetch-Site') === 'same-origin')) {
      throw new HttpError(403, '同じサイトの画面から質問してください。');
    }
    const body = await readProductSupportBody(request);
    const actor = await resolveProductSupportActor(env, request);
    return { logUser: null, response: createJsonResponse(await handleProductSupport(env, actor, body)) };
  },
}];
