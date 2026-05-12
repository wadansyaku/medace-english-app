import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Brain,
  Bell,
  BookMarked,
  BookOpen,
  Bookmark,
  Clock3,
  CheckCircle,
  Eye,
  EyeOff,
  Flame,
  Home,
  Languages,
  LibraryBig,
  ListChecks,
  Loader2,
  PencilLine,
  RefreshCw,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Target,
  Trophy,
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
import useIsMobileViewport from '../../hooks/useIsMobileViewport';
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
type PracticeNavItemId =
  | PracticeLane
  | 'vocabulary'
  | 'random'
  | 'records'
  | 'weakness'
  | 'review'
  | 'bookmark'
  | 'level'
  | 'notifications'
  | 'guide';

interface EnglishPracticeHubProps {
  user: UserProfile;
  onBack?: () => void;
  onStartVocabulary: () => void;
  variant?: 'standalone' | 'embedded';
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

const practiceNavGroups: Array<{
  label: string;
  items: Array<{
    id: PracticeNavItemId;
    label: string;
    icon: React.ElementType;
    lane?: PracticeLane;
    enabled?: boolean;
  }>;
}> = [
  {
    label: '英語演習',
    items: [
      { id: 'overview', label: 'ホーム', icon: Home, lane: 'overview' },
      { id: 'vocabulary', label: '単語', icon: Sparkles },
      { id: 'grammar', label: '文法演習', icon: BookOpen, lane: 'grammar' },
      { id: 'translation', label: '和訳トレーニング', icon: PencilLine, lane: 'translation' },
      { id: 'reading', label: '長文読解', icon: BookMarked, lane: 'reading' },
      { id: 'random', label: 'ランダム演習', icon: Shuffle, lane: 'grammar' },
    ],
  },
  {
    label: 'マイデータ',
    items: [
      { id: 'records', label: '学習記録', icon: BarChart3, enabled: false },
      { id: 'weakness', label: '苦手分析', icon: Target, enabled: false },
      { id: 'review', label: '復習リスト', icon: ListChecks, enabled: false },
      { id: 'bookmark', label: 'ブックマーク', icon: Bookmark, enabled: false },
    ],
  },
  {
    label: '設定・その他',
    items: [
      { id: 'level', label: 'レベル設定', icon: Settings, enabled: false },
      { id: 'notifications', label: '通知設定', icon: Bell, enabled: false },
      { id: 'guide', label: '使い方ガイド', icon: Sparkles, enabled: false },
    ],
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

const formatPercent = (value: number): number => {
  if (Number.isFinite(value) && value > 0) return Math.max(0, Math.min(100, Math.round(value)));
  return 0;
};

const getScoreLabel = (accuracy: number): string => {
  if (accuracy >= 90) return 'A+';
  if (accuracy >= 80) return 'A';
  if (accuracy >= 70) return 'B+';
  if (accuracy >= 60) return 'B';
  if (accuracy >= 45) return 'C+';
  return 'C';
};

const formatProgressValue = (summary: { total: number; accuracy: number }): string => (
  summary.total > 0 ? `${formatPercent(summary.accuracy)}%` : '未演習'
);

const formatCountValue = (count: number, unit: string): string => (
  count > 0 ? `${count}${unit}` : '未演習'
);

const getEstimatedPracticeMinutes = (attempts: Array<{ occurredAt: number; responseTimeMs?: number }>): number => (
  attempts.reduce((total, attempt) => {
    if (typeof attempt.responseTimeMs === 'number' && attempt.responseTimeMs > 0) {
      return total + Math.max(1, Math.round(attempt.responseTimeMs / 60000));
    }
    return total + 3;
  }, 0)
);

const getReadingPreviewText = (passage: string): string => (
  passage.length > 340 ? `${passage.slice(0, 340)}...` : passage
);

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
  variant = 'standalone',
}) => {
  const userLevel = user.englishLevel ?? EnglishLevel.A2;
  const isCompactPracticeViewport = useIsMobileViewport('(max-width: 1023px)');
  const isEmbedded = variant === 'embedded';
  const handleBack = onBack ?? (() => undefined);
  const [activeLane, setActiveLane] = useState<PracticeLane>('overview');
  const [sessionWords, setSessionWords] = useState<WordData[]>([]);
  const [wordsLoading, setWordsLoading] = useState(true);
  const [wordLoadFailed, setWordLoadFailed] = useState(false);
  const [practiceSeed, setPracticeSeed] = useState(1);
  const [grammarMode, setGrammarMode] = useState<GrammarMode>('GRAMMAR_CLOZE');
  const [grammarQuestionCount, setGrammarQuestionCount] = useState<(typeof questionCountOptions)[number]>(5);
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
  const [submittedTranslationInputs, setSubmittedTranslationInputs] = useState<Record<string, string>>({});
  const submittedTranslationInputRef = React.useRef<Record<string, string>>({});
  const translationSubmissionVersionRef = React.useRef(0);
  const [checkingTranslationId, setCheckingTranslationId] = useState<string | null>(null);
  const [practiceLevel, setPracticeLevel] = useState<EnglishLevel>(userLevel);
  const [readingSummary, setReadingSummary] = useState<ReadingPracticeSessionSummary | null>(null);
  const [practiceSyncError, setPracticeSyncError] = useState<string | null>(null);
  const [practiceProgress, setPracticeProgress] = useState(() => loadEnglishPracticeProgress(user.uid));

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
          summaryJa: `${feedback.summaryJa} AI採点に接続できないため、今回は正解例との差分で暫定フィードバックを表示しています。`,
          issues: feedback.issues.length > 0
            ? feedback.issues
          : ['AI採点が利用できないため、主語・動詞・修飾語の対応を正解例と照合してください。'],
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

  const availableWordCount = wordsLoading
    ? 0
    : sessionWords.length > 0
      ? sessionWords.length
      : FALLBACK_WORDS.length;
  const grammarLaneSummary = progressSummary.laneSummaries.grammar;
  const translationLaneSummary = progressSummary.laneSummaries.translation;
  const readingLaneSummary = progressSummary.laneSummaries.reading;
  const vocabularyProgress = formatPercent(progressSummary.accuracy);
  const grammarProgress = formatPercent(grammarLaneSummary.accuracy);
  const translationProgress = formatPercent(translationLaneSummary.accuracy);
  const readingProgress = formatPercent(readingLaneSummary.accuracy);
  const overallAccuracy = formatPercent(progressSummary.accuracy);
  const selectedScopeCount = selectedScopeIds.length;
  const previewPassage = readingPassages[0];
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(todayStart);
  weekStart.setDate(todayStart.getDate() - 6);
  const todayMinutes = getEstimatedPracticeMinutes(progressSummary.recentAttempts.filter((attempt) => attempt.occurredAt >= todayStart.getTime()));
  const weeklyMinutes = getEstimatedPracticeMinutes(practiceProgress.attempts.filter((attempt) => attempt.occurredAt >= weekStart.getTime()));
  const currentStreak = user.stats?.currentStreak ?? 0;
  const scoreLabel = progressSummary.total > 0 ? getScoreLabel(overallAccuracy) : '未採点';
  const levelIndex = Math.max(0, examLevels.indexOf(practiceLevel));

  const recommendedCards = [
    {
      id: 'vocabulary',
      title: '単語',
      description: '覚えて使える語彙を増やす',
      icon: Sparkles,
      progress: vocabularyProgress,
      progressLabel: progressSummary.total > 0 ? `${vocabularyProgress}%` : '未演習',
      metrics: [
        { label: samplePracticeActive ? '例題' : '新出', value: `${availableWordCount}語` },
        { label: '復習', value: formatCountValue(progressSummary.total, '語') },
      ],
      actionLabel: '3分で1セット',
      action: onStartVocabulary,
    },
    {
      id: 'grammar',
      title: '文法演習',
      description: '基礎から入試レベルまで',
      icon: BookOpen,
      progress: grammarProgress,
      progressLabel: formatProgressValue(grammarLaneSummary),
      metrics: [
        { label: '正答率', value: formatProgressValue(grammarLaneSummary) },
        { label: '演習数', value: formatCountValue(grammarLaneSummary.total, 'セット') },
      ],
      actionLabel: '3分で1セット',
      action: () => setActiveLane('grammar'),
    },
    {
      id: 'translation',
      title: '和訳トレーニング',
      description: '日本語に訳す力を鍛える',
      icon: PencilLine,
      progress: translationProgress,
      progressLabel: formatProgressValue(translationLaneSummary),
      metrics: [
        { label: '演習数', value: formatCountValue(translationLaneSummary.total, 'セット') },
        { label: '記述精度', value: translationLaneSummary.total > 0 ? translationProgress >= 70 ? 'A' : translationProgress >= 55 ? 'B' : 'C' : '未採点' },
      ],
      actionLabel: '3分で1セット',
      action: () => setActiveLane('translation'),
    },
    {
      id: 'reading',
      title: '長文読解',
      description: '読解力と速読力を伸ばす',
      icon: LibraryBig,
      progress: readingProgress,
      progressLabel: formatProgressValue(readingLaneSummary),
      metrics: [
        { label: '正答率', value: formatProgressValue(readingLaneSummary) },
        { label: '演習数', value: formatCountValue(readingLaneSummary.total, 'セット') },
      ],
      actionLabel: '3分で1セット',
      action: () => setActiveLane('reading'),
    },
  ];

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Flame className="h-5 w-5 fill-medace-500 text-medace-500" />
          <h1 className="text-xl font-black tracking-tight text-slate-950 md:text-2xl">英語演習のおすすめ</h1>
          <span className="hidden text-sm font-bold text-slate-500 sm:inline">
            {progressSummary.recommendation.labelJa}
          </span>
        </div>
        <button
          type="button"
          className="inline-flex min-h-10 items-center gap-2 rounded-md border border-medace-300 bg-white px-3 py-2 text-sm font-black text-medace-700 transition-colors hover:bg-medace-50"
          onClick={applyRecommendedScopes}
        >
          <SlidersHorizontal className="h-4 w-4" />
          カスタマイズ
        </button>
      </div>

      <section className="grid gap-4 xl:grid-cols-4">
        {recommendedCards.map((card) => {
          const Icon = card.icon;
          return (
            <article
              key={card.id}
              data-testid={`english-practice-recommended-card-${card.id}`}
              className="flex min-h-[230px] flex-col rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm shadow-orange-950/5"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-medace-300 to-medace-600 text-white shadow-md shadow-orange-200">
                  <Icon className="h-7 w-7" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-black tracking-tight text-slate-950">{card.title}</h2>
                  <p className="mt-1 text-sm font-bold leading-relaxed text-slate-500">{card.description}</p>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-4">
                <div
                  className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full"
                  style={{
                    background: `conic-gradient(rgb(var(--color-medace-600)) ${card.progress * 3.6}deg, rgb(var(--color-line)) 0deg)`,
                  }}
                  aria-label={`${card.title} ${card.progressLabel}`}
                >
                  <div className="flex h-[54px] w-[54px] items-center justify-center rounded-full bg-white text-sm font-black text-slate-800">
                    {card.progressLabel}
                  </div>
                </div>
                <div className="min-w-0 text-sm font-bold text-slate-500">今週の進捗</div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-orange-100 pt-3">
                {card.metrics.map((metric) => (
                  <div key={metric.label} className="min-w-0 text-sm text-slate-500">
                    <span>{metric.label}</span>
                    <span className="ml-2 font-black text-slate-900">{metric.value}</span>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={card.action}
                className="mt-auto inline-flex min-h-11 w-full items-center justify-center rounded-md bg-medace-600 px-4 py-2.5 text-base font-black text-white shadow-sm shadow-orange-200 transition-colors hover:bg-medace-700"
              >
                {card.actionLabel}
              </button>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm shadow-orange-950/5">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-orange-100 pb-3">
            <div>
              <h2 className="text-lg font-black text-slate-950">範囲を選ぶ <span className="text-sm font-bold text-slate-500">（文法演習の例）</span></h2>
              <p className="mt-1 text-sm font-bold text-slate-500">
                {selectedScopeCount}範囲を選択中。目標は {LEVEL_LABELS[practiceLevel]}。解く前に範囲を見せるかも選べます。
              </p>
            </div>
            <div className="rounded-md bg-orange-50 px-3 py-2 text-xs font-black text-medace-700">
              {getEnglishPracticeLaneLabel(progressSummary.recommendation.lane)} 推奨
            </div>
          </div>

          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-black text-slate-700">学習スタイル</span>
              {[
                { id: 'recommended' as ScopeViewFilter, label: '分野を選ぶ' },
                { id: 'weak' as ScopeViewFilter, label: '苦手単元から選ぶ' },
                { id: 'all' as ScopeViewFilter, label: 'ランダム演習' },
              ].map((filter) => (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => handleScopeViewFilterChange(filter.id)}
                  className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-black transition-colors ${
                    scopeViewFilter === filter.id
                      ? 'border-medace-600 bg-medace-600 text-white'
                      : 'border-orange-200 bg-white text-slate-700 hover:bg-orange-50'
                  }`}
                >
                  {filter.label}
                </button>
              ))}
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {visibleGrammarScopes.slice(0, 16).map((scope) => {
                const selected = selectedScopeIds.includes(scope.id);
                return (
                  <button
                    key={scope.id}
                    type="button"
                    onClick={() => toggleScope(scope.id)}
                    className={`flex min-h-9 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs font-bold transition-colors ${
                      selected
                        ? 'border-orange-200 bg-orange-50 text-slate-900'
                        : 'border-orange-100 bg-white text-slate-600 hover:border-medace-200'
                    }`}
                  >
                    <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border ${
                      selected ? 'border-medace-600 bg-medace-600 text-white' : 'border-orange-200 bg-white'
                    }`}>
                      {selected && <CheckCircle className="h-3 w-3" />}
                    </span>
                    <span className="min-w-0 truncate">{scope.labelJa}</span>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
              <span className="text-sm font-black text-slate-700">レベル</span>
              <div className="grid gap-2 sm:grid-cols-5">
                {examLevelLabels.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setPracticeLevel(examLevels[index])}
                    className={`min-h-9 rounded-md border px-3 py-1.5 text-xs font-black transition-colors ${
                      index === levelIndex
                        ? 'border-medace-600 bg-medace-600 text-white'
                        : 'border-orange-200 bg-white text-slate-600 hover:bg-orange-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
              <span className="text-sm font-black text-slate-700">出題の条件</span>
              <div className="flex flex-wrap gap-3">
                <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={showScopeHint}
                    onChange={() => setShowScopeHint((current) => !current)}
                    className="h-4 w-4 accent-medace-600"
                  />
                  範囲を明示する
                </label>
                <label className="inline-flex items-center gap-2 text-sm font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={!showScopeHint}
                    onChange={() => setShowScopeHint((current) => !current)}
                    className="h-4 w-4 accent-medace-600"
                  />
                  範囲を明示しない
                </label>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-[auto_1fr] sm:items-center">
              <span className="text-sm font-black text-slate-700">出題数</span>
              <div className="grid max-w-xl grid-cols-4 overflow-hidden rounded-md border border-orange-200 bg-white">
                {questionCountOptions.map((count) => (
                  <button
                    key={count}
                    type="button"
                    onClick={() => setGrammarQuestionCount(count)}
                    className={`min-h-9 border-r border-orange-100 px-3 py-1.5 text-xs font-black last:border-r-0 ${
                      grammarQuestionCount === count ? 'bg-medace-600 text-white' : 'text-slate-600 hover:bg-orange-50'
                    }`}
                  >
                    {count}問
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setActiveLane('grammar')}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-md bg-medace-600 px-4 py-2.5 text-sm font-black text-white transition-colors hover:bg-medace-700"
            >
              この条件で始める
            </button>
          </div>
        </div>

        <div className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm shadow-orange-950/5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 pb-3">
            <h2 className="text-lg font-black text-slate-950">長文読解のプレビュー</h2>
            <button
              type="button"
              onClick={resetGeneratedPractice}
              className="min-h-9 rounded-md border border-medace-300 bg-white px-3 py-1.5 text-xs font-black text-medace-700 transition-colors hover:bg-orange-50"
            >
              テーマを変更
            </button>
          </div>

          {previewPassage && (
            <div className="mt-4">
              <p className="text-sm font-black text-slate-600">
                テーマ：{previewPassage.topicJa}（{previewPassage.levelLabelJa}）
              </p>
              <p className="mt-4 whitespace-pre-line text-[0.95rem] font-medium leading-8 text-slate-700">
                {getReadingPreviewText(previewPassage.passageEn)}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <span className="rounded-md bg-orange-50 px-3 py-2 text-xs font-bold text-slate-600">語数：約{previewPassage.estimatedWords}語</span>
                <span className="rounded-md bg-orange-50 px-3 py-2 text-xs font-bold text-slate-600">設問数：{previewPassage.questions.length}問</span>
                <span className="rounded-md bg-orange-50 px-3 py-2 text-xs font-bold text-slate-600">目安時間：8分</span>
                <span className="rounded-md bg-orange-50 px-3 py-2 text-xs font-bold text-slate-600">出題形式：内容一致 / 要旨 / 語彙推測 / 文法構造</span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => setActiveLane('reading')}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-md border border-medace-500 bg-white px-4 py-2.5 text-sm font-black text-medace-700 transition-colors hover:bg-orange-50"
          >
            この長文に挑戦
          </button>
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-[1.02fr_0.74fr_0.84fr_0.86fr_0.9fr]">
        <div className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm shadow-orange-950/5">
          <h2 className="text-lg font-black text-slate-950">受験レベルに合わせる</h2>
          <div className="mt-4 grid grid-cols-5 items-center gap-2">
            {examLevelLabels.map((label, index) => (
              <div key={label} className="text-center text-xs font-black text-slate-600">
                <div className="mb-2 h-2 rounded-full bg-orange-100">
                  <div className={`h-2 rounded-full ${index <= levelIndex ? 'bg-medace-500' : 'bg-orange-100'}`} />
                </div>
                {label}
              </div>
            ))}
          </div>
        </div>
        {[
          { label: '今日の学習時間', value: `${todayMinutes}分`, icon: Clock3 },
          { label: '連続学習日数', value: `${currentStreak}日`, icon: Flame },
          { label: '今週の学習時間', value: `${Math.floor(weeklyMinutes / 60)}時間 ${weeklyMinutes % 60}分`, icon: BarChart3 },
          { label: '総合スコア（目安）', value: scoreLabel, icon: Trophy },
        ].map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.label} className="rounded-lg border border-orange-100 bg-white px-4 py-4 text-center shadow-sm shadow-orange-950/5">
              <div className="text-sm font-bold text-slate-600">{metric.label}</div>
              <div className="mt-3 flex items-center justify-center gap-2 text-2xl font-black text-slate-900">
                <Icon className="h-6 w-6 text-medace-600" />
                {metric.value}
              </div>
            </div>
          );
        })}
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

  const renderLaneTabs = () => (
    <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
      {laneConfig.map((lane) => {
        const Icon = lane.icon;
        return (
          <button
            key={lane.id}
            type="button"
            data-testid={`english-practice-lane-${lane.id}`}
            onClick={() => setActiveLane(lane.id)}
            className={`inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md border px-3 py-2 text-sm font-black transition-colors ${
              activeLane === lane.id
                ? 'border-medace-600 bg-medace-600 text-white'
                : 'border-orange-100 bg-white text-slate-700 hover:border-medace-200 hover:bg-orange-50'
            }`}
          >
            <Icon className="h-4 w-4" />
            {lane.label}
          </button>
        );
      })}
    </div>
  );

  const renderPracticeMeta = () => (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <span className="rounded-md border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-black text-medace-700">
        {LEVEL_LABELS[userLevel]}
      </span>
      <span className="rounded-md border border-orange-100 bg-white px-3 py-1 text-xs font-black text-slate-500">
        {wordsLoading ? '単語を準備中' : samplePracticeActive ? '体験問題' : `${sessionWords.length}語から生成`}
      </span>
      <span className="rounded-md border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-black text-medace-700">
        演習 {progressSummary.total}回 / {overallAccuracy}%
      </span>
      {activeLane !== 'overview' && (
        <button
          type="button"
          onClick={() => setActiveLane('overview')}
          className="ml-auto inline-flex min-h-9 items-center gap-2 rounded-md border border-orange-200 bg-white px-3 py-1.5 text-xs font-black text-slate-600 transition-colors hover:bg-orange-50 hover:text-medace-700"
        >
          <Home className="h-4 w-4" />
          演習トップへ
        </button>
      )}
    </div>
  );

  const renderPracticeNotices = () => (
    <>
      {wordsLoading && sessionWords.length === 0 && (
        <section className="mb-4 rounded-lg border border-orange-100 bg-orange-50 px-4 py-3 text-sm font-bold text-medace-800">
          <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
          学習中の単語を確認しています。読み込み完了後に、履歴へ残る問題を開始できます。
        </section>
      )}

      {samplePracticeActive && (
        <section className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm font-bold text-medace-800">
          学習中の単語がまだないため体験問題を表示しています。この結果は復習履歴やクラウド履歴には保存しません。
        </section>
      )}

      {practiceSyncError && (
        <section className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
          {practiceSyncError}
        </section>
      )}
    </>
  );

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
                ホーム統合
              </div>
              <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 md:text-2xl">
                英語演習
              </h2>
              <p className="mt-1 max-w-3xl text-sm font-bold leading-relaxed text-slate-600">
                単語・文法・和訳・長文をこのホーム内で切り替えます。別ページへ移動せず、今日の学習状況と同じ文脈で演習できます。
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

  return (
    <div data-testid="english-practice-hub" className="min-h-screen bg-[#fffaf5] text-slate-900">
      <header className="sticky top-0 z-30 bg-gradient-to-r from-medace-600 via-[#ff6a00] to-[#ff4f00] text-white shadow-[0_12px_32px_rgba(239,111,0,0.22)]">
        <div className="flex min-h-[72px] items-center justify-between gap-3 px-4 md:px-6">
          <button
            type="button"
            onClick={handleBack}
            className="hidden min-h-11 items-center gap-3 rounded-md px-2 text-left transition-colors hover:bg-white/10 lg:inline-flex"
          >
            <BookOpen className="h-8 w-8" />
            <span className="text-2xl font-black tracking-tight">Steady Study</span>
          </button>

          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-white/30 bg-white/10 px-3 py-2 text-sm font-black text-white transition-colors hover:bg-white/15 lg:hidden"
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              戻る
            </button>
            <div className="hidden h-8 w-px bg-white/20 lg:block" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-lg font-black md:text-xl">今日の英語演習</h1>
                <span className="hidden items-center gap-1 text-sm font-bold text-white/86 sm:inline-flex">
                  <Flame className="h-4 w-4 fill-white text-white" />
                  {currentStreak > 0 ? `${currentStreak}日連続中！` : '今日から開始'}
                </span>
              </div>
              <p className="truncate text-xs font-bold text-white/72 sm:hidden">{LEVEL_LABELS[userLevel]}</p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 md:gap-4">
            <button
              type="button"
              onClick={() => setActiveLane('overview')}
              className="hidden min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-black text-white transition-colors hover:bg-white/10 md:inline-flex"
            >
              <BarChart3 className="h-5 w-5" />
              学習データ
            </button>
            <button
              type="button"
              disabled
              className="relative inline-flex min-h-10 items-center gap-2 rounded-md px-3 py-2 text-sm font-black text-white/70"
            >
              <Bell className="h-5 w-5" />
              <span className="hidden sm:inline">お知らせ</span>
            </button>
            <div className="hidden items-center gap-2 md:flex">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-sm font-black text-medace-600">
                学
              </div>
              <div className="text-sm font-black">{user.displayName || '学習者さん'}</div>
            </div>
          </div>
        </div>
      </header>

      <div className={`grid min-h-[calc(100vh-72px)] ${isCompactPracticeViewport ? '' : 'lg:grid-cols-[302px_minmax(0,1fr)]'}`}>
        {!isCompactPracticeViewport && (
        <aside className="border-r border-orange-100 bg-white/86 px-5 py-5 shadow-[12px_0_28px_rgba(95,43,0,0.04)]">
          <nav className="sticky top-[92px] space-y-6">
            {practiceNavGroups.map((group) => (
              <section key={group.label} className="space-y-2">
                <h2 className="border-b border-orange-100 px-2 pb-2 text-sm font-black text-medace-600">{group.label}</h2>
                <div className="space-y-1">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    const isStableLane = item.id === 'overview' || item.id === 'grammar' || item.id === 'translation' || item.id === 'reading';
                    const active = item.id === activeLane;
                    const enabled = item.enabled !== false;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-testid={isStableLane ? `english-practice-lane-${item.id}` : undefined}
                        disabled={!enabled}
                        onClick={() => {
                          if (!enabled) return;
                          if (item.id === 'vocabulary') {
                            onStartVocabulary();
                            return;
                          }
                          if (item.id === 'random') {
                            setRandomScopeMode(true);
                          }
                          if (item.lane) setActiveLane(item.lane);
                        }}
                        className={`flex min-h-11 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-base font-black transition-colors ${
                          active
                            ? 'bg-medace-600 text-white shadow-sm shadow-orange-200'
                            : !enabled
                              ? 'cursor-not-allowed text-slate-400'
                            : 'text-slate-700 hover:bg-orange-50 hover:text-medace-700'
                        }`}
                      >
                        <Icon className="h-5 w-5 shrink-0" />
                        <span className="min-w-0 truncate">{item.label}</span>
                        {!enabled && (
                          <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-500">
                            準備中
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
        </aside>
        )}

        <main className="min-w-0 px-4 py-4 md:px-6">
          {isCompactPracticeViewport && renderLaneTabs()}
          {renderPracticeMeta()}
          {renderPracticeNotices()}

          {renderActiveLane()}
        </main>
      </div>
    </div>
  );
};

export default EnglishPracticeHub;
