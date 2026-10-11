import { describe, expect, it } from 'vitest';

import { resolveRuntimeFlags } from '../shared/runtimeFlags';

describe('resolveRuntimeFlags', () => {
  it.each(['medace-english-app.pages.dev', 'study.example.invalid'])('defaults business demos off on production %s while leaving other flags unchanged', (hostname) => {
    const flags = resolveRuntimeFlags({
      hostname,
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

  it.each(['localhost', '127.0.0.1', '[::1]'])('retains business demos on local host %s', (hostname) => {
    expect(resolveRuntimeFlags({ hostname }).enablePublicBusinessDemo).toBe(true);
  });

  it('retains an explicit true production business-demo override independently of admin demo', () => {
    const flags = resolveRuntimeFlags({ hostname: 'medace-english-app.pages.dev', env: { enablePublicBusinessDemo: 'true' } });
    expect(flags.enablePublicBusinessDemo).toBe(true);
    expect(flags.enableAdminDemo).toBe(false);
  });

  it('uses the production-safe default for an unrecognized business-demo flag', () => {
    expect(resolveRuntimeFlags({ hostname: 'study.example.invalid', env: { enablePublicBusinessDemo: 'unrecognized' } }).enablePublicBusinessDemo).toBe(false);
  });

  it('honors explicit overrides', () => {
    const flags = resolveRuntimeFlags({
      hostname: 'medace-english-app.pages.dev',
      env: {
        enableAdminDemo: 'false',
        enablePublicBusinessDemo: '0',
        enableDestructiveAdminActions: 'yes',
        appOnlineOnly: 'false',
      },
    });

    expect(flags.enableAdminDemo).toBe(false);
    expect(flags.enablePublicBusinessDemo).toBe(false);
    expect(flags.enableDestructiveAdminActions).toBe(true);
    expect(flags.appOnlineOnly).toBe(false);
  });
});
