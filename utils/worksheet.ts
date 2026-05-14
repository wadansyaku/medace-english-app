import {
  StudentWorksheetWord,
  WordData,
  type GrammarCurriculumScopeId,
  type GrammarScopeExplanation,
  type GrammarScopeSelection,
  type JapaneseTranslationFeedback,
  WorksheetQuestionMode,
} from '../types';
import { GRAMMAR_WORKSHEET_MODES } from '../config/grammarCurriculum';
import { getBookProgressionIndex } from '../shared/bookProgression';
import { buildGrammarScopeExplanation } from './grammarScope';
import {
  buildGrammarPracticeItemsForWord,
  hasEnoughGrammarPracticeData,
  type GrammarPracticeChip,
  type GrammarPracticeItem,
} from './grammarPractice';

type WorksheetSourceWord = Pick<StudentWorksheetWord, 'word' | 'definition' | 'bookId' | 'bookTitle'> & {
  wordId?: string;
  id?: string;
  number?: number;
  exampleSentence?: string | null;
  exampleMeaning?: string | null;
};

export interface WorksheetOrderToken {
  id: string;
  text: string;
  learnedWordId?: string;
  learnedWord?: string;
};

export interface GeneratedWorksheetQuestion {
  id: string;
  mode: WorksheetQuestionMode;
  interactionType: 'CHOICE' | 'TEXT_INPUT' | 'ORDERING';
  wordId: string;
  bookId: string;
  bookTitle?: string;
  promptLabel: string;
  promptText: string;
  answer: string;
  options?: string[];
  tokens?: WorksheetOrderToken[];
  answerTokenIds?: string[];
  sourceSentence?: string;
  sourceTranslation?: string;
  grammarFocus?: string;
  grammarScope?: GrammarScopeSelection;
  grammarExplanation?: GrammarScopeExplanation;
  translationFeedback?: JapaneseTranslationFeedback;
  showGrammarScopeHint?: boolean;
  generatedProblemId?: string;
  aiContentId?: string;
  instruction?: string;
  hintPrefix?: string;
  maskedAnswer?: string;
}

export const WORKSHEET_MODE_COPY: Record<WorksheetQuestionMode, { label: string; description: string; }> = {
  EN_TO_JA: {
    label: '英語 -> 日本語',
    description: '英単語を見て、日本語の意味を素早く確認します。',
  },
  JA_TO_EN: {
    label: '日本語 -> 英語',
    description: '意味から英語を思い出し、逆向きの想起を鍛えます。',
  },
  SPELLING_HINT: {
    label: 'スペルチェック',
    description: 'まずは全文入力し、必要なときだけ先頭2文字ヒントで確認します。',
  },
  GRAMMAR_CLOZE: {
    label: '文法穴埋め',
    description: '登場済みの単語を英文の空所に入れて、単語と文の形を一緒に確認します。',
  },
  EN_WORD_ORDER: {
    label: '英語語順並び替え',
    description: '例文や復習文を英単語チップに分け、正しい英文の順番へ戻します。',
  },
  JA_TRANSLATION_ORDER: {
    label: '日本語並び替え',
    description: '英文を見て、日本語の意味チップを自然な順番へ戻します。',
  },
  JA_TRANSLATION_INPUT: {
    label: '日本語全文入力',
    description: '英文を見て、日本語訳を全文で入力し、表現の抜けを確認します。',
  },
};

const shuffle = <T>(items: T[]): T[] => {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
};

const toWordId = (word: WorksheetSourceWord): string => word.wordId || word.id || `${word.bookId}:${word.word}`;

export const isGrammarWorksheetMode = (mode: WorksheetQuestionMode): boolean => (
  (GRAMMAR_WORKSHEET_MODES as readonly WorksheetQuestionMode[]).includes(mode)
);

const toPracticeWord = (word: WorksheetSourceWord, index = 0): WordData => ({
  id: toWordId(word),
  bookId: word.bookId,
  number: word.number ?? index + 1,
  word: word.word,
  definition: word.definition,
  exampleSentence: word.exampleSentence,
  exampleMeaning: word.exampleMeaning,
});

export const canGenerateWorksheetQuestionForWord = (
  word: Pick<WordData, 'word' | 'definition'>,
  mode: WorksheetQuestionMode,
): boolean => {
  if (isGrammarWorksheetMode(mode) || mode === 'JA_TRANSLATION_INPUT') {
    return hasEnoughGrammarPracticeData(word);
  }
  return Boolean(word.word.trim() && word.definition.trim());
};

export const filterWorksheetQuestionCandidates = <T extends Pick<WordData, 'word' | 'definition'>>(
  words: T[],
  mode: WorksheetQuestionMode,
): T[] => words.filter((word) => canGenerateWorksheetQuestionForWord(word, mode));

const uniqueValues = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const normalizeJapanese = (value: string): string => value.trim().normalize('NFKC').replace(/\s+/g, '');

const normalizeJapaneseTextAnswer = (value: string): string => normalizeJapanese(value)
  .replace(/[。、，．,.!?！？「」『』（）()[\]【】]/g, '');

const tokenizeJapanese = (value: string): string[] => {
  const normalized = value.trim().normalize('NFKC');
  const tokens = normalized
    .split(/[\s/、,()・]+/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.length === 0 && normalized) return [normalized];
  return [...new Set(tokens)];
};

const commonPrefixLength = (left: string, right: string): number => {
  const maxLength = Math.min(left.length, right.length);
  let count = 0;
  while (count < maxLength && left[count] === right[count]) {
    count += 1;
  }
  return count;
};

const commonSuffixLength = (left: string, right: string): number => {
  const maxLength = Math.min(left.length, right.length);
  let count = 0;
  while (
    count < maxLength
    && left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1;
  }
  return count;
};

const getCharacterOverlapRatio = (left: string, right: string): number => {
  if (!left || !right) return 0;
  const rightCounts = new Map<string, number>();
  [...right].forEach((character) => {
    rightCounts.set(character, (rightCounts.get(character) || 0) + 1);
  });

  let overlapCount = 0;
  [...left].forEach((character) => {
    const remaining = rightCounts.get(character) || 0;
    if (remaining <= 0) return;
    overlapCount += 1;
    rightCounts.set(character, remaining - 1);
  });

  return overlapCount / Math.max(left.length, right.length, 1);
};

const getJapaneseTokenOverlap = (left: string, right: string): number => {
  const leftTokens = tokenizeJapanese(left);
  const rightTokens = new Set(tokenizeJapanese(right));
  return leftTokens.reduce((count, token) => count + (rightTokens.has(token) ? 1 : 0), 0);
};

const getWordBand = (word: WorksheetSourceWord): number | null => (
  word.bookTitle
    ? getBookProgressionIndex({ title: word.bookTitle, description: '', sourceContext: '' })
    : null
);

const shiftEnglishVowel = (answer: string): string | null => {
  const vowels = ['a', 'e', 'i', 'o', 'u'];
  const characters = [...answer];
  for (let index = 0; index < characters.length; index += 1) {
    const lower = characters[index].toLowerCase();
    const vowelIndex = vowels.indexOf(lower);
    if (vowelIndex === -1) continue;
    const replacement = vowels[(vowelIndex + 1) % vowels.length];
    characters[index] = lower === characters[index] ? replacement : replacement.toUpperCase();
    return characters.join('');
  }
  return null;
};

const swapAdjacentEnglishCharacters = (answer: string): string | null => {
  if (answer.length < 4) return null;
  const pivot = Math.max(1, Math.floor(answer.length / 2) - 1);
  const characters = [...answer];
  [characters[pivot], characters[pivot + 1]] = [characters[pivot + 1], characters[pivot]];
  return characters.join('');
};

const buildEnglishFallbackDistractors = (answer: string): string[] => {
  const trimmed = answer.trim();
  return uniqueValues([
    trimmed.endsWith('ize') ? trimmed.replace(/ize$/i, 'ise') : '',
    trimmed.endsWith('e') ? `${trimmed.slice(0, -1)}ing` : `${trimmed}ing`,
    trimmed.endsWith('y') ? `${trimmed.slice(0, -1)}ies` : `${trimmed}s`,
    trimmed.endsWith('e') ? `${trimmed}d` : `${trimmed}ed`,
    trimmed.length > 4 ? `${trimmed}r` : '',
    swapAdjacentEnglishCharacters(trimmed) || '',
    shiftEnglishVowel(trimmed) || '',
  ]).filter((value) => normalizeEnglish(value) !== normalizeEnglish(answer));
};

const buildJapaneseFallbackDistractors = (answer: string): string[] => {
  const trimmed = answer.trim();
  return uniqueValues([
    /させる$/.test(trimmed) ? trimmed.replace(/させる$/, 'する') : '',
    /させる$/.test(trimmed) ? trimmed.replace(/させる$/, 'させた') : '',
    /させる$/.test(trimmed) ? trimmed.replace(/させる$/, '化する') : '',
    /する$/.test(trimmed) ? trimmed.replace(/する$/, 'した') : '',
    /する$/.test(trimmed) ? trimmed.replace(/する$/, 'される') : '',
    /する$/.test(trimmed) ? trimmed.replace(/する$/, 'できる') : '',
    /^[ァ-ヶー]+$/.test(trimmed) ? `${trimmed}法` : '',
    /^[ァ-ヶー]+$/.test(trimmed) ? `${trimmed}する` : '',
    trimmed.endsWith('る') ? `${trimmed.slice(0, -1)}た` : '',
    trimmed.length >= 3 ? `${trimmed}こと` : '',
  ]).filter((value) => normalizeJapanese(value) !== normalizeJapanese(answer));
};

const scoreEnglishDistractor = (current: WorksheetSourceWord, candidate: WorksheetSourceWord): number => {
  const answer = normalizeEnglish(current.word);
  const candidateWord = normalizeEnglish(candidate.word);
  if (!answer || !candidateWord || answer === candidateWord) return Number.NEGATIVE_INFINITY;

  const currentBand = getWordBand(current);
  const candidateBand = getWordBand(candidate);
  const bandScore = currentBand !== null && candidateBand !== null
    ? Math.max(0, 18 - Math.abs(currentBand - candidateBand) * 6)
    : 0;
  const sameBookScore = current.bookId === candidate.bookId ? 42 : 0;
  const lengthScore = Math.max(0, 12 - Math.abs(answer.length - candidateWord.length) * 2);
  const prefixScore = commonPrefixLength(answer, candidateWord) * 7;
  const suffixScore = commonSuffixLength(answer, candidateWord) * 6;
  const overlapScore = Math.round(getCharacterOverlapRatio(answer, candidateWord) * 24);
  return sameBookScore + bandScore + lengthScore + prefixScore + suffixScore + overlapScore;
};

const scoreJapaneseDistractor = (current: WorksheetSourceWord, candidate: WorksheetSourceWord): number => {
  const answer = normalizeJapanese(current.definition);
  const candidateDefinition = normalizeJapanese(candidate.definition);
  if (!answer || !candidateDefinition || answer === candidateDefinition) return Number.NEGATIVE_INFINITY;

  const currentBand = getWordBand(current);
  const candidateBand = getWordBand(candidate);
  const bandScore = currentBand !== null && candidateBand !== null
    ? Math.max(0, 18 - Math.abs(currentBand - candidateBand) * 6)
    : 0;
  const sameBookScore = current.bookId === candidate.bookId ? 42 : 0;
  const tokenScore = getJapaneseTokenOverlap(answer, candidateDefinition) * 14;
  const suffixScore = commonSuffixLength(answer, candidateDefinition) * 6;
  const overlapScore = Math.round(getCharacterOverlapRatio(answer, candidateDefinition) * 22);
  const lengthScore = Math.max(0, 10 - Math.abs(answer.length - candidateDefinition.length) * 2);
  return sameBookScore + bandScore + tokenScore + suffixScore + overlapScore + lengthScore;
};

const createOptions = ({
  currentWord,
  mode,
  distractorWords,
}: {
  currentWord: WorksheetSourceWord;
  mode: Extract<WorksheetQuestionMode, 'EN_TO_JA' | 'JA_TO_EN'>;
  distractorWords: WorksheetSourceWord[];
}): string[] => {
  const answer = mode === 'JA_TO_EN' ? currentWord.word : currentWord.definition;
  const normalizedAnswer = mode === 'JA_TO_EN'
    ? normalizeEnglish(answer)
    : normalizeJapanese(answer);

  const scoredCandidates = distractorWords
    .filter((candidate) => toWordId(candidate) !== toWordId(currentWord))
    .map((candidate) => ({
      value: mode === 'JA_TO_EN' ? candidate.word : candidate.definition,
      score: mode === 'JA_TO_EN'
        ? scoreEnglishDistractor(currentWord, candidate)
        : scoreJapaneseDistractor(currentWord, candidate),
    }))
    .filter((candidate) => Number.isFinite(candidate.score))
    .sort((left, right) => right.score - left.score || left.value.localeCompare(right.value));

  const distractors: string[] = [];
  const seen = new Set<string>([normalizedAnswer]);
  scoredCandidates.forEach((candidate) => {
    const normalizedValue = mode === 'JA_TO_EN'
      ? normalizeEnglish(candidate.value)
      : normalizeJapanese(candidate.value);
    if (!normalizedValue || seen.has(normalizedValue) || distractors.length >= 3) return;
    distractors.push(candidate.value);
    seen.add(normalizedValue);
  });

  const fallbackDistractors = mode === 'JA_TO_EN'
    ? buildEnglishFallbackDistractors(currentWord.word)
    : buildJapaneseFallbackDistractors(currentWord.definition);
  fallbackDistractors.forEach((candidate) => {
    const normalizedValue = mode === 'JA_TO_EN'
      ? normalizeEnglish(candidate)
      : normalizeJapanese(candidate);
    if (!normalizedValue || seen.has(normalizedValue) || distractors.length >= 3) return;
    distractors.push(candidate);
    seen.add(normalizedValue);
  });

  const lowPriorityPool = uniqueValues(
    distractorWords
      .map((candidate) => (mode === 'JA_TO_EN' ? candidate.word : candidate.definition))
      .filter(Boolean),
  );
  lowPriorityPool.forEach((candidate) => {
    const normalizedValue = mode === 'JA_TO_EN'
      ? normalizeEnglish(candidate)
      : normalizeJapanese(candidate);
    if (!normalizedValue || seen.has(normalizedValue) || distractors.length >= 3) return;
    distractors.push(candidate);
    seen.add(normalizedValue);
  });

  return shuffle([...distractors.slice(0, 3), answer]);
};

const revealPrefix = (word: string, visibleLetters = 2): string => {
  let count = 0;
  let prefix = '';
  for (const character of word) {
    if (/[A-Za-z]/.test(character)) {
      count += 1;
      prefix += character;
      if (count >= visibleLetters) break;
    } else if (count === 0) {
      prefix += character;
    } else {
      prefix += character;
    }
  }
  return prefix || word.slice(0, visibleLetters);
};

export const maskWordWithPrefix = (word: string, visibleLetters = 2): string => {
  let revealed = 0;
  return [...word].map((character) => {
    if (/[A-Za-z]/.test(character)) {
      revealed += 1;
      return revealed <= visibleLetters ? character : '_';
    }
    if (character === ' ' || character === '-' || character === '\'') {
      return character;
    }
    return '_';
  }).join('');
};

const normalizeEnglish = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

export const isCorrectSpellingHintAnswer = (input: string, answer: string, hintPrefix: string): boolean => {
  const normalizedInput = normalizeEnglish(input);
  const normalizedAnswer = normalizeEnglish(answer);
  const normalizedSuffix = normalizeEnglish(answer.slice(hintPrefix.length));
  return normalizedInput === normalizedAnswer || normalizedInput === normalizedSuffix;
};

export const resolveSpellingAttempt = ({
  input,
  answer,
  hintPrefix,
  hintVisible,
}: {
  input: string;
  answer: string;
  hintPrefix: string;
  hintVisible: boolean;
}): 'correct' | 'retry-with-hint' | 'incorrect' => {
  const isCorrect = isCorrectSpellingHintAnswer(
    input,
    answer,
    hintVisible ? hintPrefix : '',
  );
  if (isCorrect) return 'correct';
  if (!hintVisible) return 'retry-with-hint';
  return 'incorrect';
};

export const isCorrectJapaneseTranslationAnswer = (input: string, answer: string): boolean => (
  Boolean(normalizeJapaneseTextAnswer(input))
  && normalizeJapaneseTextAnswer(input) === normalizeJapaneseTextAnswer(answer)
);

export const resolveJapaneseTranslationAttempt = ({
  input,
  answer,
}: {
  input: string;
  answer: string;
}): 'correct' | 'incorrect' => (
  isCorrectJapaneseTranslationAnswer(input, answer) ? 'correct' : 'incorrect'
);

export const buildDeterministicTranslationFeedback = ({
  input,
  answer,
  grammarExplanation,
}: {
  input: string;
  answer: string;
  grammarExplanation?: GrammarScopeExplanation;
}): JapaneseTranslationFeedback => {
  const correct = isCorrectJapaneseTranslationAnswer(input, answer);
  const criteria = [
    {
      label: '意味',
      score: correct ? 4 : 1,
      maxScore: 4,
      comment: correct ? '英文全体の意味を押さえています。' : '正解例と意味のずれが残っています。',
    },
    {
      label: '文法構造',
      score: correct ? 3 : 1,
      maxScore: 3,
      comment: correct
        ? '主語・動詞・修飾語の関係を訳に反映できています。'
        : grammarExplanation?.commonMistakeJa || '文の骨組みをもう一度確認しましょう。',
    },
    {
      label: '答案として自然か',
      score: correct ? 3 : 1,
      maxScore: 3,
      comment: correct ? '高校受験・大学受験の答案として自然な範囲です。' : '採点者に伝わる日本語へ整える余地があります。',
    },
  ];

  const score = criteria.reduce((sum, criterion) => sum + criterion.score, 0);
  return {
    isCorrect: correct,
    score,
    maxScore: 10,
    verdictLabel: correct ? '満点答案' : '要復習',
    examTarget: 'GENERAL',
    expectedTranslation: answer,
    userTranslation: input,
    summaryJa: correct
      ? '正解例と同じ意味で訳せています。次は同じ型を速く処理できるようにしましょう。'
      : '正解例と一致していません。まず3ますで主語・動詞・目的語を固定してから訳しましょう。',
    strengths: correct ? ['意味の中心を落とさず訳せています。'] : [],
    issues: correct ? [] : ['正解例との差が大きいため、答案チェックが利用できない場合は不正解扱いにします。'],
    improvedTranslation: answer,
    grammarAdviceJa: grammarExplanation?.patternJa || '英文の主語・動詞・目的語を先に固定します。',
    nextDrillJa: grammarExplanation?.automationDrillJa || '同じ型の短文を3回読み直してから、もう一度訳します。',
    criteria,
    usedAi: false,
  };
};

const toOrderTokens = (
  chips: GrammarPracticeChip[],
  learnedWordId: string,
  learnedWord: string,
): WorksheetOrderToken[] => chips.map((chip) => ({
  id: chip.id,
  text: chip.text,
  learnedWordId,
  learnedWord,
}));

const orderedAnswerText = (chips: GrammarPracticeChip[], correctChipIds: string[], separator: string): string => {
  const chipMap = new Map(chips.map((chip) => [chip.id, chip.text]));
  return correctChipIds
    .map((chipId) => chipMap.get(chipId))
    .filter((value): value is string => Boolean(value))
    .join(separator);
};

const getGrammarPracticeItemForMode = (
  word: WorksheetSourceWord,
  mode: WorksheetQuestionMode,
  index: number,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): GrammarPracticeItem | null => {
  const practiceWord = toPracticeWord(word, index);
  const targetKind = mode === 'GRAMMAR_CLOZE'
    ? 'GRAMMAR_CLOZE'
    : mode === 'EN_WORD_ORDER'
      ? 'ENGLISH_WORD_ORDER'
      : (mode === 'JA_TRANSLATION_ORDER' || mode === 'JA_TRANSLATION_INPUT')
        ? 'JAPANESE_WORD_ORDER'
        : null;
  if (!targetKind) return null;

  return buildGrammarPracticeItemsForWord(practiceWord, {
    seed: `${mode}:${practiceWord.id}`,
    requestedScopeId,
    japaneseQuestionMode: mode === 'JA_TRANSLATION_INPUT' ? 'JA_TRANSLATION_INPUT' : 'JA_TRANSLATION_ORDER',
  })
    .find((item) => item.kind === targetKind) || null;
};

const toGrammarWorksheetQuestion = (
  word: WorksheetSourceWord,
  mode: Extract<WorksheetQuestionMode, 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER' | 'JA_TRANSLATION_ORDER'>,
  index: number,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): GeneratedWorksheetQuestion | null => {
  const wordId = toWordId(word);
  const item = getGrammarPracticeItemForMode(word, mode, index, requestedScopeId);
  if (!item) return null;

  if (item.kind === 'GRAMMAR_CLOZE') {
    return {
      id: `${wordId}:${mode}:${index}`,
      mode,
      interactionType: 'CHOICE',
      wordId,
      bookId: word.bookId,
      bookTitle: word.bookTitle,
      promptLabel: item.grammarFocus,
      promptText: item.clozeSentence,
      answer: item.answer,
      options: item.options,
      sourceSentence: item.sourceSentence,
      grammarFocus: item.grammarFocus,
      grammarScope: item.grammarScope,
      grammarExplanation: buildGrammarScopeExplanation(item.grammarScope),
      instruction: '空所に入る単語を選び、文の中でどう使われているか確認します。',
    };
  }

  if (item.kind === 'ENGLISH_WORD_ORDER') {
    return {
      id: `${wordId}:${mode}:${index}`,
      mode,
      interactionType: 'ORDERING',
      wordId,
      bookId: word.bookId,
      bookTitle: word.bookTitle,
      promptLabel: '英語語順',
      promptText: item.prompt,
      answer: orderedAnswerText(item.chips, item.correctChipIds, ' '),
      tokens: toOrderTokens(item.chips, wordId, word.word),
      answerTokenIds: item.correctChipIds,
      sourceSentence: item.sourceSentence,
      grammarScope: item.grammarScope,
      grammarExplanation: buildGrammarScopeExplanation(item.grammarScope),
      instruction: '登場済み単語を含む英文を、チップの順番で組み立てます。',
    };
  }

  return {
    id: `${wordId}:${mode}:${index}`,
    mode,
    interactionType: 'ORDERING',
    wordId,
    bookId: word.bookId,
    bookTitle: word.bookTitle,
    promptLabel: '日本語語順',
    promptText: item.prompt,
    answer: item.answerText,
    tokens: toOrderTokens(item.chips, wordId, word.word),
    answerTokenIds: item.correctChipIds,
    sourceSentence: item.sourceSentence,
    sourceTranslation: item.answerText,
    grammarScope: item.grammarScope,
    grammarExplanation: buildGrammarScopeExplanation(item.grammarScope),
    instruction: '英文を手がかりに、日本語の意味を自然な順番へ戻します。',
  };
};

const toJapaneseTranslationInputQuestion = (
  word: WorksheetSourceWord,
  index: number,
  requestedScopeId?: GrammarCurriculumScopeId | null,
): GeneratedWorksheetQuestion | null => {
  const wordId = toWordId(word);
  const item = getGrammarPracticeItemForMode(word, 'JA_TRANSLATION_INPUT', index, requestedScopeId);
  if (!item || item.kind !== 'JAPANESE_WORD_ORDER') return null;

  return {
    id: `${wordId}:JA_TRANSLATION_INPUT:${index}`,
    mode: 'JA_TRANSLATION_INPUT',
    interactionType: 'TEXT_INPUT',
    wordId,
    bookId: word.bookId,
    bookTitle: word.bookTitle,
    promptLabel: '和訳全文入力',
    promptText: item.sourceSentence,
    answer: item.answerText,
    sourceSentence: item.sourceSentence,
    sourceTranslation: item.answerText,
    grammarScope: item.grammarScope,
    grammarExplanation: buildGrammarScopeExplanation(item.grammarScope),
    instruction: '英文を読み、日本語訳を全文で入力します。語順だけでなく、意味の抜けも確認します。',
  };
};

export const generateWorksheetQuestions = (
  sourceWords: WorksheetSourceWord[],
  mode: WorksheetQuestionMode,
  questionCount: number,
  options: {
    distractorWords?: WorksheetSourceWord[];
    grammarScopeId?: GrammarCurriculumScopeId | null;
  } = {},
): GeneratedWorksheetQuestion[] => {
  if (sourceWords.length === 0) return [];

  const eligibleWords = sourceWords.filter((word) => canGenerateWorksheetQuestionForWord(toPracticeWord(word), mode));
  if (eligibleWords.length === 0) return [];

  const selectedWords = shuffle(eligibleWords).slice(0, Math.min(questionCount, eligibleWords.length));
  const distractorWords = options.distractorWords && options.distractorWords.length > 0
    ? options.distractorWords
    : eligibleWords;

  if (mode === 'JA_TRANSLATION_INPUT') {
    return selectedWords
      .map((word, index) => toJapaneseTranslationInputQuestion(word, index, options.grammarScopeId))
      .filter((question): question is GeneratedWorksheetQuestion => Boolean(question));
  }

  if (mode === 'GRAMMAR_CLOZE' || mode === 'EN_WORD_ORDER' || mode === 'JA_TRANSLATION_ORDER') {
    return selectedWords
      .map((word, index) => toGrammarWorksheetQuestion(word, mode, index, options.grammarScopeId))
      .filter((question): question is GeneratedWorksheetQuestion => Boolean(question));
  }

  return selectedWords.map((word, index) => {
    const wordId = toWordId(word);

    if (mode === 'JA_TO_EN') {
      return {
        id: `${wordId}:${mode}:${index}`,
        mode,
        interactionType: 'CHOICE',
        wordId,
        bookId: word.bookId,
        bookTitle: word.bookTitle,
        promptLabel: '日本語の意味',
        promptText: word.definition,
        answer: word.word,
        options: createOptions({ currentWord: word, mode, distractorWords }),
      };
    }

    if (mode === 'SPELLING_HINT') {
      const hintPrefix = revealPrefix(word.word, 2);
      return {
        id: `${wordId}:${mode}:${index}`,
        mode,
        interactionType: 'TEXT_INPUT',
        wordId,
        bookId: word.bookId,
        bookTitle: word.bookTitle,
        promptLabel: '日本語の意味',
        promptText: word.definition,
        answer: word.word,
        hintPrefix,
        maskedAnswer: maskWordWithPrefix(word.word, 2),
      };
    }

    return {
      id: `${wordId}:${mode}:${index}`,
      mode,
      interactionType: 'CHOICE',
      wordId,
      bookId: word.bookId,
      bookTitle: word.bookTitle,
      promptLabel: '英単語',
      promptText: word.word,
      answer: word.definition,
      options: createOptions({ currentWord: word, mode, distractorWords }),
    };
  });
};

export const toWorksheetSourceWords = (
  words: Array<WordData | StudentWorksheetWord>,
  bookTitles: Record<string, string> = {},
): WorksheetSourceWord[] => {
  return words.map((word) => ({
    id: 'id' in word ? word.id : undefined,
    wordId: 'wordId' in word ? word.wordId : undefined,
    word: word.word,
    definition: word.definition,
    bookId: word.bookId,
    bookTitle: 'bookTitle' in word ? word.bookTitle : bookTitles[word.bookId],
    number: 'number' in word ? word.number : undefined,
    exampleSentence: word.exampleSentence,
    exampleMeaning: word.exampleMeaning,
  }));
};
