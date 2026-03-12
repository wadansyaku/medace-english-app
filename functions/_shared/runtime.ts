import { resolveRuntimeFlags, type RuntimeFlags } from '../../shared/runtimeFlags';
import type { AppEnv } from './types';

export const getServerRuntimeFlags = (request: Request, env: AppEnv): RuntimeFlags => {
  const hostname = new URL(request.url).hostname;

  return resolveRuntimeFlags({
    hostname,
    env: {
      enableAdminDemo: env.ENABLE_ADMIN_DEMO,
      enablePublicBusinessDemo: env.ENABLE_PUBLIC_BUSINESS_DEMO,
      appOnlineOnly: env.APP_ONLINE_ONLY,
      enableDestructiveAdminActions: env.ENABLE_DESTRUCTIVE_ADMIN_ACTIONS,
    },
  });
};

export default getServerRuntimeFlags;
