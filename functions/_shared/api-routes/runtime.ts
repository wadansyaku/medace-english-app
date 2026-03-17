import { json, noContent } from '../http';
import type { AppEnv, DbUserRow } from '../types';

export type ApiLogUser = Pick<DbUserRow, 'id' | 'role' | 'organization_id' | 'organization_role'> | null;

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
