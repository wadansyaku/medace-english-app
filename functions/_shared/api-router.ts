import { handleError, HttpError } from './http';
import { apiRoutes } from './api-routes';
import type { ApiLogUser } from './api-routes/runtime';
import getServerRuntimeFlags from './runtime';
import type { AppEnv } from './types';

const getDeploymentLabel = (request: Request, env: AppEnv) => {
  const deployment = getServerRuntimeFlags(request, env).deployment;
  if (deployment.isLocalhost) return 'local';
  if (deployment.isPagesPreviewHost) return 'preview';
  return 'production';
};

const finalizeApiResponse = (request: Request, env: AppEnv, response: Response): Response => {
  const headers = new Headers(response.headers);
  if (getServerRuntimeFlags(request, env).deployment.isPagesPreviewHost) {
    headers.set('X-Robots-Tag', 'noindex, nofollow');
  }
  if (env.DEPLOYMENT_SHA) {
    headers.set('X-Deployment-Sha', env.DEPLOYMENT_SHA);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

const logApiResponse = (
  request: Request,
  env: AppEnv,
  pathname: string,
  response: Response,
  user: ApiLogUser,
  error?: unknown,
) => {
  const logPayload = {
    type: 'api_request',
    method: request.method,
    pathname: pathname || '/',
    hostname: new URL(request.url).hostname,
    status: response.status,
    deployment: getDeploymentLabel(request, env),
    deploymentSha: env.DEPLOYMENT_SHA || null,
    requestId: request.headers.get('cf-ray') || crypto.randomUUID(),
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
  let pathname = '';
  let logUser: ApiLogUser = null;

  try {
    pathname = new URL(request.url).pathname.replace(/^\/api\/?/, '');
    const route = apiRoutes.find((candidate) => candidate.matches({ env, request, pathname }));
    if (!route) {
      throw new HttpError(404, 'APIエンドポイントが見つかりません。');
    }

    const result = await route.handle({ env, request, pathname });
    logUser = result.logUser ?? null;

    const response = finalizeApiResponse(request, env, result.response);
    logApiResponse(request, env, pathname, response, logUser);
    return response;
  } catch (error) {
    const response = finalizeApiResponse(request, env, handleError(error));
    logApiResponse(request, env, pathname, response, logUser, error);
    return response;
  }
};
