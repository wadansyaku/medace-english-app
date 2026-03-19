import { describe, expect, it } from 'vitest';

import { STORAGE_ACTIONS } from '../contracts/storage';
import {
  resolveStorageActionDefinition,
  storageActionAliases,
  storageActionCompatibilityDefinitions,
  storageActionDomainGroups,
} from '../functions/_shared/storage-action-domains';

const summarizeStorageActionContracts = () => {
  const domainByAction = new Map<string, string>();
  for (const group of storageActionDomainGroups) {
    for (const action of Object.keys(group.definitions)) {
      domainByAction.set(action, group.name);
    }
  }

  return STORAGE_ACTIONS.map((action) => {
    const definition = storageActionCompatibilityDefinitions[action];
    return {
      action,
      alias: storageActionAliases[action],
      domain: domainByAction.get(action) ?? null,
      roles: definition.roles ?? null,
      requiresDestructiveAdminFlag: Boolean(definition.requiresDestructiveAdminFlag),
    };
  });
};

describe('storage action contract', () => {
  it('keeps every public storage action resolvable through the compatibility layer', () => {
    expect(new Set(STORAGE_ACTIONS).size).toBe(STORAGE_ACTIONS.length);

    for (const action of STORAGE_ACTIONS) {
      expect(storageActionAliases[action]).toBe(action);
      expect(resolveStorageActionDefinition(action)).toBe(storageActionCompatibilityDefinitions[action]);
    }
  });

  it('keeps domain groups covering the full public storage surface exactly once', () => {
    const groupedActions = storageActionDomainGroups.flatMap((group) => Object.keys(group.definitions));

    expect(groupedActions).toHaveLength(STORAGE_ACTIONS.length);
    expect(new Set(groupedActions).size).toBe(STORAGE_ACTIONS.length);
    expect([...groupedActions].sort()).toEqual([...STORAGE_ACTIONS].sort());
  });

  it('matches the storage action contract snapshot', () => {
    expect(summarizeStorageActionContracts()).toMatchSnapshot();
  });
});
