import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  type QuizSelectionMode,
  type QuizSessionConfig,
  type UserProfile,
  type WordData,
  type WorksheetQuestionMode,
} from '../types';
import { storage } from '../services/storage';
import {
  type GeneratedWorksheetQuestion,
  WORKSHEET_MODE_COPY,
  generateWorksheetQuestions,
  isCorrectSpellingHintAnswer,
  toWorksheetSourceWords,
} from '../utils/worksheet';
import {
  formatQuizSelectionSummary,
  getActualQuizQuestionCount,
  getQuizCandidateWords,
  normalizeQuizRange,
} from '../utils/quiz';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  ChevronRight,
  Eye,
  HelpCircle,
  Loader2,
  RotateCcw,
  SpellCheck,
  XCircle,
} from 'lucide-react';
import MobileStickyActionBar from './mobile/MobileStickyActionBar';

interface QuizModeProps {
  user: UserProfile;
  bookId: string;
  onBack: () => void;
}

type QuizScreen = 'SETUP' | 'READY' | 'RUNNING' | 'RESULT';

const DEFAULT_QUESTION_COUNT = 5;
const QUESTION_COUNT_OPTIONS = [5, 10, 20] as const;

const QUIZ_SELECTION_COPY: Array<{
  key: QuizSelectionMode;
  label: string;
  description: string;
}> = [
  {
    key: 'FULL_RANDOM',
    label: '全範囲ランダム',
    description: '単語帳全体から、その場でランダムに出題します。',
  },
  {
    key: 'RANGE_RANDOM',
    label: '範囲指定ランダム',
    description: '番号範囲を決めて、その中だけをランダムに確認します。',
  },
  {
    key: 'LEARNED_ONLY',
    label: '学習済みのみ',
    description: '学習モードで評価した単語だけを厳密に抽出して出題します。',
  },
];

const buildLoadingMessage = (mode: WorksheetQuestionMode): string => {
  if (mode === 'JA_TO_EN') return '日本語から英語の確認テストを準備中...';
  if (mode === 'SPELLING_HINT') return '先頭2文字ヒントの確認テストを準備中...';
  return '英語から日本語の確認テストを準備中...';
};

const createDefaultConfig = (rangeStart: number, rangeEnd: number): QuizSessionConfig => ({
  selectionMode: 'FULL_RANDOM',
  questionMode: 'EN_TO_JA',
  questionCount: DEFAULT_QUESTION_COUNT,
  rangeStart,
  rangeEnd,
});

const QuizMode: React.FC<QuizModeProps> = ({ user, bookId, onBack }) => {
  const [screen, setScreen] = useState<QuizScreen>('SETUP');
  const [setupConfig, setSetupConfig] = useState<QuizSessionConfig>(createDefaultConfig(1, 1));
  const [activeConfig, setActiveConfig] = useState<QuizSessionConfig | null>(null);
  const [allWords, setAllWords] = useState<WordData[]>([]);
  const [studiedWordIds, setStudiedWordIds] = useState<string[]>([]);
  const [questions, setQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [inputResult, setInputResult] = useState<'correct' | 'incorrect' | null>(null);
  const [score, setScore] = useState(0);
  const [missedQuestions, setMissedQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(buildLoadingMessage('EN_TO_JA'));
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const questionStartedAtRef = useRef(Date.now());

  const minWordNumber = useMemo(() => {
    if (allWords.length === 0) return 1;
    return Math.min(...allWords.map((word) => word.number));
  }, [allWords]);

  const maxWordNumber = useMemo(() => {
    if (allWords.length === 0) return 1;
    return Math.max(...allWords.map((word) => word.number));
  }, [allWords]);

  const normalizedSetupRange = useMemo(
    () => normalizeQuizRange(setupConfig.rangeStart, setupConfig.rangeEnd, minWordNumber, maxWordNumber),
    [maxWordNumber, minWordNumber, setupConfig.rangeEnd, setupConfig.rangeStart],
  );

  const studiedWordIdSet = useMemo(() => new Set(studiedWordIds), [studiedWordIds]);
  const setupCandidateWords = useMemo(
    () => getQuizCandidateWords({
      words: allWords,
      selectionMode: setupConfig.selectionMode,
      rangeStart: normalizedSetupRange.start,
      rangeEnd: normalizedSetupRange.end,
      minWordNumber,
      maxWordNumber,
      learnedWordIds: studiedWordIdSet,
    }),
    [
      allWords,
      maxWordNumber,
      minWordNumber,
      normalizedSetupRange.end,
      normalizedSetupRange.start,
      setupConfig.selectionMode,
      studiedWordIdSet,
    ],
  );
  const setupActualQuestionCount = getActualQuizQuestionCount(setupConfig.questionCount, setupCandidateWords.length);
  const setupSummary = formatQuizSelectionSummary(
    {
      selectionMode: setupConfig.selectionMode,
      rangeStart: normalizedSetupRange.start,
      rangeEnd: normalizedSetupRange.end,
    },
    setupActualQuestionCount,
  );
  const currentQuestion = questions[currentQIndex];
  const currentModeCopy = WORKSHEET_MODE_COPY[(activeConfig || setupConfig).questionMode];
  const isHintMode = currentQuestion?.mode === 'SPELLING_HINT';
  const reviewTargets = useMemo(() => missedQuestions.slice(0, 3), [missedQuestions]);
  const activeSummary = activeConfig
    ? formatQuizSelectionSummary(activeConfig, questions.length)
    : setupSummary;

  const resetAttemptState = () => {
    setQuestions([]);
    setCurrentQIndex(0);
    setShowOptions(false);
    setSelectedOption(null);
    setAnswerInput('');
    setInputResult(null);
    setScore(0);
    setMissedQuestions([]);
  };

  useEffect(() => {
    let cancelled = false;

    const loadQuizState = async () => {
      try {
        setLoading(true);
        setLoadingMessage(buildLoadingMessage('EN_TO_JA'));
        const [nextWords, nextStudiedWordIds] = await Promise.all([
          storage.getWordsByBook(bookId),
          storage.getStudiedWordIdsByBook(user.uid, bookId).catch(() => []),
        ]);
        if (cancelled) return;

        const sortedWords = [...nextWords].sort((left, right) => left.number - right.number);
        const nextMin = sortedWords.length > 0 ? Math.min(...sortedWords.map((word) => word.number)) : 1;
        const nextMax = sortedWords.length > 0 ? Math.max(...sortedWords.map((word) => word.number)) : 1;

        setAllWords(sortedWords);
        setStudiedWordIds(nextStudiedWordIds);
        setSetupConfig(createDefaultConfig(nextMin, nextMax));
        setActiveConfig(null);
        setScreen('SETUP');
        setShowExitConfirm(false);
        resetAttemptState();
      } catch (error) {
        console.error('Quiz Load Error', error);
        if (!cancelled) {
          setAllWords([]);
          setStudiedWordIds([]);
          setSetupConfig(createDefaultConfig(1, 1));
          setActiveConfig(null);
          setScreen('SETUP');
          resetAttemptState();
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void loadQuizState();

    return () => {
      cancelled = true;
    };
  }, [bookId, user.uid]);

  useEffect(() => {
    setLoadingMessage(buildLoadingMessage(setupConfig.questionMode));
  }, [setupConfig.questionMode]);

  useEffect(() => {
    if (screen === 'RUNNING' && currentQuestion) {
      questionStartedAtRef.current = Date.now();
    }
  }, [currentQuestion, screen]);

  const updateSetupConfig = (nextPartial: Partial<QuizSessionConfig>) => {
    setSetupConfig((previous) => ({ ...previous, ...nextPartial }));
  };

  const getSetupEmptyCopy = (): string => {
    if (allWords.length === 0) return '学習する単語がまだありません。先に単語帳を1冊用意してください。';
    if (setupConfig.selectionMode === 'LEARNED_ONLY') {
      return '学習済みのみは、学習モードで評価した単語が1語以上あると使えます。先にカード学習で評価を付けてください。';
    }
    if (setupConfig.selectionMode === 'RANGE_RANDOM') {
      return `No. ${normalizedSetupRange.start} - ${normalizedSetupRange.end} には出題できる単語がありません。範囲を広げてください。`;
    }
    return '出題条件に合う単語がありません。';
  };

  const startQuiz = (config: QuizSessionConfig) => {
    const normalizedConfig = {
      ...config,
      rangeStart: normalizeQuizRange(config.rangeStart, config.rangeEnd, minWordNumber, maxWordNumber).start,
      rangeEnd: normalizeQuizRange(config.rangeStart, config.rangeEnd, minWordNumber, maxWordNumber).end,
    };
    const candidateWords = getQuizCandidateWords({
      words: allWords,
      selectionMode: normalizedConfig.selectionMode,
      rangeStart: normalizedConfig.rangeStart,
      rangeEnd: normalizedConfig.rangeEnd,
      minWordNumber,
      maxWordNumber,
      learnedWordIds: studiedWordIdSet,
    });
    const actualQuestionCount = getActualQuizQuestionCount(normalizedConfig.questionCount, candidateWords.length);

    if (actualQuestionCount === 0) {
      setActiveConfig(null);
      setScreen('SETUP');
      return;
    }

    const nextQuestions = generateWorksheetQuestions(
      toWorksheetSourceWords(candidateWords),
      normalizedConfig.questionMode,
      actualQuestionCount,
    );

    setActiveConfig(normalizedConfig);
    resetAttemptState();
    setQuestions(nextQuestions);
    setScreen('RUNNING');
  };

  const handleAdvanceToReady = () => {
    if (setupActualQuestionCount === 0) return;
    setScreen('READY');
  };

  const completeQuestion = async (correct: boolean, responseTimeMs: number) => {
    const question = questions[currentQIndex];
    if (!question) return;

    if (correct) {
      setScore((previous) => previous + 1);
    } else {
      setMissedQuestions((previous) => (
        previous.some((item) => item.wordId === question.wordId)
          ? previous
          : [...previous, question]
      ));
    }

    await storage.saveHistory(user.uid, {
      wordId: question.wordId,
      bookId: question.bookId,
      status: correct ? 'learning' : 'review',
      lastStudiedAt: Date.now(),
      correctCount: correct ? 1 : 0,
      attemptCount: 1,
      interactionSource: 'QUIZ',
    }, responseTimeMs);

    window.setTimeout(() => {
      if (currentQIndex < questions.length - 1) {
        setCurrentQIndex((previous) => previous + 1);
        setSelectedOption(null);
        setShowOptions(false);
        setAnswerInput('');
        setInputResult(null);
        return;
      }

      setScreen('RESULT');
    }, 900);
  };

  const handleOptionClick = async (option: string) => {
    if (selectedOption || !currentQuestion) return;
    setSelectedOption(option);
    await completeQuestion(option === currentQuestion.answer, Math.max(0, Date.now() - questionStartedAtRef.current));
  };

  const handleHintSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentQuestion || inputResult || !answerInput.trim()) return;

    const correct = isCorrectSpellingHintAnswer(
      answerInput,
      currentQuestion.answer,
      currentQuestion.hintPrefix || '',
    );
    setInputResult(correct ? 'correct' : 'incorrect');
    await completeQuestion(correct, Math.max(0, Date.now() - questionStartedAtRef.current));
  };

  const handleHeaderBack = () => {
    if (screen === 'SETUP') {
      onBack();
      return;
    }
    if (screen === 'READY') {
      setScreen('SETUP');
      return;
    }
    if (screen === 'RUNNING') {
      setShowExitConfirm(true);
      return;
    }
    setActiveConfig(null);
    setScreen('SETUP');
    resetAttemptState();
  };

  const confirmExitRunning = () => {
    setShowExitConfirm(false);
    setActiveConfig(null);
    setScreen('SETUP');
    resetAttemptState();
  };

  const percentage = questions.length === 0 ? 0 : Math.round((score / questions.length) * 100);
  const nextReviewCopy = reviewTargets.length > 0
    ? '10分後に間違えた単語だけもう一度。そのあと明日の最初に1回確認すると定着しやすいです。'
    : '間違いはありません。明日に1回だけ軽く確認すれば十分です。';

  const renderHeader = (title: string, subtitle: string) => (
    <div
      className="sticky top-0 z-20 -mx-4 border-b border-slate-200 bg-white/95 px-4 pb-3 backdrop-blur sm:static sm:mx-0 sm:rounded-[28px] sm:border sm:px-5 sm:pb-4 sm:pt-4"
      style={{ paddingTop: 'calc(0.85rem + var(--safe-top))' }}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          onClick={handleHeaderBack}
          data-testid="quiz-back-button"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:border-medace-300 hover:text-medace-700"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Quiz Flow</div>
          <h1 className="mt-1 text-lg font-black tracking-tight text-slate-950 sm:text-[1.55rem]">{title}</h1>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">{subtitle}</p>
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="flex h-80 flex-col items-center justify-center text-medace-600">
        <Loader2 className="mb-4 h-12 w-12 animate-spin" />
        <p className="animate-pulse text-lg font-bold">{loadingMessage}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-6">
      {renderHeader(
        screen === 'SETUP'
          ? 'テスト条件を決める'
          : screen === 'READY'
            ? 'この条件で始める'
            : screen === 'RUNNING'
              ? 'テスト中'
              : '結果を見る',
        screen === 'SETUP'
          ? '出題パターン、方向、問題数を先に固定してから始めます。'
          : screen === 'READY'
            ? '条件を確認してから開始します。設定と出題はこの画面で分けます。'
            : screen === 'RUNNING'
              ? activeSummary
              : activeSummary,
      )}

      {showExitConfirm && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 px-4 pb-4 pt-16 sm:items-center">
          <div
            data-testid="quiz-exit-confirm-dialog"
            className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <div className="rounded-2xl bg-red-50 p-3 text-red-600">
                <XCircle className="h-5 w-5" />
              </div>
              <div>
                <div className="text-lg font-black text-slate-950">今のテストをやめますか？</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  途中結果は保存せずに、条件設定画面へ戻ります。
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                data-testid="quiz-exit-cancel"
                onClick={() => setShowExitConfirm(false)}
                className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-200"
              >
                続ける
              </button>
              <button
                type="button"
                data-testid="quiz-exit-confirm"
                onClick={confirmExitRunning}
                className="rounded-2xl bg-red-600 px-4 py-3 font-bold text-white transition-colors hover:bg-red-700"
              >
                やめて戻る
              </button>
            </div>
          </div>
        </div>
      )}

      {screen === 'SETUP' && (
        <div data-testid="quiz-setup-view" className="space-y-4">
          <section className="ui-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Step 1</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">出題パターンを選ぶ</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  今日どこを確認するかだけ先に決めます。スマホでは1つずつ条件を固定したほうが迷いません。
                </p>
              </div>
              <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
                {setupSummary}
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              {QUIZ_SELECTION_COPY.map((item) => {
                const isActive = setupConfig.selectionMode === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    data-testid={`quiz-selection-${item.key.toLowerCase()}`}
                    onClick={() => updateSetupConfig({ selectionMode: item.key })}
                    className={`ui-option-card ${isActive ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-base font-black text-slate-950">{item.label}</div>
                        <div className="mt-1 text-sm leading-relaxed text-slate-500">{item.description}</div>
                      </div>
                      <div className={`h-5 w-5 rounded-full border-2 ${isActive ? 'border-medace-500 bg-medace-500' : 'border-slate-300 bg-white'}`}></div>
                    </div>
                  </button>
                );
              })}
            </div>

            {setupConfig.selectionMode === 'RANGE_RANDOM' && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="ui-form-label">開始番号</label>
                  <input
                    type="number"
                    min={minWordNumber}
                    max={maxWordNumber}
                    value={setupConfig.rangeStart}
                    onChange={(event) => updateSetupConfig({ rangeStart: Number(event.target.value) || minWordNumber })}
                    className="ui-input"
                  />
                </div>
                <div>
                  <label className="ui-form-label">終了番号</label>
                  <input
                    type="number"
                    min={minWordNumber}
                    max={maxWordNumber}
                    value={setupConfig.rangeEnd}
                    onChange={(event) => updateSetupConfig({ rangeEnd: Number(event.target.value) || maxWordNumber })}
                    className="ui-input"
                  />
                </div>
              </div>
            )}
          </section>

          <section className="ui-panel">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Step 2</div>
            <h2 className="mt-1 text-xl font-black text-slate-950">出題方向を選ぶ</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              英日・日英・先頭2文字ヒントのどれで確認するかを固定します。
            </p>
            <div className="mt-4 grid gap-3">
              {(Object.keys(WORKSHEET_MODE_COPY) as WorksheetQuestionMode[]).map((questionMode) => {
                const isActive = setupConfig.questionMode === questionMode;
                return (
                  <button
                    key={questionMode}
                    type="button"
                    data-testid={`quiz-direction-${questionMode.toLowerCase()}`}
                    onClick={() => updateSetupConfig({ questionMode })}
                    className={`ui-option-card ${isActive ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                  >
                    <div className="text-base font-black text-slate-950">{WORKSHEET_MODE_COPY[questionMode].label}</div>
                    <div className="mt-1 text-sm leading-relaxed text-slate-500">
                      {WORKSHEET_MODE_COPY[questionMode].description}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="ui-panel">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Step 3</div>
                <h2 className="mt-1 text-xl font-black text-slate-950">問題数を選ぶ</h2>
              </div>
              <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
                候補 {setupCandidateWords.length} 語
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {QUESTION_COUNT_OPTIONS.map((count) => {
                const isActive = setupConfig.questionCount === count;
                return (
                  <button
                    key={count}
                    type="button"
                    data-testid={`quiz-count-${count}`}
                    onClick={() => updateSetupConfig({ questionCount: count })}
                    className={`rounded-2xl border px-4 py-4 text-center font-black transition-colors ${
                      isActive
                        ? 'border-medace-500 bg-medace-50 text-medace-800'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {count}問
                  </button>
                );
              })}
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">対象</div>
                <div className="mt-1 text-lg font-black text-slate-950">{setupCandidateWords.length}</div>
                <div className="text-sm text-slate-500">候補語</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">出題</div>
                <div className="mt-1 text-lg font-black text-slate-950">{setupActualQuestionCount}</div>
                <div className="text-sm text-slate-500">実際の問題数</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">方向</div>
                <div className="mt-1 text-sm font-black text-slate-950">{WORKSHEET_MODE_COPY[setupConfig.questionMode].label}</div>
                <div className="text-sm text-slate-500">この向きで固定</div>
              </div>
            </div>

            {setupActualQuestionCount < setupConfig.questionCount && setupCandidateWords.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                候補数が少ないため、{setupActualQuestionCount}問で開始します。
              </div>
            )}

            {setupCandidateWords.length === 0 && (
              <div
                data-testid="quiz-empty-state"
                className="mt-4 rounded-2xl border border-dashed border-red-200 bg-red-50 px-4 py-4 text-sm leading-relaxed text-red-700"
              >
                {getSetupEmptyCopy()}
              </div>
            )}
          </section>

          <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
            <button
              type="button"
              data-testid="quiz-setup-primary-cta"
              disabled={setupActualQuestionCount === 0}
              onClick={handleAdvanceToReady}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-4 font-bold text-white transition-colors hover:bg-medace-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              条件を確認する <ChevronRight className="h-4 w-4" />
            </button>
          </MobileStickyActionBar>
        </div>
      )}

      {screen === 'READY' && (
        <div data-testid="quiz-ready-view" className="space-y-4">
          <section className="ui-panel">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Ready</div>
            <h2 className="mt-1 text-2xl font-black text-slate-950">この条件で始めます</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              ここから先は出題だけに集中します。設定は混ぜません。
            </p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">出題パターン</div>
                <div className="mt-1 text-lg font-black text-slate-950">{setupSummary}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">出題方向</div>
                <div className="mt-1 text-lg font-black text-slate-950">{WORKSHEET_MODE_COPY[setupConfig.questionMode].label}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">対象語数</div>
                <div className="mt-1 text-lg font-black text-slate-950">{setupCandidateWords.length}語</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">出題数</div>
                <div className="mt-1 text-lg font-black text-slate-950">{setupActualQuestionCount}問</div>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4 text-sm leading-relaxed text-slate-700">
              {setupConfig.selectionMode === 'LEARNED_ONLY'
                ? '学習モードで一度評価した単語だけを出します。クイズだけ解いた履歴は含めません。'
                : '出題中は問題と回答だけに絞ります。途中で条件は変えません。'}
            </div>
          </section>

          <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
            <button
              type="button"
              data-testid="quiz-ready-start"
              onClick={() => startQuiz(setupConfig)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-4 font-bold text-white transition-colors hover:bg-medace-700"
            >
              この条件で始める <ChevronRight className="h-4 w-4" />
            </button>
          </MobileStickyActionBar>
        </div>
      )}

      {screen === 'RUNNING' && currentQuestion && (
        <div data-testid="quiz-running-view" className="space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
                {activeSummary}
              </div>
              <div className="text-sm font-bold text-slate-500">
                第 {currentQIndex + 1} 問 / {questions.length}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3 text-sm font-medium text-slate-500">
              <span>{currentModeCopy.label}</span>
              <span className="font-bold text-medace-600">正解数: {score}</span>
            </div>
            <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full bg-medace-500 transition-all duration-500 ease-out"
                style={{ width: `${((currentQIndex + 1) / questions.length) * 100}%` }}
              ></div>
            </div>
          </section>

          <section data-testid="quiz-question-card" className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <span className="block text-xs font-bold uppercase tracking-widest text-slate-400">
              {currentQuestion.promptLabel}
            </span>
            <h2 className="mt-3 text-3xl font-black leading-tight text-slate-800 sm:text-4xl">
              {currentQuestion.promptText}
            </h2>

            {isHintMode ? (
              <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-800">
                  <SpellCheck className="h-4 w-4" />
                  先頭2文字ヒント
                </div>
                <div className="mt-3 text-2xl font-black tracking-[0.12em] text-slate-900">
                  {currentQuestion.maskedAnswer}
                </div>
                <div className="mt-2 text-sm text-amber-800/80">
                  先頭2文字は見せています。全文でも、残りだけでも判定できます。
                </div>
              </div>
            ) : (
              !showOptions && (
                <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
                  <p className="text-sm text-slate-500">
                    まず頭の中で答えを思い出してから、次の確認に進んでください。
                  </p>
                </div>
              )
            )}
          </section>

          {isHintMode ? (
            <form onSubmit={handleHintSubmit} className="space-y-4 animate-in slide-in-from-bottom-2 fade-in">
              <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
                <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">英語を入力</label>
                <input
                  type="text"
                  value={answerInput}
                  onChange={(event) => setAnswerInput(event.target.value)}
                  disabled={!!inputResult}
                  autoFocus
                  className="ui-input text-lg"
                  placeholder={`${currentQuestion.hintPrefix || ''}...`}
                />
                {inputResult && (
                  <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm font-bold ${
                    inputResult === 'correct'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                      : 'border-red-200 bg-red-50 text-red-700'
                  }`}>
                    {inputResult === 'correct'
                      ? '正解です。この方向でも思い出せました。'
                      : `不正解です。正解は ${currentQuestion.answer} です。`}
                  </div>
                )}
              </section>

              <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
                <button
                  type="submit"
                  disabled={!answerInput.trim() || !!inputResult}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-700 px-4 py-4 font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  <CheckCircle className="h-5 w-5" /> 入力して判定する
                </button>
              </MobileStickyActionBar>
            </form>
          ) : !showOptions ? (
            <div className="animate-in slide-in-from-bottom-2 flex flex-col gap-4 fade-in">
              <button
                type="button"
                onClick={() => setShowOptions(true)}
                data-testid="quiz-show-options"
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-4 font-bold text-white shadow-lg transition-colors hover:bg-slate-700"
              >
                <Eye className="h-5 w-5" /> 選択肢を表示する
              </button>
              <div className="flex items-center justify-center gap-1 text-center text-sm text-slate-400">
                <HelpCircle className="h-4 w-4" />
                <span>先に自力で思い出してから見るほうが記憶が定着します。</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 animate-in zoom-in duration-200 fade-in">
              {currentQuestion.options?.map((option, index) => {
                let buttonClass = 'bg-white border-2 border-slate-100 hover:border-medace-300 hover:bg-orange-50 text-slate-700 shadow-sm';
                let icon = null;

                if (selectedOption) {
                  if (option === currentQuestion.answer) {
                    buttonClass = 'bg-green-50 border-green-500 text-green-700 ring-2 ring-green-200';
                    icon = <CheckCircle className="h-5 w-5 text-green-600" />;
                  } else if (option === selectedOption) {
                    buttonClass = 'bg-red-50 border-red-500 text-red-700';
                    icon = <AlertCircle className="h-5 w-5 text-red-600" />;
                  } else {
                    buttonClass = 'bg-slate-50 border-slate-100 text-slate-400 opacity-50';
                  }
                }

                return (
                  <button
                    key={`${currentQuestion.id}-${index}`}
                    type="button"
                    onClick={() => void handleOptionClick(option)}
                    disabled={!!selectedOption}
                    className={`flex w-full items-center justify-between rounded-2xl p-5 text-left text-lg font-semibold transition-all duration-200 ${buttonClass}`}
                  >
                    <span>{option}</span>
                    {icon}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {screen === 'RESULT' && activeConfig && (
        <div data-testid="quiz-result-view" className="space-y-4">
          <section className="rounded-[32px] bg-white p-6 shadow-lg sm:p-8">
            <div className="text-center">
              <div className="mb-5 inline-flex h-20 w-20 items-center justify-center rounded-full bg-green-100">
                {percentage >= 80 ? (
                  <CheckCircle className="h-10 w-10 text-green-500" />
                ) : (
                  <AlertCircle className="h-10 w-10 text-medace-500" />
                )}
              </div>
              <h2 className="text-3xl font-black text-slate-900">テスト完了</h2>
              <p className="mt-2 text-sm text-slate-500">
                {currentModeCopy.label} で確認しました。点数より、次に直すところだけ見れば十分です。
              </p>
              <div className="mt-3 text-sm font-bold text-slate-500">{activeSummary}</div>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-medace-50 px-4 py-2 text-sm font-bold text-medace-700">
                正解 {score} / {questions.length}
                <span className="text-medace-400">{percentage}%</span>
              </div>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">次に直す3問</div>
                {reviewTargets.length > 0 ? (
                  <div className="mt-4 space-y-3">
                    {reviewTargets.map((question) => (
                      <div key={question.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="font-bold text-slate-900">{question.promptText}</div>
                          <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                            10分後
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          {question.promptLabel} / 正解: {question.answer}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                    直しが必要な単語はありません。このセットはそのまま卒業で大丈夫です。
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-medace-100 bg-[#fff8ef] p-5">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">次の一手</div>
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <div className="font-bold text-slate-900">次の復習タイミング</div>
                    <div className="mt-1 leading-relaxed">{nextReviewCopy}</div>
                  </div>
                  <div className="rounded-2xl bg-white px-4 py-4">
                    <div className="font-bold text-slate-900">おすすめの次アクション</div>
                    <div className="mt-1 leading-relaxed">
                      {reviewTargets.length > 0
                        ? 'いまは再挑戦より、間違えた語だけ先に見直すほうが効率的です。'
                        : '余裕があれば別の出題方向で1回だけ確認すると、想起の幅が広がります。'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <MobileStickyActionBar className="-mx-4 px-4 sm:mx-0 sm:px-0">
            <div className="space-y-3">
              <button
                type="button"
                data-testid="quiz-result-retry"
                onClick={() => startQuiz(activeConfig)}
                className="flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-4 font-bold text-white transition-colors hover:bg-medace-700"
              >
                <RotateCcw className="h-4 w-4" /> 同じ条件で再挑戦
              </button>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  data-testid="quiz-result-reset"
                  onClick={() => {
                    setActiveConfig(null);
                    setScreen('SETUP');
                    resetAttemptState();
                  }}
                  className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-200"
                >
                  条件を決め直す
                </button>
                <button
                  type="button"
                  data-testid="quiz-result-back-dashboard"
                  onClick={onBack}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  ダッシュボードへ戻る
                </button>
              </div>
            </div>
          </MobileStickyActionBar>
        </div>
      )}
    </div>
  );
};

export default QuizMode;
