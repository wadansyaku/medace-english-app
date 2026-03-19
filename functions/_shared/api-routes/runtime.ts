import { json, noContent } from '../http';
import getServerRuntimeFlags from '../runtime';
import type { AppEnv, DbUserRow } from '../types';

export type ApiLogUser = Pick<DbUserRow, 'id' | 'role' | 'organization_id' | 'organization_role'> | null;
export type ApiDeploymentLabel = 'local' | 'preview' | 'production';

export interface ApiRequestLogContext {
  requestId: string;
  pathname: string;
  method: string;
  deployment: ApiDeploymentLabel;
  deploymentSha: string | null;
}

export interface ApiRouteContext {
  env: AppEnv;
  request: Request;
  pathname: string;
}

export interface ApiRouteResult {
  response: Response;
  logUser?: ApiLogUser;
}

export interface ApiRouteDefinition {
  matches: (context: ApiRouteContext) => boolean;
  handle: (context: ApiRouteContext) => Promise<ApiRouteResult>;
}

export const resolveApiDeploymentLabel = (request: Request, env: AppEnv): ApiDeploymentLabel => {
  const deployment = getServerRuntimeFlags(request, env).deployment;
  if (deployment.isLocalhost) return 'local';
  if (deployment.isPagesPreviewHost) return 'preview';
  return 'production';
};

export const resolveApiRequestId = (request: Request): string => (
  request.headers.get('cf-ray')
  || request.headers.get('x-request-id')
  || crypto.randomUUID()
);

export const createApiRequestLogContext = (
  request: Request,
  env: AppEnv,
  pathname: string,
): ApiRequestLogContext => ({
  requestId: resolveApiRequestId(request),
  pathname: pathname || '/',
  method: request.method,
  deployment: resolveApiDeploymentLabel(request, env),
  deploymentSha: env.DEPLOYMENT_SHA || null,
});

export const createJsonResponse = (data: unknown, init: ResponseInit = {}): Response => {
  if (data === null || data === undefined) {
    return noContent(init);
  }

  return json(data, init);
};

export const isEnumValue = <TEnum extends Record<string, string>>(
  enumObject: TEnum,
  value: unknown,
): value is TEnum[keyof TEnum] => (
  typeof value === 'string'
  && Object.values(enumObject).includes(value as TEnum[keyof TEnum])
);
