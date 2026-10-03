import { ORIGINAL_GRAMMAR_QUESTIONS, type OriginalGrammarQuestion } from '../config/grammarQuestionBank';
import { EnglishLevel, type GrammarCurriculumScopeId } from '../types';
import { compareEnglishLevels, resolveGrammarScopeSelection } from './grammarScope';
import type { EnglishWordOrderPracticeItem, GrammarPracticeItem } from './grammarPractice';

export interface CuratedGrammarPracticeOptions {
  mode: 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER';
  scopeIds?: readonly GrammarCurriculumScopeId[];
  userLevel?: EnglishLevel;
  seed?: string | number;
  questionCount?: number;
  excludeQuestionIds?: readonly string[];
}

const shuffle = <T>(values: readonly T[], seed: string): T[] => {
  let state = 2166136261;
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619) >>> 0;
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
};

const normalizeOrderText = (text: string): string => text
  .normalize('NFKC').toLowerCase().replace(/[“”‘’]/g, "'")
  .replace(/[.,!?;:]/g, '').replace(/\s+/g, ' ').trim();

// Commas distinguish nonrestrictive relative clauses and must stay visible.
const displayOrderChunk = (text: string): string => text
  .normalize('NFKC').toLowerCase().replace(/[“”‘’]/g, "'")
  .replace(/[.!?;:]/g, '').replace(/\s+/g, ' ').trim();

const toPracticeItem = (
  question: OriginalGrammarQuestion, options: CuratedGrammarPracticeOptions,
): GrammarPracticeItem => {
  const id = `${question.id}:${options.mode}`;
  const seed = String(options.seed ?? 'original-grammar');
  const base = {
    id, wordId: '', bookId: '', word: '', source: 'curated' as const,
    grammarScope: {
      ...resolveGrammarScopeSelection({ mode: options.mode, requestedScopeId: question.scopeId }),
      cefrLevel: question.level,
    },
    sourceSentence: question.sourceSentence,
    feedback: {
      questionId: question.id, level: question.level, recommendedGradeJa: question.recommendedGradeJa,
      translationJa: question.translationJa, explanationJa: question.explanationJa,
      distractorReasons: question.distractorReasons, alternativeNotesJa: question.alternativeNotesJa,
    },
  };
  if (options.mode === 'GRAMMAR_CLOZE') return {
    ...base, kind: 'GRAMMAR_CLOZE', prompt: question.contextJa,
    clozeSentence: question.clozeSentence, answer: question.answer,
    options: shuffle(question.options, `${seed}:${id}:options`),
    grammarFocus: base.grammarScope.labelJa,
  };
  const orderedChips = question.orderChunks.map((text, index) => ({
    id: `${id}:chip-${index}`, text: displayOrderChunk(text),
  }));
  const correctChipIds = orderedChips.map(chip => chip.id);
  const shuffled = shuffle(orderedChips, `${seed}:${id}:chips`);
  const chips = shuffled.every((chip, index) => chip.id === correctChipIds[index])
    ? [...shuffled.slice(1), shuffled[0]] : shuffled;
  return {
    ...base, kind: 'ENGLISH_WORD_ORDER',
    prompt: `${question.contextJa} 日本語の意味になるように語句を並べます：${question.translationJa}`,
    chips, correctChipIds,
    acceptedChipOrders: [correctChipIds, ...question.alternateOrders.map(order => order.map(index => correctChipIds[index]))],
  };
};

/** Authored grammar has no fictional Word/Book association and never enters SRS. */
export const buildCuratedGrammarPracticeItems = (options: CuratedGrammarPracticeOptions): GrammarPracticeItem[] => {
  const requestedCount = options.questionCount ?? 5;
  if (!Number.isFinite(requestedCount)) return [];
  const limit = Math.max(0, Math.min(60, Math.floor(requestedCount)));
  if (limit === 0) return [];
  const scopes = options.scopeIds ? new Set(options.scopeIds) : null;
  const excluded = new Set(options.excludeQuestionIds ?? []);
  const level = options.userLevel ?? EnglishLevel.B1;
  const seed = String(options.seed ?? 'original-grammar');
  const eligible = ORIGINAL_GRAMMAR_QUESTIONS.filter(question =>
    (!scopes || scopes.has(question.scopeId)) && !excluded.has(question.id)
    && compareEnglishLevels(question.level, level) <= 0);
  const groups = new Map<GrammarCurriculumScopeId, OriginalGrammarQuestion[]>();
  for (const question of shuffle(eligible, `${seed}:questions`)) {
    const group = groups.get(question.scopeId) ?? [];
    group.push(question);
    groups.set(question.scopeId, group);
  }
  const queues = shuffle([...groups.values()], `${seed}:scopes`);
  const selected: OriginalGrammarQuestion[] = [];
  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const queue of queues) {
      if (queue[round]) { selected.push(queue[round]); added = true; }
      if (selected.length === limit) break;
    }
    if (!added) break;
  }
  return selected.map(question => toPracticeItem(question, options));
};

/** Text comparison accepts identical-chip swaps and explicitly reviewed alternative orders. */
export const isGrammarPracticeOrderCorrect = (
  item: EnglishWordOrderPracticeItem, selectedChipIds: readonly string[],
): boolean => {
  if (selectedChipIds.length !== item.correctChipIds.length || new Set(selectedChipIds).size !== selectedChipIds.length) return false;
  const chipById = new Map(item.chips.map(chip => [chip.id, chip.text]));
  if (selectedChipIds.some(id => !chipById.has(id))) return false;
  const orderedText = (ids: readonly string[]) => normalizeOrderText(ids.map(id => chipById.get(id) ?? '').join(' '));
  const selectedText = orderedText(selectedChipIds);
  return (item.acceptedChipOrders ?? [item.correctChipIds]).some(order => orderedText(order) === selectedText);
};
