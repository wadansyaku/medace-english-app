export type StorageMode = 'cloudflare' | 'idb';

export interface StorageModeSummary {
  mode: StorageMode;
  isLocalMockData: boolean;
}

export const resolveStorageMode = (value: string | undefined): StorageModeSummary => {
  const normalized = value?.trim().toLowerCase();

  if (normalized === 'idb') {
    return {
      mode: 'idb',
      isLocalMockData: true,
    };
  }

  return {
    mode: 'cloudflare',
    isLocalMockData: false,
  };
};

export default resolveStorageMode;
