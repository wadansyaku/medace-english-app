export type StorageMode = 'cloudflare' | 'idb';

export type StorageCapabilityProvider = StorageMode | 'unavailable';

export type StorageDomain =
  | 'session'
  | 'catalog'
  | 'learning'
  | 'dashboard'
  | 'organization'
  | 'missions'
  | 'commercial'
  | 'announcements'
  | 'writing'
  | 'admin';

export interface StorageDomainCapability {
  available: boolean;
  provider: StorageCapabilityProvider;
  usesMockData: boolean;
}

export type StorageCapabilityMap = Record<StorageDomain, StorageDomainCapability>;

export interface StorageModeSummary {
  mode: StorageMode;
  isLocalMockData: boolean;
  capabilities: StorageCapabilityMap;
}

export const resolveStorageMode = (value: string | undefined): StorageModeSummary => {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'idb') {
    return {
      mode: 'idb',
      isLocalMockData: true,
      capabilities: {
        session: { available: true, provider: 'idb', usesMockData: false },
        catalog: { available: true, provider: 'idb', usesMockData: true },
        learning: { available: true, provider: 'idb', usesMockData: true },
        dashboard: { available: true, provider: 'idb', usesMockData: true },
        organization: { available: false, provider: 'unavailable', usesMockData: false },
        missions: { available: false, provider: 'unavailable', usesMockData: false },
        commercial: { available: false, provider: 'unavailable', usesMockData: false },
        announcements: { available: false, provider: 'unavailable', usesMockData: true },
        writing: { available: false, provider: 'unavailable', usesMockData: false },
        admin: { available: true, provider: 'idb', usesMockData: true },
      },
    };
  }

  return {
    mode: 'cloudflare',
    isLocalMockData: false,
    capabilities: {
      session: { available: true, provider: 'cloudflare', usesMockData: false },
      catalog: { available: true, provider: 'cloudflare', usesMockData: false },
      learning: { available: true, provider: 'cloudflare', usesMockData: false },
      dashboard: { available: true, provider: 'cloudflare', usesMockData: false },
      organization: { available: true, provider: 'cloudflare', usesMockData: false },
      missions: { available: true, provider: 'cloudflare', usesMockData: false },
      commercial: { available: true, provider: 'cloudflare', usesMockData: false },
      announcements: { available: true, provider: 'cloudflare', usesMockData: false },
      writing: { available: true, provider: 'cloudflare', usesMockData: false },
      admin: { available: true, provider: 'cloudflare', usesMockData: false },
    },
  };
};

export default resolveStorageMode;
