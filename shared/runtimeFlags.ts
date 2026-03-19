export interface RuntimeFlagInputs {
  hostname: string;
  env?: {
    enableAdminDemo?: string | boolean;
    enablePublicBusinessDemo?: string | boolean;
    appOnlineOnly?: string | boolean;
    enableDestructiveAdminActions?: string | boolean;
  };
}

export interface DeploymentContext {
  isLocalhost: boolean;
  isPagesDevHost: boolean;
  isPagesPreviewHost: boolean;
  isProductionLike: boolean;
}

export interface RuntimeFlags {
  deployment: DeploymentContext;
  enableAdminDemo: boolean;
  enablePublicBusinessDemo: boolean;
  appOnlineOnly: boolean;
  enableDestructiveAdminActions: boolean;
}

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enabled']);
const FALSE_VALUES = new Set(['0', 'false', 'no', 'off', 'disabled']);

export const getDeploymentContext = (hostname: string): DeploymentContext => {
  const normalizedHost = hostname.trim().toLowerCase();
  const isLocalhost =
    normalizedHost === 'localhost'
    || normalizedHost === '127.0.0.1'
    || normalizedHost === '[::1]';
  const isPagesDevHost = normalizedHost.endsWith('.pages.dev');
  const labelCount = normalizedHost.split('.').filter(Boolean).length;
  const isPagesPreviewHost = isPagesDevHost && labelCount > 3;

  return {
    isLocalhost,
    isPagesDevHost,
    isPagesPreviewHost,
    isProductionLike: !isLocalhost && !isPagesPreviewHost,
  };
};

export const parseBooleanFlag = (
  value: string | boolean | undefined,
  fallback: boolean,
): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return fallback;

  const normalized = value.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) return true;
  if (FALSE_VALUES.has(normalized)) return false;
  return fallback;
};

export const resolveRuntimeFlags = ({
  hostname,
  env = {},
}: RuntimeFlagInputs): RuntimeFlags => {
  const deployment = getDeploymentContext(hostname);

  return {
    deployment,
    enableAdminDemo: parseBooleanFlag(
      env.enableAdminDemo,
      !deployment.isProductionLike,
    ),
    enablePublicBusinessDemo: parseBooleanFlag(
      env.enablePublicBusinessDemo,
      true,
    ),
    appOnlineOnly: parseBooleanFlag(env.appOnlineOnly, false),
    enableDestructiveAdminActions: parseBooleanFlag(
      env.enableDestructiveAdminActions,
      !deployment.isProductionLike,
    ),
  };
};

export default resolveRuntimeFlags;
