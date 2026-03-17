import type { StorageAction, StorageActionRequest, StoragePayload, StorageResponse } from '../../contracts/storage';
import type { UserRole } from '../../types';
import type getServerRuntimeFlags from './runtime';
import type { AppEnv, DbUserRow } from './types';

export interface StorageActionContext {
  env: AppEnv;
  user: DbUserRow;
  request: Request;
  runtimeFlags: ReturnType<typeof getServerRuntimeFlags>;
}

export interface StorageActionDefinition<TAction extends StorageAction> {
  parse: (payload: unknown) => StoragePayload<TAction>;
  execute: (context: StorageActionContext, payload: StoragePayload<TAction>) => Promise<StorageResponse<TAction>>;
  roles?: UserRole[];
  requiresDestructiveAdminFlag?: boolean;
}

export type StorageActionDefinitionMap = {
  [TAction in StorageAction]: StorageActionDefinition<TAction>;
};

export const defineStorageAction = <TAction extends StorageAction>(
  definition: StorageActionDefinition<TAction>,
): StorageActionDefinition<TAction> => definition;

export const readRawPayload = <TAction extends StorageAction>(
  body: StorageActionRequest<TAction> | undefined,
): unknown => {
  if (!body || typeof body !== 'object') {
    return undefined;
  }

  if ('payload' in body) {
    return body.payload;
  }

  return undefined;
};
