import { describe, expect, it } from 'vitest';

import { resolveStorageMode } from '../shared/storageMode';

describe('resolveStorageMode', () => {
  it('treats idb as local mock data mode', () => {
    expect(resolveStorageMode('idb')).toEqual(expect.objectContaining({
      mode: 'idb',
      isLocalMockData: true,
      capabilities: expect.objectContaining({
        dashboard: {
          available: true,
          provider: 'idb',
          usesMockData: true,
        },
        writing: {
          available: false,
          provider: 'unavailable',
          usesMockData: false,
        },
        organization: {
          available: false,
          provider: 'unavailable',
          usesMockData: true,
        },
        missions: {
          available: false,
          provider: 'unavailable',
          usesMockData: true,
        },
        commercial: {
          available: false,
          provider: 'unavailable',
          usesMockData: true,
        },
        announcements: {
          available: false,
          provider: 'unavailable',
          usesMockData: true,
        },
      }),
    }));
  });

  it('falls back to cloudflare mode for unset or unknown values', () => {
    expect(resolveStorageMode(undefined)).toEqual(expect.objectContaining({
      mode: 'cloudflare',
      isLocalMockData: false,
      capabilities: expect.objectContaining({
        dashboard: {
          available: true,
          provider: 'cloudflare',
          usesMockData: false,
        },
      }),
    }));
    expect(resolveStorageMode('remote')).toEqual(expect.objectContaining({
      mode: 'cloudflare',
      isLocalMockData: false,
      capabilities: expect.objectContaining({
        writing: {
          available: true,
          provider: 'cloudflare',
          usesMockData: false,
        },
      }),
    }));
  });
});
