import { describe, expect, it } from 'vitest';
import type { ProductFeedbackReport } from '../contracts/productFeedback';
import { advanceFeedback, exportFeedback, findFeedbackFaq, validateFeedbackInput } from '../shared/productFeedback';

const input = { title: '合成: 操作確認', version: 'synthetic-1', screen: '教材ホーム', steps: '匿名の操作で開く', expected: '保存結果が見える', actual: '確認できなかった', impact: '次へ進めない' };
const report = (): ProductFeedbackReport => ({ ...input, id: 'synthetic-feedback', revision: 1, createdAt: 1, updatedAt: 1,
  status: 'NEW', history: [{ revision: 1, at: 1, status: 'NEW', actorRole: 'INSTRUCTOR', note: '合成の報告' }], historyLoaded: true, isOwnReport: true });

describe('product feedback facts and handoff', () => {
  it('answers only the verified question and leaves compound or unknown claims unanswered', () => {
    expect(findFeedbackFaq(' 復習はいつ行いますか? ')?.id).toBe('review');
    expect(findFeedbackFaq('復習はいつ行いますか？他社より効果が高いですか？')).toBeUndefined();
    expect(findFeedbackFaq('他社より2倍覚えられますか？')).toBeUndefined();
    expect(findFeedbackFaq('学習効果について')?.answer).toContain('今後');
  });
  it.each(['one@example.test', '090-1234-5678', '09012345678'])('rejects a contact detail rather than recording it: %s', value => {
    expect(() => validateFeedbackInput({ ...input, actual: value })).toThrow('匿名');
  });
  it('requires version and bounded anonymous fields', () => {
    expect(() => validateFeedbackInput({ ...input, version: '' })).toThrow('試した版');
    expect(() => validateFeedbackInput({ ...input, steps: 'x'.repeat(2001) })).toThrow('2000');
    expect(validateFeedbackInput({ ...input, title: ' 合成 ' }).title).toBe('合成');
  });
  it('keeps failed retest history through a second fix and exports only the complete anonymous record', () => {
    let next = advanceFeedback(report(), { type: 'triage', priority: 'P1', acceptance: '保存後に状態を確認できる' }, 'ADMIN', 2);
    next = advanceFeedback(next, { type: 'prepare-handoff' }, 'ADMIN', 3);
    next = advanceFeedback(next, { type: 'record-fix', revision: 'synthetic-fix-1', note: '保存結果を表示' }, 'ADMIN', 4);
    next = advanceFeedback(next, { type: 'retest', passed: false, note: '390pxで再訪後に古い表示' }, 'INSTRUCTOR', 5);
    next = advanceFeedback(next, { type: 'record-fix', revision: 'synthetic-fix-2', note: '再訪時に取得' }, 'ADMIN', 6);
    next = advanceFeedback(next, { type: 'retest', passed: true, note: '再訪後も新しい結果を確認' }, 'INSTRUCTOR', 7);
    expect(next.history.map(event => event.status)).toEqual(['NEW', 'TRIAGED', 'HANDOFF_PREPARED', 'FIXED', 'RETEST_FAIL', 'FIXED', 'RETEST_PASS']);
    const exported = JSON.parse(exportFeedback(next));
    expect(exported.report.fixRevision).toBe('synthetic-fix-2');
    expect(exported.notice).toContain('送信・受領');
    expect(exported.report).not.toHaveProperty('isOwnReport');
    expect(exported.report).not.toHaveProperty('historyLoaded');
    expect(() => exportFeedback({ ...next, history: [], historyLoaded: false })).toThrow('取得');
  });
  it('rejects skipping the owner review or retesting a report before a fixed version exists', () => {
    expect(() => advanceFeedback(report(), { type: 'prepare-handoff' }, 'ADMIN', 2)).toThrow('先に');
    expect(() => advanceFeedback(report(), { type: 'retest', passed: true, note: '試していない合成例' }, 'INSTRUCTOR', 2)).toThrow('先に');
  });
});
