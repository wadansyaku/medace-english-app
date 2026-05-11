import {
  EnglishLevel,
  type GrammarCurriculumScopeId,
  type GrammarScopeSelection,
  type WordData,
} from '../types';
import {
  getGrammarCurriculumScope,
  isEnglishLevelAtLeast,
  isGrammarScopeCompatibleWithMode,
  resolveGrammarScopeSelection,
} from './grammarScope';

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
  userLevel?: EnglishLevel;
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

interface ScopePracticeSentenceTemplate {
  levelMin: EnglishLevel;
  sentence: (term: string) => string;
  japaneseAnswerText: (meaning: string) => string;
}

const template = (
  levelMin: EnglishLevel,
  sentence: ScopePracticeSentenceTemplate['sentence'],
  japaneseAnswerText: ScopePracticeSentenceTemplate['japaneseAnswerText'],
): ScopePracticeSentenceTemplate => ({
  levelMin,
  sentence,
  japaneseAnswerText,
});

const SCOPE_PRACTICE_SENTENCE_POOLS: Record<GrammarCurriculumScopeId, ScopePracticeSentenceTemplate[]> = {
  'basic-svo': [
    template(EnglishLevel.A1, (term) => `Students learn the word ${term} today.`, (meaning) => `生徒は 今日 ${meaning} という語を 学ぶ`),
    template(EnglishLevel.A1, (term) => `Teachers review the word ${term} after lunch.`, (meaning) => `先生は 昼食後に ${meaning} という語を 復習する`),
    template(EnglishLevel.A2, (term) => `Learners use the word ${term} in class.`, (meaning) => `生徒は 授業で ${meaning} という語を 使う`),
  ],
  'be-verb': [
    template(EnglishLevel.A1, (term) => `The word ${term} is useful today.`, (meaning) => `${meaning} という語は 今日 役に立つ`),
    template(EnglishLevel.A1, (term) => `The English word ${term} is useful today.`, (meaning) => `${meaning} は 今日 役に立つ 英単語だ`),
  ],
  'basic-tense': [
    template(EnglishLevel.A1, (term) => `Students reviewed the word ${term} yesterday.`, (meaning) => `生徒は 昨日 ${meaning} という語を 復習した`),
    template(EnglishLevel.A2, (term) => `Students will review the word ${term} tomorrow.`, (meaning) => `生徒は 明日 ${meaning} という語を 復習する`),
  ],
  'progressive-aspect': [
    template(EnglishLevel.A2, (term) => `Students are reviewing the word ${term} now.`, (meaning) => `生徒は 今 ${meaning} という語を 復習している`),
    template(EnglishLevel.A2, (term) => `Teachers are explaining the word ${term} today.`, (meaning) => `先生は 今日 ${meaning} という語を 説明している`),
  ],
  'modal-base-verb': [
    template(EnglishLevel.A1, (term) => `Learners can use the word ${term} today.`, (meaning) => `生徒は 今日 ${meaning} という語を 使える`),
    template(EnglishLevel.A2, (term) => `Students should review the word ${term} again.`, (meaning) => `生徒は もう一度 ${meaning} という語を 復習すべきだ`),
  ],
  'time-preposition-phrase': [
    template(EnglishLevel.A1, (term) => `Learners study the word ${term} before class.`, (meaning) => `生徒は 授業前に ${meaning} という語を 復習する`),
    template(EnglishLevel.A2, (term) => `Students review the word ${term} during lunch.`, (meaning) => `生徒は 昼食中に ${meaning} という語を 復習する`),
  ],
  'to-infinitive': [
    template(EnglishLevel.A2, (term) => `Learners hope to master the word ${term}.`, (meaning) => `生徒は ${meaning} という語を 身につけたい`),
    template(EnglishLevel.A2, (term) => `Students need to review the word ${term} today.`, (meaning) => `生徒は 今日 ${meaning} という語を 復習する 必要がある`),
  ],
  gerund: [
    template(EnglishLevel.A2, (term) => `Learners enjoy studying the word ${term}.`, (meaning) => `生徒は ${meaning} という語を 学ぶことを 楽しむ`),
    template(EnglishLevel.B1, (term) => `Students avoid forgetting the word ${term}.`, (meaning) => `生徒は ${meaning} という語を 忘れることを 避ける`),
  ],
  'participle-modifier': [
    template(EnglishLevel.B1, (term) => `The word ${term} used in class is useful.`, (meaning) => `授業で使われた ${meaning} という語は 役に立つ`),
    template(EnglishLevel.B1, (term) => `Learners reading the word ${term} speak carefully.`, (meaning) => `${meaning} という語を 読んでいる 生徒は 慎重に話す`),
  ],
  comparative: [
    template(EnglishLevel.A2, (term) => `The word ${term} is more useful than before.`, (meaning) => `${meaning} という語は 以前より 役に立つ`),
    template(EnglishLevel.B1, (term) => `Students remember the word ${term} better today.`, (meaning) => `生徒は 今日 ${meaning} という語を よりよく 覚えている`),
  ],
  'pronoun-reference': [
    template(EnglishLevel.A1, (term) => `Students learn the word ${term} and use it.`, (meaning) => `生徒は ${meaning} という語を 学び それを使う`),
    template(EnglishLevel.A2, (term) => `Teachers write the word ${term} because it matters.`, (meaning) => `先生は 大切なので ${meaning} という語を 書く`),
  ],
  'when-while-clause': [
    template(EnglishLevel.A2, (term) => `Learners say the word ${term} when they practice.`, (meaning) => `生徒は 練習するとき ${meaning} という語を 言う`),
    template(EnglishLevel.A2, (term) => `Students review the word ${term} while they listen.`, (meaning) => `生徒は 聞きながら ${meaning} という語を 復習する`),
  ],
  'passive-voice': [
    template(EnglishLevel.A2, (term) => `The word ${term} is introduced by teachers today.`, (meaning) => `${meaning} という語は 今日 先生に 紹介される`),
    template(EnglishLevel.B1, (term) => `The word ${term} was chosen by students yesterday.`, (meaning) => `${meaning} という語は 昨日 生徒に 選ばれた`),
  ],
  'present-perfect': [
    template(EnglishLevel.A2, (term) => `Learners have practiced the word ${term} today.`, (meaning) => `生徒は 今日 ${meaning} という語を 復習した`),
    template(EnglishLevel.B1, (term) => `Teachers have used the word ${term} for weeks.`, (meaning) => `先生は 何週間も ${meaning} という語を 使っている`),
  ],
  'relative-clause': [
    template(EnglishLevel.B1, (term) => `The word ${term} that teachers choose is useful.`, (meaning) => `先生が選んだ ${meaning} という語は 役に立つ`),
    template(EnglishLevel.B1, (term) => `Students like the word ${term} which appears often.`, (meaning) => `生徒は よく出る ${meaning} という語を 好む`),
  ],
  'first-conditional': [
    template(EnglishLevel.A2, (term) => `If learners study the word ${term} they will remember it.`, (meaning) => `生徒が ${meaning} という語を 学べば それを覚える`),
    template(EnglishLevel.B1, (term) => `If students review the word ${term} they can answer.`, (meaning) => `生徒が ${meaning} という語を 復習すれば 答えられる`),
  ],
  'subjunctive-mood': [
    template(EnglishLevel.B1, (term) => `If learners knew the word ${term} they would answer quickly.`, (meaning) => `生徒が ${meaning} という語を 知っていれば すぐ答えるだろう`),
    template(EnglishLevel.B2, (term) => `If students had reviewed the word ${term} they would remember.`, (meaning) => `生徒が ${meaning} という語を 復習していたら 覚えていただろう`),
  ],
  'subject-verb-agreement': [
    template(EnglishLevel.A2, (term) => `The list of terms includes ${term} today.`, (meaning) => `語の一覧には 今日 ${meaning} が 含まれる`),
    template(EnglishLevel.B1, (term) => `Each student reviews the word ${term}.`, (meaning) => `それぞれの 生徒が ${meaning} という語を 復習する`),
  ],
  'interrogative-word-order': [
    template(EnglishLevel.A1, (term) => `How do learners use the word ${term}?`, (meaning) => `生徒は どのように ${meaning} という語を 使うか`),
    template(EnglishLevel.A2, (term) => `Why should students review the word ${term}?`, (meaning) => `なぜ 生徒は ${meaning} という語を 復習すべきか`),
  ],
  'negation-emphasis': [
    template(EnglishLevel.A2, (term) => `Learners do not ignore the word ${term}.`, (meaning) => `生徒は ${meaning} という語を 無視しない`),
    template(EnglishLevel.B1, (term) => `Students do remember the word ${term} today.`, (meaning) => `生徒は 今日 ${meaning} という語を 本当に 覚えている`),
  ],
  'reported-speech': [
    template(EnglishLevel.B1, (term) => `Teachers said that learners used the word ${term}.`, (meaning) => `先生は 生徒が ${meaning} という語を 使ったと 言った`),
    template(EnglishLevel.B1, (term) => `Students reported that the word ${term} was clear.`, (meaning) => `生徒は ${meaning} という語が 明確だったと 報告した`),
  ],
  'verb-patterns': [
    template(EnglishLevel.A2, (term) => `Teachers ask learners to use the word ${term}.`, (meaning) => `先生は 生徒に ${meaning} という語を 使うよう 求める`),
    template(EnglishLevel.B1, (term) => `Students spend time reviewing the word ${term}.`, (meaning) => `生徒は ${meaning} という語を 復習するのに 時間を使う`),
  ],
  'adjective-adverb-usage': [
    template(EnglishLevel.A2, (term) => `Learners use the word ${term} carefully.`, (meaning) => `生徒は ${meaning} という語を 慎重に 使う`),
    template(EnglishLevel.B1, (term) => `The word ${term} is clear enough today.`, (meaning) => `${meaning} という語は 今日 十分に 明確だ`),
  ],
  'noun-usage': [
    template(EnglishLevel.A2, (term) => `The word ${term} has a clear meaning.`, (meaning) => `${meaning} という語には 明確な 意味がある`),
    template(EnglishLevel.B1, (term) => `A learner records the word ${term} as information.`, (meaning) => `生徒は ${meaning} という語を 情報として 記録する`),
  ],
  'idiomatic-expression': [
    template(EnglishLevel.B1, (term) => `Learners look up the word ${term} after class.`, (meaning) => `生徒は 授業後に ${meaning} という語を 調べる`),
    template(EnglishLevel.B1, (term) => `Students take note of the word ${term}.`, (meaning) => `生徒は ${meaning} という語に 注意を払う`),
  ],
  'conversation-expression': [
    template(EnglishLevel.A1, (term) => `Could you explain the word ${term} today?`, (meaning) => `今日 ${meaning} という語を 説明してくれますか`),
    template(EnglishLevel.A2, (term) => `Would you like to review the word ${term}?`, (meaning) => `${meaning} という語を 復習したいですか`),
  ],
};

const selectScopePracticeTemplate = (
  scopeId: GrammarCurriculumScopeId,
  seed: string,
  userLevel?: EnglishLevel,
): ScopePracticeSentenceTemplate => {
  const scope = getGrammarCurriculumScope(scopeId);
  const levelCeiling = userLevel ?? scope.levelMin;
  const templates = SCOPE_PRACTICE_SENTENCE_POOLS[scopeId];
  const eligibleTemplates = templates.filter((item) => isEnglishLevelAtLeast(levelCeiling, item.levelMin));
  const pool = eligibleTemplates.length > 0 ? eligibleTemplates : templates;
  const random = createSeededRandom(`${seed}:${scopeId}:template`);
  return pool[Math.floor(random() * pool.length)] || pool[0];
};

const createScopePracticeSentence = (
  word: WordData,
  scopeId: GrammarCurriculumScopeId,
  seed: string,
  userLevel?: EnglishLevel,
): ResolvedPracticeSentence => {
  const term = normalizeTermForSentence(word.word);
  const meaning = normalizeDefinitionForSentence(word.definition);
  const selectedTemplate = selectScopePracticeTemplate(scopeId, `${seed}:${word.id}:${term}`, userLevel);
  return {
    sentence: selectedTemplate.sentence(term),
    japaneseAnswerText: selectedTemplate.japaneseAnswerText(meaning),
    source: 'fallback',
  };
};

const createFallbackSentence = (
  word: WordData,
  seed = 'fallback',
  userLevel?: EnglishLevel,
): ResolvedPracticeSentence => (
  createScopePracticeSentence(word, 'basic-svo', seed, userLevel)
);

const resolveEnglishSentence = (
  word: WordData,
  requestedScopeId?: GrammarCurriculumScopeId | null,
  seed = 'grammar-practice',
  userLevel?: EnglishLevel,
): ResolvedPracticeSentence => {
  if (requestedScopeId) {
    const scoped = createScopePracticeSentence(word, requestedScopeId, seed, userLevel);
    if (isUsableEnglishSentence(scoped.sentence, word.word)) return scoped;
  }

  const candidate = firstSentence(word.exampleSentence);
  if (candidate && isUsableEnglishSentence(candidate, word.word)) {
    return { sentence: candidate, source: 'example' };
  }
  return createFallbackSentence(word, seed, userLevel);
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

interface GrammarClozeTargetSpec {
  answerPattern: RegExp;
  answer: string;
  options: string[];
}

interface GrammarClozeMask {
  clozeSentence: string;
  answer: string;
  options?: string[];
}

const grammarClozeTargetSpecs: Partial<Record<GrammarCurriculumScopeId, GrammarClozeTargetSpec[]>> = {
  'basic-svo': [
    { answerPattern: /\blearn\b/i, answer: 'learn', options: ['learn', 'learns', 'learned', 'learning'] },
    { answerPattern: /\breview\b/i, answer: 'review', options: ['review', 'reviews', 'reviewed', 'reviewing'] },
    { answerPattern: /\buse\b/i, answer: 'use', options: ['use', 'uses', 'used', 'using'] },
  ],
  'be-verb': [
    { answerPattern: /\bis\b/i, answer: 'is', options: ['is', 'are', 'am', 'be'] },
    { answerPattern: /\bare\b/i, answer: 'are', options: ['is', 'are', 'am', 'be'] },
  ],
  'basic-tense': [
    { answerPattern: /\breviewed\b/i, answer: 'reviewed', options: ['review', 'reviews', 'reviewed', 'reviewing'] },
    { answerPattern: /\bwill review\b/i, answer: 'will review', options: ['reviewed', 'reviews', 'will review', 'is reviewing'] },
  ],
  'progressive-aspect': [
    { answerPattern: /\bare reviewing\b/i, answer: 'are reviewing', options: ['review', 'reviews', 'are reviewing', 'reviewed'] },
    { answerPattern: /\bare explaining\b/i, answer: 'are explaining', options: ['explain', 'explains', 'are explaining', 'explained'] },
  ],
  'modal-base-verb': [
    { answerPattern: /\bcan\b/i, answer: 'can', options: ['can', 'should', 'must', 'will'] },
    { answerPattern: /\bshould\b/i, answer: 'should', options: ['can', 'should', 'must', 'will'] },
  ],
  'time-preposition-phrase': [
    { answerPattern: /\bbefore\b/i, answer: 'before', options: ['before', 'during', 'after', 'in'] },
    { answerPattern: /\bduring\b/i, answer: 'during', options: ['before', 'during', 'after', 'at'] },
  ],
  'to-infinitive': [
    { answerPattern: /\bto master\b/i, answer: 'to master', options: ['master', 'to master', 'mastering', 'mastered'] },
    { answerPattern: /\bto review\b/i, answer: 'to review', options: ['review', 'to review', 'reviewing', 'reviewed'] },
  ],
  gerund: [
    { answerPattern: /\bstudying\b/i, answer: 'studying', options: ['study', 'to study', 'studying', 'studied'] },
    { answerPattern: /\bforgetting\b/i, answer: 'forgetting', options: ['forget', 'to forget', 'forgetting', 'forgot'] },
  ],
  'participle-modifier': [
    { answerPattern: /\bused\b/i, answer: 'used', options: ['use', 'used', 'using', 'to use'] },
    { answerPattern: /\breading\b/i, answer: 'reading', options: ['read', 'reading', 'to read', 'reads'] },
  ],
  comparative: [
    { answerPattern: /\bmore useful than\b/i, answer: 'more useful than', options: ['useful', 'more useful than', 'most useful', 'as useful'] },
    { answerPattern: /\bbetter\b/i, answer: 'better', options: ['good', 'better', 'best', 'well'] },
  ],
  'pronoun-reference': [
    { answerPattern: /\bit\b/i, answer: 'it', options: ['it', 'them', 'him', 'there'] },
  ],
  'when-while-clause': [
    { answerPattern: /\bwhen\b/i, answer: 'when', options: ['when', 'because', 'if', 'although'] },
    { answerPattern: /\bwhile\b/i, answer: 'while', options: ['when', 'while', 'because', 'after'] },
  ],
  'passive-voice': [
    { answerPattern: /\bis introduced\b/i, answer: 'is introduced', options: ['introduces', 'introduced', 'is introduced', 'are introduced'] },
    { answerPattern: /\bwas chosen\b/i, answer: 'was chosen', options: ['chooses', 'chosen', 'was chosen', 'were chosen'] },
  ],
  'present-perfect': [
    { answerPattern: /\bhave practiced\b/i, answer: 'have practiced', options: ['practice', 'practiced', 'have practiced', 'are practicing'] },
    { answerPattern: /\bhave used\b/i, answer: 'have used', options: ['use', 'used', 'have used', 'are using'] },
  ],
  'relative-clause': [
    { answerPattern: /\bthat\b/i, answer: 'that', options: ['that', 'because', 'if', 'when'] },
    { answerPattern: /\bwhich\b/i, answer: 'which', options: ['which', 'because', 'when', 'what'] },
  ],
  'first-conditional': [
    { answerPattern: /\bIf\b/, answer: 'If', options: ['If', 'Although', 'Because', 'Before'] },
    { answerPattern: /\bwill remember\b/i, answer: 'will remember', options: ['remembered', 'remembers', 'will remember', 'remembering'] },
  ],
  'subjunctive-mood': [
    { answerPattern: /\bwould answer\b/i, answer: 'would answer', options: ['answer', 'answered', 'would answer', 'will answer'] },
    { answerPattern: /\bhad reviewed\b/i, answer: 'had reviewed', options: ['reviewed', 'has reviewed', 'had reviewed', 'will review'] },
  ],
  'subject-verb-agreement': [
    { answerPattern: /\bincludes\b/i, answer: 'includes', options: ['include', 'includes', 'included', 'including'] },
    { answerPattern: /\breviews\b/i, answer: 'reviews', options: ['review', 'reviews', 'reviewed', 'reviewing'] },
  ],
  'interrogative-word-order': [
    { answerPattern: /\bHow do\b/i, answer: 'How do', options: ['How do', 'How does', 'How did', 'How is'] },
    { answerPattern: /\bWhy should\b/i, answer: 'Why should', options: ['Why should', 'Why does', 'Why is', 'Why did'] },
  ],
  'negation-emphasis': [
    { answerPattern: /\bdo not\b/i, answer: 'do not', options: ['do not', 'does not', 'did not', 'is not'] },
    { answerPattern: /\bdo remember\b/i, answer: 'do remember', options: ['remember', 'does remember', 'do remember', 'remembered'] },
  ],
  'reported-speech': [
    { answerPattern: /\bsaid that\b/i, answer: 'said that', options: ['say that', 'said that', 'says that', 'saying that'] },
    { answerPattern: /\breported that\b/i, answer: 'reported that', options: ['report that', 'reports that', 'reported that', 'reporting that'] },
  ],
  'verb-patterns': [
    { answerPattern: /\bto use\b/i, answer: 'to use', options: ['use', 'to use', 'using', 'used'] },
    { answerPattern: /\breviewing\b/i, answer: 'reviewing', options: ['review', 'to review', 'reviewing', 'reviewed'] },
  ],
  'adjective-adverb-usage': [
    { answerPattern: /\bcarefully\b/i, answer: 'carefully', options: ['careful', 'carefully', 'careless', 'care'] },
    { answerPattern: /\benough\b/i, answer: 'enough', options: ['enough', 'too', 'very', 'many'] },
  ],
  'noun-usage': [
    { answerPattern: /\bmeaning\b/i, answer: 'meaning', options: ['mean', 'meaning', 'meant', 'means'] },
    { answerPattern: /\binformation\b/i, answer: 'information', options: ['information', 'informations', 'inform', 'informed'] },
  ],
  'idiomatic-expression': [
    { answerPattern: /\blook up\b/i, answer: 'look up', options: ['look', 'look up', 'look at', 'look for'] },
    { answerPattern: /\btake note of\b/i, answer: 'take note of', options: ['take note', 'take note of', 'take notes', 'take over'] },
  ],
  'conversation-expression': [
    { answerPattern: /\bCould you\b/i, answer: 'Could you', options: ['Could you', 'Do you', 'Are you', 'Did you'] },
    { answerPattern: /\bWould you like to\b/i, answer: 'Would you like to', options: ['Would you like to', 'Do you like', 'Are you like', 'Did you like'] },
  ],
};

const maskGrammarTarget = (
  sentence: string,
  scopeId: GrammarCurriculumScopeId,
  seed: string,
): GrammarClozeMask | null => {
  const specs = grammarClozeTargetSpecs[scopeId] || [];
  for (const spec of specs) {
    const match = sentence.match(spec.answerPattern);
    if (match?.[0] && typeof match.index === 'number') {
      const clozeSentence = normalizeWhitespace(`${sentence.slice(0, match.index)}____${sentence.slice(match.index + match[0].length)}`);
      const options = deterministicShuffle([...new Set(spec.options)], `${seed}:${scopeId}:${spec.answer}`).slice(0, 4);
      return {
        clozeSentence,
        answer: spec.answer,
        options: options.includes(spec.answer) ? options : deterministicShuffle([spec.answer, ...options].slice(0, 4), `${seed}:${scopeId}:with-answer`),
      };
    }
  }
  return null;
};

const createGrammarClozeItem = (
  word: WordData,
  sentence: string,
  source: GrammarPracticeSource,
  grammarScope: GrammarScopeSelection,
  seed: string,
): GrammarClozePracticeItem | null => {
  const grammarMasked = maskGrammarTarget(sentence, grammarScope.scopeId, seed);
  const masked: GrammarClozeMask | null = grammarMasked ?? maskStudyWord(sentence, word.word);
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
    options: masked.options ?? buildWordFormOptions(masked.answer, `${seed}:${id}:options`),
    grammarFocus: grammarScope.labelJa,
  };
};

export const buildGrammarPracticeItemsForWord = (
  word: WordData,
  options: BuildGrammarPracticeOptions = {},
): GrammarPracticeItem[] => {
  if (!hasEnoughGrammarPracticeData(word)) return [];

  const seed = String(options.seed ?? 'grammar-practice');
  const japaneseQuestionMode = options.japaneseQuestionMode ?? 'JA_TRANSLATION_ORDER';
  const canBuildJapaneseItem = !options.requestedScopeId
    || isGrammarScopeCompatibleWithMode(options.requestedScopeId, japaneseQuestionMode);
  const english = resolveEnglishSentence(word, options.requestedScopeId, seed, options.userLevel);
  const englishGrammarScope = resolveGrammarScopeSelection({
    mode: 'EN_WORD_ORDER',
    requestedScopeId: options.requestedScopeId,
    sentence: english.sentence,
  });
  const japaneseGrammarScope = canBuildJapaneseItem
    ? resolveGrammarScopeSelection({
      mode: japaneseQuestionMode,
      requestedScopeId: options.requestedScopeId,
      sentence: english.sentence,
    })
    : null;
  const clozeGrammarScope = resolveGrammarScopeSelection({
    mode: 'GRAMMAR_CLOZE',
    requestedScopeId: options.requestedScopeId,
    sentence: english.sentence,
  });
  const items = [
    createEnglishWordOrderItem(word, english.sentence, english.source, englishGrammarScope, seed),
    japaneseGrammarScope
      ? createJapaneseWordOrderItem(word, english.sentence, english.japaneseAnswerText, japaneseGrammarScope, seed)
      : null,
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
