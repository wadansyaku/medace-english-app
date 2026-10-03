import { afterEach, describe, expect, it, vi } from 'vitest';
const { post } = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('../services/apiClient', () => ({ apiPost: post, apiGet: vi.fn(), apiDelete: vi.fn(), ApiError: class extends Error {} }));
import { CloudflareStorageService } from '../services/cloudflare';
import { LearningTaskIntentType, type LearningTaskIntent } from '../types';
afterEach(() => vi.resetAllMocks());

describe('remote study scope adapter', () => {
  it('forwards a normalized scope without trusting a supplied user ID', async () => {
    const overview = { bookId: 'book', totalCount: 10, studiedCount: 2, newCount: 8, dueCount: 1 };
    post.mockResolvedValue(overview);
    expect(await new CloudflareStorageService().getBookStudyOverview('forged-user', 'book', { start: 11, end: 20 })).toEqual(overview);
    expect(post).toHaveBeenCalledWith('/api/storage', { action: 'getBookStudyOverview', payload: { bookId: 'book', wordRange: { start: 11, end: 20 } } });
    expect(post.mock.calls[0][1].payload).not.toHaveProperty('uid');
  });
  it('refuses malformed overview and daily ranges before dispatch', async () => {
    const service = new CloudflareStorageService();
    await expect(service.getBookStudyOverview('user', 'book', { start: 20, end: 10 })).rejects.toThrow();
    await expect(service.getDailySessionWords('user', 10, { wordRange: { start: 11, end: 20 } } as LearningTaskIntent)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
  it('forwards ordinary book chapter intent but rejects mission and smart scope', async () => {
    const service = new CloudflareStorageService();
    const intent: LearningTaskIntent = { mode: 'study', intentType: LearningTaskIntentType.BOOK_STUDY, label: '章', selectionPolicy: 'BOOK_DUE_ONLY', limit: 10, bookId: 'book', wordRange: { start: 11, end: 20 } };
    post.mockResolvedValue([]);
    await expect(service.getBookSession('user', 'book', 10, intent)).resolves.toEqual([]);
    expect(post).toHaveBeenCalledWith('/api/storage', { action: 'getBookSession', payload: { bookId: 'book', limit: 10, taskIntent: intent } });
    post.mockClear();
    await expect(service.getBookSession('user', 'book', 10, { ...intent, missionAssignmentId: 'mission' })).rejects.toThrow();
    await expect(service.getBookSession('user', 'smart-session', 10, intent)).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
