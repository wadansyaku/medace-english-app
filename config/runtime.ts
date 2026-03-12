import { resolveRuntimeFlags, type RuntimeFlags } from '../shared/runtimeFlags';

const fallbackHostname = 'localhost';

export const getClientRuntimeFlags = (): RuntimeFlags => {
  const hostname = typeof window === 'undefined' ? fallbackHostname : window.location.hostname;

  return resolveRuntimeFlags({
    hostname,
    env: {
      enableAdminDemo: import.meta.env.VITE_ENABLE_ADMIN_DEMO,
      enablePublicBusinessDemo: import.meta.env.VITE_ENABLE_PUBLIC_BUSINESS_DEMO,
      appOnlineOnly: import.meta.env.VITE_APP_ONLINE_ONLY,
      enableDestructiveAdminActions: import.meta.env.VITE_ENABLE_DESTRUCTIVE_ADMIN_ACTIONS,
    },
  });
};

export default getClientRuntimeFlags;
