import React, { useEffect, useMemo, useState } from 'react';
import { UserProfile, WorksheetQuestionMode } from '../types';
import { storage } from '../services/storage';
import {
  GeneratedWorksheetQuestion,
  WORKSHEET_MODE_COPY,
  generateWorksheetQuestions,
  isCorrectSpellingHintAnswer,
  toWorksheetSourceWords,
} from '../utils/worksheet';
import { AlertCircle, CheckCircle, Eye, HelpCircle, Loader2, RotateCcw, SpellCheck } from 'lucide-react';

interface QuizModeProps {
  user: UserProfile;
  bookId: string;
  onBack: () => void;
}

const QUESTION_COUNT = 5;

const buildLoadingMessage = (mode: WorksheetQuestionMode): string => {
  if (mode === 'JA_TO_EN') return '日本語から英語の確認テストを準備中...';
  if (mode === 'SPELLING_HINT') return '先頭2文字ヒントの確認テストを準備中...';
  return '英語から日本語の確認テストを準備中...';
};

const QuizMode: React.FC<QuizModeProps> = ({ user, bookId, onBack }) => {
  const [mode, setMode] = useState<WorksheetQuestionMode>('EN_TO_JA');
  const [questions, setQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [showOptions, setShowOptions] = useState(false);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [answerInput, setAnswerInput] = useState('');
  const [inputResult, setInputResult] = useState<'correct' | 'incorrect' | null>(null);
  const [score, setScore] = useState(0);
  const [completed, setCompleted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState(buildLoadingMessage('EN_TO_JA'));
  const [missedQuestions, setMissedQuestions] = useState<GeneratedWorksheetQuestion[]>([]);
  const [attemptSeed, setAttemptSeed] = useState(0);

  useEffect(() => {
    const initQuiz = async () => {
      try {
        setLoading(true);
        setLoadingMessage(buildLoadingMessage(mode));
        setCurrentQIndex(0);
        setShowOptions(false);
        setSelectedOption(null);
        setAnswerInput('');
        setInputResult(null);
        setScore(0);
        setCompleted(false);
        setMissedQuestions([]);

        const allWords = await storage.getWordsByBook(bookId);
        if (allWords.length === 0) {
          setQuestions([]);
          return;
        }

        const sourceWords = toWorksheetSourceWords(allWords);
        const nextQuestions = generateWorksheetQuestions(
          sourceWords,
          mode,
          Math.min(QUESTION_COUNT, sourceWords.length),
        );

        setQuestions(nextQuestions);
      } catch (error) {
        console.error('Quiz Init Error', error);
        setQuestions([]);
      } finally {
        setLoading(false);
      }
    };

    void initQuiz();
  }, [attemptSeed, bookId, mode]);

  const currentQuestion = questions[currentQIndex];
  const currentModeCopy = WORKSHEET_MODE_COPY[mode];
  const isHintMode = currentQuestion?.mode === 'SPELLING_HINT';

  const reviewTargets = useMemo(() => missedQuestions.slice(0, 3), [missedQuestions]);

  const completeQuestion = async (correct: boolean) => {
    const question = questions[currentQIndex];
    if (!question) return;

    if (correct) {
      setScore((prev) => prev + 1);
    } else {
      setMissedQuestions((prev) =>
        prev.some((item) => item.wordId === question.wordId) ? prev : [...prev, question],
      );
    }

    await storage.saveHistory(user.uid, {
      wordId: question.wordId,
      bookId: question.bookId,
      status: correct ? 'learning' : 'review',
      lastStudiedAt: Date.now(),
      correctCount: correct ? 1 : 0,
      attemptCount: 1,
    });

    window.setTimeout(() => {
      if (currentQIndex < questions.length - 1) {
        setCurrentQIndex((prev) => prev + 1);
        setSelectedOption(null);
        setShowOptions(false);
        setAnswerInput('');
        setInputResult(null);
      } else {
        setCompleted(true);
      }
    }, 1200);
  };

  const handleOptionClick = async (option: string) => {
    if (selectedOption || !currentQuestion) return;
    setSelectedOption(option);
    await completeQuestion(option === currentQuestion.answer);
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
    await completeQuestion(correct);
  };

  const restartQuiz = () => {
    setAttemptSeed((prev) => prev + 1);
  };

  if (loading) {
    return (
      <div className="flex h-80 flex-col items-center justify-center text-medace-600">
        <Loader2 className="mb-4 h-12 w-12 animate-spin" />
        <p className="animate-pulse text-lg font-bold">{loadingMessage}</p>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-slate-500">学習する単語がまだありません。</p>
        <button onClick={onBack} className="mt-4 text-medace-600 underline">戻る</button>
      </div>
    );
  }

  if (completed) {
    const percentage = Math.round((score / questions.length) * 100);
    const nextReviewCopy = reviewTargets.length > 0
      ? '10分後に間違えた単語だけもう一度。そのあと明日の最初に1回確認すると定着しやすいです。'
      : '間違いはありません。明日に1回だけ軽く確認すれば十分です。';

    return (
      <div className="mx-auto max-w-3xl rounded-[32px] bg-white p-8 shadow-lg animate-in zoom-in duration-300">
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
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-medace-50 px-4 py-2 text-sm font-bold text-medace-700">
            正解 {score} / {questions.length}
            <span className="text-medace-400">{percentage}%</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {(Object.keys(WORKSHEET_MODE_COPY) as WorksheetQuestionMode[]).map((questionMode) => (
            <button
              key={questionMode}
              type="button"
              onClick={() => setMode(questionMode)}
              className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                mode === questionMode
                  ? 'border-medace-500 bg-medace-50 text-medace-700'
                  : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
              }`}
            >
              {WORKSHEET_MODE_COPY[questionMode].label}
            </button>
          ))}
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
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">10分後</span>
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
                    : '余裕があれば別の出題方向でもう1回だけ確認すると、想起の幅が広がります。'}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex gap-3">
          <button
            onClick={onBack}
            className="flex-1 rounded-2xl bg-slate-100 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-200"
          >
            戻る
          </button>
          <button
            onClick={restartQuiz}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-medace-600 py-3 font-bold text-white transition-colors hover:bg-medace-700"
          >
            <RotateCcw className="h-4 w-4" /> 同じ方向で再挑戦
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Check Mode</div>
            <div className="mt-1 text-xl font-black text-slate-950">出題方向を切り替えて確認する</div>
            <div className="mt-2 text-sm leading-relaxed text-slate-500">
              英日・日英・先頭2文字ヒントを切り替えて、同じ単語帳でも別方向から確認できます。
            </div>
          </div>
          <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
            {currentModeCopy.label}
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {(Object.keys(WORKSHEET_MODE_COPY) as WorksheetQuestionMode[]).map((questionMode) => (
            <button
              key={questionMode}
              type="button"
              onClick={() => setMode(questionMode)}
              className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                mode === questionMode
                  ? 'border-medace-500 bg-medace-50'
                  : 'border-slate-200 bg-slate-50 hover:border-medace-200 hover:bg-white'
              }`}
            >
              <div className="text-sm font-bold text-slate-900">{WORKSHEET_MODE_COPY[questionMode].label}</div>
              <div className="mt-1 text-sm text-slate-500">{WORKSHEET_MODE_COPY[questionMode].description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="mb-8">
        <div className="mb-2 flex justify-between text-sm font-medium text-slate-500">
          <span>第 {currentQIndex + 1} 問</span>
          <span className="font-bold text-medace-600">正解数: {score}</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full bg-medace-500 transition-all duration-500 ease-out"
            style={{ width: `${((currentQIndex + 1) / questions.length) * 100}%` }}
          ></div>
        </div>
      </div>

      <div className="relative mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-md">
        <span className="mb-3 block text-xs font-bold uppercase tracking-widest text-slate-400">{currentQuestion.promptLabel}</span>
        <h2 className="text-3xl font-black leading-tight text-slate-800 md:text-4xl">{currentQuestion.promptText}</h2>

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
              先頭2文字は見せています。全文を入力しても、残りだけを入力しても判定できます。
            </div>
          </div>
        ) : (
          !showOptions && (
            <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-sm text-slate-500">頭の中で答えを思い浮かべてから、次の確認に進んでください。</p>
            </div>
          )
        )}
      </div>

      {isHintMode ? (
        <form onSubmit={handleHintSubmit} className="space-y-4 animate-in slide-in-from-bottom-2 fade-in">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-xs font-bold uppercase tracking-[0.16em] text-slate-400">英語を入力</label>
            <input
              type="text"
              value={answerInput}
              onChange={(event) => setAnswerInput(event.target.value)}
              disabled={!!inputResult}
              autoFocus
              className="w-full rounded-2xl border border-slate-300 px-4 py-4 text-lg font-bold text-slate-900 outline-none transition-all focus:border-medace-500 focus:ring-2 focus:ring-medace-100 disabled:bg-slate-50"
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
          </div>
          <button
            type="submit"
            disabled={!answerInput.trim() || !!inputResult}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-medace-700 py-4 font-bold text-white shadow-lg transition-all hover:bg-medace-800 disabled:opacity-50"
          >
            <CheckCircle className="h-5 w-5" /> 入力して判定する
          </button>
        </form>
      ) : !showOptions ? (
        <div className="animate-in slide-in-from-bottom-2 flex flex-col gap-4 fade-in">
          <button
            onClick={() => setShowOptions(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-4 font-bold text-white shadow-lg transition-all hover:bg-slate-700"
          >
            <Eye className="h-5 w-5" /> 選択肢を表示する
          </button>
          <div className="flex items-center justify-center gap-1 text-center text-sm text-slate-400">
            <HelpCircle className="h-4 w-4" />
            <span>先に自力で思い出してから見るほうが記憶が定着します</span>
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
                onClick={() => void handleOptionClick(option)}
                disabled={!!selectedOption}
                className={`flex w-full items-center justify-between rounded-xl p-5 text-left text-lg font-semibold transition-all duration-200 ${buttonClass}`}
              >
                <span>{option}</span>
                {icon}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default QuizMode;
