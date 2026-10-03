import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Real component callbacks/effects, without claiming browser or layout coverage.
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: new Map<number, () => unknown>() }));
vi.mock('react', async importOriginal => {
  const original = await importOriginal<typeof import('react')>();
  const changed = (before: unknown[] | undefined, after: unknown[]) => !before || after.some((value, i) => !Object.is(value, before[i]));
  const replacements = {
    useState(initial: any) {
      const slot = hooks.cursor++;
      if (!(slot in hooks.slots)) hooks.slots[slot] = typeof initial === 'function' ? initial() : initial;
      return [hooks.slots[slot], (value: any) => { hooks.slots[slot] = typeof value === 'function' ? value(hooks.slots[slot]) : value; }];
    },
    useRef(initial: unknown) {
      const slot = hooks.cursor++;
      if (!(slot in hooks.slots)) hooks.slots[slot] = { current: initial };
      return hooks.slots[slot];
    },
    useMemo(factory: () => unknown, deps: unknown[]) {
      const slot = hooks.cursor++;
      if (changed(hooks.slots[slot]?.deps, deps)) hooks.slots[slot] = { value: factory(), deps };
      return hooks.slots[slot].value;
    },
    useCallback(callback: unknown, deps: unknown[]) {
      const slot = hooks.cursor++;
      if (changed(hooks.slots[slot]?.deps, deps)) hooks.slots[slot] = { value: callback, deps };
      return hooks.slots[slot].value;
    },
    useEffect(effect: () => unknown, deps: unknown[]) {
      const slot = hooks.cursor++;
      if (changed(hooks.slots[slot], deps)) { hooks.slots[slot] = deps; hooks.effects.set(slot, effect); }
    },
  };
  return { ...original, ...replacements, default: { ...original.default, ...replacements } };
});
const api = vi.hoisted(() => ({ getDailySessionWords: vi.fn(), recordEnglishPracticeAttempt: vi.fn() }));
vi.mock('../services/learning', () => ({ learningService: api }));
vi.mock('../services/gemini', () => ({ evaluateJapaneseTranslationAnswer: vi.fn() }));

import EnglishPracticeHub from '../components/practice/EnglishPracticeHub';
import { ORIGINAL_GRAMMAR_QUESTIONS } from '../config/grammarQuestionBank';
import { EnglishLevel, UserRole, type GrammarCurriculumScopeId, type UserProfile } from '../types';
import { getGrammarScopesForPracticeSelection } from '../utils/grammarScope';

const user: UserProfile = { uid: 'curated-fixture', displayName: '架空生徒', role: UserRole.STUDENT, email: 'fixture@example.invalid', englishLevel: EnglishLevel.B1 };
let currentUser = user;
const render = () => { hooks.cursor = 0; return EnglishPracticeHub({ user: currentUser }); };
const elements = (tree: unknown): ReactElement<any>[] => {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!React.isValidElement(tree)) return [];
  const element = tree as ReactElement<any>;
  return [element, ...elements(element.props.children)];
};
const text = (tree: unknown): string => Array.isArray(tree) ? tree.map(text).join('')
  : React.isValidElement(tree) ? text((tree as ReactElement<any>).props.children)
    : typeof tree === 'string' || typeof tree === 'number' ? String(tree) : '';
const button = (tree: ReactElement, label: string) => elements(tree).find(e => e.type === 'button' && text(e) === label)!;
const question = (tree: ReactElement) => elements(tree).find(e => e.props['data-testid'] === 'grammar-practice-question')!;
const authoredQuestion = (tree: ReactElement) => ORIGINAL_GRAMMAR_QUESTIONS.find(q => q.id === question(tree).props['data-question-id'])!;
const settle = async () => {
  let tree = render();
  for (let i = 0; i < 5; i++) {
    const effects = [...hooks.effects.values()]; hooks.effects.clear(); effects.forEach(effect => effect());
    await Promise.resolve(); tree = render();
  }
  return tree;
};
const selectOnlyScope = async (scopeId: GrammarCurriculumScopeId) => {
  let tree = render();
  if (button(tree, '範囲を変更')) { button(tree, '範囲を変更').props.onClick(); tree = render(); }
  button(tree, '全範囲').props.onClick(); tree = render();
  const scopeIds = new Set(getGrammarScopesForPracticeSelection({ mode: 'GRAMMAR_CLOZE' }).map(scope => scope.id));
  const target = elements(tree).find(element => element.key === scopeId)!;
  if (!target.props['aria-pressed']) { target.props.onClick(); tree = render(); }
  for (const scope of elements(tree).filter(e => e.type === 'button' && e.props['aria-pressed'] === true
    && scopeIds.has(String(e.key) as GrammarCurriculumScopeId) && e.key !== scopeId)) scope.props.onClick();
  return settle();
};

beforeEach(() => {
  hooks.slots = []; hooks.cursor = 0; hooks.effects.clear(); currentUser = user;
  vi.clearAllMocks();
  api.getDailySessionWords.mockRejectedValue(new Error('Synthetic unavailable vocabulary'));
  api.recordEnglishPracticeAttempt.mockImplementation(async (_uid, payload) => ({
    id: payload.clientAttemptId, deduplicated: false, delegatedQuizAttempt: false, projectionStatus: 'COMPLETE',
  }));
});

describe('authored grammar in the practice hub', () => {
  it('keeps a committed pending attempt for an explicit identical retry and clears the notice only after progress is confirmed', async () => {
    api.recordEnglishPracticeAttempt.mockImplementationOnce(async (_uid, payload) => ({
      id: payload.clientAttemptId, deduplicated: false, delegatedQuizAttempt: true, projectionStatus: 'PENDING',
    }));
    let tree = await settle();
    const source = authoredQuestion(tree);
    button(tree, source.answer).props.onClick(); tree = render();
    button(tree, '判定する').props.onClick(); tree = await settle();
    expect(api.recordEnglishPracticeAttempt).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(tree)).toContain('回答は保存済み');
    const original = structuredClone(api.recordEnglishPracticeAttempt.mock.calls[0][1]);
    button(tree, '保存と進捗を再確認する').props.onClick(); tree = await settle();
    expect(api.recordEnglishPracticeAttempt).toHaveBeenCalledTimes(2);
    expect(api.recordEnglishPracticeAttempt.mock.calls[1][1]).toEqual(original);
    expect(renderToStaticMarkup(tree)).not.toContain('english-practice-save-error');
    expect(renderToStaticMarkup(tree)).toContain(source.explanationJa);
  });

  it('starts undiagnosed grammar with A1 and lets practice difficulty change without assigning a diagnosed level', async () => {
    currentUser = { ...user, englishLevel: undefined };
    let tree = await settle();
    expect(authoredQuestion(tree).level).toBe(EnglishLevel.A1);
    const difficulty = () => elements(tree).find(element => element.props['data-testid'] === 'english-practice-difficulty')!;
    expect(text(difficulty())).toBe('A1 入門');
    button(tree, '長文').props.onClick(); tree = render();
    const levelButton = button(tree, 'B1 標準');
    expect(levelButton.props['aria-pressed']).toBe(false);
    levelButton.props.onClick(); tree = await settle();
    expect(button(tree, 'B1 標準').props['aria-pressed']).toBe(true);
    expect(text(difficulty())).toBe('B1 標準');
    expect(renderToStaticMarkup(tree)).toContain('診断結果ではありません');
    expect(currentUser.englishLevel).toBeUndefined();
    expect(api.recordEnglishPracticeAttempt).not.toHaveBeenCalled();
    button(tree, '文法').props.onClick(); tree = render();
    expect(text(difficulty())).toBe('B1 標準');
    expect(currentUser.englishLevel).toBeUndefined();
  });

  it('shows one contextualized question without revealing the sentence, translation or explanation before checking', async () => {
    const tree = await settle(); const source = authoredQuestion(tree);
    const markup = renderToStaticMarkup(tree);
    expect(elements(tree).filter(e => e.props['data-testid'] === 'grammar-practice-question')).toHaveLength(1);
    expect(markup).toContain(source.contextJa);
    expect(markup).toContain(source.recommendedGradeJa);
    expect(markup).not.toContain(source.sourceSentence);
    expect(markup).not.toContain(source.translationJa);
    expect(markup).not.toContain(source.explanationJa);
    expect(markup).not.toContain('お試し問題です');
    expect(markup).not.toContain('単語を読み込み中');
    expect(button(tree, '次の問題へ').props.disabled).toBe(true);
  });

  it('gives the selected distractor reason immediately, saves despite the vocabulary fallback and rejects repeated check callbacks', async () => {
    let tree = await settle(); const source = authoredQuestion(tree);
    const wrong = source.options.find(option => option !== source.answer)!;
    button(tree, wrong).props.onClick(); tree = render();
    const check = button(tree, '判定する'); check.props.onClick(); check.props.onClick();
    tree = await settle();
    const markup = renderToStaticMarkup(tree);
    expect(markup).toContain(source.explanationJa);
    expect(markup).toContain(source.distractorReasons[wrong]);
    expect(markup).toContain(source.sourceSentence);
    expect(markup).toContain(source.translationJa);
    expect(markup).toContain('<details>');
    expect(api.recordEnglishPracticeAttempt).toHaveBeenCalledTimes(1);
    const payload = api.recordEnglishPracticeAttempt.mock.calls[0][1];
    expect(payload).toMatchObject({ lane: 'grammar', mode: 'GRAMMAR_CLOZE', correct: false, grammarScopeId: source.scopeId, level: source.level });
    expect(payload.wordId).toBeUndefined(); expect(payload.bookId).toBeUndefined();
    expect(payload).not.toHaveProperty('curatedQuestionId');
  });

  it('keeps earlier answers and explanations while advancing and returning to individual questions', async () => {
    let tree = await settle(); const first = authoredQuestion(tree);
    button(tree, first.answer).props.onClick(); tree = render(); button(tree, '判定する').props.onClick();
    tree = await settle();
    const next = button(tree, '次の問題へ'); next.props.onClick(); next.props.onClick(); tree = render();
    expect(renderToStaticMarkup(tree)).toContain('2 / 5 問');
    const second = authoredQuestion(tree);
    expect(second.id).not.toBe(first.id);
    expect(button(tree, '判定する').props.disabled).toBe(true);
    expect(renderToStaticMarkup(tree)).not.toContain('grammar-answer-feedback');
    button(tree, '前の問題を確認').props.onClick(); tree = render();
    expect(authoredQuestion(tree).id).toBe(first.id);
    expect(button(tree, first.answer).props['aria-pressed']).toBe(true);
    expect(button(tree, first.answer).props.disabled).toBe(true);
    expect(renderToStaticMarkup(tree)).toContain(first.explanationJa);
    expect(api.recordEnglishPracticeAttempt).toHaveBeenCalledTimes(1);
  });

  it('accepts the reviewed alternative word order and keeps its correct sentence hidden until checking', async () => {
    let tree = await settle(); button(tree, '英語並び替え').props.onClick(); tree = await settle();
    tree = await selectOnlyScope('basic-svo');
    let source = authoredQuestion(tree);
    if (!source.alternateOrders.length) { button(tree, '問題を更新').props.onClick(); tree = render(); source = authoredQuestion(tree); }
    expect(source.alternateOrders.length).toBeGreaterThan(0);
    expect(renderToStaticMarkup(tree)).not.toContain(source.sourceSentence);
    const chips = elements(question(tree)).filter(e => e.type === 'button' && !['判定する', 'クリア'].includes(text(e)));
    const orderedTexts = source.alternateOrders[0].map(index => source.orderChunks[index].toLowerCase().replace(/[.,!?;:]/g, '').trim());
    for (const chipText of orderedTexts) {
      const chip = chips.find(candidate => text(candidate) === chipText)!;
      expect(chip).toBeTruthy(); chip.props.onClick();
    }
    tree = render(); button(tree, '判定する').props.onClick(); tree = await settle();
    expect(api.recordEnglishPracticeAttempt.mock.calls[0][1].correct).toBe(true);
    expect(renderToStaticMarkup(tree)).toContain(source.sourceSentence);
  });

  it('uses a short unique pool as-is and explicitly stops after its questions are exhausted', async () => {
    await settle(); let tree = await selectOnlyScope('basic-svo');
    const pool = ORIGINAL_GRAMMAR_QUESTIONS.filter(q => q.scopeId === 'basic-svo');
    expect(pool.length).toBeLessThan(5);
    expect(renderToStaticMarkup(tree)).toContain(`選んだ範囲から ${pool.length} 問`);
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i++) {
      const source = authoredQuestion(tree);
      expect(seen.has(source.id)).toBe(false); seen.add(source.id);
      button(tree, source.answer).props.onClick(); tree = render(); button(tree, '判定する').props.onClick();
      tree = await settle();
      button(tree, i === pool.length - 1 ? '次のセットへ' : '次の問題へ').props.onClick();
      tree = render();
    }
    expect(renderToStaticMarkup(tree)).toContain('この範囲で未出題の問題はありません');
    expect(elements(tree).filter(e => e.props['data-testid'] === 'grammar-practice-question')).toHaveLength(0);
  });

  it('reports the selected scope and level for an empty intersection without silently switching scopes', async () => {
    currentUser = { ...user, englishLevel: EnglishLevel.A1 };
    await settle(); const tree = await selectOnlyScope('present-perfect');
    const empty = elements(tree).find(e => e.props['data-testid'] === 'grammar-empty-pool')!;
    expect(text(empty)).toContain('この範囲とレベルで出題できる問題はありません');
    expect(text(empty)).toContain('現在完了');
    expect(text(empty)).toContain('A1 入門');
    expect(elements(tree).filter(e => e.props['data-testid'] === 'grammar-practice-question')).toHaveLength(0);
  });
});
