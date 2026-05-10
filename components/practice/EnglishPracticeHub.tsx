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
import ReadingPracticeView from './ReadingPracticeView';
import { buildReadingPracticePassages } from '../../utils/readingPractice';

type PracticeLane = 'overview' | 'grammar' | 'translation' | 'reading';
type GrammarMode = 'GRAMMAR_CLOZE' | 'EN_WORD_ORDER';
type TranslationMode = 'input' | 'order';

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
    bookId: 'english-practice',
    number: 1,
    word: 'stabilize',
    definition: '安定させる',
    exampleSentence: 'Doctors stabilize the patient before surgery.',
    exampleMeaning: '医師は 手術前に 患者を 安定させる。',
  },
  {
    id: 'practice-monitor',
    bookId: 'english-practice',
    number: 2,
    word: 'monitor',
    definition: '観察する',
    exampleSentence: 'Nurses monitor the patient while the medicine works.',
    exampleMeaning: '看護師は 薬が効いている間 患者を 観察する。',
  },
  {
    id: 'practice-recall',
    bookId: 'english-practice',
    number: 3,
    word: 'recall',
    definition: '思い出す',
    exampleSentence: 'Students can recall the word after short practice.',
    exampleMeaning: '生徒は 短い練習の後で その語を 思い出せる。',
  },
  {
    id: 'practice-compare',
    bookId: 'english-practice',
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

  const grammarScopes = useMemo(
    () => getGrammarScopesForPracticeSelection({ mode: grammarMode }),
    [grammarMode],
  );
  const [selectedScopeIds, setSelectedScopeIds] = useState<GrammarCurriculumScopeId[]>(
    () => selectDefaultScopeIds(getGrammarScopesForPracticeSelection({ mode: 'GRAMMAR_CLOZE' }), userLevel),
  );

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

  const practiceWords = sessionWords.length > 0 ? sessionWords : FALLBACK_WORDS;
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

  const toggleScope = (scopeId: GrammarCurriculumScopeId) => {
    setSelectedScopeIds((current) => {
      if (current.includes(scopeId)) {
        return current.length === 1 ? current : current.filter((id) => id !== scopeId);
      }
      return [...current, scopeId];
    });
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
      setCheckingTranslationId(null);
    }

    setTranslationFeedback((current) => ({
      ...current,
      [item.id]: feedback,
    }));
  };

  const renderOverview = () => (
    <div className="grid gap-4 lg:grid-cols-[1.04fr_0.96fr]">
      <section className="overflow-hidden rounded-lg border border-medace-200 bg-medace-700 text-white shadow-sm">
        <div className="px-5 py-6 md:px-7 md:py-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-white/72">
            Practice Hub
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
              onClick={() => setActiveLane('grammar')}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-black text-medace-900 transition-colors hover:bg-orange-50"
            >
              文法から始める <ArrowRight className="h-4 w-4" />
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
            </button>
          );
        })}
        <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-medace-700">Level Adaptive</div>
          <div className="mt-2 text-lg font-black text-slate-950">{LEVEL_LABELS[userLevel]}</div>
          <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">
            例文と読解本文は現在の英語レベルを上限にし、難しすぎる構文を避けます。
          </p>
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
              onClick={() => setCheckedGrammarItems((current) => ({ ...current, [item.id]: true }))}
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
              onClick={() => setCheckedGrammarItems((current) => ({ ...current, [item.id]: true }))}
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
      <section className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Brain className="h-5 w-5 text-medace-700" />
          <h2 className="text-xl font-black text-slate-950">文法範囲を選ぶ</h2>
        </div>
        <p className="mt-2 text-sm font-bold leading-relaxed text-slate-500">
          Next Stage・Vintage・Scramble・Evergreen 型の章立てに近いカテゴリで、複数範囲を横断できます。
        </p>

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

        <div className="mt-4 max-h-[520px] overflow-y-auto pr-1">
          <div className="grid gap-2">
            {grammarScopes.map((scope) => {
              const selected = selectedScopeIds.includes(scope.id);
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
                    <span className="shrink-0 rounded-full bg-white px-2 py-1 text-[11px] font-black text-medace-700">{scope.levelMin}-{scope.levelMax}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <div className="rounded-lg border border-orange-100 bg-orange-50 px-4 py-4">
          <div className="text-xs font-black uppercase tracking-[0.16em] text-medace-700">Generated Practice</div>
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
      <section className="rounded-lg border border-orange-100 bg-white px-4 py-4 shadow-sm">
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
          <div className="text-xs font-black uppercase tracking-[0.16em] text-medace-700">AI Feedback</div>
          <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">
            不一致答案はAI採点に回し、高校受験・大学受験の答案として、意味の抜けと構文の取り違えを返します。
          </p>
        </div>
      </section>

      <section className="space-y-3">
        {translationItems.map((item) => {
          const feedback = translationFeedback[item.id];
          const orderedChipIds = translationOrders[item.id] || [];
          const orderChecked = checkedTranslationOrders[item.id];
          const orderCorrect = isOrderCorrect(orderedChipIds, item.correctChipIds);
          const chipById = new Map(item.chips.map((chip) => [chip.id, chip.text]));

          return (
            <article key={item.id} className="rounded-lg border border-slate-200 bg-white px-4 py-4 shadow-sm">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Translation</div>
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
                  {feedback && (
                    <div className={`mt-4 rounded-lg border px-4 py-4 ${
                      feedback.isCorrect ? 'border-emerald-200 bg-emerald-50' : 'border-orange-200 bg-orange-50'
                    }`}>
                      <div className="text-sm font-black text-slate-950">{feedback.verdictLabel} / {feedback.score}点</div>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-slate-700">{feedback.summaryJa}</p>
                      <p className="mt-2 text-sm font-bold leading-relaxed text-slate-600">改善例: {feedback.improvedTranslation || feedback.expectedTranslation}</p>
                      <p className="mt-1 text-sm font-bold leading-relaxed text-slate-600">次の練習: {feedback.nextDrillJa}</p>
                    </div>
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
                      onClick={() => setCheckedTranslationOrders((current) => ({ ...current, [item.id]: true }))}
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
            <div className="text-xs font-black uppercase tracking-[0.16em] text-medace-700">Reading</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">長文読解演習</h2>
            <p className="mt-1 text-sm font-bold leading-relaxed text-slate-500">
              本文を読み、選択肢だけでなく根拠文と日本語解説まで確認します。
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
          {Object.values(EnglishLevel).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setReadingLevel(level)}
              className={`rounded-lg border px-3 py-2 text-sm font-black transition-colors ${
                readingLevel === level
                  ? 'border-medace-600 bg-medace-600 text-white'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'
              }`}
            >
              {LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </section>
      <ReadingPracticeView passages={readingPassages} />
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
              {wordsLoading ? '単語を準備中' : wordLoadFailed || sessionWords.length === 0 ? 'サンプル問題' : `${sessionWords.length}語から生成`}
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
          学習中の単語を確認しています。読み込み中もサンプル問題で演習できます。
        </section>
      )}

      {renderActiveLane()}
    </div>
  );
};

export default EnglishPracticeHub;
