import { describe, expect, it } from 'vitest';

import dashboardService from '../services/dashboard';
import learningService from '../services/learning';
import sessionService from '../services/session';
import { sessionStorage, storage } from '../services/storage';
import workspaceService from '../services/workspace';

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
});
