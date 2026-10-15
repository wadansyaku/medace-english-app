import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EnglishLevel } from '../types';
import { ORIGINAL_GRAMMAR_QUESTIONS } from '../config/grammarQuestionBank';
import { ORIGINAL_TRANSLATION_QUESTIONS } from '../config/translationQuestionBank';
import { buildCuratedGrammarPracticeItems } from '../utils/grammarQuestionBank';
import { buildCuratedTranslationPracticeItems, assessCuratedTranslationAnswer, assessCuratedTranslationOrder } from '../utils/translationQuestionBank';
import { createGrammarPracticeReview, createTranslationPracticeReview } from '../utils/englishPracticeReview';
import {
  createEmptyEnglishPracticeProgress, recordEnglishPracticeAttempt, markEnglishPracticeAttemptSynced,
  clearEnglishPracticeProgress, summarizeEnglishPracticeProgress, persistEnglishPracticeProgress,
  loadEnglishPracticeProgress, saveEnglishPracticeProgress, toEnglishPracticeStoragePayload,
} from '../utils/englishPracticeProgress';
import EnglishPracticeReviewHistory from '../components/practice/EnglishPracticeReviewHistory';

const uid = 'synthetic-review-student';
const translation = () => buildCuratedTranslationPracticeItems({ userLevel: EnglishLevel.B2, questionCount: 20 })
  .find(item => item.questionId === 'translation-original-20261009-be-negation-01')!;
const translationRecord = () => {
  const item = translation();
  const input = item.reviewedQuestion.knownIncorrectTranslations[0].text;
  const assessment = assessCuratedTranslationAnswer(item, input);
  return recordEnglishPracticeAttempt(createEmptyEnglishPracticeProgress(uid), {
    lane: 'translation', mode: 'JA_TRANSLATION_INPUT', correct: false,
    clientAttemptId: 'synthetic-stable-attempt', curatedQuestionId: item.questionId,
    review: createTranslationPracticeReview(item, 'JA_TRANSLATION_INPUT', input, assessment),
  });
};
const storage = () => {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
};

describe('device-only question and answer review', () => {
  it('copies every grammar answer, displayed option and accepted order from the existing authored source', () => {
    for (const mode of ['GRAMMAR_CLOZE', 'EN_WORD_ORDER'] as const) {
      const scopes = [...new Set(ORIGINAL_GRAMMAR_QUESTIONS.map(question => question.scopeId))];
      const items = scopes.flatMap(scope => buildCuratedGrammarPracticeItems({ mode, scopeIds: [scope], userLevel: EnglishLevel.C2, questionCount: 60 }));
      expect(new Set(items.map(item => item.feedback?.questionId))).toEqual(new Set(ORIGINAL_GRAMMAR_QUESTIONS.map(question => question.id)));
      for (const item of items) {
        const source = ORIGINAL_GRAMMAR_QUESTIONS.find(question => question.id === item.feedback?.questionId)!;
        const answer = item.kind === 'GRAMMAR_CLOZE' ? source.answer : item.kind === 'ENGLISH_WORD_ORDER' ? item.correctChipIds : [];
        const review = createGrammarPracticeReview(item, answer, true)!;
        expect(review).toMatchObject({ questionId: source.id, questionVersion: source.version, mode,
          prompt: item.prompt, sourceSentence: source.sourceSentence, explanationJa: source.explanationJa,
          referenceTranslation: source.translationJa, assessment: 'correct' });
        if (item.kind === 'GRAMMAR_CLOZE') {
          expect(review.referenceAnswer).toBe(source.answer);
          expect(review.displayedOptions).toEqual(item.options);
          expect(review.acceptedAnswers).toEqual([source.answer]);
        } else if (item.kind === 'ENGLISH_WORD_ORDER') {
          expect(review.acceptedAnswers).toHaveLength(1 + source.alternateOrders.length);
          expect(review.submittedAnswer).toBe(review.acceptedAnswers[0]);
          expect(review.displayedOptions).toEqual(item.chips.map(chip => chip.text));
        }
      }
    }
  });

  it('records every finite translation variant and retains the existing version without inventing answers', () => {
    const items = buildCuratedTranslationPracticeItems({ userLevel: EnglishLevel.B2, questionCount: 20 });
    expect(items).toHaveLength(ORIGINAL_TRANSLATION_QUESTIONS.length);
    for (const item of items) {
      const source = item.reviewedQuestion;
      const input = source.acceptedTranslations[0];
      const review = createTranslationPracticeReview(item, 'JA_TRANSLATION_INPUT', input, assessCuratedTranslationAnswer(item, input))!;
      expect(review).toMatchObject({ questionId: source.id, questionVersion: source.version,
        sourceSentence: source.sourceSentence, referenceAnswer: source.referenceTranslation,
        explanationJa: source.explanationJa, submittedAnswer: input, assessment: 'correct' });
      expect(review.acceptedAnswers).toEqual([source.referenceTranslation, ...source.acceptedTranslations,
        ...source.alternateOrders.map(order => order.map(index => source.orderChunks[index]).join(''))]);
      const orderReview = createTranslationPracticeReview(item, 'JA_TRANSLATION_ORDER', item.correctChipIds,
        assessCuratedTranslationOrder(item, item.correctChipIds))!;
      expect(orderReview.submittedAnswer).toBe(source.referenceTranslation);
      expect(orderReview.acceptedAnswers).toEqual(review.acceptedAnswers);
    }
  });

  it('retains the original incorrect input and specific negation reason across save, reload and sync', () => {
    const memory = storage();
    const progress = translationRecord();
    saveEnglishPracticeProgress(progress, memory);
    const reloaded = loadEnglishPracticeProgress(uid, memory);
    const attempt = reloaded.attempts[0];
    const source = translation().reviewedQuestion;
    expect(attempt.review).toMatchObject({ submittedAnswer: source.knownIncorrectTranslations[0].text,
      answerReasonJa: source.knownIncorrectTranslations[0].reasonJa, assessment: 'incorrect' });
    const payload = toEnglishPracticeStoragePayload(attempt);
    expect(payload).not.toHaveProperty('review');
    expect(payload).not.toHaveProperty('curatedQuestionId');
    expect(payload).not.toHaveProperty('questionVersion');
    expect(payload).not.toHaveProperty('submittedAnswer');
    expect(markEnglishPracticeAttemptSynced(reloaded, attempt.clientAttemptId).attempts[0].review).toEqual(attempt.review);
    expect(toEnglishPracticeStoragePayload(loadEnglishPracticeProgress(uid, memory).attempts[0])).toEqual(payload);
    expect(loadEnglishPracticeProgress('another-synthetic-student', memory).attempts).toEqual([]);
  });

  it('rejects a different UID inside a corrupt bucket without exposing or deleting that bucket', () => {
    const memory = storage();
    const wrongBucket = 'medace:english-practice-progress:another-synthetic-student';
    const raw = JSON.stringify(translationRecord()); memory.setItem(wrongBucket, raw);
    expect(loadEnglishPracticeProgress('another-synthetic-student', memory).attempts).toEqual([]);
    expect(memory.getItem(wrongBucket)).toBe(raw);
  });

  it('renders a corrupt optional scope label with a fallback', () => {
    const progress = translationRecord(); progress.attempts[0].scopeLabelJa = { bad: true } as any;
    const memory = storage(); saveEnglishPracticeProgress(progress, memory);
    const reloaded = loadEnglishPracticeProgress(uid, memory);
    expect(() => renderToStaticMarkup(React.createElement(EnglishPracticeReviewHistory, { attempts: reloaded.attempts }))).not.toThrow();
  });

  it('detaches the submitted snapshot from later question edits and caller mutations', () => {
    const item = structuredClone(translation());
    const review = createTranslationPracticeReview(item, 'JA_TRANSLATION_INPUT', item.answerText,
      assessCuratedTranslationAnswer(item, item.answerText))!;
    const progress = recordEnglishPracticeAttempt(createEmptyEnglishPracticeProgress(uid), {
      lane: 'translation', mode: 'JA_TRANSLATION_INPUT', correct: true, curatedQuestionId: item.questionId, review,
    });
    const recorded = structuredClone(progress.attempts[0].review);
    item.reviewedQuestion.explanationJa = 'Synthetic newer explanation';
    item.reviewedQuestion.version = 99;
    review.acceptedAnswers[0] = 'Synthetic changed answer';
    review.explanationJa = 'Synthetic caller mutation';
    expect(progress.attempts[0].review).toEqual(recorded);
    const memory = storage(); saveEnglishPracticeProgress(progress, memory);
    expect(loadEnglishPracticeProgress(uid, memory).attempts[0].review).toEqual(recorded);
  });

  it.each([
    { acceptedAnswers: null }, { displayedOptions: [42] }, { questionVersion: 0 },
    { mode: 'GRAMMAR_CLOZE' }, { questionId: 'another-question' }, { assessment: 'correct' },
    { explanationJa: 'x'.repeat(12001) }, { meaningNotesJa: new Array(81).fill('x') },
  ])('drops a malformed review only and retains the attempt and retry payload: %j', corrupted => {
    const progress = translationRecord();
    const payload = toEnglishPracticeStoragePayload(progress.attempts[0]);
    progress.attempts[0].review = { ...progress.attempts[0].review, ...corrupted } as any;
    const memory = storage(); memory.setItem(`medace:english-practice-progress:${uid}`, JSON.stringify(progress));
    const attempt = loadEnglishPracticeProgress(uid, memory).attempts[0];
    expect(attempt.review).toBeUndefined();
    expect(attempt.clientAttemptId).toBe('synthetic-stable-attempt');
    expect(attempt.correct).toBe(false); expect(attempt.syncStatus).toBe('pending');
    expect(toEnglishPracticeStoragePayload(attempt)).toEqual(payload);
  });

  it('preserves old IDs without inferring their version or rebuilding content from the current bank', () => {
    const progress = translationRecord(); delete progress.attempts[0].review;
    const memory = storage(); saveEnglishPracticeProgress(progress, memory);
    const attempt = loadEnglishPracticeProgress(uid, memory).attempts[0];
    expect(attempt.curatedQuestionId).toBe(translation().questionId);
    expect(attempt.review).toBeUndefined();
    const markup = renderToStaticMarkup(React.createElement(EnglishPracticeReviewHistory, { attempts: [attempt] }));
    expect(markup).toContain('版は不明です');
    expect(markup).not.toContain(translation().reviewedQuestion.explanationJa);
  });

  it('does not create reviews for unknown input or order, including stale translation versions', () => {
    const item = translation();
    const unknown = assessCuratedTranslationAnswer(item, 'これは未登録の合成答案です');
    expect(unknown.status).toBe('unassessed');
    expect(createTranslationPracticeReview(item, 'JA_TRANSLATION_INPUT', 'これは未登録の合成答案です', unknown)).toBeUndefined();
    const unknownOrder = assessCuratedTranslationOrder(item, []);
    expect(createTranslationPracticeReview(item, 'JA_TRANSLATION_ORDER', [], unknownOrder)).toBeUndefined();
    const stale = { ...item, questionVersion: 99 };
    expect(createTranslationPracticeReview(stale, 'JA_TRANSLATION_INPUT', item.answerText,
      assessCuratedTranslationAnswer(stale, item.answerText))).toBeUndefined();
  });

  it('renders the stored feedback with escaped text, at most five entries and no current bank lookup', () => {
    const progress = translationRecord();
    progress.attempts[0].review!.submittedAnswer = '<script>synthetic()</script>';
    const markup = renderToStaticMarkup(React.createElement(EnglishPracticeReviewHistory, {
      attempts: new Array(7).fill(null).map((_, index) => ({ ...progress.attempts[0], id: `synthetic-${index}` })),
    }));
    expect(markup.match(/data-testid="english-practice-review-attempt"/g)).toHaveLength(5);
    expect(markup).toContain('&lt;script&gt;synthetic()&lt;/script&gt;');
    expect(markup).not.toContain('<script>');
    expect(markup).toContain(progress.attempts[0].review!.answerReasonJa);
    expect(markup).toContain('出題時の版 2');
    expect(markup).toContain('現在の問題で採点し直していません');
  });

  it('keeps the existing 160-record cap, retained counters and original retry IDs with review data', () => {
    const original = translationRecord().attempts[0];
    let progress = createEmptyEnglishPracticeProgress(uid);
    for (let index = 0; index < 161; index += 1) {
      progress = recordEnglishPracticeAttempt(progress, { ...original,
        clientAttemptId: `synthetic-cap-${index}`, occurredAt: 1000 + index,
        syncStatus: index === 160 ? 'pending' : 'synced' });
    }
    const memory = storage(); saveEnglishPracticeProgress(progress, memory);
    const restored = loadEnglishPracticeProgress(uid, memory);
    expect(restored.attempts).toHaveLength(160);
    expect(restored.attempts[0].clientAttemptId).toBe('synthetic-cap-1');
    expect(restored.attempts.at(-1)?.clientAttemptId).toBe('synthetic-cap-160');
    expect(summarizeEnglishPracticeProgress(restored)).toMatchObject({ total: 160, correct: 0 });
    expect(toEnglishPracticeStoragePayload(restored.attempts.at(-1)!))
      .toEqual(toEnglishPracticeStoragePayload(progress.attempts.at(-1)!));
    expect(restored.attempts.at(-1)?.review).toEqual(original.review);
  });

  it('keeps the in-memory record and prior persisted contents if storage quota is exceeded', () => {
    const memory = storage(); const before = translationRecord(); saveEnglishPracticeProgress(before, memory);
    const key = `medace:english-practice-progress:${uid}`; const persisted = memory.getItem(key);
    const after = recordEnglishPracticeAttempt(before, { ...before.attempts[0], clientAttemptId: 'synthetic-quota-attempt' });
    const returned = saveEnglishPracticeProgress(after, { ...memory, setItem: () => { throw new Error('QuotaExceededError'); } });
    expect(returned.attempts).toHaveLength(2);
    expect(returned.attempts[1].review).toEqual(after.attempts[1].review);
    expect(returned.attempts[1].clientAttemptId).toBe('synthetic-quota-attempt');
    expect(memory.getItem(key)).toBe(persisted);
    expect(loadEnglishPracticeProgress(uid, memory).attempts).toHaveLength(1);
    expect(persistEnglishPracticeProgress(after, null)).toMatchObject({ persisted: false, progress: after });
    expect(persistEnglishPracticeProgress(after, { ...memory, setItem: () => { throw new Error('QuotaExceededError'); } }).persisted).toBe(false);
    expect(persistEnglishPracticeProgress(after, memory).persisted).toBe(true);
    expect(loadEnglishPracticeProgress(uid, memory).attempts[1].clientAttemptId).toBe('synthetic-quota-attempt');
  });

  it('retains maximum-length review text and renders it without truncating the stored answer', () => {
    const progress = translationRecord(); const text = '長文の合成答案\n'.repeat(1499) + '終端';
    expect(text.length).toBeLessThanOrEqual(12000);
    progress.attempts[0].review!.submittedAnswer = text;
    progress.attempts[0].review!.explanationJa = '合成の当時の解説'.repeat(1000);
    const memory = storage(); saveEnglishPracticeProgress(progress, memory);
    const restored = loadEnglishPracticeProgress(uid, memory);
    expect(restored.attempts[0].review!.submittedAnswer).toBe(text);
    const markup = renderToStaticMarkup(React.createElement(EnglishPracticeReviewHistory, { attempts: restored.attempts }));
    expect(markup).toContain('終端'); expect(markup).toContain('合成の当時の解説');
    expect(markup).toContain('overflow-wrap:anywhere');
  });

  it('clears only the requested device history and does not resurrect it on reload or sync', () => {
    const memory = storage(); const progress = translationRecord(); saveEnglishPracticeProgress(progress, memory);
    const other = { ...progress, userUid: 'another-synthetic-student' }; saveEnglishPracticeProgress(other, memory);
    const otherRaw = memory.getItem('medace:english-practice-progress:another-synthetic-student');
    const empty = clearEnglishPracticeProgress(uid, memory);
    expect(empty.attempts).toEqual([]); expect(loadEnglishPracticeProgress(uid, memory).attempts).toEqual([]);
    expect(markEnglishPracticeAttemptSynced(empty, progress.attempts[0].clientAttemptId).attempts).toEqual([]);
    expect(memory.getItem('medace:english-practice-progress:another-synthetic-student')).toBe(otherRaw);
  });

});
