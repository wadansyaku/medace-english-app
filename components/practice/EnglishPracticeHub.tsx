import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Brain,
  CheckCircle,
  Eye,
  EyeOff,
  Languages,
  LibraryBig,
  Loader2,
  PencilLine,
  RefreshCw,
  Shuffle,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';

import {
  EnglishLevel,
  type GrammarCurriculumCategoryId,
  UserGrade,
  type GrammarCurriculumScope,
  type GrammarCurriculumScopeId,
  type JapaneseTranslationFeedback,
  type TranslationExamTarget,
  type UserProfile,
  type WordData,
} from '../../types';
import { compareEnglishLevels, getGrammarScopesForPracticeSelection } from '../../utils/grammarScope';
import {
  buildGrammarPracticeItemsForWord,
  type EnglishWordOrderPracticeItem,
  type GrammarClozePracticeItem,
  type GrammarPracticeItem,
  type JapaneseWordOrderPracticeItem,
} from '../../utils/grammarPractice';
import { buildGrammarScopeExplanation } from '../../utils/grammarScope';
import { buildDeterministicTranslationFeedback } from '../../utils/worksheet';
import { evaluateJapaneseTranslationAnswer } from '../../services/gemini';
import { learningService } from '../../services/learning';
import {
  clearEnglishPracticeProgress,
  ENGLISH_PRACTICE_SAMPLE_BOOK_ID,
  getEnglishPracticeLaneLabel,
  loadEnglishPracticeProgress,
  recordEnglishPracticeAttempt,
  saveEnglishPracticeProgress,
  summarizeEnglishPracticeProgress,
  toEnglishPracticeCloudQuizAttempt,
  type EnglishPracticeAttemptInput,
} from '../../utils/englishPracticeProgress';
import ReadingPracticeView from './ReadingPracticeView';
import JapaneseTranslationFeedbackCard from './JapaneseTranslationFeedbackCard';
import {
  buildReadingPracticePassages,
  getReadingQuestionKindLabel,
  type ReadingPracticeAnswerResult,
  type ReadingPracticeSessionSummary,
} from '../../utils/readingPractice';

type PracticeLane = 'overview' | 'grammar' | 'translation' | 'reading';
type GrammarMode = 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER';
type TranslationMode = 'input' | 'order';
type ScopeViewFilter = 'recommended' | 'weak' | 'all';
type ScopeCategoryFilter = GrammarCurriculumCategoryId | 'all';

interface EnglishPracticeHubProps {
  user: UserProfile;
  onBack: () => void;
  onStartVocabulary: () => void;
}

const LEVEL_LABELS: Record<EnglishLevel, string> = {
  [EnglishLevel.A1]: 'A1 入門',
  [EnglishLevel.A2]: 'A2 基礎',
  [EnglishLevel.B1]: 'B1 標準',
  [EnglishLevel.B2]: 'B2 発展',
  [EnglishLevel.C1]: 'C1 難関',
  [EnglishLevel.C2]: 'C2 精密',
};

const FALLBACK_WORDS: WordData[] = [
  {
    id: 'practice-stabilize',
    bookId: ENGLISH_PRACTICE_SAMPLE_BOOK_ID,
    number: 1,
    word: 'stabilize',
    definition: '安定させる',
    exampleSentence: 'Doctors stabilize the patient before surgery.',
    exampleMeaning: '医師は 手術前に 患者を 安定させる。',
  },
  {
    id: 'practice-monitor',
    bookId: ENGLISH_PRACTICE_SAMPLE_BOOK_ID,
    number: 2,
    word: 'monitor',
    definition: '観察する',
    exampleSentence: 'Nurses monitor the patient while the medicine works.',
    exampleMeaning: '看護師は 薬が効いている間 患者を 観察する。',
  },
  {
    id: 'practice-recall',
    bookId: ENGLISH_PRACTICE_SAMPLE_BOOK_ID,
    number: 3,
    word: 'recall',
    definition: '思い出す',
    exampleSentence: 'Students can recall the word after short practice.',
    exampleMeaning: '生徒は 短い練習の後で その語を 思い出せる。',
  },
  {
    id: 'practice-compare',
    bookId: ENGLISH_PRACTICE_SAMPLE_BOOK_ID,
    number: 4,
    word: 'compare',
    definition: '比較する',
    exampleSentence: 'Learners compare two answers before they choose one.',
    exampleMeaning: '生徒は 1つを選ぶ前に 2つの答えを 比較する。',
  },
];

const laneConfig: Array<{
  id: PracticeLane;
  label: string;
  title: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: 'overview',
    label: '全体',
    title: '英語演習ホーム',
    description: '単語・文法・和訳・長文を分けて選ぶ',
    icon: Sparkles,
  },
  {
    id: 'grammar',
    label: '文法',
    title: '参考書型の文法演習',
    description: '範囲を複数選択し、固定でもランダムでも演習',
    icon: Brain,
  },
  {
    id: 'translation',
    label: '和訳',
    title: '受験答案としての和訳',
    description: '文法範囲を選ばず、英文全体を訳す',
    icon: Languages,
  },
  {
    id: 'reading',
    label: '長文',
    title: '根拠を探す長文読解',
    description: '内容一致・要旨・語彙推測・文構造を確認',
    icon: LibraryBig,
  },
];

const normalizeWordList = (words: WordData[]): WordData[] => (
  [...words]
    .filter((word) => word.word.trim() && word.definition.trim())
    .sort((left, right) => left.number - right.number)
);

const selectDefaultScopeIds = (
  scopes: GrammarCurriculumScope[],
  userLevel: EnglishLevel,
): GrammarCurriculumScopeId[] => {
  const recommended = scopes
    .filter((scope) => compareEnglishLevels(scope.levelMin, userLevel) <= 0)
    .slice(0, 5)
    .map((scope) => scope.id);
  return recommended.length > 0 ? recommended : scopes.slice(0, 4).map((scope) => scope.id);
};

const resolveTranslationExamTarget = (grade?: UserGrade): TranslationExamTarget => {
  if (grade === UserGrade.JHS1 || grade === UserGrade.JHS2 || grade === UserGrade.JHS3) {
    return 'HIGH_SCHOOL_ENTRANCE';
  }
  if (grade === UserGrade.SHS1 || grade === UserGrade.SHS2 || grade === UserGrade.SHS3 || grade === UserGrade.UNIVERSITY) {
    return 'UNIVERSITY_ENTRANCE';
  }
  return 'GENERAL';
};

const toGrammarKind = (mode: GrammarMode): GrammarPracticeItem['kind'] => (
  mode === 'GRAMMAR_CLOZE' ? 'GRAMMAR_CLOZE' : 'ENGLISH_WORD_ORDER'
);

const isGrammarClozeItem = (item: GrammarPracticeItem): item is GrammarClozePracticeItem => (
  item.kind === 'GRAMMAR_CLOZE'
);

const isEnglishWordOrderItem = (item: GrammarPracticeItem): item is EnglishWordOrderPracticeItem => (
  item.kind === 'ENGLISH_WORD_ORDER'
);

const isJapaneseWordOrderItem = (item: GrammarPracticeItem): item is JapaneseWordOrderPracticeItem => (
  item.kind === 'JAPANESE_WORD_ORDER'
);

const isOrderCorrect = (orderedChipIds: string[], correctChipIds: string[]): boolean => (
  orderedChipIds.length === correctChipIds.length
  && orderedChipIds.every((chipId, index) => chipId === correctChipIds[index])
);

const getOrderedText = (
  item: EnglishWordOrderPracticeItem | JapaneseWordOrderPracticeItem,
): string => {
  const chipById = new Map(item.chips.map((chip) => [chip.id, chip.text]));
  return item.correctChipIds
    .map((chipId) => chipById.get(chipId))
    .filter((value): value is string => Boolean(value))
    .join(item.kind === 'ENGLISH_WORD_ORDER' ? ' ' : '');
};

const EnglishPracticeHub: React.FC<EnglishPracticeHubProps> = ({
  user,
  onBack,
  onStartVocabulary,
}) => {
  const userLevel = user.englishLevel ?? EnglishLevel.A2;
  const [activeLane, setActiveLane] = useState<PracticeLane>('overview');
  const [sessionWords, setSessionWords] = useState<WordData[]>([]);
  const [wordsLoading, setWordsLoading] = useState(true);
  const [wordLoadFailed, setWordLoadFailed] = useState(false);
  const [practiceSeed, setPracticeSeed] = useState(1);
  const [grammarMode, setGrammarMode] = useState<GrammarMode>('GRAMMAR_CLOZE');
  const [scopeViewFilter, setScopeViewFilter] = useState<ScopeViewFilter>('recommended');
  const [scopeCategoryFilter, setScopeCategoryFilter] = useState<ScopeCategoryFilter>('all');
  const [randomScopeMode, setRandomScopeMode] = useState(true);
  const [showScopeHint, setShowScopeHint] = useState(true);
  const [grammarSelections, setGrammarSelections] = useState<Record<string, string>>({});
  const [grammarOrders, setGrammarOrders] = useState<Record<string, string[]>>({});
  const [checkedGrammarItems, setCheckedGrammarItems] = useState<Record<string, boolean>>({});
  const [translationMode, setTranslationMode] = useState<TranslationMode>('input');
  const [translationInputs, setTranslationInputs] = useState<Record<string, string>>({});
  const [translationOrders, setTranslationOrders] = useState<Record<string, string[]>>({});
  const [checkedTranslationOrders, setCheckedTranslationOrders] = useState<Record<string, boolean>>({});
  const [translationFeedback, setTranslationFeedback] = useState<Record<string, JapaneseTranslationFeedback>>({});
  const [checkingTranslationId, setCheckingTranslationId] = useState<string | null>(null);
  const [readingLevel, setReadingLevel] = useState<EnglishLevel>(userLevel);
  const [readingSummary, setReadingSummary] = useState<ReadingPracticeSessionSummary | null>(null);
  const [practiceSyncError, setPracticeSyncError] = useState<string | null>(null);
  const [practiceProgress, setPracticeProgress] = useState(() => loadEnglishPracticeProgress(user.uid));

  const grammarScopes = useMemo(
    () => getGrammarScopesForPracticeSelection({ mode: grammarMode }),
    [grammarMode],
  );
  const [selectedScopeIds, setSelectedScopeIds] = useState<GrammarCurriculumScopeId[]>(
    () => selectDefaultScopeIds(getGrammarScopesForPracticeSelection({ mode: 'GRAMMAR_CLOZE' }), userLevel),
  );

  React.useEffect(() => {
    setPracticeProgress(loadEnglishPracticeProgress(user.uid));
  }, [user.uid]);

  React.useEffect(() => {
    saveEnglishPracticeProgress(practiceProgress);
  }, [practiceProgress]);

  React.useEffect(() => {
    let cancelled = false;
    setWordsLoading(true);
    setWordLoadFailed(false);

    learningService.getDailySessionWords(user.uid, 12)
      .then((words) => {
        if (cancelled) return;
        setSessionWords(normalizeWordList(words));
      })
      .catch(() => {
        if (cancelled) return;
        setWordLoadFailed(true);
        setSessionWords([]);
      })
      .finally(() => {
        if (!cancelled) setWordsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user.uid]);

  React.useEffect(() => {
    setSelectedScopeIds((current) => {
      const availableIds = new Set(grammarScopes.map((scope) => scope.id));
      const next = current.filter((scopeId) => availableIds.has(scopeId));
      if (next.length > 0) return next;
      return selectDefaultScopeIds(grammarScopes, userLevel);
    });
    setGrammarSelections({});
    setGrammarOrders({});
    setCheckedGrammarItems({});
  }, [grammarMode, grammarScopes, userLevel]);

  const samplePracticeActive = !wordsLoading && (wordLoadFailed || sessionWords.length === 0);
  const practiceWords = sessionWords.length > 0 ? sessionWords : samplePracticeActive ? FALLBACK_WORDS : [];
  const selectedScopes = grammarScopes.filter((scope) => selectedScopeIds.includes(scope.id));
  const activeScopePool = selectedScopes.length > 0 ? selectedScopes : grammarScopes.slice(0, 4);
  const targetGrammarKind = toGrammarKind(grammarMode);
  const examTarget = resolveTranslationExamTarget(user.grade);

  const grammarItems = useMemo(() => {
    if (activeScopePool.length === 0) return [];
    return practiceWords
      .slice(0, 10)
      .map((word, index) => {
        const scopeIndex = randomScopeMode
          ? (index * 3 + practiceSeed) % activeScopePool.length
          : index % activeScopePool.length;
        const scope = activeScopePool[scopeIndex];
        return buildGrammarPracticeItemsForWord(word, {
          seed: `english-practice:${practiceSeed}:${grammarMode}:${scope.id}:${index}`,
          requestedScopeId: scope.id,
          userLevel,
        }).find((item) => item.kind === targetGrammarKind) ?? null;
      })
      .filter((item): item is GrammarPracticeItem => Boolean(item))
      .slice(0, 5);
  }, [activeScopePool, grammarMode, practiceSeed, practiceWords, randomScopeMode, targetGrammarKind, userLevel]);

  const translationItems = useMemo(() => (
    practiceWords
      .slice(0, 6)
      .map((word, index) => buildGrammarPracticeItemsForWord(word, {
        seed: `translation:${practiceSeed}:${index}`,
        japaneseQuestionMode: 'JA_TRANSLATION_INPUT',
        userLevel,
      }).find(isJapaneseWordOrderItem) ?? null)
      .filter((item): item is JapaneseWordOrderPracticeItem => Boolean(item))
      .slice(0, 4)
  ), [practiceSeed, practiceWords, userLevel]);

  const readingPassages = useMemo(() => (
    buildReadingPracticePassages({
      level: readingLevel,
      seed: `english-practice:${practiceSeed}:${readingLevel}`,
      maxPassages: 1,
    })
  ), [practiceSeed, readingLevel]);

  const progressSummary = useMemo(
    () => summarizeEnglishPracticeProgress(practiceProgress),
    [practiceProgress],
  );

  const weakScopeById = useMemo(
    () => new Map(progressSummary.weakGrammarScopes.map((scope) => [scope.scopeId, scope])),
    [progressSummary.weakGrammarScopes],
  );

  const recommendedScopeIds = useMemo(() => {
    const availableIds = new Set(grammarScopes.map((scope) => scope.id));
    const fromRecommendation = progressSummary.recommendation.scopeIds.filter((scopeId) => availableIds.has(scopeId));
    if (fromRecommendation.length > 0) return fromRecommendation;
    return selectDefaultScopeIds(grammarScopes, userLevel);
  }, [grammarScopes, progressSummary.recommendation.scopeIds, userLevel]);

  const visibleGrammarScopes = useMemo(() => {
    const baseScopes = grammarScopes.filter((scope) => (
      scopeCategoryFilter === 'all' || scope.curriculumCategoryId === scopeCategoryFilter
    ));
    if (scopeViewFilter === 'all') return baseScopes;
    if (scopeViewFilter === 'weak') {
      const weakIds = new Set(progressSummary.weakGrammarScopes.map((scope) => scope.scopeId));
      return baseScopes.filter((scope) => weakIds.has(scope.id));
    }
    const recommendedIds = new Set(recommendedScopeIds);
    return baseScopes.filter((scope) => recommendedIds.has(scope.id));
  }, [grammarScopes, progressSummary.weakGrammarScopes, recommendedScopeIds, scopeCategoryFilter, scopeViewFilter]);

  const grammarCategoryOptions = useMemo(() => {
    const seen = new Set<GrammarCurriculumCategoryId>();
    const categories: Array<{ id: GrammarCurriculumCategoryId; label: string; count: number }> = [];
    grammarScopes.forEach((scope) => {
      const current = categories.find((category) => category.id === scope.curriculumCategoryId);
      if (current) {
        current.count += 1;
        return;
      }
      if (!seen.has(scope.curriculumCategoryId)) {
        seen.add(scope.curriculumCategoryId);
        categories.push({
          id: scope.curriculumCategoryId,
          label: scope.curriculumCategoryLabelJa,
          count: 1,
        });
      }
    });
    return categories;
  }, [grammarScopes]);

  React.useEffect(() => {
    setReadingSummary(null);
  }, [readingPassages]);

  const recordPracticeAttempt = React.useCallback((
    attempt: EnglishPracticeAttemptInput,
    options?: { translationFeedback?: JapaneseTranslationFeedback },
  ) => {
    if (samplePracticeActive || attempt.bookId === ENGLISH_PRACTICE_SAMPLE_BOOK_ID) {
      setPracticeSyncError(null);
      return;
    }

    setPracticeProgress((current) => {
      const base = current.userUid === user.uid ? current : loadEnglishPracticeProgress(user.uid);
      return recordEnglishPracticeAttempt(base, attempt);
    });

    const cloudAttempt = toEnglishPracticeCloudQuizAttempt(user.uid, attempt, options?.translationFeedback);
    if (!cloudAttempt) return;

    setPracticeSyncError(null);
    void learningService.recordQuizAttempt(
      cloudAttempt.uid,
      cloudAttempt.wordId,
      cloudAttempt.bookId,
      cloudAttempt.correct,
      cloudAttempt.questionMode,
      cloudAttempt.responseTimeMs,
      undefined,
      undefined,
      undefined,
      cloudAttempt.grammarScopeId,
      cloudAttempt.translationFeedback,
    ).catch((error) => {
      console.error('English practice attempt sync failed', error);
      setPracticeSyncError('演習履歴をクラウドへ保存できませんでした。画面内の復習履歴はこの端末に残っています。');
    });
  }, [samplePracticeActive, user.uid]);

  const resetGeneratedPractice = () => {
    setPracticeSeed((current) => current + 1);
    setGrammarSelections({});
    setGrammarOrders({});
    setCheckedGrammarItems({});
    setTranslationInputs({});
    setTranslationOrders({});
    setCheckedTranslationOrders({});
    setTranslationFeedback({});
  };

  const resetPracticeProgress = () => {
    setPracticeProgress(clearEnglishPracticeProgress(user.uid));
  };

  const toggleScope = (scopeId: GrammarCurriculumScopeId) => {
    setSelectedScopeIds((current) => {
      if (current.includes(scopeId)) {
        return current.length === 1 ? current : current.filter((id) => id !== scopeId);
      }
      return [...current, scopeId];
    });
  };

  const applyRecommendedScopes = () => {
    setSelectedScopeIds(recommendedScopeIds.length > 0 ? recommendedScopeIds : selectDefaultScopeIds(grammarScopes, userLevel));
    setScopeViewFilter(recommendedScopeIds.length > 0 ? 'recommended' : 'all');
    setScopeCategoryFilter('all');
  };

  const handleScopeViewFilterChange = (filter: ScopeViewFilter) => {
    if (filter !== 'weak') {
      setScopeViewFilter(filter);
      return;
    }

    const availableIds = new Set(grammarScopes.map((scope) => scope.id));
    const weakScopeIds = progressSummary.weakGrammarScopes
      .map((scope) => scope.scopeId)
      .filter((scopeId) => availableIds.has(scopeId));

    if (weakScopeIds.length === 0) {
      applyRecommendedScopes();
      return;
    }

    setSelectedScopeIds(weakScopeIds);
    setScopeViewFilter('weak');
    setScopeCategoryFilter('all');
  };

  const addOrderChip = (itemId: string, chipId: string, surface: 'grammar' | 'translation') => {
    const setter = surface === 'grammar' ? setGrammarOrders : setTranslationOrders;
    setter((current) => {
      const ordered = current[itemId] || [];
      if (ordered.includes(chipId)) return current;
      return { ...current, [itemId]: [...ordered, chipId] };
    });
  };

  const removeOrderChip = (itemId: string, chipId: string, surface: 'grammar' | 'translation') => {
    const setter = surface === 'grammar' ? setGrammarOrders : setTranslationOrders;
    setter((current) => ({
      ...current,
      [itemId]: (current[itemId] || []).filter((id) => id !== chipId),
    }));
  };

  const handleGrammarCheck = (item: GrammarPracticeItem, correct: boolean) => {
    setCheckedGrammarItems((current) => ({ ...current, [item.id]: true }));
    recordPracticeAttempt({
      lane: 'grammar',
      mode: grammarMode,
      correct,
      wordId: item.wordId,
      bookId: item.bookId,
      word: item.word,
      scopeId: item.grammarScope.scopeId,
      scopeLabelJa: item.grammarScope.labelJa,
      level: userLevel,
    });
  };

  const handleTranslationOrderCheck = (item: JapaneseWordOrderPracticeItem, correct: boolean) => {
    setCheckedTranslationOrders((current) => ({ ...current, [item.id]: true }));
    recordPracticeAttempt({
      lane: 'translation',
      mode: 'JA_TRANSLATION_ORDER',
      correct,
      wordId: item.wordId,
      bookId: item.bookId,
      word: item.word,
      scopeId: item.grammarScope.scopeId,
      scopeLabelJa: item.grammarScope.labelJa,
      level: userLevel,
    });
  };

  const handleTranslationSubmit = async (item: JapaneseWordOrderPracticeItem) => {
    const input = translationInputs[item.id]?.trim() || '';
    if (!input || checkingTranslationId) return;

    const grammarExplanation = buildGrammarScopeExplanation(item.grammarScope);
    let feedback: JapaneseTranslationFeedback = {
      ...buildDeterministicTranslationFeedback({
        input,
        answer: item.answerText,
        grammarExplanation,
      }),
      examTarget,
      sourceSentence: item.sourceSentence,
      expectedTranslation: item.answerText,
      userTranslation: input,
    };

    if (!feedback.isCorrect) {
      setCheckingTranslationId(item.id);
      try {
        const aiFeedback = await evaluateJapaneseTranslationAnswer({
          sourceSentence: item.sourceSentence,
          expectedTranslation: item.answerText,
          userTranslation: input,
          grammarScopeLabel: item.grammarScope.labelJa,
          grammarScopeId: item.grammarScope.scopeId,
          examTarget,
        });
        if (aiFeedback) {
          feedback = aiFeedback;
        }
      } catch {
        feedback = {
          ...feedback,
          summaryJa: `${feedback.summaryJa} AI採点に接続できないため、今回は正解例との差分で暫定フィードバックを表示しています。`,
          issues: feedback.issues.length > 0
            ? feedback.issues
            : ['AI採点が利用できないため、主語・動詞・修飾語の対応を正解例と照合してください。'],
        };
      } finally {
        setCheckingTranslationId(null);
      }
    }

    setTranslationFeedback((current) => ({
      ...current,
      [item.id]: feedback,
    }));
    recordPracticeAttempt({
      lane: 'translation',
      mode: 'JA_TRANSLATION_INPUT',
      correct: feedback.isCorrect,
      score: feedback.score,
      maxScore: feedback.maxScore,
      wordId: item.wordId,
      bookId: item.bookId,
      word: item.word,
      scopeId: item.grammarScope.scopeId,
      scopeLabelJa: item.grammarScope.labelJa,
      level: userLevel,
    }, { translationFeedback: feedback });
  };

  const handleReadingAnswer = React.useCallback((result: ReadingPracticeAnswerResult) => {
    recordPracticeAttempt({
      lane: 'reading',
      mode: 'READING',
      correct: result.correct,
      level: readingLevel,
      readingQuestionKind: result.kind,
    });
  }, [readingLevel, recordPracticeAttempt]);

  const handleReadingComplete = React.useCallback((summary: ReadingPracticeSessionSummary) => {
    setReadingSummary(summary);
  }, []);

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
        <section className="overflow-hidden rounded-lg border border-medace-200 bg-medace-700 text-white shadow-sm">
          <div className="px-5 py-6 md:px-7 md:py-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black text-white/72">
              今日の演習
            </div>
            <h1 className="mt-4 max-w-2xl text-3xl font-black leading-tight tracking-tight md:text-5xl">
              単語テストから独立した英語演習
            </h1>
            <p className="mt-3 max-w-2xl text-sm font-medium leading-relaxed text-white/78 md:text-base">
              大手参考書型の文法範囲、受験答案としての和訳、根拠を確認する長文読解を、目的別に切り替えます。
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setActiveLane(progressSummary.recommendation.lane)}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-black text-medace-900 transition-colors hover:bg-orange-50"
              >
                {progressSummary.recommendation.actionJa} <ArrowRight className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onStartVocabulary}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-white/15"
              >
                単語に戻る
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2">
          {laneConfig.slice(1).map((lane) => {
            const Icon = lane.icon;
            const laneSummary = progressSummary.laneSummaries[lane.id as 'grammar' | 'translation' | 'reading'];
            return (
              <button
                key={lane.id}
                type="button"
                onClick={() => setActiveLane(lane.id)}
                className="rounded-lg border border-orange-100 bg-white px-4 py-4 text-left shadow-sm transition-colors hover:border-medace-300 hover:bg-medace-50"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-medace-50 text-medace-700">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="mt-4 text-lg font-black text-slate-950">{lane.title}</div>
                <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">{lane.description}</p>
                <div className="mt-3 text-xs font-black text-medace-700">
                  {laneSummary.total > 0 ? `${laneSummary.total}回 / 正答率 ${laneSummary.accuracy}%` : '未演習'}
                </div>
              </button>
            );
          })}
          <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
            <div className="text-xs font-black text-medace-700">レベル調整</div>
            <div className="mt-2 text-lg font-black text-slate-950">{LEVEL_LABELS[userLevel]}</div>
            <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">
              推奨範囲は現在レベルを中心にし、上位レベルは挑戦問題として明示します。
            </p>
          </div>
        </section>
      </div>

      <section className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-xs font-black text-medace-700">復習ナビ</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">{progressSummary.recommendation.labelJa}</h2>
            <div className="mt-1 text-xs font-black text-medace-700">
              おすすめレーン: {getEnglishPracticeLaneLabel(progressSummary.recommendation.lane)}
            </div>
            <p className="mt-1 text-sm font-bold leading-relaxed text-slate-600">{progressSummary.recommendation.reasonJa}</p>
          </div>
          <button
            type="button"
            onClick={resetPracticeProgress}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-500 transition-colors hover:border-orange-200 hover:text-medace-700"
          >
            履歴をリセット
          </button>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
            <div className="text-xs font-black text-medace-700">全体</div>
            <div className="mt-2 text-2xl font-black text-slate-950">{progressSummary.total}回</div>
            <p className="mt-1 text-sm font-bold text-slate-600">正答率 {progressSummary.accuracy}%</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            <div className="text-xs font-black text-slate-500">弱い文法範囲</div>
            <div className="mt-2 space-y-1">
              {progressSummary.weakGrammarScopes.length > 0
                ? progressSummary.weakGrammarScopes.slice(0, 2).map((scope) => (
                  <div key={scope.scopeId} className="text-sm font-black text-slate-800">
                    {scope.labelJa} <span className="text-medace-700">{scope.accuracy}%</span>
                  </div>
                ))
                : <p className="text-sm font-bold text-slate-500">まだ偏りは出ていません</p>}
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white px-4 py-4">
            <div className="text-xs font-black text-slate-500">弱い読解設問</div>
            <div className="mt-2 space-y-1">
              {progressSummary.weakReadingKinds.length > 0
                ? progressSummary.weakReadingKinds.slice(0, 2).map((kind) => (
                  <div key={kind.kind} className="text-sm font-black text-slate-800">
                    {kind.labelJa} <span className="text-medace-700">{kind.accuracy}%</span>
                  </div>
                ))
                : <p className="text-sm font-bold text-slate-500">長文を解くと表示されます</p>}
            </div>
          </div>
        </div>
      </section>
    </div>
  );

  const renderGrammarItem = (item: GrammarPracticeItem) => {
    const isChecked = Boolean(checkedGrammarItems[item.id]);

    if (isGrammarClozeItem(item)) {
      const selected = grammarSelections[item.id];
      const correct = selected === item.answer;
      return (
        <article key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-black text-medace-700">
              {item.grammarScope.curriculumCategoryLabelJa || item.grammarFocus}
            </span>
            {showScopeHint && <span className="text-xs font-bold text-slate-400">{item.grammarScope.labelJa}</span>}
          </div>
          <p className="mt-4 text-lg font-black leading-relaxed text-slate-950">{item.clozeSentence}</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {item.options.map((option) => (
              <button
                key={option}
                type="button"
                disabled={isChecked}
                onClick={() => setGrammarSelections((current) => ({ ...current, [item.id]: option }))}
                className={`min-h-11 rounded-lg border px-3 py-2 text-sm font-black transition-colors ${
                  selected === option
                    ? 'border-medace-500 bg-medace-50 text-medace-900'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-medace-200'
                } disabled:cursor-not-allowed`}
              >
                {option}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!selected || isChecked}
              onClick={() => handleGrammarCheck(item, correct)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-medace-700 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              判定する
            </button>
            {isChecked && (
              <span className={`inline-flex items-center gap-1 text-sm font-black ${correct ? 'text-emerald-700' : 'text-red-600'}`}>
                {correct ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {correct ? '正解' : `正解は ${item.answer}`}
              </span>
            )}
          </div>
          {isChecked && <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">例文: {item.sourceSentence}</p>}
        </article>
      );
    }

    if (isEnglishWordOrderItem(item)) {
      const orderedChipIds = grammarOrders[item.id] || [];
      const correct = isOrderCorrect(orderedChipIds, item.correctChipIds);
      const chipById = new Map(item.chips.map((chip) => [chip.id, chip.text]));
      return (
        <article key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-black text-medace-700">
              {item.grammarScope.curriculumCategoryLabelJa || item.grammarScope.labelJa}
            </span>
            {showScopeHint && <span className="text-xs font-bold text-slate-400">{item.grammarScope.labelJa}</span>}
          </div>
          <p className="mt-4 text-sm font-bold text-slate-500">英単語を正しい順番に並べ替えます。大文字・ピリオドの手がかりは消しています。</p>
          <div className="mt-4 min-h-14 rounded-lg border border-dashed border-medace-200 bg-medace-50/60 px-3 py-3">
            <div className="flex flex-wrap gap-2">
              {orderedChipIds.length === 0 && <span className="text-sm font-bold text-slate-400">ここに選んだ語が並びます</span>}
              {orderedChipIds.map((chipId) => (
                <button
                  key={chipId}
                  type="button"
                  disabled={isChecked}
                  onClick={() => removeOrderChip(item.id, chipId, 'grammar')}
                  className="rounded-lg bg-white px-3 py-2 text-sm font-black text-medace-900 shadow-sm disabled:cursor-not-allowed"
                >
                  {chipById.get(chipId)}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {item.chips
              .filter((chip) => !orderedChipIds.includes(chip.id))
              .map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  disabled={isChecked}
                  onClick={() => addOrderChip(item.id, chip.id, 'grammar')}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 transition-colors hover:border-medace-300 disabled:cursor-not-allowed"
                >
                  {chip.text}
                </button>
              ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={orderedChipIds.length !== item.correctChipIds.length || isChecked}
              onClick={() => handleGrammarCheck(item, correct)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-medace-700 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              判定する
            </button>
            <button
              type="button"
              disabled={isChecked}
              onClick={() => setGrammarOrders((current) => ({ ...current, [item.id]: [] }))}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
            >
              クリア
            </button>
            {isChecked && (
              <span className={`inline-flex items-center gap-1 text-sm font-black ${correct ? 'text-emerald-700' : 'text-red-600'}`}>
                {correct ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                {correct ? '正解' : `正解: ${getOrderedText(item)}`}
              </span>
            )}
          </div>
        </article>
      );
    }

    return null;
  };

  const renderGrammar = () => (
    <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="order-2 rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm xl:order-1">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-medace-700" />
          <h2 className="text-xl font-black text-slate-950">文法範囲を選ぶ</h2>
        </div>
        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
          Next Stage・Vintage・Scramble・Evergreen 型の章立てに近いカテゴリで、複数範囲を横断できます。
        </p>
        <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="text-xs font-black text-medace-700">範囲コーチ</div>
              <p className="mt-1 text-sm font-bold leading-relaxed text-slate-700">
                {progressSummary.weakGrammarScopes.length > 0
                  ? `${progressSummary.weakGrammarScopes[0].labelJa} を優先して復習します。`
                  : 'まずは現在レベルの推奨範囲から始めます。'}
              </p>
            </div>
            <button
              type="button"
              onClick={applyRecommendedScopes}
              className="rounded-lg bg-white px-3 py-2 text-xs font-black text-medace-800 shadow-sm"
            >
              推奨範囲を選択
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {[
            { mode: 'GRAMMAR_CLOZE' as GrammarMode, label: '文法穴埋め' },
            { mode: 'EN_WORD_ORDER' as GrammarMode, label: '英語並び替え' },
          ].map((item) => (
            <button
              key={item.mode}
              type="button"
              onClick={() => setGrammarMode(item.mode)}
              className={`rounded-lg border px-4 py-3 text-sm font-black transition-colors ${
                grammarMode === item.mode
                  ? 'border-medace-600 bg-medace-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setRandomScopeMode((current) => !current)}
            className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-2 text-sm font-black ${
              randomScopeMode ? 'border-medace-500 bg-medace-50 text-medace-800' : 'border-slate-200 bg-white text-slate-600'
            }`}
          >
            <Shuffle className="h-4 w-4" />
            ランダム演習
          </button>
          <button
            type="button"
            onClick={() => setShowScopeHint((current) => !current)}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-600"
          >
            {showScopeHint ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {showScopeHint ? '範囲を明示' : '範囲を隠す'}
          </button>
          <button
            type="button"
            onClick={resetGeneratedPractice}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
            問題を更新
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { id: 'recommended' as ScopeViewFilter, label: '推奨' },
            { id: 'weak' as ScopeViewFilter, label: '弱点' },
            { id: 'all' as ScopeViewFilter, label: '全範囲' },
          ].map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => handleScopeViewFilterChange(filter.id)}
              className={`rounded-lg border px-3 py-2 text-xs font-black transition-colors ${
                scopeViewFilter === filter.id
                  ? 'border-medace-500 bg-medace-50 text-medace-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-medace-200'
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScopeCategoryFilter('all')}
            className={`rounded-lg border px-3 py-2 text-xs font-black transition-colors ${
              scopeCategoryFilter === 'all'
                ? 'border-medace-500 bg-medace-50 text-medace-800'
                : 'border-slate-200 bg-white text-slate-600 hover:border-medace-200'
            }`}
          >
            章すべて
          </button>
          {grammarCategoryOptions.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => setScopeCategoryFilter(category.id)}
              className={`rounded-lg border px-3 py-2 text-xs font-black transition-colors ${
                scopeCategoryFilter === category.id
                  ? 'border-medace-500 bg-medace-50 text-medace-800'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-medace-200'
              }`}
            >
              {category.label} {category.count}
            </button>
          ))}
        </div>

        <div className="mt-4 max-h-[520px] overflow-y-auto pr-1">
          <div className="grid gap-2">
            {visibleGrammarScopes.length === 0 && (
              <div className="rounded-lg border border-dashed border-orange-200 bg-orange-50 px-3 py-4 text-sm font-bold text-medace-800">
                この条件の範囲はまだありません。全範囲か別の章に切り替えてください。
              </div>
            )}
            {visibleGrammarScopes.map((scope) => {
              const selected = selectedScopeIds.includes(scope.id);
              const weakScope = weakScopeById.get(scope.id);
              return (
                <button
                  key={scope.id}
                  type="button"
                  onClick={() => toggleScope(scope.id)}
                  className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                    selected
                      ? 'border-medace-400 bg-medace-50 text-medace-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-medace-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-sm font-black">{scope.labelJa}</div>
                      <div className="mt-1 text-xs font-bold text-slate-500">{scope.curriculumCategoryLabelJa} / {scope.groupLabelJa}</div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-medace-700">{scope.levelMin}-{scope.levelMax}</span>
                      {weakScope && (
                        <span className="rounded-full bg-orange-100 px-2 py-1 text-[11px] font-black text-orange-800">
                          弱点 {weakScope.accuracy}%
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="order-1 space-y-3 xl:order-2">
        <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
          <div className="text-xs font-black text-medace-700">生成された問題</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">選んだ範囲から {grammarItems.length} 問</h2>
          <p className="mt-1 text-sm font-bold leading-relaxed text-slate-600">
            同じテンプレートの使い回しを避け、範囲・単語・レベルに合わせて例文を切り替えます。
          </p>
        </div>
        {grammarItems.map(renderGrammarItem)}
      </section>
    </div>
  );

  const renderTranslation = () => (
    <div className="grid gap-4 xl:grid-cols-[0.78fr_1.22fr]">
      <section className="order-2 rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm xl:order-1">
        <div className="flex items-center gap-2">
          <Languages className="h-5 w-5 text-medace-700" />
          <h2 className="text-xl font-black text-slate-950">和訳トレーニング</h2>
        </div>
        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
          文法範囲を先に選ばず、英文全体の意味・構造・受験答案らしさを見ます。
        </p>
        <div className="mt-4 grid gap-2">
          {[
            { mode: 'input' as TranslationMode, label: '全文を自分で書く', icon: PencilLine },
            { mode: 'order' as TranslationMode, label: '訳の骨組みを並べる', icon: Target },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.mode}
                type="button"
                onClick={() => setTranslationMode(item.mode)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-black transition-colors ${
                  translationMode === item.mode
                    ? 'border-medace-600 bg-medace-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>
        <div className="mt-4 rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
          <div className="text-xs font-black text-medace-700">AIフィードバック</div>
          <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">
            不一致答案はAI採点に回し、高校受験・大学受験の答案として、意味の抜けと構文の取り違えを返します。
          </p>
        </div>
      </section>

      <section className="order-1 space-y-3 xl:order-2">
        {translationItems.map((item) => {
          const feedback = translationFeedback[item.id];
          const orderedChipIds = translationOrders[item.id] || [];
          const orderChecked = checkedTranslationOrders[item.id];
          const orderCorrect = isOrderCorrect(orderedChipIds, item.correctChipIds);
          const chipById = new Map(item.chips.map((chip) => [chip.id, chip.text]));

          return (
            <article key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs font-black text-slate-400">和訳練習</div>
              <p className="mt-2 text-lg font-black leading-relaxed text-slate-950">{item.sourceSentence}</p>

              {translationMode === 'input' ? (
                <>
                  <textarea
                    value={translationInputs[item.id] || ''}
                    onChange={(event) => setTranslationInputs((current) => ({ ...current, [item.id]: event.target.value }))}
                    rows={3}
                    className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm font-bold leading-relaxed text-slate-800 outline-none transition-colors focus:border-medace-400 focus:ring-2 focus:ring-medace-100"
                    placeholder="日本語訳を全文で入力"
                  />
                  {feedback ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={resetGeneratedPractice}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-medace-700 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-medace-800"
                      >
                        次の和訳へ <ArrowRight className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setTranslationFeedback((current) => {
                          const next = { ...current };
                          delete next[item.id];
                          return next;
                        })}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-600 transition-colors hover:border-medace-300 hover:text-medace-800"
                      >
                        訳を修正して再提出
                      </button>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={!translationInputs[item.id]?.trim() || checkingTranslationId === item.id}
                        onClick={() => void handleTranslationSubmit(item)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-medace-700 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {checkingTranslationId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        AIフィードバック
                      </button>
                    </div>
                  )}
                  {feedback && (
                    <JapaneseTranslationFeedbackCard feedback={feedback} />
                  )}
                </>
              ) : (
                <>
                  <div className="mt-4 min-h-14 rounded-lg border border-dashed border-medace-200 bg-medace-50/60 px-3 py-3">
                    <div className="flex flex-wrap gap-2">
                      {orderedChipIds.length === 0 && <span className="text-sm font-bold text-slate-400">訳の部品を順番に選びます</span>}
                      {orderedChipIds.map((chipId) => (
                        <button
                          key={chipId}
                          type="button"
                          disabled={orderChecked}
                          onClick={() => removeOrderChip(item.id, chipId, 'translation')}
                          className="rounded-lg bg-white px-3 py-2 text-sm font-black text-medace-900 shadow-sm disabled:cursor-not-allowed"
                        >
                          {chipById.get(chipId)}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {item.chips
                      .filter((chip) => !orderedChipIds.includes(chip.id))
                      .map((chip) => (
                        <button
                          key={chip.id}
                          type="button"
                          disabled={orderChecked}
                          onClick={() => addOrderChip(item.id, chip.id, 'translation')}
                          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-700 transition-colors hover:border-medace-300 disabled:cursor-not-allowed"
                        >
                          {chip.text}
                        </button>
                      ))}
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={orderedChipIds.length !== item.correctChipIds.length || orderChecked}
                      onClick={() => handleTranslationOrderCheck(item, orderCorrect)}
                      className="inline-flex min-h-10 items-center rounded-lg bg-medace-700 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      判定する
                    </button>
                    {orderChecked && (
                      <span className={`inline-flex items-center gap-1 text-sm font-black ${orderCorrect ? 'text-emerald-700' : 'text-red-600'}`}>
                        {orderCorrect ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        {orderCorrect ? '正解' : `正解: ${getOrderedText(item)}`}
                      </span>
                    )}
                  </div>
                </>
              )}
            </article>
          );
        })}
      </section>
    </div>
  );

  const renderReading = () => (
    <div className="space-y-4">
      <section className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-black text-medace-700">長文読解</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">長文読解演習</h2>
            <p className="mt-1 text-sm font-bold leading-relaxed text-slate-500">
              本文を読み、選択肢だけでなく根拠文と日本語解説まで確認します。上位レベルは挑戦として扱います。
            </p>
          </div>
          <button
            type="button"
            onClick={resetGeneratedPractice}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
            本文を更新
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.values(EnglishLevel).map((level) => {
            const isChallengeLevel = compareEnglishLevels(level, userLevel) > 0;
            return (
              <button
                key={level}
                type="button"
                onClick={() => setReadingLevel(level)}
                className={`rounded-lg border px-3 py-2 text-sm font-black transition-colors ${
                  readingLevel === level
                    ? 'border-medace-600 bg-medace-600 text-white'
                    : isChallengeLevel
                      ? 'border-orange-200 bg-orange-50 text-orange-800 hover:border-medace-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'
                }`}
              >
                {LEVEL_LABELS[level]}{isChallengeLevel ? '・挑戦' : ''}
              </button>
            );
          })}
        </div>
      </section>
      {readingSummary && (
        <section className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
          <div className="text-xs font-black text-medace-700">読解レビュー</div>
          <h3 className="mt-1 text-lg font-black text-slate-950">
            今回 {readingSummary.correct} / {readingSummary.total} 問正解
          </h3>
          <p className="mt-1 text-sm font-bold leading-relaxed text-slate-600">
            {readingSummary.weakQuestionKinds.length > 0
              ? `次は ${readingSummary.weakQuestionKinds.map(getReadingQuestionKindLabel).join('・')} の根拠探しを短く復習します。`
              : '設問種別の偏りはありません。次は1つ上の本文に挑戦できます。'}
          </p>
        </section>
      )}
      <ReadingPracticeView
        passages={readingPassages}
        onAnswer={handleReadingAnswer}
        onComplete={handleReadingComplete}
      />
    </div>
  );

  const renderActiveLane = () => {
    switch (activeLane) {
      case 'grammar':
        return renderGrammar();
      case 'translation':
        return renderTranslation();
      case 'reading':
        return renderReading();
      case 'overview':
      default:
        return renderOverview();
    }
  };

  return (
    <div data-testid="english-practice-hub" className="space-y-5 pb-24">
      <section className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-600 transition-colors hover:border-medace-300 hover:text-medace-800"
          >
            <ArrowLeft className="h-4 w-4" />
            戻る
          </button>
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-black text-medace-700">
              {LEVEL_LABELS[userLevel]}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-black text-slate-500">
              {wordsLoading ? '単語を準備中' : samplePracticeActive ? '体験問題' : `${sessionWords.length}語から生成`}
            </span>
            <span className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-medace-700">
              演習 {progressSummary.total}回 / {progressSummary.accuracy}%
            </span>
          </div>
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-4">
          {laneConfig.map((lane) => {
            const Icon = lane.icon;
            return (
              <button
                key={lane.id}
                type="button"
                data-testid={`english-practice-lane-${lane.id}`}
                onClick={() => setActiveLane(lane.id)}
                className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                  activeLane === lane.id
                    ? 'border-medace-600 bg-medace-600 text-white'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  <span className="text-sm font-black">{lane.label}</span>
                </div>
                <p className={`mt-1 text-xs font-bold leading-relaxed ${activeLane === lane.id ? 'text-white/72' : 'text-slate-500'}`}>
                  {lane.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {wordsLoading && sessionWords.length === 0 && (
        <section className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-medace-800">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          学習中の単語を確認しています。読み込み完了後に、履歴へ残る問題を開始できます。
        </section>
      )}

      {samplePracticeActive && (
        <section className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-medace-800">
          学習中の単語がまだないため体験問題を表示しています。この結果は復習履歴やクラウド履歴には保存しません。
        </section>
      )}

      {practiceSyncError && (
        <section className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {practiceSyncError}
        </section>
      )}

      {renderActiveLane()}
    </div>
  );
};

export default EnglishPracticeHub;
