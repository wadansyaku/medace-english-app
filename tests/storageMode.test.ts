import { describe, expect, it } from 'vitest';

import { resolveStorageMode } from '../shared/storageMode';

describe('resolveStorageMode', () => {
  it('treats idb as local mock data mode', () => {
    expect(resolveStorageMode('idb')).toEqual({
      mode: 'idb',
      isLocalMockData: true,
    });
  });

  it('falls back to cloudflare mode for unset or unknown values', () => {
    expect(resolveStorageMode(undefined)).toEqual({
      mode: 'cloudflare',
      isLocalMockData: false,
    });
    expect(resolveStorageMode('remote')).toEqual({
      mode: 'cloudflare',
      isLocalMockData: false,
    });
  });
});
