import type { GrammarCurriculumScopeId, WorksheetQuestionMode } from '../types';
import { buildGrammarScopeExplanation, resolveGrammarScopeSelection } from './grammarScope';
import type { GeneratedWorksheetQuestion, WorksheetOrderToken } from './worksheet';

type GrammarQuestionMode = Extract<WorksheetQuestionMode, 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER' | 'JA_TRANSLATION_ORDER' | 'JA_TRANSLATION_INPUT'>;

export interface AiGrammarSourceWord {
  wordId?: string;
  id?: string;
  word: string;
  definition: string;
  bookId: string;
  bookTitle?: string;
}

export interface AiGrammarQuestionDraft {
  wordId: string;
  mode: GrammarQuestionMode;
  promptText?: string;
  sourceSentence?: string;
  sourceTranslation?: string;
  answer?: string;
  options?: string[];
  orderedTokens?: string[];
  grammarFocus?: string;
  instruction?: string;
}

const EN_ORDER_MIN_TOKENS = 4;
const EN_ORDER_MAX_TOKENS = 14;
const JA_ORDER_MIN_TOKENS = 2;
const JA_ORDER_MAX_TOKENS = 8;

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, ' ');

const normalizeEnglishOrderToken = (value: string): string => (
  normalizeWhitespace(value)
    .replace(/^[“"‘'([{]+/g, '')
    .replace(/[.,!?;:。．…、，"”’)\]}]+$/g, '')
    .toLowerCase()
);

const normalizeJapanese = (value: string): string => (
  value
    .trim()
    .normalize('NFKC')
    .replace(/[。．.]+$/g, '')
    .replace(/\s+/g, ' ')
);

const normalizeJapaneseOrderToken = (value: string): string => (
  normalizeJapanese(value)
    .replace(/^[「『（(【［\["'“‘]+/g, '')
    .replace(/[」』）)】］\]"'”’、，,。．.!?！？]+$/g, '')
);

const hasUniqueOrderingTokens = (tokens: string[]): boolean => {
  const normalizedTokens = tokens.map((token) => normalizeWhitespace(token).toLowerCase());
  return normalizedTokens.length === new Set(normalizedTokens).size;
};

const toWordId = (word: AiGrammarSourceWord): string => word.wordId || word.id || `${word.bookId}:${word.word}`;

const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seed: string): () => number => {
  let state = stableHash(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
};

const shuffleStable = <T>(items: T[], seed: string): T[] => {
  const next = [...items];
  const random = createSeededRandom(seed);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const avoidOriginalOrder = <T>(items: T[], original: T[]): T[] => {
  if (items.length < 2) return items;
  const unchanged = items.every((item, index) => item === original[index]);
  return unchanged ? [...items.slice(1), items[0]] : items;
};

const uniqueNormalized = (values: string[]): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach((value) => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    next.push(normalized);
  });
  return next;
};

const cleanTokens = (values: string[], normalizeToken = normalizeWhitespace): string[] => (
  values
    .map((value) => normalizeToken(value))
    .filter(Boolean)
);

const tokenizeEnglish = (value: string): string[] => (
  normalizeWhitespace(value)
    .split(' ')
    .map((token) => normalizeEnglishOrderToken(token))
    .filter(Boolean)
);

const tokenizeJapanese = (value: string): string[] => {
  const normalized = normalizeJapanese(value);
  const separated = normalized
    .split(/[\s、，,／/・（）()「」『』]+/)
    .map((token) => normalizeJapaneseOrderToken(token))
    .filter(Boolean);
  if (separated.length >= JA_ORDER_MIN_TOKENS) return separated.slice(0, JA_ORDER_MAX_TOKENS);
  if (normalized.length > 8) {
    const middle = Math.ceil(normalized.length / 2);
    return [normalized.slice(0, middle), normalized.slice(middle)]
      .map((token) => normalizeJapaneseOrderToken(token))
      .filter(Boolean);
  }
  return normalized ? [normalizeJapaneseOrderToken(normalized)].filter(Boolean) : [];
};

const buildFallbackOptions = (answer: string, learnedWord: string): string[] => {
  const normalized = normalizeWhitespace(answer || learnedWord);
  const lower = normalized.toLowerCase();
  const variants = [
    normalized,
    lower.endsWith('e') ? `${normalized.slice(0, -1)}ing` : `${normalized}ing`,
    lower.endsWith('y') ? `${normalized.slice(0, -1)}ies` : `${normalized}s`,
    lower.endsWith('e') ? `${normalized}d` : `${normalized}ed`,
  ];
  return uniqueNormalized(variants).slice(0, 4);
};

const ensureOptions = (options: string[] | undefined, answer: string, learnedWord: string): string[] => {
  const merged = uniqueNormalized([answer, ...(options || []), ...buildFallbackOptions(answer, learnedWord)]);
  return merged.slice(0, Math.max(3, Math.min(4, merged.length)));
};

const shuffleOptions = (options: string[], answer: string, seed: string): string[] => {
  const shuffled = shuffleStable(options, seed);
  const answerIndex = shuffled.findIndex((option) => option.toLowerCase() === answer.toLowerCase());
  if (answerIndex !== 0 || shuffled.length < 2) return shuffled;

  const swapIndex = 1 + (stableHash(`${seed}:answer-position`) % (shuffled.length - 1));
  [shuffled[0], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[0]];
  return shuffled;
};

const createOrderTokens = (
  orderedTexts: string[],
  wordId: string,
  learnedWord: string,
  seed: string,
): { tokens: WorksheetOrderToken[]; answerTokenIds: string[] } => {
  const correctTokens = orderedTexts.map((text, index) => ({
    id: `${wordId}:ai-token-${index}`,
    text,
    learnedWordId: wordId,
    learnedWord,
  }));
  const shuffled = avoidOriginalOrder(shuffleStable(correctTokens, seed), correctTokens);
  return {
    tokens: shuffled,
    answerTokenIds: correctTokens.map((token) => token.id),
  };
};

const normalizeClozeDraft = (
  draft: AiGrammarQuestionDraft,
  sourceWord: AiGrammarSourceWord,
  index: number,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): GeneratedWorksheetQuestion | null => {
  const wordId = toWordId(sourceWord);
  const answer = normalizeWhitespace(draft.answer || sourceWord.word);
  const promptText = normalizeWhitespace(draft.promptText || '');
  if (!answer || !promptText.includes('____')) return null;

  const options = shuffleOptions(
    ensureOptions(draft.options, answer, sourceWord.word),
    answer,
    `${wordId}:ai-cloze:${index}`,
  );
  if (options.length < 3 || !options.some((option) => option.toLowerCase() === answer.toLowerCase())) return null;

  const sourceSentence = normalizeWhitespace(
    draft.sourceSentence || promptText.replace('____', answer),
  );
  const grammarScope = resolveGrammarScopeSelection({
    mode: 'GRAMMAR_CLOZE',
    requestedScopeId,
    sentence: sourceSentence,
  });

  return {
    id: `${wordId}:ai:${draft.mode}:${index}`,
    mode: 'GRAMMAR_CLOZE',
    interactionType: 'CHOICE',
    wordId,
    bookId: sourceWord.bookId,
    bookTitle: sourceWord.bookTitle,
    promptLabel: grammarScope.labelJa,
    promptText,
    answer,
    options,
    sourceSentence,
    grammarFocus: grammarScope.labelJa,
    grammarScope,
    grammarExplanation: buildGrammarScopeExplanation(grammarScope),
    instruction: normalizeWhitespace(draft.instruction || 'AIが作った文で、空所に入る語形と文の形を確認します。'),
  };
};

const normalizeEnglishOrderDraft = (
  draft: AiGrammarQuestionDraft,
  sourceWord: AiGrammarSourceWord,
  index: number,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): GeneratedWorksheetQuestion | null => {
  const wordId = toWordId(sourceWord);
  const sourceSentence = normalizeWhitespace(draft.sourceSentence || '');
  const orderedTokens = cleanTokens(draft.orderedTokens && draft.orderedTokens.length > 0
    ? draft.orderedTokens
    : tokenizeEnglish(sourceSentence), normalizeEnglishOrderToken);
  if (orderedTokens.length < EN_ORDER_MIN_TOKENS || orderedTokens.length > EN_ORDER_MAX_TOKENS) return null;
  if (!hasUniqueOrderingTokens(orderedTokens)) return null;

  const order = createOrderTokens(orderedTokens, wordId, sourceWord.word, `${wordId}:ai-en:${index}`);
  const grammarScope = resolveGrammarScopeSelection({
    mode: 'EN_WORD_ORDER',
    requestedScopeId,
    sentence: sourceSentence || orderedTokens.join(' '),
  });
  return {
    id: `${wordId}:ai:${draft.mode}:${index}`,
    mode: 'EN_WORD_ORDER',
    interactionType: 'ORDERING',
    wordId,
    bookId: sourceWord.bookId,
    bookTitle: sourceWord.bookTitle,
    promptLabel: '英語語順',
    promptText: normalizeWhitespace(draft.promptText || '英単語を正しい英文の順番に並べ替えましょう。'),
    answer: orderedTokens.join(' '),
    tokens: order.tokens,
    answerTokenIds: order.answerTokenIds,
    sourceSentence: sourceSentence || orderedTokens.join(' '),
    grammarFocus: grammarScope.labelJa,
    grammarScope,
    grammarExplanation: buildGrammarScopeExplanation(grammarScope),
    instruction: normalizeWhitespace(draft.instruction || 'AIが作った英文を、文の構造を意識して組み立てます。'),
  };
};

const normalizeJapaneseOrderDraft = (
  draft: AiGrammarQuestionDraft,
  sourceWord: AiGrammarSourceWord,
  index: number,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): GeneratedWorksheetQuestion | null => {
  const wordId = toWordId(sourceWord);
  const sourceSentence = normalizeWhitespace(draft.sourceSentence || '');
  const sourceTranslation = normalizeJapanese(draft.sourceTranslation || draft.answer || '');
  const orderedTokens = cleanTokens(draft.orderedTokens && draft.orderedTokens.length > 0
    ? draft.orderedTokens
    : tokenizeJapanese(sourceTranslation), normalizeJapaneseOrderToken);
  if (!sourceSentence || orderedTokens.length < JA_ORDER_MIN_TOKENS || orderedTokens.length > JA_ORDER_MAX_TOKENS) return null;
  if (!hasUniqueOrderingTokens(orderedTokens)) return null;

  const order = createOrderTokens(orderedTokens, wordId, sourceWord.word, `${wordId}:ai-ja:${index}`);
  const grammarScope = resolveGrammarScopeSelection({
    mode: 'JA_TRANSLATION_ORDER',
    requestedScopeId,
    sentence: sourceSentence,
  });
  return {
    id: `${wordId}:ai:${draft.mode}:${index}`,
    mode: 'JA_TRANSLATION_ORDER',
    interactionType: 'ORDERING',
    wordId,
    bookId: sourceWord.bookId,
    bookTitle: sourceWord.bookTitle,
    promptLabel: '日本語語順',
    promptText: normalizeWhitespace(draft.promptText || '英文に合う日本語を正しい順番に並べ替えましょう。'),
    answer: sourceTranslation || orderedTokens.join(''),
    tokens: order.tokens,
    answerTokenIds: order.answerTokenIds,
    sourceSentence,
    sourceTranslation: sourceTranslation || orderedTokens.join(''),
    grammarFocus: grammarScope.labelJa,
    grammarScope,
    grammarExplanation: buildGrammarScopeExplanation(grammarScope),
    instruction: normalizeWhitespace(draft.instruction || 'AIが作った英文を手がかりに、自然な日本語の順番へ戻します。'),
  };
};

const normalizeJapaneseInputDraft = (
  draft: AiGrammarQuestionDraft,
  sourceWord: AiGrammarSourceWord,
  index: number,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): GeneratedWorksheetQuestion | null => {
  const wordId = toWordId(sourceWord);
  const sourceSentence = normalizeWhitespace(draft.sourceSentence || draft.promptText || '');
  const sourceTranslation = normalizeJapanese(draft.sourceTranslation || draft.answer || '');
  if (!sourceSentence || !sourceTranslation) return null;

  const grammarScope = resolveGrammarScopeSelection({
    mode: 'JA_TRANSLATION_INPUT',
    requestedScopeId,
    sentence: sourceSentence,
  });

  return {
    id: `${wordId}:ai:${draft.mode}:${index}`,
    mode: 'JA_TRANSLATION_INPUT',
    interactionType: 'TEXT_INPUT',
    wordId,
    bookId: sourceWord.bookId,
    bookTitle: sourceWord.bookTitle,
    promptLabel: '和訳全文入力',
    promptText: sourceSentence,
    answer: sourceTranslation,
    sourceSentence,
    sourceTranslation,
    grammarFocus: grammarScope.labelJa,
    grammarScope,
    grammarExplanation: buildGrammarScopeExplanation(grammarScope),
    instruction: normalizeWhitespace(draft.instruction || 'AIが作った英文を読み、自然な日本語訳を最後まで入力します。'),
  };
};

export const normalizeAiGrammarQuestionDrafts = (
  drafts: AiGrammarQuestionDraft[],
  sourceWords: AiGrammarSourceWord[],
  mode: GrammarQuestionMode,
  questionCount: number,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): GeneratedWorksheetQuestion[] => {
  const sourceById = new Map(sourceWords.map((word) => [toWordId(word), word]));
  const usedWordIds = new Set<string>();

  return drafts
    .map((draft, index) => {
      if (draft.mode !== mode) return null;
      const sourceWord = sourceById.get(draft.wordId);
      if (!sourceWord || usedWordIds.has(toWordId(sourceWord))) return null;
      const question = mode === 'GRAMMAR_CLOZE'
        ? normalizeClozeDraft(draft, sourceWord, index, requestedScopeId)
        : mode === 'EN_WORD_ORDER'
          ? normalizeEnglishOrderDraft(draft, sourceWord, index, requestedScopeId)
          : mode === 'JA_TRANSLATION_ORDER'
            ? normalizeJapaneseOrderDraft(draft, sourceWord, index, requestedScopeId)
            : normalizeJapaneseInputDraft(draft, sourceWord, index, requestedScopeId);
      if (!question) return null;
      usedWordIds.add(toWordId(sourceWord));
      return question;
    })
    .filter((question): question is GeneratedWorksheetQuestion => Boolean(question))
    .slice(0, Math.max(0, questionCount));
};
