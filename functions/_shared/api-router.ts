import { handleError, HttpError } from './http';
import { apiRoutes } from './api-routes';
import type { ApiLogUser } from './api-routes/runtime';
import { createApiRequestLogContext } from './api-routes/runtime';
import getServerRuntimeFlags from './runtime';
import type { AppEnv } from './types';

const finalizeApiResponse = (
  request: Request,
  env: AppEnv,
  response: Response,
  logContext: ReturnType<typeof createApiRequestLogContext>,
): Response => {
  const headers = new Headers(response.headers);
  if (getServerRuntimeFlags(request, env).deployment.isPagesPreviewHost) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  if (env.DEPLOYMENT_SHA) {
    headers.set('X-Deployment-Sha', env.DEPLOYMENT_SHA);
  }
  headers.set('X-Request-Id', logContext.requestId);

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const logApiResponse = (
  request: Request,
  logContext: ReturnType<typeof createApiRequestLogContext>,
  response: Response,
  user: ApiLogUser,
  error?: unknown,
) => {
  const logPayload = {
    type: 'api_request',
    method: logContext.method,
    pathname: logContext.pathname,
    hostname: new URL(request.url).hostname,
    status: response.status,
    deployment: logContext.deployment,
    deploymentSha: logContext.deploymentSha,
    requestId: logContext.requestId,
    userId: user?.id || null,
    role: user?.role || null,
    organizationId: user?.organization_id || null,
    organizationRole: user?.organization_role || null,
    error: error instanceof Error ? error.message : null,
  };

  const sink = response.status >= 500 ? console.error : console.log;
  sink(JSON.stringify(logPayload));
};

export const onRequest = async (context: { request: Request; env: AppEnv }): Promise<Response> => {
  const { request, env } = context;
  const pathname = new URL(request.url).pathname.replace(/^\/api\/?/, '');
  const logContext = createApiRequestLogContext(request, env, pathname);
  let logUser: ApiLogUser = null;

  try {
    const route = apiRoutes.find((candidate) => candidate.matches({ env, request, pathname }));
    if (!route) {
      throw new HttpError(404, 'APIエンドポイントが見つかりません。');
    }

    const result = await route.handle({ env, request, pathname });
    logUser = result.logUser ?? null;

    const response = finalizeApiResponse(request, env, result.response, logContext);
    logApiResponse(request, logContext, response, logUser);
    return response;
  } catch (error) {
    const response = finalizeApiResponse(request, env, handleError(error), logContext);
    logApiResponse(request, logContext, response, logUser, error);
    return response;
  }
};
