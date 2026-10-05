import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole, SubscriptionPlan } from '../types';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';

const forbidden = vi.hoisted(() => ({ provider: vi.fn(), budget: vi.fn(), usage: vi.fn() }));
vi.mock('@google/genai', () => ({
  GoogleGenAI: class { constructor() { forbidden.provider(); throw new Error('Provider must not be instantiated'); } },
  Type: { ARRAY: 'ARRAY', BOOLEAN: 'BOOLEAN', NUMBER: 'NUMBER', OBJECT: 'OBJECT', STRING: 'STRING' },
}));
vi.mock('../functions/_shared/ai-metering', () => ({
  assertAiActionAllowed: vi.fn(), assertBudgetAvailable: forbidden.budget, recordAiUsageEvent: forbidden.usage,
}));
import { handleAiAction } from '../functions/_shared/ai-actions';

const user = (role = UserRole.STUDENT, plan = 'TOC_FREE') => ({ id: 'synthetic-owner', role, subscription_plan: plan }) as DbUserRow;
const planRequest = { action: 'generateLearningPlan', payload: {
  grade: 'JHS1', level: 'A1', availableBooks: [
    { id: 'my-existing-id', title: '合成My教材', wordCount: 20, isPriority: false, catalogSource: 'USER_GENERATED' },
  ],
} };
const followUpRequest = { action: 'generateInstructorFollowUp', payload: {
  instructorName: '合成講師', studentName: '合成生徒', riskLevel: 'DANGER', daysSinceActive: 3, totalLearned: 12,
  customInstruction: '一緒に復習しましょう。',
} };

describe('AI-free compatibility actions', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  it.each(Object.values(SubscriptionPlan))('builds a standard owner plan on %s even when a legacy key exists', async (plan) => {
    const result = await handleAiAction({ GEMINI_API_KEY: 'synthetic-unused-key' } as AppEnv, user(UserRole.STUDENT, plan), planRequest);
    expect(result).toMatchObject({ uid: 'synthetic-owner', selectedBookIds: ['my-existing-id'], status: 'ACTIVE' });
    expect(forbidden.provider).not.toHaveBeenCalled();
    expect(forbidden.budget).not.toHaveBeenCalled();
    expect(forbidden.usage).not.toHaveBeenCalled();
  });
  it('returns only a template for an instructor without AI usage or delivery', async () => {
    const result = await handleAiAction({ GEMINI_API_KEY: 'synthetic-unused-key' } as AppEnv, user(UserRole.INSTRUCTOR, 'TOB_PAID'), followUpRequest);
    expect(result).toMatchObject({ message: expect.stringContaining('\n一緒に復習しましょう。') });
    expect(forbidden.provider).not.toHaveBeenCalled();
    expect(forbidden.budget).not.toHaveBeenCalled();
    expect(forbidden.usage).not.toHaveBeenCalled();
  });
  it('keeps role authorization at the server', async () => {
    await expect(handleAiAction({} as AppEnv, user(UserRole.INSTRUCTOR), planRequest)).rejects.toMatchObject({ status: 403 });
    await expect(handleAiAction({} as AppEnv, user(UserRole.STUDENT), followUpRequest)).rejects.toMatchObject({ status: 403 });
  });
  it('rejects malformed requests before returning a proposal', async () => {
    await expect(handleAiAction({} as AppEnv, user(), { ...planRequest, payload: { ...planRequest.payload, availableBooks: 'not loaded' } }))
      .rejects.toMatchObject({ status: 400 });
    await expect(handleAiAction({} as AppEnv, user(UserRole.INSTRUCTOR), { ...followUpRequest, payload: { ...followUpRequest.payload, instructorName: '' } }))
      .rejects.toMatchObject({ status: 400 });
    expect(forbidden.provider).not.toHaveBeenCalled();
  });
});
