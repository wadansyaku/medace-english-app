import { describe, expect, it } from 'vitest';

import { resolveRuntimeFlags } from '../shared/runtimeFlags';

describe('resolveRuntimeFlags', () => {
  it('locks down admin, business demo, destructive actions, and online-only blocking on production hosts by default', () => {
    const flags = resolveRuntimeFlags({
      hostname: 'medace-english-app.pages.dev',
    });

    expect(flags.enableAdminDemo).toBe(false);
    expect(flags.enablePublicBusinessDemo).toBe(false);
    expect(flags.enableDestructiveAdminActions).toBe(false);
    expect(flags.appOnlineOnly).toBe(false);
  });

  it('enables demos and destructive admin actions on preview hosts by default', () => {
    const flags = resolveRuntimeFlags({
      hostname: 'preview.medace-english-app.pages.dev',
    });

    expect(flags.enableAdminDemo).toBe(true);
    expect(flags.enablePublicBusinessDemo).toBe(true);
    expect(flags.enableDestructiveAdminActions).toBe(true);
  });

  it('honors explicit overrides', () => {
    const flags = resolveRuntimeFlags({
      hostname: 'medace-english-app.pages.dev',
      env: {
        enableAdminDemo: 'true',
        enablePublicBusinessDemo: '1',
        enableDestructiveAdminActions: 'yes',
        appOnlineOnly: 'false',
      },
    });

    expect(flags.enableAdminDemo).toBe(true);
    expect(flags.enablePublicBusinessDemo).toBe(true);
    expect(flags.enableDestructiveAdminActions).toBe(true);
    expect(flags.appOnlineOnly).toBe(false);
  });
});
