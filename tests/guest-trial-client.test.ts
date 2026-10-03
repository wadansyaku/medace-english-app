import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGuestTrialSummary, getLatestGuestTrialSummary, importGuestTrial } from '../services/guestTrial';
import { GUEST_TRIAL_QUESTIONS, GUEST_TRIAL_VERSION, getGuestTrialQuestion, isGuestTrialAnswerCorrect } from '../shared/guestTrial';

afterEach(() => vi.unstubAllGlobals());
describe('original guest trial and cloud service', () => {
  it('uses five unique original question IDs and coherent meaning choices', () => {
    expect(GUEST_TRIAL_QUESTIONS).toHaveLength(5);
    expect(new Set(GUEST_TRIAL_QUESTIONS.map((question) => question.id)).size).toBe(5);
    for (const question of GUEST_TRIAL_QUESTIONS) {
      expect(question.id).toMatch(/^original-v1-/); expect(question.choices).toHaveLength(4);
      expect(new Set(question.choices).size).toBe(4); expect(question.explanation).toContain(question.choices[question.correctChoiceIndex]);
      expect(getGuestTrialQuestion(question.id)).toBe(question);
      expect(isGuestTrialAnswerCorrect({ questionId: question.id, choiceIndex: question.correctChoiceIndex })).toBe(true);
      expect(isGuestTrialAnswerCorrect({ questionId: question.id, choiceIndex: (question.correctChoiceIndex + 1) % 4 })).toBe(false);
    }
    expect(isGuestTrialAnswerCorrect({ questionId: 'not-a-word', choiceIndex: 0 })).toBe(false);
  });
  it('imports the exact immutable payload with session cookies and reads only the supplied trial', async () => {
    const payload = { expectedUserId: 'student-1', trialId: 'trial-original-123', version: GUEST_TRIAL_VERSION, answers: [] };
    const summary = { trialId: payload.trialId, version: payload.version, answerCount: 1, correctCount: 1, importedAt: 123,
      answers: [{ attemptId: 'attempt-original-1', questionId: GUEST_TRIAL_QUESTIONS[0].id, choiceIndex: 0, answeredAt: 123 }] };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ summary }), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock); expect(await importGuestTrial(payload)).toEqual({ summary });
    expect(fetchMock.mock.calls[0]).toEqual(['/api/guest-trial/import', expect.objectContaining({ credentials: 'include', method: 'POST', body: JSON.stringify(payload) })]);
    expect(await getGuestTrialSummary(payload.trialId)).toEqual(summary);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/guest-trial/summary?trialId=trial-original-123');
  });
  it('propagates cloud failures without producing a successful local receipt', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(importGuestTrial({ expectedUserId: 'student-1', trialId: 'trial-original-123', version: GUEST_TRIAL_VERSION, answers: [] })).rejects.toThrow('offline');
  });
  it('keeps an absent own summary as null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    expect(await getGuestTrialSummary('trial-original-123')).toBeNull();
  });
  it('reads the latest saved account answers without needing a device trial ID', async () => {
    const summary = { trialId: 'trial-original-123', version: GUEST_TRIAL_VERSION, answers: [], answerCount: 0, correctCount: 0, importedAt: 123 };
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(summary), { headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await getLatestGuestTrialSummary()).toEqual(summary);
    expect(fetchMock.mock.calls[0]).toEqual(['/api/guest-trial/summary', expect.objectContaining({ credentials: 'include', method: 'GET', cache: 'no-store' })]);
    expect(await getLatestGuestTrialSummary()).toBeNull();
  });
});
