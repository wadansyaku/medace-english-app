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
  NotebookPen,
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
  getPendingEnglishPracticeAttempts,
  loadEnglishPracticeProgress,
  markEnglishPracticeAttemptSynced,
  recordEnglishPracticeAttempt,
  saveEnglishPracticeProgress,
  summarizeEnglishPracticeProgress,
  toEnglishPracticeStoragePayload,
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
import {
  countEssayWords,
  getDefaultEikenWritingTask,
  getEikenWritingLevelLabel,
  getEikenWritingTaskTypeLabel,
  getEikenWritingTasks,
  type EikenWritingLevel,
  type EikenWritingTaskType,
} from '../../utils/eikenWritingPractice';

export type PracticeLane = 'overview' | 'grammar' | 'translation' | 'reading' | 'writing';
type GrammarMode = 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER';
type TranslationMode = 'input' | 'order';
type ScopeViewFilter = 'recommended' | 'weak' | 'all';
type ScopeCategoryFilter = GrammarCurriculumCategoryId | 'all';

interface EnglishPracticeHubProps {
  user: UserProfile;
  onBack?: () => void;
  onStartVocabulary: () => void;
  variant?: 'standalone' | 'embedded';
  embeddedMode?: 'full' | 'drill';
  initialLane?: PracticeLane;
  onActiveLaneChange?: (lane: PracticeLane) => void;
  onClose?: () => void;
  closeLabel?: string;
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
    title: '英語演習',
    description: 'ホームから選んだ演習を集中して進める',
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
  {
    id: 'writing',
    label: '英検英作文',
    title: '英検ライティング練習',
    description: 'Eメール・意見論述・要約を級別テーマで練習',
    icon: NotebookPen,
  },
];

const examLevelLabels = ['中学', '高校基礎', '共通テスト', '二次・私大', '国公立二次'];
const examLevels: EnglishLevel[] = [
  EnglishLevel.A2,
  EnglishLevel.B1,
  EnglishLevel.B2,
  EnglishLevel.C1,
  EnglishLevel.C2,
];
const questionCountOptions = [5, 10, 15, 20] as const;
const eikenWritingLevelOptions: EikenWritingLevel[] = ['grade-3', 'pre-2', 'grade-2', 'pre-1'];
const eikenWritingTaskTypeOptions: EikenWritingTaskType[] = ['email', 'opinion', 'summary'];

const formatPercent = (value: number): number => {
  if (Number.isFinite(value) && value > 0) return Math.max(0, Math.min(100, Math.round(value)));
  return 0;
};

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

const normalizePracticeLane = (lane: PracticeLane | undefined, fallback: PracticeLane = 'grammar'): PracticeLane => (
  lane && lane !== 'overview' ? lane : fallback
);

const EnglishPracticeHub: React.FC<EnglishPracticeHubProps> = ({
  user,
  onBack,
  variant = 'standalone',
  embeddedMode = 'full',
  initialLane,
  onActiveLaneChange,
  onClose,
  closeLabel = '閉じる',
}) => {
  const userLevel = user.englishLevel ?? EnglishLevel.A2;
  const isEmbedded = variant === 'embedded';
  const isEmbeddedDrill = isEmbedded && embeddedMode === 'drill';
  const handleBack = onBack ?? (() => undefined);
  const [activeLane, setActiveLane] = useState<PracticeLane>(
    () => normalizePracticeLane(initialLane, isEmbeddedDrill ? 'grammar' : 'grammar'),
  );
  const [sessionWords, setSessionWords] = useState<WordData[]>([]);
  const [wordsLoading, setWordsLoading] = useState(true);
  const [wordLoadFailed, setWordLoadFailed] = useState(false);
  const [practiceSeed, setPracticeSeed] = useState(1);
  const [grammarMode, setGrammarMode] = useState<GrammarMode>('GRAMMAR_CLOZE');
  const [grammarQuestionCount, setGrammarQuestionCount] = useState<(typeof questionCountOptions)[number]>(5);
  const [scopeViewFilter, setScopeViewFilter] = useState<ScopeViewFilter>('recommended');
  const [scopeCategoryFilter, setScopeCategoryFilter] = useState<ScopeCategoryFilter>('all');
  const [scopePickerOpen, setScopePickerOpen] = useState(false);
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
  const [submittedTranslationInputs, setSubmittedTranslationInputs] = useState<Record<string, string>>({});
  const submittedTranslationInputRef = React.useRef<Record<string, string>>({});
  const translationSubmissionVersionRef = React.useRef(0);
  const [checkingTranslationId, setCheckingTranslationId] = useState<string | null>(null);
  const [practiceLevel, setPracticeLevel] = useState<EnglishLevel>(userLevel);
  const [readingSummary, setReadingSummary] = useState<ReadingPracticeSessionSummary | null>(null);
  const [writingLevel, setWritingLevel] = useState<EikenWritingLevel>('grade-2');
  const [writingTaskType, setWritingTaskType] = useState<EikenWritingTaskType>('opinion');
  const [selectedWritingTaskId, setSelectedWritingTaskId] = useState<string | null>(() => (
    getDefaultEikenWritingTask({ level: 'grade-2', taskType: 'opinion' })?.id ?? null
  ));
  const [writingDraft, setWritingDraft] = useState('');
  const [practiceSyncError, setPracticeSyncError] = useState<string | null>(null);
  const [practiceProgress, setPracticeProgress] = useState(() => loadEnglishPracticeProgress(user.uid));
  const pendingPracticeSyncRef = React.useRef<Set<string>>(new Set());

  const activateLane = React.useCallback((lane: PracticeLane) => {
    setActiveLane(lane);
    onActiveLaneChange?.(lane);
    if (!isEmbedded && typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [isEmbedded, onActiveLaneChange]);

  React.useEffect(() => {
    if (initialLane) {
      setActiveLane(normalizePracticeLane(initialLane));
      return;
    }
    if (isEmbeddedDrill) {
      setActiveLane('grammar');
    }
  }, [initialLane, isEmbeddedDrill]);

  const grammarScopes = useMemo(
    () => getGrammarScopesForPracticeSelection({ mode: grammarMode }),
    [grammarMode],
  );
  const [selectedScopeIds, setSelectedScopeIds] = useState<GrammarCurriculumScopeId[]>(
    () => selectDefaultScopeIds(getGrammarScopesForPracticeSelection({ mode: 'GRAMMAR_CLOZE' }), practiceLevel),
  );

  React.useEffect(() => {
    setPracticeProgress(loadEnglishPracticeProgress(user.uid));
  }, [user.uid]);

  React.useEffect(() => {
    saveEnglishPracticeProgress(practiceProgress);
  }, [practiceProgress]);

  React.useEffect(() => {
    const pendingAttempts = getPendingEnglishPracticeAttempts(practiceProgress)
      .filter((attempt) => !pendingPracticeSyncRef.current.has(attempt.clientAttemptId))
      .slice(0, 8);
    if (pendingAttempts.length === 0) return;

    pendingAttempts.forEach((attempt) => {
      pendingPracticeSyncRef.current.add(attempt.clientAttemptId);
      void learningService.recordEnglishPracticeAttempt(
        user.uid,
        toEnglishPracticeStoragePayload(attempt),
      ).then(() => {
        pendingPracticeSyncRef.current.delete(attempt.clientAttemptId);
        setPracticeProgress((current) => markEnglishPracticeAttemptSynced(current, attempt.clientAttemptId));
      }).catch((error) => {
        console.error('English practice attempt sync failed', error);
        pendingPracticeSyncRef.current.delete(attempt.clientAttemptId);
        setPracticeSyncError('結果を保存できませんでした。次に開いたとき、もう一度保存を試します。');
      });
    });
  }, [practiceProgress, user.uid]);

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
      return selectDefaultScopeIds(grammarScopes, practiceLevel);
    });
    setGrammarSelections({});
    setGrammarOrders({});
    setCheckedGrammarItems({});
  }, [grammarMode, grammarScopes, practiceLevel]);

  React.useEffect(() => {
    setTranslationInputs({});
    setTranslationOrders({});
    setCheckedTranslationOrders({});
    setTranslationFeedback({});
    setSubmittedTranslationInputs({});
    submittedTranslationInputRef.current = {};
    translationSubmissionVersionRef.current += 1;
    setCheckingTranslationId(null);
    setReadingSummary(null);
  }, [practiceLevel]);

  const samplePracticeActive = !wordsLoading && (wordLoadFailed || sessionWords.length === 0);
  const practiceWords = sessionWords.length > 0 ? sessionWords : samplePracticeActive ? FALLBACK_WORDS : [];
  const selectedScopes = grammarScopes.filter((scope) => selectedScopeIds.includes(scope.id));
  const activeScopePool = selectedScopes.length > 0 ? selectedScopes : grammarScopes.slice(0, 4);
  const targetGrammarKind = toGrammarKind(grammarMode);
  const examTarget = resolveTranslationExamTarget(user.grade);

  const grammarItems = useMemo(() => {
    if (activeScopePool.length === 0) return [];
    if (practiceWords.length === 0) return [];
    return Array.from({ length: grammarQuestionCount }, (_, index) => {
        const word = practiceWords[index % practiceWords.length];
        const scopeIndex = randomScopeMode
          ? (index * 3 + practiceSeed) % activeScopePool.length
          : index % activeScopePool.length;
        const scope = activeScopePool[scopeIndex];
        return buildGrammarPracticeItemsForWord(word, {
          seed: `english-practice:${practiceSeed}:${grammarMode}:${scope.id}:${index}`,
          requestedScopeId: scope.id,
          userLevel: practiceLevel,
        }).find((item) => item.kind === targetGrammarKind) ?? null;
      })
      .filter((item): item is GrammarPracticeItem => Boolean(item))
      .slice(0, grammarQuestionCount);
  }, [activeScopePool, grammarMode, grammarQuestionCount, practiceLevel, practiceSeed, practiceWords, randomScopeMode, targetGrammarKind]);

  const translationItems = useMemo(() => (
    practiceWords
      .slice(0, 6)
      .map((word, index) => buildGrammarPracticeItemsForWord(word, {
        seed: `translation:${practiceSeed}:${index}`,
        japaneseQuestionMode: 'JA_TRANSLATION_INPUT',
        userLevel: practiceLevel,
      }).find(isJapaneseWordOrderItem) ?? null)
      .filter((item): item is JapaneseWordOrderPracticeItem => Boolean(item))
      .slice(0, 4)
  ), [practiceLevel, practiceSeed, practiceWords]);

  const readingPassages = useMemo(() => (
    buildReadingPracticePassages({
      level: practiceLevel,
      seed: `english-practice:${practiceSeed}:${practiceLevel}`,
      maxPassages: 1,
    })
  ), [practiceLevel, practiceSeed]);

  const availableWritingTaskTypes = useMemo(() => (
    eikenWritingTaskTypeOptions.filter((taskType) => getEikenWritingTasks({ level: writingLevel, taskType }).length > 0)
  ), [writingLevel]);

  const writingTasks = useMemo(() => (
    getEikenWritingTasks({ level: writingLevel, taskType: writingTaskType })
  ), [writingLevel, writingTaskType]);

  React.useEffect(() => {
    if (availableWritingTaskTypes.length > 0 && !availableWritingTaskTypes.includes(writingTaskType)) {
      setWritingTaskType(availableWritingTaskTypes[0]);
    }
  }, [availableWritingTaskTypes, writingTaskType]);

  React.useEffect(() => {
    const currentStillAvailable = writingTasks.some((task) => task.id === selectedWritingTaskId);
    if (!currentStillAvailable) {
      setSelectedWritingTaskId(writingTasks[0]?.id ?? null);
      setWritingDraft('');
    }
  }, [selectedWritingTaskId, writingTasks]);

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
    return selectDefaultScopeIds(grammarScopes, practiceLevel);
  }, [grammarScopes, practiceLevel, progressSummary.recommendation.scopeIds]);

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
    const isFallbackWordAttempt = samplePracticeActive && (attempt.lane === 'grammar' || attempt.lane === 'translation');
    if (isFallbackWordAttempt || attempt.bookId === ENGLISH_PRACTICE_SAMPLE_BOOK_ID) {
      setPracticeSyncError(null);
      return;
    }

    const attemptWithFeedback = options?.translationFeedback
      ? { ...attempt, translationFeedback: options.translationFeedback }
      : attempt;
    setPracticeSyncError(null);
    setPracticeProgress((current) => {
      const base = current.userUid === user.uid ? current : loadEnglishPracticeProgress(user.uid);
      return recordEnglishPracticeAttempt(base, attemptWithFeedback);
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
    setSubmittedTranslationInputs({});
    submittedTranslationInputRef.current = {};
    translationSubmissionVersionRef.current += 1;
    setCheckingTranslationId(null);
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
    setSelectedScopeIds(recommendedScopeIds.length > 0 ? recommendedScopeIds : selectDefaultScopeIds(grammarScopes, practiceLevel));
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
      level: practiceLevel,
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
      level: practiceLevel,
    });
  };

  const handleTranslationSubmit = async (item: JapaneseWordOrderPracticeItem) => {
    const input = translationInputs[item.id]?.trim() || '';
    if (!input || checkingTranslationId || submittedTranslationInputRef.current[item.id] === input) return;
    submittedTranslationInputRef.current = {
      ...submittedTranslationInputRef.current,
      [item.id]: input,
    };
    setSubmittedTranslationInputs((current) => ({ ...current, [item.id]: input }));
    const submissionVersion = translationSubmissionVersionRef.current;

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
          summaryJa: `${feedback.summaryJa} 今回は正解例と比べて、直す場所を確認しています。`,
          issues: feedback.issues.length > 0
            ? feedback.issues
          : ['正解例を見ながら、主語・動詞・修飾語の対応をもう一度確認してください。'],
        };
      } finally {
        if (translationSubmissionVersionRef.current === submissionVersion) {
          setCheckingTranslationId(null);
        }
      }
    }

    if (translationSubmissionVersionRef.current !== submissionVersion) return;

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
      level: practiceLevel,
    }, { translationFeedback: feedback });
  };

  const handleReadingAnswer = React.useCallback((result: ReadingPracticeAnswerResult) => {
    recordPracticeAttempt({
      lane: 'reading',
      mode: 'READING',
      correct: result.correct,
      level: practiceLevel,
      readingQuestionKind: result.kind,
    });
  }, [practiceLevel, recordPracticeAttempt]);

  const handleReadingComplete = React.useCallback((summary: ReadingPracticeSessionSummary) => {
    setReadingSummary(summary);
  }, []);

  const selectedWritingTask = writingTasks.find((task) => task.id === selectedWritingTaskId)
    ?? writingTasks[0]
    ?? getDefaultEikenWritingTask({ level: writingLevel, taskType: writingTaskType });
  const writingWordCount = countEssayWords(writingDraft);
  const writingWordRange = selectedWritingTask?.wordRange;
  const writingWithinRange = Boolean(
    writingWordRange
    && writingWordCount >= writingWordRange.min
    && writingWordCount <= writingWordRange.max,
  );
  const handleWritingRecord = React.useCallback(() => {
    if (!selectedWritingTask || !writingDraft.trim()) return;
    recordPracticeAttempt({
      lane: 'writing',
      mode: 'WRITING',
      correct: writingWithinRange,
      score: writingWithinRange ? 1 : 0,
      maxScore: 1,
      level: practiceLevel,
    });
  }, [practiceLevel, recordPracticeAttempt, selectedWritingTask, writingDraft, writingWithinRange]);
  const overallAccuracy = formatPercent(progressSummary.accuracy);
  const currentStreak = user.stats?.currentStreak ?? 0;
  const levelIndex = Math.max(0, examLevels.indexOf(practiceLevel));

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
                  : 'まずは今のレベルで解きやすい範囲から始めます。'}
              </p>
            </div>
            <button
              type="button"
              onClick={applyRecommendedScopes}
              className="rounded-lg bg-white px-3 py-2 text-xs font-black text-medace-800 shadow-sm"
            >
              今日の範囲を選ぶ
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

        <div className="mt-4 rounded-lg border border-orange-100 bg-white px-3 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-xs font-black text-slate-500">選択中の範囲</div>
              <p className="mt-1 text-sm font-black text-slate-900">
                {selectedScopes.length > 0
                  ? selectedScopes.slice(0, 2).map((scope) => scope.labelJa).join(' / ')
                  : '今日向けの範囲'}
                {selectedScopes.length > 2 ? ` ほか${selectedScopes.length - 2}件` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setScopePickerOpen((current) => !current)}
              className="inline-flex min-h-10 items-center justify-center rounded-lg border border-medace-200 bg-medace-50 px-3 py-2 text-sm font-black text-medace-800 transition-colors hover:bg-orange-50"
            >
              {scopePickerOpen ? '範囲選択を閉じる' : '範囲を変更'}
            </button>
          </div>
        </div>

        {scopePickerOpen && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { id: 'recommended' as ScopeViewFilter, label: '今日向け' },
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

            <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
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
          </>
        )}
      </section>

      <section className="order-1 space-y-3 xl:order-2">
        <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
          <div className="text-xs font-black text-medace-700">今回の問題</div>
          <h2 className="mt-1 text-xl font-black text-slate-950">選んだ範囲から {grammarItems.length} 問</h2>
          <p className="mt-1 text-sm font-bold leading-relaxed text-slate-600">
            選んだ範囲と単語に合わせた例文で練習します。
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
          英文全体を訳して、意味の抜けと構文の取り違えを見直します。
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
          <div className="text-xs font-black text-medace-700">答案チェック</div>
          <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">
            正解例と違う訳は、意味の抜けと構文の取り違えを確認します。
          </p>
        </div>
      </section>

      <section className="order-1 space-y-3 xl:order-2">
        {translationItems.map((item) => {
          const feedback = translationFeedback[item.id];
          const translationInput = translationInputs[item.id] || '';
          const trimmedTranslationInput = translationInput.trim();
          const repeatedSubmittedTranslation = Boolean(trimmedTranslationInput)
            && submittedTranslationInputs[item.id] === trimmedTranslationInput;
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
                    value={translationInput}
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
                        disabled={!trimmedTranslationInput || checkingTranslationId === item.id || repeatedSubmittedTranslation}
                        onClick={() => void handleTranslationSubmit(item)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-medace-700 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        {checkingTranslationId === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        答案チェック
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
      <section className="rounded-lg border border-orange-100 bg-white px-4 py-3 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {Object.values(EnglishLevel).map((level) => {
              const isChallengeLevel = compareEnglishLevels(level, userLevel) > 0;
              return (
                <button
                  key={level}
                  type="button"
                  onClick={() => setPracticeLevel(level)}
                  className={`rounded-lg border px-3 py-2 text-sm font-black transition-colors ${
                    practiceLevel === level
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
          <button
            type="button"
            onClick={resetGeneratedPractice}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-600"
          >
            <RefreshCw className="h-4 w-4" />
            本文を更新
          </button>
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
        showHeader={false}
        onAnswer={handleReadingAnswer}
        onComplete={handleReadingComplete}
      />
    </div>
  );

  const renderWriting = () => (
    <div data-testid="english-practice-lane-writing-panel" className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
      <section className="order-2 rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm xl:order-1">
        <div className="flex items-center gap-2">
          <NotebookPen className="h-5 w-5 text-medace-700" />
          <h2 className="text-xl font-black text-slate-950">英検ライティング</h2>
        </div>
        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
          級と形式を選び、採点観点を見ながら短時間で1答案を書きます。
        </p>

        <div className="mt-4 space-y-4">
          <div>
            <div className="mb-2 text-xs font-black text-slate-500">級</div>
            <div className="grid grid-cols-2 gap-2">
              {eikenWritingLevelOptions.map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setWritingLevel(level)}
                  className={`min-h-10 rounded-lg border px-3 py-2 text-sm font-black transition-colors ${
                    writingLevel === level
                      ? 'border-medace-600 bg-medace-600 text-white'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'
                  }`}
                >
                  {getEikenWritingLevelLabel(level)}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-black text-slate-500">形式</div>
            <div className="grid gap-2">
              {eikenWritingTaskTypeOptions.map((taskType) => {
                const enabled = availableWritingTaskTypes.includes(taskType);
                return (
                  <button
                    key={taskType}
                    type="button"
                    disabled={!enabled}
                    onClick={() => setWritingTaskType(taskType)}
                    className={`min-h-10 rounded-lg border px-3 py-2 text-left text-sm font-black transition-colors ${
                      writingTaskType === taskType && enabled
                        ? 'border-medace-600 bg-medace-600 text-white'
                        : enabled
                          ? 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'
                          : 'cursor-not-allowed border-slate-100 bg-slate-50 text-slate-300'
                    }`}
                  >
                    {getEikenWritingTaskTypeLabel(taskType)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div className="mb-2 text-xs font-black text-slate-500">テーマ</div>
            <div className="max-h-[390px] overflow-y-auto pr-1">
              <div className="grid gap-2">
                {writingTasks.map((task) => (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => {
                      if (selectedWritingTask?.id !== task.id) {
                        setSelectedWritingTaskId(task.id);
                        setWritingDraft('');
                      }
                    }}
                    className={`rounded-lg border px-3 py-3 text-left transition-colors ${
                      selectedWritingTask?.id === task.id
                        ? 'border-medace-400 bg-medace-50 text-medace-950'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-medace-200'
                    }`}
                  >
                    <div className="text-sm font-black">{task.titleJa}</div>
                    <div className="mt-1 text-xs font-bold text-slate-500">
                      {task.wordRange.min}-{task.wordRange.max} words / {getEikenWritingTaskTypeLabel(task.taskType)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="order-1 space-y-3 xl:order-2">
        {selectedWritingTask ? (
          <>
            <article className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-black text-medace-700">
                    {getEikenWritingLevelLabel(selectedWritingTask.level)} / {getEikenWritingTaskTypeLabel(selectedWritingTask.taskType)}
                  </div>
                  <h2 className="mt-1 text-2xl font-black text-slate-950">{selectedWritingTask.titleJa}</h2>
                </div>
                <span className="rounded-full border border-orange-100 bg-orange-50 px-3 py-1 text-xs font-black text-medace-700">
                  {selectedWritingTask.wordRange.min}-{selectedWritingTask.wordRange.max} words
                </span>
              </div>
              <p className="mt-4 whitespace-pre-line rounded-lg border border-slate-200 bg-slate-50 px-4 py-4 text-base font-black leading-8 text-slate-900">
                {selectedWritingTask.promptEn}
              </p>
              {selectedWritingTask.sourcePassageEn && (
                <section
                  data-testid="eiken-writing-source-passage"
                  className="mt-4 rounded-lg border border-orange-100 bg-white px-4 py-4"
                >
                  <div className="text-xs font-black text-medace-700">要約用英文</div>
                  <p className="mt-2 whitespace-pre-line text-[0.95rem] font-medium leading-8 text-slate-800">
                    {selectedWritingTask.sourcePassageEn}
                  </p>
                </section>
              )}
              <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">{selectedWritingTask.promptJa}</p>
            </article>

            <div className="grid gap-3 lg:grid-cols-2">
              <section className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
                <div className="text-xs font-black text-medace-700">見る観点</div>
                <ul className="mt-3 space-y-2 text-sm font-bold leading-relaxed text-slate-700">
                  {selectedWritingTask.focusPoints.map((point) => (
                    <li key={point} className="flex gap-2">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-medace-600" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="rounded-lg border border-slate-200 bg-white px-4 py-4">
                <div className="text-xs font-black text-slate-500">提出前チェック</div>
                <ul className="mt-3 space-y-2 text-sm font-bold leading-relaxed text-slate-700">
                  {selectedWritingTask.checklist.map((item) => (
                    <li key={item} className="flex gap-2">
                      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-medace-500" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            <article className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-black text-slate-400">答案</div>
                  <h3 className="mt-1 text-lg font-black text-slate-950">自分の英作文を書く</h3>
                </div>
                <span
                  data-testid="eiken-writing-word-count"
                  className={`rounded-full border px-3 py-1 text-xs font-black ${
                    writingWithinRange
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-orange-200 bg-orange-50 text-medace-700'
                  }`}
                >
                  {writingWordCount} words
                </span>
              </div>
              <textarea
                data-testid="eiken-writing-draft"
                value={writingDraft}
                onChange={(event) => setWritingDraft(event.target.value)}
                rows={10}
                className="mt-4 w-full rounded-lg border border-slate-200 bg-white px-4 py-4 text-base font-medium leading-8 text-slate-900 outline-none transition-colors focus:border-medace-400 focus:ring-2 focus:ring-medace-100"
                placeholder="Write your answer here."
              />
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-orange-100">
                <div
                  className={`h-full rounded-full transition-all ${writingWithinRange ? 'bg-emerald-500' : 'bg-medace-500'}`}
                  style={{
                    width: `${Math.min(100, writingWordRange ? (writingWordCount / writingWordRange.max) * 100 : 0)}%`,
                  }}
                />
              </div>
              <p className="mt-3 text-sm font-bold leading-relaxed text-slate-600">
                {writingWithinRange
                  ? '語数は範囲内です。次は理由・具体例・結論の対応を確認します。'
                  : `目安は ${selectedWritingTask.wordRange.min}-${selectedWritingTask.wordRange.max} words です。`}
              </p>
              <button
                type="button"
                disabled={!writingDraft.trim()}
                onClick={handleWritingRecord}
                className="mt-4 inline-flex min-h-10 w-full items-center justify-center rounded-lg bg-medace-700 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                英検英作文の練習として記録
              </button>
            </article>
          </>
        ) : (
          <section className="rounded-lg border border-dashed border-orange-200 bg-orange-50 px-4 py-6 text-sm font-bold text-medace-800">
            この条件の英作文テーマはまだありません。別の級または形式を選んでください。
          </section>
        )}
      </section>
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
      case 'writing':
        return renderWriting();
      case 'overview':
      default:
        return renderGrammar();
    }
  };

  const renderLaneTabs = () => {
    const visibleLanes = laneConfig.filter((lane) => lane.id !== 'overview');
    return (
    <div className="mb-4 grid grid-cols-4 gap-2 sm:flex sm:overflow-x-auto sm:pb-1">
      {visibleLanes.map((lane) => {
        const Icon = lane.icon;
        return (
          <button
            key={lane.id}
            type="button"
            data-testid={`english-practice-lane-${lane.id}`}
            onClick={() => activateLane(lane.id)}
            className={`inline-flex min-h-14 shrink-0 flex-col items-center justify-center gap-1 rounded-md border px-1.5 py-2 text-[11px] font-black leading-tight transition-colors sm:min-h-10 sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
              activeLane === lane.id
                ? 'border-medace-600 bg-medace-600 text-white'
                : 'border-orange-100 bg-white text-slate-700 hover:border-medace-200 hover:bg-orange-50'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 text-center">{lane.label}</span>
          </button>
        );
      })}
    </div>
    );
  };

  const renderPracticeMeta = () => (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="rounded-md border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-black text-medace-700">
        {LEVEL_LABELS[userLevel]}
      </span>
      <span className="rounded-md border border-orange-100 bg-white px-3 py-1 text-xs font-black text-slate-500">
        {wordsLoading ? '単語を準備中' : samplePracticeActive ? 'お試し問題' : `${sessionWords.length}語で練習`}
      </span>
      <span className="rounded-md border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-medace-700">
        演習 {progressSummary.total}回 / {overallAccuracy}%
      </span>
    </div>
  );

  const renderPracticeNotices = () => (
    <>
      {wordsLoading && sessionWords.length === 0 && (
        <section className="mb-4 rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-medace-800">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          単語を読み込んでいます。準備できたら、このまま1セット始められます。
        </section>
      )}

      {samplePracticeActive && (
        <section className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-medace-800">
          これはお試し問題です。あとから復習対象には入りません。
        </section>
      )}

      {practiceSyncError && (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {practiceSyncError}
        </section>
      )}
    </>
  );

  if (isEmbeddedDrill) {
    const activeLaneConfig = laneConfig.find((lane) => lane.id === activeLane) ?? laneConfig[1];
    const ActiveIcon = activeLaneConfig.icon;
    return (
      <div
        data-testid="english-practice-hub"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white text-slate-900 shadow-sm"
      >
        <div className="border-b border-slate-200 bg-white px-4 py-4 md:px-5">
          <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-medace-100 bg-medace-50 text-medace-700">
                <ActiveIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-black text-medace-600">英語演習</p>
                <h2 className="text-lg font-black text-slate-950 md:text-xl">{activeLaneConfig.title}</h2>
                <p className="mt-1 max-w-3xl text-sm font-bold leading-relaxed text-slate-600">
                  このまま1セット解いて、終わったら今日の画面に戻れます。
                </p>
              </div>
            </div>
            {onClose && (
              <button
                type="button"
                data-testid="english-practice-close"
                onClick={onClose}
                className="inline-flex min-h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-black text-slate-600 transition-colors hover:bg-slate-50"
              >
                {closeLabel}
              </button>
            )}
          </div>
        </div>

        <div className="px-4 py-4 md:px-5">
          {renderLaneTabs()}
          {renderPracticeMeta()}
          {renderPracticeNotices()}
          {renderActiveLane()}
        </div>
      </div>
    );
  }

  if (isEmbedded) {
    return (
      <div
        data-testid="english-practice-hub"
        className="overflow-hidden rounded-lg border border-orange-100 bg-[#fffaf5] text-slate-900 shadow-sm shadow-orange-950/5"
      >
        <div className="border-b border-orange-100 bg-white px-4 py-4 md:px-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-[11px] font-black text-medace-700">
                英語演習
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 md:text-2xl">
                英語演習
              </h2>
              <p className="mt-1 max-w-3xl text-sm font-bold leading-relaxed text-slate-600">
                文法、和訳、長文、英作文をここから切り替えます。迷ったら左から1つだけ進めましょう。
              </p>
            </div>
            <div className="rounded-md border border-orange-100 bg-orange-50 px-3 py-2 text-xs font-black text-medace-700">
              {currentStreak > 0 ? `${currentStreak}日連続中` : '今日から開始'}
            </div>
          </div>
        </div>

        <div className="px-4 py-4 md:px-5">
          {renderLaneTabs()}
          {renderPracticeMeta()}
          {renderPracticeNotices()}
          {renderActiveLane()}
        </div>
      </div>
    );
  }

  const activeLaneConfig = laneConfig.find((lane) => lane.id === activeLane) ?? laneConfig[1];
  const ActiveIcon = activeLaneConfig.icon;

  return (
    <div data-testid="english-practice-hub" className="min-h-screen bg-[#fffaf5] text-slate-900">
      <main className="mx-auto max-w-[1480px] px-4 py-4 md:px-6">
        <section className="mb-4 rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm shadow-orange-950/5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={handleBack}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-orange-200 bg-white px-3 py-2 text-sm font-black text-slate-700 transition-colors hover:bg-orange-50 hover:text-medace-700"
              >
                <ArrowLeft className="h-4 w-4" />
                戻る
              </button>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-medace-100 bg-medace-50 text-medace-700">
                <ActiveIcon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black text-medace-700">英語演習</div>
                <h1 className="truncate text-xl font-black text-slate-950 md:text-2xl">{activeLaneConfig.title}</h1>
              </div>
            </div>
            <p className="max-w-2xl text-sm font-bold leading-relaxed text-slate-500">
              {activeLaneConfig.description}
            </p>
          </div>
        </section>

        {renderLaneTabs()}
        {renderPracticeMeta()}
        {renderPracticeNotices()}
        {renderActiveLane()}
      </main>
    </div>
  );
};

export default EnglishPracticeHub;
