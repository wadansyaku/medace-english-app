import { describe, expect, it } from 'vitest';

import { ORIGINAL_TRANSLATION_QUESTIONS, type TranslationMeaningError } from '../config/translationQuestionBank';
import { EnglishLevel } from '../types';
import { compareEnglishLevels, getGrammarCurriculumScope } from '../utils/grammarScope';
import { assessJapaneseTranslationOrder } from '../utils/japaneseTranslationOrder';
import {
  assessCuratedTranslationAnswer,
  assessCuratedTranslationOrder,
  assessWorksheetTranslationOrder,
  buildCuratedTranslationPracticeItems,
  type CuratedTranslationPracticeItem,
} from '../utils/translationQuestionBank';

const questionId = (key: string): string => `translation-original-20261009-${key}`;
const allItems = (): CuratedTranslationPracticeItem[] => buildCuratedTranslationPracticeItems({
  userLevel: EnglishLevel.B2, questionCount: 20, seed: 'golden-translation',
});
const normalize = (value: string): string => value.normalize('NFKC').replace(/\s+/g, '').replace(/[、,]/g, '').replace(/[。.]$/, '');

describe('independently authored translation material', () => {
  it('contains 20 unique bilingual questions with declared level, meaning evidence and versioned original provenance', () => {
    expect(ORIGINAL_TRANSLATION_QUESTIONS).toHaveLength(20);
    expect(new Set(ORIGINAL_TRANSLATION_QUESTIONS.map(question => question.id)).size).toBe(20);
    expect(new Set(ORIGINAL_TRANSLATION_QUESTIONS.map(question => question.sourceSentence)).size).toBe(20);
    for (const level of [EnglishLevel.A1, EnglishLevel.A2, EnglishLevel.B1, EnglishLevel.B2]) {
      expect(ORIGINAL_TRANSLATION_QUESTIONS.filter(question => question.level === level)).toHaveLength(5);
    }
    for (const question of ORIGINAL_TRANSLATION_QUESTIONS) {
      const scope = getGrammarCurriculumScope(question.scopeId);
      expect(question.id).toMatch(/^translation-original-20261009-[a-z-]+-\d{2}$/);
      expect(question.version).toBe(2);
      expect(compareEnglishLevels(question.level, scope.levelMin), question.id).toBeGreaterThanOrEqual(0);
      expect(compareEnglishLevels(question.level, scope.levelMax), question.id).toBeLessThanOrEqual(0);
      expect(question.contextJa.length, question.id).toBeGreaterThan(12);
      expect(question.explanationJa.length, question.id).toBeGreaterThan(40);
      expect(question.requiredMeaningElements.length, question.id).toBeGreaterThanOrEqual(2);
      expect(question.acceptedTranslations, question.id).toHaveLength(2);
      expect(question.knownIncorrectTranslations.length, question.id).toBeGreaterThanOrEqual(1);
      expect(question.provenance.kind).toBe('ORIGINAL');
      expect(question.provenance.authoredAt).toBe('2026-10-09');
      expect(question.provenance.reviewMethodJa).toContain('外部監修は未実施');
      for (const note of question.vocabularyNotesJa ?? []) expect(note.length, question.id).toBeGreaterThan(5);
      expect(question.orderChunks.join(''), question.id).toBe(question.referenceTranslation);
      for (const order of question.alternateOrders) {
        expect([...order].sort((a, b) => a - b), question.id).toEqual(question.orderChunks.map((_chunk, index) => index));
        expect(order, question.id).not.toEqual(question.orderChunks.map((_chunk, index) => index));
      }
      const accepted = new Set([question.referenceTranslation, ...question.acceptedTranslations].map(normalize));
      expect(accepted.size, question.id).toBe(3);
      for (const error of question.knownIncorrectTranslations) {
        expect(error.reasonJa.length, question.id).toBeGreaterThan(20);
        expect(accepted.has(normalize(error.text)), question.id).toBe(false);
      }
    }
    const coveredErrors = new Set(ORIGINAL_TRANSLATION_QUESTIONS.flatMap(question => question.knownIncorrectTranslations.map(error => error.errorType)));
    for (const error of ['NEGATION', 'PARTICIPANT', 'COMPARISON', 'TIME_OR_NUMBER', 'VOICE', 'MODALITY', 'CLAUSE_RELATION'] as TranslationMeaningError[]) {
      expect(coveredErrors.has(error), error).toBe(true);
    }
    expect(ORIGINAL_TRANSLATION_QUESTIONS.find(question => question.id === questionId('ability-01'))?.vocabularyNotesJa)
      .toContain('without help：助けなしで');
  });

  it('preserves every reference-translation character and final predicate in complete order chips', () => {
    for (const item of allItems()) {
      const chipsById = new Map(item.chips.map(chip => [chip.id, chip.text]));
      expect(item.chips.length, item.questionId).toBeGreaterThanOrEqual(2);
      expect(item.chips.length, item.questionId).toBeLessThanOrEqual(7);
      expect(new Set(item.chips.map(chip => chip.id)).size, item.questionId).toBe(item.chips.length);
      expect(item.correctChipIds.map(id => chipsById.get(id)).join(''), item.questionId).toBe(item.answerText);
      expect(item.chips.map(chip => chip.id), item.questionId).not.toEqual(item.correctChipIds);
      expect(item.chips.length, item.questionId).toBe(item.correctChipIds.length);
      expect(item.source).toBe('curated');
      expect(item.wordId).toBe('');
      expect(item.bookId).toBe('');
      expect(item.word).toBe('');
      expect(item.id).toContain(`:v${item.questionVersion}:`);
      expect(item.feedback?.translationJa).toBe(item.answerText);
      expect(item.feedback?.explanationJa).toBe(item.reviewedQuestion.explanationJa);
    }
    expect(allItems().find(item => item.questionId === questionId('counterfactual-past-01'))?.answerText)
      .toBe('もし地図を持っていっていたら、私は道に迷わずに済んだでしょう。');
  });
});

describe('reviewed Japanese translation order', () => {
  it('allows indistinguishable chip identities to swap, while rejecting incomplete or surplus chip configurations', () => {
    const question = {
      tokens: [{ id: 'one', text: '一つ' }, { id: 'two', text: '一つ' }, { id: 'verb', text: '確認します。' }],
      answerTokenIds: ['one', 'two', 'verb'], referenceTranslation: '一つ一つ確認します。',
    };
    expect(assessJapaneseTranslationOrder({ ...question, orderedTokenIds: ['two', 'one', 'verb'] }).status).toBe('correct');
    expect(assessJapaneseTranslationOrder({ ...question, orderedTokenIds: ['one', 'one', 'verb'] }).status).toBe('unassessed');
    expect(assessJapaneseTranslationOrder({ ...question, tokens: [...question.tokens, { id: 'extra', text: '余分' }],
      orderedTokenIds: question.answerTokenIds }).status).toBe('unassessed');
  });
  it.each(ORIGINAL_TRANSLATION_QUESTIONS.map(question => [question.id, question] as const))(
    '%s accepts its complete reference and all registered natural chip variants', (_id, question) => {
      const item = allItems().find(candidate => candidate.questionId === question.id)!;
      expect(assessCuratedTranslationOrder(item, item.correctChipIds).status).toBe('correct');
      for (const order of question.alternateOrders) {
        const ids = order.map(index => item.correctChipIds[index]);
        expect(assessCuratedTranslationOrder(item, ids).status, order.join(',')).toBe('correct');
        const text = order.map(index => question.orderChunks[index]).join('');
        expect(assessCuratedTranslationAnswer(item, text).status, text).toBe('correct');
      }
      expect(assessCuratedTranslationOrder(item, [...item.correctChipIds].reverse()).status).toBe('unassessed');
    },
  );

  it('accepts the reported every-morning-first sentence and keeps a plausible unregistered object-first order unassessed', () => {
    const item = allItems().find(candidate => candidate.questionId === questionId('svo-01'))!;
    const ids = item.correctChipIds;
    expect(assessCuratedTranslationOrder(item, [ids[1], ids[0], ids[2], ids[3]]).status).toBe('correct');
    const unregistered = assessCuratedTranslationOrder(item, [ids[2], ids[0], ids[1], ids[3]]);
    expect(unregistered.status).toBe('unassessed');
    expect(unregistered.reasonJa).toContain('未登録の並び');
  });

  it('shares registered variants with worksheet quizzes only for the same source and model translation', () => {
    const item = allItems().find(candidate => candidate.questionId === questionId('svo-01'))!;
    const question = { sourceSentence: item.sourceSentence, answer: item.answerText, tokens: item.chips, answerTokenIds: item.correctChipIds };
    const alternate = [1, 0, 2, 3].map(index => item.correctChipIds[index]);
    expect(assessWorksheetTranslationOrder(question, alternate).status).toBe('correct');
    expect(assessWorksheetTranslationOrder({ ...question, sourceSentence: 'A different English source.' }, alternate).status).toBe('unassessed');
    expect(assessWorksheetTranslationOrder({ ...question, answer: '別の参考訳。' }, question.answerTokenIds).status).toBe('unassessed');
  });

  it('does not grade missing, repeated, unknown, stale or changed Japanese chips', () => {
    const item = allItems()[0]; const ids = item.correctChipIds;
    for (const ordered of [[], ids.slice(1), ids.map(() => ids[0]), [...ids.slice(0, -1), 'unknown-chip']]) {
      expect(assessCuratedTranslationOrder(item, ordered).status).toBe('unassessed');
    }
    expect(assessCuratedTranslationOrder({ ...item, questionVersion: 1 }, ids).status).toBe('unassessed');
    expect(assessCuratedTranslationOrder({ ...item, chips: item.chips.map(chip => ({ ...chip, text: '別の部品' })) }, ids).status).toBe('unassessed');
    const variants = ORIGINAL_TRANSLATION_QUESTIONS.reduce((count, question) => count + question.alternateOrders.length, 0);
    expect(variants).toBe(20);
  });
});

describe('translation answer goldens', () => {
  it.each(ORIGINAL_TRANSLATION_QUESTIONS.map(question => [question.id, question] as const))(
    '%s accepts its full reference and every reviewed alternative without depending on AI',
    (_id, question) => {
      for (const answer of [question.referenceTranslation, ...question.acceptedTranslations]) {
        const result = assessCuratedTranslationAnswer(question.id, answer, 'UNIVERSITY_ENTRANCE');
        expect(result.status, answer).toBe('correct');
        expect(result.feedback?.isCorrect).toBe(true);
        expect(result.feedback?.usedAi).toBe(false);
        expect(result.feedback?.score).toBe(10);
        expect(result.feedback?.maxScore).toBe(10);
        expect(result.feedback?.examTarget).toBe('UNIVERSITY_ENTRANCE');
        expect(result.feedback?.criteria.reduce((sum, criterion) => sum + criterion.score, 0)).toBe(10);
        expect(result.feedback?.criteria.reduce((sum, criterion) => sum + criterion.maxScore, 0)).toBe(10);
        expect(result.feedback?.expectedTranslation).toBe(question.referenceTranslation);
      }
    },
  );

  it.each(ORIGINAL_TRANSLATION_QUESTIONS.map(question => [question.id, question] as const))(
    '%s rejects only a specific known meaning error with its reason and no invented partial score',
    (_id, question) => {
      for (const error of question.knownIncorrectTranslations) {
        const result = assessCuratedTranslationAnswer(question.id, error.text);
        expect(result).toEqual({ status: 'incorrect', reasonJa: error.reasonJa });
        expect(result.feedback).toBeUndefined();
      }
    },
  );

  it.each([
    ['svo-01', '生徒たちが部屋を掃除するのは毎朝です。'],
    ['be-negation-01', '今日の私は忙しくはない。'],
    ['past-number-01', '昨日書かれた2通の手紙の書き手はサラです。'],
    ['comparison-01', 'この箱の方があの箱よりも軽量です。'],
    ['passive-agent-01', 'その窓はケンが昨日割ったものです。'],
    ['perfect-duration-01', '私たちはこの町で3年暮らしてきて、今も住んでいます。'],
    ['relative-recipient-01', '先週あなたに私が貸した本は興味深いものです。'],
    ['partial-negation-01', 'その生徒たちの提案への賛成は、全員一致ではありませんでした。'],
    ['reported-time-01', 'リナの話では、戻るのは発言した次の日とのことでした。'],
    ['passive-before-01', 'その橋の修理が終わったのは、嵐が始まるより前のことでした。'],
  ])('keeps an unregistered plausible alternative unassessed: %s', (key, input) => {
    const result = assessCuratedTranslationAnswer(questionId(key), input);
    expect(result.status).toBe('unassessed');
    expect(result.feedback).toBeUndefined();
    expect(result.reasonJa).toContain('未採点');
  });

  it('ignores spacing, comma placement and final full stop while preserving information-bearing characters', () => {
    expect(assessCuratedTranslationAnswer(questionId('past-number-01'), ' サラは 昨日、手紙を ２通 書きました。 ').status).toBe('correct');
    expect(assessCuratedTranslationAnswer(questionId('past-number-01'), 'サラは昨日手紙を20通書きました。').status).toBe('unassessed');
    expect(assessCuratedTranslationAnswer(questionId('comparison-01'), 'この箱はあの箱より軽くないです。').status).toBe('unassessed');
    expect(assessCuratedTranslationAnswer(questionId('be-negation-01'), '私は今日は忙しいです。').status).toBe('incorrect');
  });

  it('never grades unknown, stale or changed question content against a current model translation', () => {
    const item = allItems()[0];
    expect(assessCuratedTranslationAnswer(item, item.answerText).status).toBe('correct');
    for (const changed of [
      { ...item, questionVersion: item.questionVersion + 1 },
      { ...item, questionId: 'unknown-question' },
      { ...item, sourceSentence: 'A different sentence.' },
      { ...item, answerText: '変更された参考訳' },
    ]) {
      expect(assessCuratedTranslationAnswer(changed, item.answerText).status).toBe('unassessed');
    }
    expect(assessCuratedTranslationAnswer('unknown-question', '訳').status).toBe('unassessed');
    expect(assessCuratedTranslationAnswer(item, '  ')).toEqual({
      status: 'unassessed', reasonJa: '和訳を入力してから確認してください。',
    });
  });
});

describe('curated translation selection', () => {
  it('is deterministic and uses seed variation without repeating IDs', () => {
    const options = { userLevel: EnglishLevel.B2, questionCount: 20, seed: 'session-one' };
    const first = buildCuratedTranslationPracticeItems(options);
    expect(buildCuratedTranslationPracticeItems(options)).toEqual(first);
    expect(buildCuratedTranslationPracticeItems({ ...options, seed: 'session-two' })).not.toEqual(first);
    expect(new Set(first.map(item => item.questionId)).size).toBe(20);
  });

  it('prefers the learner level, never raises difficulty and returns fewer items when easy material is exhausted', () => {
    for (const level of [EnglishLevel.A1, EnglishLevel.A2, EnglishLevel.B1, EnglishLevel.B2]) {
      const firstFive = buildCuratedTranslationPracticeItems({ userLevel: level, questionCount: 5 });
      expect(firstFive).toHaveLength(5);
      expect(firstFive.every(item => item.level === level)).toBe(true);
      const all = buildCuratedTranslationPracticeItems({ userLevel: level, questionCount: 20 });
      expect(all.every(item => compareEnglishLevels(item.level, level) <= 0)).toBe(true);
      expect(new Set(all.map(item => item.questionId)).size).toBe(all.length);
    }
    expect(buildCuratedTranslationPracticeItems({ userLevel: EnglishLevel.A1, questionCount: 20 })).toHaveLength(5);
  });

  it('honors selected scopes and exclusions without producing fabricated filler', () => {
    const options = { userLevel: EnglishLevel.B2, scopeIds: ['passive-voice'] as const, questionCount: 20 };
    const selected = buildCuratedTranslationPracticeItems(options);
    expect(selected).toHaveLength(2);
    expect(selected.every(item => item.grammarScope.scopeId === 'passive-voice')).toBe(true);
    const excluding = buildCuratedTranslationPracticeItems({ ...options, excludeQuestionIds: [questionId('passive-agent-01')] });
    expect(excluding.map(item => item.questionId)).toEqual([questionId('passive-before-01')]);
    expect(buildCuratedTranslationPracticeItems({ ...options, excludeQuestionIds: selected.map(item => item.questionId) })).toEqual([]);
    expect(buildCuratedTranslationPracticeItems({ userLevel: EnglishLevel.A1, scopeIds: ['subjunctive-mood'] })).toEqual([]);
    expect(buildCuratedTranslationPracticeItems({ scopeIds: [] })).toEqual([]);
  });

  it('bounds invalid and excessive counts without repeating the small authored bank', () => {
    for (const questionCount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildCuratedTranslationPracticeItems({ questionCount })).toEqual([]);
    }
    expect(buildCuratedTranslationPracticeItems({ questionCount: 2.8 })).toHaveLength(2);
    expect(buildCuratedTranslationPracticeItems({ userLevel: EnglishLevel.C2, questionCount: 1000 })).toHaveLength(20);
  });
});
