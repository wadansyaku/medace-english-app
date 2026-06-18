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
    && !hasMetaStudyWordReference(sentence, word)
    && Boolean(findStudyWordInSentence(sentence, word));
};

const normalizeTermForSentence = (word: string): string => normalizeWhitespace(word).toLowerCase();

const normalizeDefinitionForSentence = (definition: string): string => normalizeJapanese(definition);

interface ScopePracticeSentenceTemplate {
  levelMin: EnglishLevel;
  sentence: (usage: PracticeTermUsage) => string;
  japaneseAnswerText: (meaning: string) => string;
}

interface PracticeTermUsage {
  base: string;
  nounPhrase: string;
  pronoun: 'it' | 'them';
  bePresent: 'is' | 'are';
  bePast: 'was' | 'were';
  actionBase: string;
  actionThird: string;
  actionPast: string;
  actionParticiple: string;
  actionIng: string;
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

const isConsonantBeforeFinalY = (value: string): boolean => /[^aeiou]y$/i.test(value);

const toThirdPersonSingular = (verb: string): string => {
  const lower = verb.toLowerCase();
  if (isConsonantBeforeFinalY(lower)) return `${verb.slice(0, -1)}ies`;
  if (/(s|x|z|ch|sh|o)$/i.test(lower)) return `${verb}es`;
  return `${verb}s`;
};

const toRegularPast = (verb: string): string => {
  const lower = verb.toLowerCase();
  if (lower.endsWith('e')) return `${verb}d`;
  if (isConsonantBeforeFinalY(lower)) return `${verb.slice(0, -1)}ied`;
  return `${verb}ed`;
};

const toPresentParticiple = (verb: string): string => {
  const lower = verb.toLowerCase();
  if (lower.endsWith('ie')) return `${verb.slice(0, -2)}ying`;
  if (lower.endsWith('e') && !/(ee|ye|oe)$/i.test(lower)) return `${verb.slice(0, -1)}ing`;
  return `${verb}ing`;
};

const inferPracticeTermRole = (word: WordData): 'verb' | 'adjective' | 'adverb' | 'noun' => {
  const term = normalizeTermForSentence(word.word);
  const meaning = normalizeDefinitionForSentence(word.definition);
  if (term.endsWith('ly') || /に$/.test(meaning)) return 'adverb';
  if (/(する|させる|される|できる|える|う)$/.test(meaning)) return 'verb';
  if (/(い|な|的|の)$/.test(meaning)) return 'adjective';
  return 'noun';
};

const buildPracticeTermUsage = (word: WordData): PracticeTermUsage => {
  const base = normalizeTermForSentence(word.word);
  const role = inferPracticeTermRole(word);

  if (role === 'verb') {
    return {
      base,
      nounPhrase: `${toPresentParticiple(base)} the process`,
      pronoun: 'it',
      bePresent: 'is',
      bePast: 'was',
      actionBase: `${base} the process`,
      actionThird: `${toThirdPersonSingular(base)} the process`,
      actionPast: `${toRegularPast(base)} the process`,
      actionParticiple: `${toRegularPast(base)} the process`,
      actionIng: `${toPresentParticiple(base)} the process`,
    };
  }

  if (role === 'adjective') {
    return {
      base,
      nounPhrase: `${base} cases`,
      pronoun: 'them',
      bePresent: 'are',
      bePast: 'were',
      actionBase: `choose ${base} cases`,
      actionThird: `chooses ${base} cases`,
      actionPast: `chose ${base} cases`,
      actionParticiple: `chosen ${base} cases`,
      actionIng: `choosing ${base} cases`,
    };
  }

  if (role === 'adverb') {
    return {
      base,
      nounPhrase: `responding ${base}`,
      pronoun: 'it',
      bePresent: 'is',
      bePast: 'was',
      actionBase: `respond ${base}`,
      actionThird: `responds ${base}`,
      actionPast: `responded ${base}`,
      actionParticiple: `responded ${base}`,
      actionIng: `responding ${base}`,
    };
  }

  return {
    base,
    nounPhrase: `the ${base}`,
    pronoun: 'it',
    bePresent: 'is',
    bePast: 'was',
    actionBase: `study the ${base}`,
    actionThird: `studies the ${base}`,
    actionPast: `studied the ${base}`,
    actionParticiple: `studied the ${base}`,
    actionIng: `studying the ${base}`,
  };
};

const hasMetaStudyWordReference = (sentence: string, word: string): boolean => {
  const escaped = normalizeWhitespace(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`\\b(?:the\\s+)?(?:word|term)\\s+${escaped}\\b`, 'i').test(sentence);
};

const SCOPE_PRACTICE_SENTENCE_POOLS: Record<GrammarCurriculumScopeId, ScopePracticeSentenceTemplate[]> = {
  'basic-svo': [
    template(EnglishLevel.A1, ({ actionBase }) => `Students ${actionBase} today.`, (meaning) => `生徒は 今日 ${meaning} を 使う`),
    template(EnglishLevel.A1, ({ nounPhrase }) => `Teachers check ${nounPhrase} after class.`, (meaning) => `先生は 授業後に ${meaning} を 確認する`),
    template(EnglishLevel.A2, ({ actionThird }) => `A nurse ${actionThird} in reports.`, (meaning) => `看護師は 報告書で ${meaning} を 使う`),
    template(EnglishLevel.A2, ({ nounPhrase }) => `Visitors saw ${nounPhrase} at museums.`, (meaning) => `来館者は 博物館で ${meaning} を 見た`),
  ],
  'be-verb': [
    template(EnglishLevel.A1, ({ nounPhrase, bePresent }) => `${nounPhrase} ${bePresent} still useful.`, (meaning) => `${meaning} は 今も 役に立つ`),
    template(EnglishLevel.A1, ({ nounPhrase }) => `Notes about ${nounPhrase} are clear today.`, (meaning) => `${meaning} についての メモは 今日 明確だ`),
    template(EnglishLevel.A2, ({ nounPhrase, bePast }) => `${nounPhrase} ${bePast} important in this passage.`, (meaning) => `${meaning} は この文章で 重要だった`),
    template(EnglishLevel.A2, ({ base }) => `The example with ${base} was helpful.`, (meaning) => `${meaning} を 含む 例は 役に立った`),
  ],
  'basic-tense': [
    template(EnglishLevel.A1, ({ actionPast }) => `Students ${actionPast} yesterday.`, (meaning) => `生徒は 昨日 ${meaning} を 使った`),
    template(EnglishLevel.A2, ({ actionBase }) => `The class will ${actionBase} tomorrow.`, (meaning) => `クラスは 明日 ${meaning} を 使う`),
    template(EnglishLevel.A2, ({ actionPast }) => `A student ${actionPast} in yesterday's answer.`, (meaning) => `生徒は 昨日の答案で ${meaning} を 使った`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `A reporter checked ${nounPhrase} last night.`, (meaning) => `記者は 昨夜 ${meaning} を 確認した`),
  ],
  'progressive-aspect': [
    template(EnglishLevel.A2, ({ actionIng }) => `Students are ${actionIng} now.`, (meaning) => `生徒は 今 ${meaning} を 使っている`),
    template(EnglishLevel.A2, ({ nounPhrase }) => `Teachers are checking ${nounPhrase} during class.`, (meaning) => `先生は 授業中に ${meaning} を 確認している`),
    template(EnglishLevel.B1, ({ actionIng }) => `Volunteers were ${actionIng} before events.`, (meaning) => `ボランティアは 行事前に ${meaning} を 使っていた`),
  ],
  'modal-base-verb': [
    template(EnglishLevel.A1, ({ actionBase }) => `Learners can ${actionBase} today.`, (meaning) => `生徒は 今日 ${meaning} を 使える`),
    template(EnglishLevel.A2, ({ nounPhrase }) => `Students should check ${nounPhrase} again.`, (meaning) => `生徒は もう一度 ${meaning} を 確認すべきだ`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `A guide must explain ${nounPhrase} clearly.`, (meaning) => `ガイドは ${meaning} を 明確に 説明しなければならない`),
  ],
  'time-preposition-phrase': [
    template(EnglishLevel.A1, ({ nounPhrase }) => `Learners check ${nounPhrase} before class.`, (meaning) => `生徒は 授業前に ${meaning} を 確認する`),
    template(EnglishLevel.A2, ({ nounPhrase }) => `Students review ${nounPhrase} during lunch.`, (meaning) => `生徒は 昼食中に ${meaning} を 復習する`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `Doctors discussed ${nounPhrase} after surgery.`, (meaning) => `医師は 手術後に ${meaning} を 話し合った`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `The team has studied ${nounPhrase} since April.`, (meaning) => `チームは 4月から ${meaning} を 学んでいる`),
  ],
  'to-infinitive': [
    template(EnglishLevel.A2, ({ actionBase }) => `Learners plan to ${actionBase} today.`, (meaning) => `生徒は 今日 ${meaning} を 使う 予定だ`),
    template(EnglishLevel.A2, ({ nounPhrase }) => `Students need to review ${nounPhrase} carefully.`, (meaning) => `生徒は ${meaning} を 慎重に 復習する 必要がある`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `A team met to discuss ${nounPhrase}.`, (meaning) => `チームは ${meaning} を 話し合うために 集まった`),
  ],
  gerund: [
    template(EnglishLevel.A2, ({ actionIng }) => `Learners enjoy ${actionIng}.`, (meaning) => `生徒は ${meaning} を 使うことを 楽しむ`),
    template(EnglishLevel.B1, ({ actionIng }) => `Students avoid ${actionIng} vaguely.`, (meaning) => `生徒は ${meaning} を 曖昧に 使うことを 避ける`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `A blogger kept explaining ${nounPhrase} online.`, (meaning) => `ブロガーは オンラインで ${meaning} を 説明し続けた`),
  ],
  'participle-modifier': [
    template(EnglishLevel.B1, ({ nounPhrase }) => `${nounPhrase} used in class matters.`, (meaning) => `授業で使われた ${meaning} は 重要だ`),
    template(EnglishLevel.B1, ({ actionIng }) => `Students ${actionIng} speak carefully.`, (meaning) => `${meaning} を 使っている 生徒は 慎重に話す`),
    template(EnglishLevel.B2, ({ nounPhrase }) => `Examples written about ${nounPhrase} sound natural.`, (meaning) => `${meaning} について 書かれた 例は 自然に聞こえる`),
  ],
  comparative: [
    template(EnglishLevel.A2, ({ base }) => `This answer with ${base} is clearer than before.`, (meaning) => `${meaning} を 含む 答案は 以前より 明確だ`),
    template(EnglishLevel.B1, ({ base }) => `Using ${base} is better than guessing.`, (meaning) => `${meaning} を 使うことは 推測するより よい`),
    template(EnglishLevel.B1, ({ base }) => `This example with ${base} sounds more natural.`, (meaning) => `${meaning} を 含む この例は より自然に聞こえる`),
  ],
  'pronoun-reference': [
    template(EnglishLevel.A1, ({ nounPhrase, pronoun }) => `Students study ${nounPhrase} and remember ${pronoun}.`, (meaning) => `生徒は ${meaning} を 学び それを覚える`),
    template(EnglishLevel.A2, ({ nounPhrase, pronoun }) => `Teachers explain ${nounPhrase} because ${pronoun} matters.`, (meaning) => `先生は 大切なので ${meaning} を 説明する`),
    template(EnglishLevel.B1, ({ nounPhrase, pronoun }) => `A child found ${nounPhrase} and remembered ${pronoun}.`, (meaning) => `子どもは ${meaning} を 見つけ それを覚えた`),
  ],
  'when-while-clause': [
    template(EnglishLevel.A2, ({ actionBase }) => `Learners ${actionBase} when they practice.`, (meaning) => `生徒は 練習するとき ${meaning} を 使う`),
    template(EnglishLevel.A2, ({ nounPhrase }) => `Students review ${nounPhrase} while they listen.`, (meaning) => `生徒は 聞きながら ${meaning} を 復習する`),
    template(EnglishLevel.B1, ({ actionPast }) => `Travelers ${actionPast} when asking directions.`, (meaning) => `旅行者は 道を尋ねるとき ${meaning} を 使った`),
  ],
  'passive-voice': [
    template(EnglishLevel.A2, ({ nounPhrase, bePresent }) => `${nounPhrase} ${bePresent} checked by teachers today.`, (meaning) => `${meaning} は 今日 先生に 確認される`),
    template(EnglishLevel.B1, ({ nounPhrase, bePresent }) => `${nounPhrase} ${bePresent} used by many writers in answers.`, (meaning) => `${meaning} は 答案で 多くの書き手に 使われる`),
    template(EnglishLevel.B1, ({ nounPhrase, bePast }) => `${nounPhrase} ${bePast} chosen by students yesterday.`, (meaning) => `${meaning} は 昨日 生徒に 選ばれた`),
    template(EnglishLevel.B1, ({ base }) => `Examples with ${base} were reviewed by coaches.`, (meaning) => `${meaning} を 含む 例は コーチに 復習された`),
  ],
  'present-perfect': [
    template(EnglishLevel.A2, ({ actionParticiple }) => `Learners have ${actionParticiple} today.`, (meaning) => `生徒は 今日 ${meaning} を 使った`),
    template(EnglishLevel.B1, ({ actionParticiple }) => `Teachers have ${actionParticiple} for weeks.`, (meaning) => `先生は 何週間も ${meaning} を 使っている`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `Nurses have written about ${nounPhrase} in reports.`, (meaning) => `看護師は 報告書で ${meaning} について 書いてきた`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `The class has studied ${nounPhrase} since April.`, (meaning) => `クラスは 4月から ${meaning} を 学んでいる`),
  ],
  'relative-clause': [
    template(EnglishLevel.B1, ({ base }) => `An example with ${base} that teachers choose matters.`, (meaning) => `先生が選んだ ${meaning} を 含む 例は 重要だ`),
    template(EnglishLevel.B1, ({ actionBase }) => `An answer that helps students ${actionBase} sounds precise.`, (meaning) => `生徒が ${meaning} を 使うのを 助ける 答案は 正確に聞こえる`),
    template(EnglishLevel.B1, ({ base }) => `Students like examples which include ${base}.`, (meaning) => `生徒は ${meaning} を 含む 例を 好む`),
    template(EnglishLevel.B2, ({ base }) => `A sentence that contains ${base} matters.`, (meaning) => `${meaning} を 含む 文は 重要だ`),
  ],
  'first-conditional': [
    template(EnglishLevel.A2, ({ actionBase, pronoun }) => `If learners ${actionBase} they will remember ${pronoun}.`, (meaning) => `生徒が ${meaning} を 使えば それを覚える`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `If students review ${nounPhrase} they can answer.`, (meaning) => `生徒が ${meaning} を 復習すれば 答えられる`),
    template(EnglishLevel.B1, ({ actionBase, pronoun }) => `If readers ${actionBase} they will remember ${pronoun}.`, (meaning) => `読者が ${meaning} を 使えば それを覚える`),
  ],
  'subjunctive-mood': [
    template(EnglishLevel.B1, ({ nounPhrase }) => `If learners knew ${nounPhrase} they would answer quickly.`, (meaning) => `生徒が ${meaning} を 知っていれば すぐ答えるだろう`),
    template(EnglishLevel.B2, ({ nounPhrase }) => `If students had reviewed ${nounPhrase} they would remember.`, (meaning) => `生徒が ${meaning} を 復習していたら 覚えていただろう`),
    template(EnglishLevel.B2, ({ nounPhrase }) => `If readers knew ${nounPhrase} they would answer clearly.`, (meaning) => `読者が ${meaning} を 知っていれば 明確に答えるだろう`),
  ],
  'subject-verb-agreement': [
    template(EnglishLevel.A2, ({ base }) => `The list of examples includes ${base} today.`, (meaning) => `例の一覧には 今日 ${meaning} が 含まれる`),
    template(EnglishLevel.B1, ({ actionThird }) => `Each student ${actionThird}.`, (meaning) => `それぞれの 生徒が ${meaning} を 使う`),
    template(EnglishLevel.B1, ({ base }) => `A set of answers includes ${base} today.`, (meaning) => `答案の組には 今日 ${meaning} が 含まれる`),
  ],
  'interrogative-word-order': [
    template(EnglishLevel.A1, ({ actionBase }) => `How do learners ${actionBase}?`, (meaning) => `生徒は どのように ${meaning} を 使うか`),
    template(EnglishLevel.A2, ({ nounPhrase }) => `Why should students review ${nounPhrase}?`, (meaning) => `なぜ 生徒は ${meaning} を 復習すべきか`),
    template(EnglishLevel.B1, ({ actionBase }) => `When did travelers ${actionBase}?`, (meaning) => `旅行者は いつ ${meaning} を 使ったか`),
  ],
  'negation-emphasis': [
    template(EnglishLevel.A2, ({ nounPhrase }) => `Learners do not ignore ${nounPhrase}.`, (meaning) => `生徒は ${meaning} を 無視しない`),
    template(EnglishLevel.B1, ({ actionBase }) => `Students do ${actionBase} today.`, (meaning) => `生徒は 今日 本当に ${meaning} を 使う`),
    template(EnglishLevel.B1, ({ actionBase }) => `Not every writer can ${actionBase} correctly.`, (meaning) => `すべての 書き手が ${meaning} を 正しく使えるわけではない`),
  ],
  'reported-speech': [
    template(EnglishLevel.B1, ({ actionPast }) => `Teachers said that learners ${actionPast}.`, (meaning) => `先生は 生徒が ${meaning} を 使ったと 言った`),
    template(EnglishLevel.B1, ({ nounPhrase, bePast }) => `Students reported that ${nounPhrase} ${bePast} clear.`, (meaning) => `生徒は ${meaning} が 明確だったと 報告した`),
    template(EnglishLevel.B2, ({ nounPhrase }) => `A coach explained that players needed ${nounPhrase}.`, (meaning) => `コーチは 選手が ${meaning} を 必要としていると 説明した`),
  ],
  'verb-patterns': [
    template(EnglishLevel.A2, ({ actionBase }) => `Teachers ask learners to ${actionBase}.`, (meaning) => `先生は 生徒に ${meaning} を 使うよう 求める`),
    template(EnglishLevel.B1, ({ actionIng }) => `Students spend time ${actionIng}.`, (meaning) => `生徒は ${meaning} を 使うのに 時間を使う`),
    template(EnglishLevel.B1, ({ actionBase }) => `A mentor helped interns ${actionBase}.`, (meaning) => `指導者は 研修生が ${meaning} を 使うのを 助けた`),
  ],
  'adjective-adverb-usage': [
    template(EnglishLevel.A2, ({ actionBase }) => `Learners ${actionBase} carefully.`, (meaning) => `生徒は ${meaning} を 慎重に 使う`),
    template(EnglishLevel.B1, ({ nounPhrase, bePresent }) => `${nounPhrase} ${bePresent} clear enough today.`, (meaning) => `${meaning} は 今日 十分に 明確だ`),
    template(EnglishLevel.B1, ({ actionPast }) => `A writer ${actionPast} more carefully.`, (meaning) => `書き手は ${meaning} を より慎重に 使った`),
  ],
  'noun-usage': [
    template(EnglishLevel.A2, ({ nounPhrase }) => `${nounPhrase} has clear meaning.`, (meaning) => `${meaning} には 明確な 意味がある`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `A learner records ${nounPhrase} as information.`, (meaning) => `生徒は ${meaning} を 情報として 記録する`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `This note gives advice about ${nounPhrase}.`, (meaning) => `このメモは ${meaning} について 助言を 与える`),
  ],
  'idiomatic-expression': [
    template(EnglishLevel.B1, ({ nounPhrase }) => `Learners look up ${nounPhrase} after class.`, (meaning) => `生徒は 授業後に ${meaning} を 調べる`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `Students take note of ${nounPhrase}.`, (meaning) => `生徒は ${meaning} に 注意を払う`),
    template(EnglishLevel.B1, ({ nounPhrase }) => `Readers kept an eye on ${nounPhrase}.`, (meaning) => `読者は ${meaning} に 注意を向け続けた`),
  ],
  'conversation-expression': [
    template(EnglishLevel.A1, ({ nounPhrase }) => `Could you explain ${nounPhrase} today?`, (meaning) => `今日 ${meaning} を 説明してくれますか`),
    template(EnglishLevel.A2, ({ nounPhrase }) => `Would you like to review ${nounPhrase}?`, (meaning) => `${meaning} を 復習したいですか`),
    template(EnglishLevel.A2, ({ actionBase }) => `Could you ${actionBase} now?`, (meaning) => `今 ${meaning} を 使ってくれますか`),
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
  const usage = buildPracticeTermUsage(word);
  const selectedTemplate = selectScopePracticeTemplate(scopeId, `${seed}:${word.id}:${term}`, userLevel);
  return {
    sentence: selectedTemplate.sentence(usage),
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

const buildWordFormOptions = (answer: string, seed: string, sourceWord?: WordData): string[] => {
  const normalized = normalizeWhitespace(answer);
  const lower = normalized.toLowerCase();
  const role = sourceWord ? inferPracticeTermRole(sourceWord) : 'verb';
  const variants = role === 'adjective'
    ? [
      normalized,
      `${normalized}ly`,
      `${normalized}ness`,
      `more ${normalized}`,
    ]
    : role === 'noun'
      ? [
        normalized,
        lower.endsWith('s') ? normalized.slice(0, -1) : `${normalized}s`,
        `a ${normalized}`,
        `the ${normalized}`,
      ]
      : role === 'adverb'
        ? [
          normalized,
          lower.endsWith('ly') ? normalized.slice(0, -2) : `${normalized}ly`,
          `more ${normalized}`,
          `${normalized}er`,
        ]
        : [
          normalized,
          toPresentParticiple(normalized),
          toThirdPersonSingular(normalized),
          toRegularPast(normalized),
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
    { answerPattern: /\bwill\b/i, answer: 'will', options: ['will', 'did', 'has', 'is'] },
    { answerPattern: /\byesterday\b/i, answer: 'yesterday', options: ['yesterday', 'tomorrow', 'now', 'next week'] },
    { answerPattern: /\blast night\b/i, answer: 'last night', options: ['last night', 'tomorrow', 'now', 'next week'] },
  ],
  'progressive-aspect': [
    { answerPattern: /\bare\b/i, answer: 'are', options: ['are', 'do', 'have', 'will'] },
    { answerPattern: /\bwere\b/i, answer: 'were', options: ['were', 'did', 'have', 'will'] },
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
    { answerPattern: /\bto review\b/i, answer: 'to review', options: ['review', 'to review', 'reviewing', 'reviewed'] },
    { answerPattern: /\bto discuss\b/i, answer: 'to discuss', options: ['discuss', 'to discuss', 'discussing', 'discussed'] },
    { answerPattern: /\bto\b/i, answer: 'to', options: ['to', 'for', 'by', 'with'] },
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
    { answerPattern: /\bis checked\b/i, answer: 'is checked', options: ['checks', 'checked', 'is checked', 'are checked'] },
    { answerPattern: /\bis used\b/i, answer: 'is used', options: ['uses', 'used', 'is used', 'are used'] },
    { answerPattern: /\bis introduced\b/i, answer: 'is introduced', options: ['introduces', 'introduced', 'is introduced', 'are introduced'] },
    { answerPattern: /\bwas chosen\b/i, answer: 'was chosen', options: ['chooses', 'chosen', 'was chosen', 'were chosen'] },
    { answerPattern: /\bwere reviewed\b/i, answer: 'were reviewed', options: ['review', 'reviewed', 'were reviewed', 'was reviewed'] },
  ],
  'present-perfect': [
    { answerPattern: /\bhave\b/i, answer: 'have', options: ['have', 'did', 'are', 'will'] },
    { answerPattern: /\bhas studied\b/i, answer: 'has studied', options: ['study', 'studied', 'has studied', 'is studying'] },
    { answerPattern: /\bsince\b/i, answer: 'since', options: ['since', 'for', 'during', 'until'] },
    { answerPattern: /\bfor weeks\b/i, answer: 'for weeks', options: ['for weeks', 'since weeks', 'during weeks', 'until weeks'] },
  ],
  'relative-clause': [
    { answerPattern: /\bthat\b/i, answer: 'that', options: ['that', 'because', 'if', 'when'] },
    { answerPattern: /\bwhich\b/i, answer: 'which', options: ['which', 'because', 'when', 'what'] },
  ],
  'first-conditional': [
    { answerPattern: /\bwill remember\b/i, answer: 'will remember', options: ['remembered', 'remembers', 'will remember', 'remembering'] },
    { answerPattern: /\bIf\b/, answer: 'If', options: ['If', 'Although', 'Because', 'Before'] },
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
    options: masked.options ?? buildWordFormOptions(masked.answer, `${seed}:${id}:options`, word),
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
