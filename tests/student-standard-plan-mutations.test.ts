import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BookCatalogSource, EnglishLevel, SubscriptionPlan, UserGrade, UserRole, type LearningPlan } from '../types';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', () => ({
  useCallback: (callback: unknown) => callback,
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
}));
const service = vi.hoisted(() => ({ save: vi.fn(), ai: vi.fn() }));
vi.mock('../services/dashboard', () => ({ dashboardService: { saveLearningPlan: service.save } }));
vi.mock('../services/gemini', () => ({
  generateLearningPlan: service.ai, extractVocabularyFromMedia: vi.fn(), extractVocabularyFromText: vi.fn(), isAiUnavailableError: vi.fn(),
}));
import { useStudentDashboardMutations } from '../hooks/useStudentDashboardMutations';

const existing: LearningPlan = {
  uid: 'synthetic-student', createdAt: 1, targetDate: '2026-12-31', goalDescription: '保存済みのプラン',
  dailyWordGoal: 12, selectedBookIds: ['selected-book'], status: 'ACTIVE',
};
const defaultParams = () => ({
  user: { uid: existing.uid, displayName: '合成生徒', email: 'student@example.invalid', role: UserRole.STUDENT,
    subscriptionPlan: SubscriptionPlan.TOB_PAID, grade: UserGrade.JHS1, englishLevel: EnglishLevel.A1 },
  learningPlan: existing, learningPreference: null,
  planningBooks: [
    { id: 'other-book', title: '候補教材', wordCount: 20, isPriority: true, catalogSource: BookCatalogSource.USER_GENERATED },
    { id: 'selected-book', title: '選択済み教材', wordCount: 30, isPriority: false, catalogSource: BookCatalogSource.USER_GENERATED },
  ],
  setGeneratingPlan: vi.fn(), updateLearningPlan: vi.fn(), setPageNotice: vi.fn(),
} as unknown as Parameters<typeof useStudentDashboardMutations>[0]);
const render = (params: Parameters<typeof useStudentDashboardMutations>[0]) => {
  harness.cursor = 0;
  return useStudentDashboardMutations(params);
};

describe('standard plan persistence', () => {
  beforeEach(() => {
    harness.slots = []; harness.cursor = 0;
    vi.clearAllMocks(); service.save.mockResolvedValue(undefined);
  });
  it('saves an owner standard plan while retaining selected textbook IDs without using the paid AI path', async () => {
    const params = defaultParams();
    await render(params).handleGeneratePlan();
    expect(service.ai).not.toHaveBeenCalled();
    expect(service.save).toHaveBeenCalledWith(expect.objectContaining({ uid: existing.uid, selectedBookIds: existing.selectedBookIds }));
    expect(params.updateLearningPlan).toHaveBeenCalledWith(service.save.mock.calls[0][0]);
    expect(params.setPageNotice).toHaveBeenCalledWith({ tone: 'success', message: '標準の学習プランを保存しました。' });
  });
  it('does not claim a saved standard plan or overwrite the current plan after a storage failure', async () => {
    const params = defaultParams();
    service.save.mockRejectedValueOnce(new Error('synthetic storage failure'));
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await render(params).handleGeneratePlan();
    expect(params.updateLearningPlan).not.toHaveBeenCalled();
    expect(existing.selectedBookIds).toEqual(['selected-book']);
    expect(params.setPageNotice).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
    expect(params.setGeneratingPlan).toHaveBeenLastCalledWith(false);
    consoleError.mockRestore();
  });
  it('does not send duplicate saves while the first storage request is pending', async () => {
    const params = defaultParams();
    let release!: () => void;
    service.save.mockReturnValueOnce(new Promise<void>((resolve) => { release = resolve; }));
    const first = render(params).handleGeneratePlan();
    await render(params).handleGeneratePlan();
    expect(service.save).toHaveBeenCalledTimes(1);
    expect(params.updateLearningPlan).not.toHaveBeenCalled();
    release(); await first;
    expect(params.updateLearningPlan).toHaveBeenCalledTimes(1);
  });
  it('keeps an empty catalog distinct from a saved plan', async () => {
    const params = defaultParams(); params.planningBooks = [];
    await render(params).handleGeneratePlan();
    expect(service.save).not.toHaveBeenCalled();
    expect(params.updateLearningPlan).not.toHaveBeenCalled();
    expect(params.setPageNotice).not.toHaveBeenCalled();
  });
});
