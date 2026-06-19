import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

import dashboardService from '../services/dashboard';
import learningService from '../services/learning';
import sessionService from '../services/session';
import { sessionStorage, storage } from '../services/storage';
import workspaceService from '../services/workspace';

const readText = (path: string): string => readFileSync(path, 'utf8');

describe('service adapters', () => {
  it('exposes session operations through a dedicated adapter boundary', () => {
    expect(sessionService).not.toBe(sessionStorage);
    expect(typeof sessionService.getSession).toBe('function');
    expect(typeof sessionService.login).toBe('function');
    expect(typeof sessionService.authenticate).toBe('function');
  });

  it('exposes dashboard operations through a dedicated adapter boundary', () => {
    expect(dashboardService).not.toBe(storage);
    expect(typeof dashboardService.getDashboardSnapshot).toBe('function');
    expect(typeof dashboardService.batchImportWords).toBe('function');
    expect(typeof dashboardService.resetAllData).toBe('function');
  });

  it('exposes learning operations through a dedicated adapter boundary', () => {
    expect(learningService).not.toBe(storage);
    expect(typeof learningService.getBookSession).toBe('function');
    expect(typeof learningService.recordQuizAttempt).toBe('function');
    expect(typeof learningService.saveSRSHistory).toBe('function');
  });

  it('exposes workspace operations through a dedicated adapter boundary', () => {
    expect(typeof workspaceService.getAllStudentsProgress).toBe('function');
    expect(typeof workspaceService.getWeeklyMissionBoard).toBe('function');
    expect(typeof workspaceService.updateMissionProgress).toBe('function');
  });

  it('keeps local catalog IndexedDB implementation out of the storage facade body', () => {
    const storageSource = readText('services/storage.ts');
    const catalogSource = readText('services/storage/catalog-local.ts');

    expect(storageSource).toContain("from './storage/catalog-local'");
    expect(storageSource).toContain('return batchImportWordsLocal(this.getLocalCatalogStorageContext(), request, onProgress);');
    expect(storageSource).toContain('return generateWordHintAssetLocal(this.getLocalCatalogStorageContext(), payload);');
    expect(storageSource).not.toContain('normalizeCatalogImportRows(request)');
    expect(storageSource).not.toContain('createLocalExampleHint(');
    expect(catalogSource).toContain('normalizeCatalogImportRows(request)');
    expect(catalogSource).toContain('createLocalExampleHint(');
  });

  it('keeps local learning plan IndexedDB implementation out of the storage facade body', () => {
    const storageSource = readText('services/storage.ts');
    const learningPlanSource = readText('services/storage/learning-plan-local.ts');

    expect(storageSource).toContain("from './storage/learning-plan-local'");
    expect(storageSource).toContain('return saveLearningPlanLocal(this.getLocalLearningPlanStorageContext(), plan);');
    expect(storageSource).toContain('return getLearningPreferenceLocal(this.getLocalLearningPlanStorageContext(), uid);');
    expect(storageSource).not.toContain('defaultLearningPreference(uid)');
    expect(storageSource).not.toContain('store.get(uid);');
    expect(learningPlanSource).toContain('defaultLearningPreference(uid)');
    expect(learningPlanSource).toContain('store.get(uid);');
  });
});
