import type { GrammarCurriculumScopeId, GrammarScopeSelection, WordData } from '../types';
import { resolveGrammarScopeSelection } from './grammarScope';

export type GrammarPracticeKind = 'ENGLISH_WORD_ORDER' | 'JAPANESE_WORD_ORDER' | 'GRAMMAR_CLOZE';

export type GrammarPracticeSource = 'example' | 'fallback';

interface ResolvedPracticeSentence {
  sentence: string;
  source: GrammarPracticeSource;
  japaneseAnswerText?: string;
}

export interface GrammarPracticeChip {
  id: string;
  text: string;
}

interface GrammarPracticeBaseItem {
  id: string;
  kind: GrammarPracticeKind;
  wordId: string;
  bookId: string;
  word: string;
  source: GrammarPracticeSource;
  prompt: string;
  grammarScope: GrammarScopeSelection;
}

export interface EnglishWordOrderPracticeItem extends GrammarPracticeBaseItem {
  kind: 'ENGLISH_WORD_ORDER';
  sourceSentence: string;
  chips: GrammarPracticeChip[];
  correctChipIds: string[];
}

export interface JapaneseWordOrderPracticeItem extends GrammarPracticeBaseItem {
  kind: 'JAPANESE_WORD_ORDER';
  sourceSentence: string;
  answerText: string;
  chips: GrammarPracticeChip[];
  correctChipIds: string[];
}

export interface GrammarClozePracticeItem extends GrammarPracticeBaseItem {
  kind: 'GRAMMAR_CLOZE';
  sourceSentence: string;
  clozeSentence: string;
  answer: string;
  options: string[];
  grammarFocus: string;
}

export type GrammarPracticeItem =
  | EnglishWordOrderPracticeItem
  | JapaneseWordOrderPracticeItem
  | GrammarClozePracticeItem;

export interface BuildGrammarPracticeOptions {
  seed?: string | number;
  maxItemsPerWord?: number;
  requestedScopeId?: GrammarCurriculumScopeId | null;
  japaneseQuestionMode?: 'JA_TRANSLATION_ORDER' | 'JA_TRANSLATION_INPUT';
}

const ENGLISH_CHIP_MIN = 4;
const ENGLISH_CHIP_MAX = 12;
const JAPANESE_CHIP_MIN = 2;
const JAPANESE_CHIP_MAX = 7;

const normalizeWhitespace = (value: string): string => value.trim().replace(/\s+/g, ' ');

const normalizeEnglish = (value: string): string => normalizeWhitespace(value).toLowerCase();

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
    .replace(/^語義\s*[:：]\s*/, '')
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

const hasLatinLetter = (value: string): boolean => /[A-Za-z]/.test(value);

const isSupportedStudyWord = (value: string): boolean => {
  const word = normalizeWhitespace(value);
  return word.length >= 2
    && word.length <= 32
    && hasLatinLetter(word)
    && /^[A-Za-z][A-Za-z\s'-]*[A-Za-z]$/.test(word);
};

export const hasEnoughGrammarPracticeData = (word: Pick<WordData, 'word' | 'definition'>): boolean => (
  isSupportedStudyWord(word.word)
  && normalizeJapanese(word.definition).length >= 2
);

const hashSeed = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createSeededRandom = (seed: string): () => number => {
  let state = hashSeed(seed) || 1;
  return () => {
    state = Math.imul(state ^ (state >>> 15), 1 | state);
    state ^= state + Math.imul(state ^ (state >>> 7), 61 | state);
    return ((state ^ (state >>> 14)) >>> 0) / 4294967296;
  };
};

const deterministicShuffle = <T>(items: T[], seed: string): T[] => {
  const next = [...items];
  const random = createSeededRandom(seed);
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const avoidCorrectOrder = <T>(shuffled: T[], correct: T[]): T[] => {
  if (shuffled.length < 2) return shuffled;
  const sameOrder = shuffled.every((item, index) => item === correct[index]);
  if (!sameOrder) return shuffled;
  return [...shuffled.slice(1), shuffled[0]];
};

const firstSentence = (value?: string | null): string => {
  const text = normalizeWhitespace(value || '');
  if (!text) return '';
  const match = text.match(/^(.+?[.!?])(?:\s|$)/);
  return normalizeWhitespace(match?.[1] || text);
};

const getWordPattern = (word: string): RegExp => {
  const escaped = normalizeWhitespace(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^A-Za-z])(${escaped})(?=$|[^A-Za-z])`, 'i');
};

const findStudyWordInSentence = (sentence: string, word: string): string | null => {
  const exactMatch = sentence.match(getWordPattern(word));
  if (exactMatch?.[2]) return exactMatch[2];

  if (/\s/.test(word)) return null;
  const escaped = normalizeWhitespace(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const inflectedMatch = sentence.match(new RegExp(`(^|[^A-Za-z])(${escaped}(?:s|es|ed|ing)?)(?=$|[^A-Za-z])`, 'i'));
  return inflectedMatch?.[2] || null;
};

const tokenizeEnglishSentence = (sentence: string): string[] => (
  normalizeWhitespace(sentence)
    .split(' ')
    .map((token) => normalizeEnglishOrderToken(token))
    .filter(Boolean)
);

const isUsableEnglishSentence = (sentence: string, word: string): boolean => {
  const tokens = tokenizeEnglishSentence(sentence);
  return tokens.length >= ENGLISH_CHIP_MIN
    && tokens.length <= ENGLISH_CHIP_MAX
    && hasUniqueOrderingTokens(tokens)
    && Boolean(findStudyWordInSentence(sentence, word));
};

const normalizeTermForSentence = (word: string): string => normalizeWhitespace(word).toLowerCase();

const normalizeDefinitionForSentence = (definition: string): string => normalizeJapanese(definition);

const createScopePracticeSentence = (
  word: WordData,
  scopeId: GrammarCurriculumScopeId,
): ResolvedPracticeSentence => {
  const term = normalizeTermForSentence(word.word);
  const meaning = normalizeDefinitionForSentence(word.definition);
  const byScope: Record<GrammarCurriculumScopeId, { sentence: string; japaneseAnswerText: string }> = {
    'basic-svo': {
      sentence: `Students learn the term ${term} today.`,
      japaneseAnswerText: `生徒は ${meaning} という語を 学ぶ`,
    },
    'be-verb': {
      sentence: `The term ${term} is useful today.`,
      japaneseAnswerText: `${meaning} という語は 役に立つ`,
    },
    'modal-base-verb': {
      sentence: `Learners can use the term ${term} today.`,
      japaneseAnswerText: `生徒は ${meaning} という語を 使える`,
    },
    'time-preposition-phrase': {
      sentence: `Learners study the term ${term} before class.`,
      japaneseAnswerText: `生徒は 授業前に ${meaning} という語を 復習する`,
    },
    'to-infinitive': {
      sentence: `Learners hope to master the term ${term}.`,
      japaneseAnswerText: `生徒は ${meaning} という語を 復習する 予定だ`,
    },
    gerund: {
      sentence: `Learners enjoy studying the term ${term}.`,
      japaneseAnswerText: `生徒は ${meaning} という語を 復習することを 楽しむ`,
    },
    comparative: {
      sentence: `The term ${term} is more useful than before.`,
      japaneseAnswerText: `${meaning} という語は 前より 役に立つ`,
    },
    'when-while-clause': {
      sentence: `Learners say the term ${term} when they practice.`,
      japaneseAnswerText: `生徒は 復習するとき ${meaning} という語を 言う`,
    },
    'passive-voice': {
      sentence: `The term ${term} is introduced by teachers today.`,
      japaneseAnswerText: `${meaning} という語は 先生に 紹介される`,
    },
    'present-perfect': {
      sentence: `Learners have practiced the term ${term} today.`,
      japaneseAnswerText: `生徒は 今日 ${meaning} という語を 復習した`,
    },
    'relative-clause': {
      sentence: `The term ${term} that teachers choose is useful.`,
      japaneseAnswerText: `先生が選んだ ${meaning} という語は 役に立つ`,
    },
    'first-conditional': {
      sentence: `If learners study the term ${term} they will remember.`,
      japaneseAnswerText: `生徒が ${meaning} という語を 復習すれば 覚える`,
    },
  };
  return {
    ...byScope[scopeId],
    source: 'fallback',
  };
};

const createFallbackSentence = (word: WordData): ResolvedPracticeSentence => (
  createScopePracticeSentence(word, 'basic-svo')
);

const resolveEnglishSentence = (
  word: WordData,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): ResolvedPracticeSentence => {
  if (requestedScopeId) {
    const scoped = createScopePracticeSentence(word, requestedScopeId);
    if (isUsableEnglishSentence(scoped.sentence, word.word)) return scoped;
  }

  const candidate = firstSentence(word.exampleSentence);
  if (candidate && isUsableEnglishSentence(candidate, word.word)) {
    return { sentence: candidate, source: 'example' };
  }
  return createFallbackSentence(word);
};

const createChips = (texts: string[], seed: string, idPrefix: string): {
  chips: GrammarPracticeChip[];
  correctChipIds: string[];
} => {
  const correctChips = texts.map((text, index) => ({
    id: `${idPrefix}:chip-${index}`,
    text,
  }));
  const shuffled = avoidCorrectOrder(
    deterministicShuffle(correctChips, seed),
    correctChips,
  );
  return {
    chips: shuffled,
    correctChipIds: correctChips.map((chip) => chip.id),
  };
};

const splitJapaneseBySeparators = (value: string): string[] => (
  value
    .split(/[\s、，,／/・（）()「」『』]+/)
    .map((token) => token.trim())
    .filter(Boolean)
);

const splitJapaneseByParticles = (value: string): string[] => (
  value
    .replace(/([はがをにでともへ])(?=[^はがをにでともへ\s])/g, '$1 ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
);

const splitJapaneseDefinition = (value: string): string[] => {
  const text = normalizeJapanese(value);
  const suffixMatch = text.match(/^(.+?)(する|させる|される|できる|した|された)$/);
  if (suffixMatch) return [suffixMatch[1], suffixMatch[2]];

  const adjectiveMatch = text.match(/^(.+?[いな])(.{1,6})$/);
  if (adjectiveMatch && text.length <= 10) return [adjectiveMatch[1], adjectiveMatch[2]];

  if (text.length > 8) return [text.slice(0, Math.ceil(text.length / 2)), text.slice(Math.ceil(text.length / 2))];
  return text ? [text] : [];
};

const compactJapaneseChips = (tokens: string[]): string[] => {
  const compacted: string[] = [];
  tokens.forEach((token) => {
    const normalized = normalizeJapaneseOrderToken(token);
    if (!normalized) return;
    if (normalized.length <= 9) {
      compacted.push(normalized);
      return;
    }
    const middle = Math.ceil(normalized.length / 2);
    compacted.push(normalized.slice(0, middle), normalized.slice(middle));
  });
  return compacted.slice(0, JAPANESE_CHIP_MAX);
};

const tokenizeJapaneseAnswer = (answer: string, definition: string): string[] => {
  const normalized = normalizeJapanese(answer);
  const separated = splitJapaneseBySeparators(normalized);
  const roughTokens = separated.length >= JAPANESE_CHIP_MIN
    ? separated
    : splitJapaneseByParticles(normalized);
  const chips = compactJapaneseChips(roughTokens);
  if (chips.length >= JAPANESE_CHIP_MIN) return chips;
  return compactJapaneseChips(splitJapaneseDefinition(definition));
};

const createFallbackJapaneseAnswer = (word: WordData, scopedAnswerText?: string): string => (
  scopedAnswerText || `意味は ${normalizeJapanese(word.definition)} です。`
);

const resolveJapaneseAnswer = (
  word: WordData,
  scopedAnswerText?: string,
): { answerText: string; source: GrammarPracticeSource } => {
  if (scopedAnswerText) {
    const chips = tokenizeJapaneseAnswer(scopedAnswerText, word.definition);
    if (chips.length >= JAPANESE_CHIP_MIN && chips.length <= JAPANESE_CHIP_MAX && hasUniqueOrderingTokens(chips)) {
      return { answerText: scopedAnswerText, source: 'fallback' };
    }
  }

  const candidate = normalizeJapanese(word.exampleMeaning || '');
  const chips = tokenizeJapaneseAnswer(candidate, word.definition);
  if (candidate && chips.length >= JAPANESE_CHIP_MIN && chips.length <= JAPANESE_CHIP_MAX && hasUniqueOrderingTokens(chips)) {
    return { answerText: candidate, source: 'example' };
  }
  return { answerText: createFallbackJapaneseAnswer(word, scopedAnswerText), source: 'fallback' };
};

const createEnglishWordOrderItem = (
  word: WordData,
  sentence: string,
  source: GrammarPracticeSource,
  grammarScope: GrammarScopeSelection,
  seed: string,
): EnglishWordOrderPracticeItem | null => {
  const tokens = tokenizeEnglishSentence(sentence);
  if (tokens.length < ENGLISH_CHIP_MIN || tokens.length > ENGLISH_CHIP_MAX) return null;
  if (!hasUniqueOrderingTokens(tokens)) return null;
  const id = `${word.id}:english-word-order`;
  return {
    id,
    kind: 'ENGLISH_WORD_ORDER',
    wordId: word.id,
    bookId: word.bookId,
    word: normalizeWhitespace(word.word),
    source,
    prompt: '英単語を正しい英文の順番に並べ替えましょう。',
    grammarScope,
    sourceSentence: sentence,
    ...createChips(tokens, `${seed}:${id}`, id),
  };
};

const createJapaneseWordOrderItem = (
  word: WordData,
  sourceSentence: string,
  scopedAnswerText: string | undefined,
  grammarScope: GrammarScopeSelection,
  seed: string,
): JapaneseWordOrderPracticeItem | null => {
  const resolved = resolveJapaneseAnswer(word, scopedAnswerText);
  const tokens = tokenizeJapaneseAnswer(resolved.answerText, word.definition);
  if (tokens.length < JAPANESE_CHIP_MIN || tokens.length > JAPANESE_CHIP_MAX) return null;
  if (!hasUniqueOrderingTokens(tokens)) return null;

  const id = `${word.id}:japanese-word-order`;
  return {
    id,
    kind: 'JAPANESE_WORD_ORDER',
    wordId: word.id,
    bookId: word.bookId,
    word: normalizeWhitespace(word.word),
    source: resolved.source,
    prompt: '英文に合う日本語を正しい順番に並べ替えましょう。',
    grammarScope,
    sourceSentence,
    answerText: resolved.answerText,
    ...createChips(tokens, `${seed}:${id}`, id),
  };
};

const maskStudyWord = (sentence: string, word: string): { clozeSentence: string; answer: string } | null => {
  const matchedWord = findStudyWordInSentence(sentence, word);
  if (!matchedWord) return null;
  const clozeSentence = sentence.replace(getWordPattern(matchedWord), (match, prefix) => `${prefix}____`);
  return {
    clozeSentence: normalizeWhitespace(clozeSentence),
    answer: matchedWord,
  };
};

const buildWordFormOptions = (answer: string, seed: string): string[] => {
  const normalized = normalizeWhitespace(answer);
  const lower = normalized.toLowerCase();
  const variants = [
    normalized,
    lower.endsWith('e') ? `${normalized.slice(0, -1)}ing` : `${normalized}ing`,
    lower.endsWith('y') ? `${normalized.slice(0, -1)}ies` : `${normalized}s`,
    lower.endsWith('e') ? `${normalized}d` : `${normalized}ed`,
  ];
  const unique = [...new Set(variants.filter(Boolean))].slice(0, 4);
  return deterministicShuffle(unique, seed);
};

const createGrammarClozeItem = (
  word: WordData,
  sentence: string,
  source: GrammarPracticeSource,
  grammarScope: GrammarScopeSelection,
  seed: string,
): GrammarClozePracticeItem | null => {
  const masked = maskStudyWord(sentence, word.word);
  if (!masked) return null;
  const id = `${word.id}:grammar-cloze`;
  return {
    id,
    kind: 'GRAMMAR_CLOZE',
    wordId: word.id,
    bookId: word.bookId,
    word: normalizeWhitespace(word.word),
    source,
    prompt: '空所に入る単語を選び、文の形も確認しましょう。',
    grammarScope,
    sourceSentence: sentence,
    clozeSentence: masked.clozeSentence,
    answer: masked.answer,
    options: buildWordFormOptions(masked.answer, `${seed}:${id}:options`),
    grammarFocus: grammarScope.labelJa,
  };
};

export const buildGrammarPracticeItemsForWord = (
  word: WordData,
  options: BuildGrammarPracticeOptions = {},
): GrammarPracticeItem[] => {
  if (!hasEnoughGrammarPracticeData(word)) return [];

  const seed = String(options.seed ?? 'grammar-practice');
  const english = resolveEnglishSentence(word, options.requestedScopeId);
  const englishGrammarScope = resolveGrammarScopeSelection({
    mode: 'EN_WORD_ORDER',
    requestedScopeId: options.requestedScopeId,
    sentence: english.sentence,
  });
  const japaneseGrammarScope = resolveGrammarScopeSelection({
    mode: options.japaneseQuestionMode ?? 'JA_TRANSLATION_ORDER',
    requestedScopeId: options.requestedScopeId,
    sentence: english.sentence,
  });
  const clozeGrammarScope = resolveGrammarScopeSelection({
    mode: 'GRAMMAR_CLOZE',
    requestedScopeId: options.requestedScopeId,
    sentence: english.sentence,
  });
  const items = [
    createEnglishWordOrderItem(word, english.sentence, english.source, englishGrammarScope, seed),
    createJapaneseWordOrderItem(word, english.sentence, english.japaneseAnswerText, japaneseGrammarScope, seed),
    createGrammarClozeItem(word, english.sentence, english.source, clozeGrammarScope, seed),
  ].filter((item): item is GrammarPracticeItem => Boolean(item));

  return items.slice(0, Math.max(0, options.maxItemsPerWord ?? items.length));
};

export const buildGrammarPracticeItems = (
  words: WordData[],
  options: BuildGrammarPracticeOptions = {},
): GrammarPracticeItem[] => (
  words.flatMap((word) => buildGrammarPracticeItemsForWord(word, options))
);
