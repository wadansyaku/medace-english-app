import type { StorageAction, StorageActionRequest } from '../../contracts/storage';
import { HttpError } from './http';
import { requireRole } from './auth';
import getServerRuntimeFlags from './runtime';
import { resolveStorageActionDefinition } from './storage-action-domains';
import { readRawPayload } from './storage-action-runtime';
import type { AppEnv, DbUserRow } from './types';

export const handleStorageAction = async (
  env: AppEnv,
  user: DbUserRow,
  body: StorageActionRequest<StorageAction>,
  request: Request,
): Promise<unknown> => {
  if (!body || typeof body !== 'object' || !('action' in body) || typeof body.action !== 'string') {
    throw new HttpError(400, 'storage action が指定されていません。');
  }

  const action = body.action as StorageAction;
  const definition = resolveStorageActionDefinition(action);
  if (!definition) {
    throw new HttpError(404, `未対応のストレージ操作です: ${String(action)}`);
  }

  const runtimeFlags = getServerRuntimeFlags(request, env);
  if (definition.roles) {
    requireRole(user, definition.roles);
  }
  if (definition.requiresDestructiveAdminFlag && !runtimeFlags.enableDestructiveAdminActions) {
    throw new HttpError(403, '本番環境ではデータ初期化を API から実行できません。preview またはローカル検証環境に限定してください。');
  }

  const payload = definition.parse(readRawPayload(body));
  return definition.execute({
    env,
    user,
    request,
    runtimeFlags,
  }, payload as never);
};
