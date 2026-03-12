import React, { useState } from 'react';
import { CheckCircle2, ChevronLeft, ChevronRight, Compass, GraduationCap, Radar, Sparkles, Target, X } from 'lucide-react';
import { DIAGNOSTIC_PHASE_LABELS, DIAGNOSTIC_QUESTIONS, SELF_ASSESSMENT_OPTIONS, SelfAssessmentKey, evaluateDiagnostic } from '../data/diagnostic';
import { EnglishLevel, GRADE_LABELS, UserGrade, UserProfile } from '../types';
import { storage } from '../services/storage';
import useIsMobileViewport from '../hooks/useIsMobileViewport';
import MobileStickyActionBar from './mobile/MobileStickyActionBar';
import MobileStepPager from './mobile/MobileStepPager';

interface OnboardingProps {
  user: UserProfile;
  onComplete: (updatedUser: UserProfile) => void;
  isRetake?: boolean;
  historySummary?: string;
  onCancel?: () => void;
}

const GRADES = [
  { id: UserGrade.JHS1, label: GRADE_LABELS[UserGrade.JHS1], desc: '英語を始めたばかり' },
  { id: UserGrade.JHS2, label: GRADE_LABELS[UserGrade.JHS2], desc: '基礎を固めたい' },
  { id: UserGrade.JHS3, label: GRADE_LABELS[UserGrade.JHS3], desc: '受験対策・長文挑戦' },
  { id: UserGrade.SHS1, label: GRADE_LABELS[UserGrade.SHS1], desc: '文法・語彙を強化' },
  { id: UserGrade.SHS2, label: GRADE_LABELS[UserGrade.SHS2], desc: '応用力をつけたい' },
  { id: UserGrade.SHS3, label: GRADE_LABELS[UserGrade.SHS3], desc: '大学受験レベル' },
  { id: UserGrade.UNIVERSITY, label: GRADE_LABELS[UserGrade.UNIVERSITY], desc: 'アカデミック / TOEIC' },
  { id: UserGrade.ADULT, label: GRADE_LABELS[UserGrade.ADULT], desc: 'ビジネス / 教養' },
];

const LEVEL_BADGE_STYLE: Record<EnglishLevel, string> = {
  [EnglishLevel.A1]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  [EnglishLevel.A2]: 'bg-lime-50 text-lime-700 border-lime-200',
  [EnglishLevel.B1]: 'bg-sky-50 text-sky-700 border-sky-200',
  [EnglishLevel.B2]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  [EnglishLevel.C1]: 'bg-rose-50 text-rose-700 border-rose-200',
  [EnglishLevel.C2]: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200',
};

const Onboarding: React.FC<OnboardingProps> = ({ user, onComplete, isRetake = false, onCancel }) => {
  const isMobileViewport = useIsMobileViewport();
  const [step, setStep] = useState<'PROFILE' | 'TEST' | 'RESULT'>('PROFILE');
  const [selectedGrade, setSelectedGrade] = useState<UserGrade>(user.grade || UserGrade.ADULT);
  const [selfAssessment, setSelfAssessment] = useState<SelfAssessmentKey | null>(null);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Record<string, string>>({});
  const [finalLevel, setFinalLevel] = useState<EnglishLevel | null>(null);
  const [result, setResult] = useState<ReturnType<typeof evaluateDiagnostic> | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const currentQuestion = DIAGNOSTIC_QUESTIONS[currentQuestionIndex];
  const currentAnswer = currentQuestion ? userAnswers[currentQuestion.id] : '';
  const answeredCount = Object.keys(userAnswers).length;
  const progressPercent = Math.round((((step === 'RESULT' ? DIAGNOSTIC_QUESTIONS.length : currentQuestionIndex + 1)) / DIAGNOSTIC_QUESTIONS.length) * 100);

  const handleStart = () => {
    if (!selectedGrade || !selfAssessment) return;
    setCurrentQuestionIndex(0);
    setUserAnswers({});
    setResult(null);
    setFinalLevel(null);
    setStep('TEST');
  };

  const handleSelectAnswer = (answer: string) => {
    setUserAnswers((prev) => ({
      ...prev,
      [currentQuestion.id]: answer,
    }));
  };

  const handleNext = () => {
    if (!currentAnswer) return;
    if (currentQuestionIndex < DIAGNOSTIC_QUESTIONS.length - 1) {
      setCurrentQuestionIndex((prev) => prev + 1);
      return;
    }

    const evaluation = evaluateDiagnostic(userAnswers, selfAssessment!, selectedGrade);
    setResult(evaluation);
    setFinalLevel(evaluation.level);
    setStep('RESULT');
  };

  const handleBack = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
      return;
    }
    setStep('PROFILE');
  };

  const saveResult = async () => {
    if (!finalLevel) return;
    setIsSaving(true);

    try {
      const updatedUser: UserProfile = {
        ...user,
        grade: selectedGrade,
        englishLevel: finalLevel,
        needsOnboarding: false,
      };

      await storage.updateSessionUser(updatedUser);
      onComplete(updatedUser);
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 'PROFILE') {
    if (isMobileViewport) {
      return (
        <div data-testid="onboarding-profile" className="bg-[#fff8f1] px-1 pb-28 pt-1">
          <div className="mx-auto max-w-xl space-y-4">
            <section className="relative overflow-hidden rounded-[28px] bg-medace-500 p-5 text-white shadow-[0_20px_50px_rgba(255,130,22,0.22)]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_24%)]"></div>
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold tracking-[0.18em] uppercase text-white/72">
                  <Radar className="h-4 w-4" /> Placement Design
                </div>
                <h1 className="mt-4 text-[1.7rem] font-black leading-tight tracking-tight">
                  {isRetake ? '学習スタート帯を再診断する' : '最初のスタート帯を、短時間で決める'}
                </h1>
                <p className="mt-3 text-[13px] leading-relaxed text-white/78">
                  文法・語彙・読解を 12 問で確認し、Steady Study を始めるための推定レベルを出します。
                </p>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    { value: '12', label: '問題' },
                    { value: '4-5分', label: '所要時間' },
                    { value: '選択式', label: '入力なし' },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-white/10 bg-white/6 px-3 py-3">
                      <div className="text-lg font-black text-white">{item.value}</div>
                      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-white/58">{item.label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-3xl border border-white/10 bg-white/6 px-4 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/58">診断の特徴</div>
                  <div className="mt-3 space-y-2 text-sm text-white/84">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-medace-200" />
                      <span>AI生成ではなく固定問題なので、毎回ぶれません。</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-medace-200" />
                      <span>結果では「なぜその帯か」まで確認できます。</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Setup</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                    {isRetake ? 'いまの実感を更新する' : '学年と現在地を選ぶ'}
                  </h2>
                </div>
                {isRetake && onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" /> 閉じる
                  </button>
                )}
              </div>

              <div className="mt-4">
                <MobileStepPager
                  steps={[
                    { id: 'grade', label: '学年・立場' },
                    { id: 'assessment', label: 'いまの実感' },
                  ]}
                  activeStep={selfAssessment ? 1 : 0}
                />
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-medace-600" />
                  <h3 className="text-sm font-black text-slate-900">1. 学年・立場</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {GRADES.map((grade) => (
                    <button
                      key={grade.id}
                      type="button"
                      onClick={() => setSelectedGrade(grade.id)}
                      className={`rounded-2xl border px-4 py-3 text-left transition-all ${
                        selectedGrade === grade.id
                          ? 'border-medace-500 bg-medace-50 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="text-sm font-bold text-slate-900">{grade.label}</div>
                      <div className="mt-1 text-[12px] leading-relaxed text-slate-500">{grade.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <div className="mb-3 flex items-center gap-2">
                  <Compass className="h-4 w-4 text-medace-600" />
                  <h3 className="text-sm font-black text-slate-900">2. いまの実感</h3>
                </div>
                <div className="grid gap-3">
                  {SELF_ASSESSMENT_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setSelfAssessment(option.id)}
                      className={`rounded-3xl border px-4 py-4 text-left transition-all ${
                        selfAssessment === option.id
                          ? 'border-medace-600 bg-medace-500 text-white shadow-[0_18px_40px_rgba(255,130,22,0.18)]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className={`text-sm font-bold ${selfAssessment === option.id ? 'text-white' : 'text-slate-900'}`}>
                            {option.title}
                          </div>
                          <p className={`mt-1 line-clamp-2 text-[13px] leading-relaxed ${
                            selfAssessment === option.id ? 'text-white/72' : 'text-slate-500'
                          }`}>
                            {option.description}
                          </p>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                          selfAssessment === option.id
                            ? 'border-white/20 bg-white/10 text-white/88'
                            : 'border-slate-200 bg-slate-50 text-slate-500'
                        }`}>
                          {option.estimatedBand}
                        </span>
                      </div>
                      <div className={`mt-2 text-[11px] font-bold tracking-[0.14em] uppercase ${
                        selfAssessment === option.id ? 'text-medace-200' : 'text-medace-600'
                      }`}>
                        {option.helper}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-5 rounded-3xl border border-medace-100 bg-medace-50/70 px-4 py-4">
                <div className="flex items-start gap-3">
                  <Target className="mt-0.5 h-4 w-4 shrink-0 text-medace-600" />
                  <div>
                    <div className="text-sm font-bold text-slate-900">診断の設計方針</div>
                    <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
                      最初は易しめから入り、後半で抽象度を上げます。入力負荷を減らすため、すべて選択式です。
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur">
            <div className="flex flex-col gap-3">
              <button
                type="button"
                data-testid="onboarding-start-button"
                onClick={handleStart}
                disabled={!selfAssessment}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-base font-bold text-white transition-colors hover:bg-medace-700 disabled:opacity-50"
              >
                診断を始める <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </MobileStickyActionBar>
        </div>
      );
    }

    return (
      <div data-testid="onboarding-profile" className="bg-[#fff8f1] px-4 py-10">
        <div className="max-w-6xl mx-auto grid xl:grid-cols-[0.96fr_1.04fr] gap-6">
          <div className="relative overflow-hidden rounded-[32px] bg-medace-500 p-8 text-white shadow-[0_28px_80px_rgba(255,130,22,0.22)] md:p-10">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.12),_transparent_24%)]"></div>
            <div className="relative">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-bold tracking-[0.18em] uppercase text-white/70">
                <Radar className="w-4 h-4" /> Placement Design
              </div>
              <h1 className="mt-6 text-3xl md:text-4xl font-black tracking-tight leading-tight">
                {isRetake ? '学習スタート帯を再診断する' : '最初のスタート帯を、短時間で正確に決める'}
              </h1>
              <p className="mt-4 text-sm md:text-base text-white/78 leading-relaxed max-w-lg">
                CEFR の自己評価の考え方と placement test の定番形式を参考に、文法・語彙・読解を 12 問で確認します。
                これは公式資格判定ではなく、Steady Study で学習を始めるための推定レベルです。
              </p>

              <div className="mt-8 grid gap-3">
                {[
                  '問題は事前作成済みで、AI生成のブレがない',
                  '文法・語彙・読解をバランスよく確認する',
                  '結果画面で「なぜその帯か」を説明する',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <CheckCircle2 className="w-5 h-5 text-medace-300 shrink-0" />
                    <span className="text-sm text-white/88">{item}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8 rounded-3xl bg-white/5 border border-white/10 p-5">
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-white/60">What You Get</p>
                <div className="mt-4 grid sm:grid-cols-3 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/5 px-4 py-4">
                    <div className="text-2xl font-black text-white">12</div>
                    <div className="text-white/70 mt-1">prebuilt questions</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-4 py-4">
                    <div className="text-2xl font-black text-white">4-5分</div>
                    <div className="text-white/70 mt-1">on average</div>
                  </div>
                  <div className="rounded-2xl bg-white/5 px-4 py-4">
                    <div className="text-2xl font-black text-white">3軸</div>
                    <div className="text-white/70 mt-1">grammar / vocab / reading</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white/95 backdrop-blur p-6 md:p-8 shadow-xl">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Setup</p>
                <h2 className="mt-2 text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                  {isRetake ? 'いまの実感を更新する' : '学年と現在地を選ぶ'}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="rounded-full bg-medace-50 border border-medace-100 px-4 py-2 text-sm font-bold text-medace-700">
                  まずは 2 ステップ
                </div>
                {isRetake && onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" /> 閉じる
                  </button>
                )}
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <GraduationCap className="w-5 h-5 text-medace-600" />
                <h3 className="text-lg font-bold text-slate-900">1. 学年・立場</h3>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {GRADES.map((grade) => (
                  <button
                    key={grade.id}
                    type="button"
                    onClick={() => setSelectedGrade(grade.id)}
                    className={`rounded-2xl border px-4 py-4 text-left transition-all ${selectedGrade === grade.id ? 'border-medace-500 bg-medace-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="font-bold text-slate-900">{grade.label}</div>
                    <div className="text-sm text-slate-500 mt-1">{grade.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8">
              <div className="flex items-center gap-2 mb-4">
                <Compass className="w-5 h-5 text-medace-600" />
                <h3 className="text-lg font-bold text-slate-900">2. いまの実感</h3>
              </div>
              <div className="grid gap-3">
                {SELF_ASSESSMENT_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setSelfAssessment(option.id)}
                    className={`rounded-3xl border px-5 py-4 text-left transition-all ${selfAssessment === option.id ? 'border-medace-600 bg-medace-500 text-white shadow-[0_18px_40px_rgba(255,130,22,0.18)]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className={`font-bold ${selfAssessment === option.id ? 'text-white' : 'text-slate-900'}`}>{option.title}</div>
                        <p className={`mt-1 text-sm leading-relaxed ${selfAssessment === option.id ? 'text-white/72' : 'text-slate-500'}`}>{option.description}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-bold ${selfAssessment === option.id ? 'border-white/20 text-white/88 bg-white/10' : 'border-slate-200 text-slate-500 bg-slate-50'}`}>
                        {option.estimatedBand}
                      </span>
                    </div>
                    <div className={`mt-3 text-xs font-bold tracking-wide ${selfAssessment === option.id ? 'text-medace-200' : 'text-medace-600'}`}>
                      {option.helper}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-8 rounded-3xl border border-medace-100 bg-medace-50/70 px-5 py-4">
              <div className="flex items-start gap-3">
                <Target className="w-5 h-5 text-medace-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">診断の設計方針</div>
                  <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                    最初は易しめから入り、後半で抽象度を上げます。タイピング問題は入れず、最初の離脱を防ぐために選択式で統一しています。
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleStart}
              disabled={!selfAssessment}
              className="mt-8 flex w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 py-4 text-base font-bold text-white shadow-lg transition-colors hover:bg-medace-700 disabled:opacity-50"
            >
              診断を始める <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'RESULT' && result && finalLevel) {
    if (isMobileViewport) {
      const reviewItems = result.reviewItems.filter((item) => !item.isCorrect).slice(0, 3);
      return (
        <div data-testid="onboarding-result" className="bg-[#fff8f1] px-1 pb-28 pt-1">
          <div className="mx-auto max-w-xl space-y-4">
            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Placement Result</p>
                  <h2 className="mt-2 text-[1.75rem] font-black tracking-tight text-slate-950">推定スタート帯は {finalLevel}</h2>
                </div>
                {isRetake && onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" /> 閉じる
                  </button>
                )}
              </div>

              <p className="mt-3 text-sm leading-relaxed text-slate-600">{result.summaryBody}</p>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className={`rounded-3xl border px-4 py-4 ${LEVEL_BADGE_STYLE[finalLevel]}`}>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em]">Estimated Level</div>
                  <div className="mt-2 text-3xl font-black tracking-tight">{finalLevel}</div>
                  <div className="mt-1 text-sm font-medium">{result.summaryTitle}</div>
                </div>
                <div className="rounded-3xl border border-medace-100 bg-medace-50/75 px-4 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Confidence</div>
                  <div className="mt-2 text-xl font-black text-slate-900">{result.confidence === 'HIGH' ? '高め' : '標準'}</div>
                  <div className="mt-1 text-sm text-slate-600">{result.correctCount} / {result.totalQuestions} 問正解</div>
                </div>
              </div>

              <div className="mt-4 rounded-3xl border border-medace-100 bg-[#fff8ef] px-4 py-4 text-sm leading-relaxed text-medace-900/75">
                {result.alignmentNote}
              </div>

              <div className="mt-4 rounded-3xl border border-medace-600 bg-medace-500 px-4 py-4 text-white">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/55">おすすめペース</div>
                <div className="mt-2 text-3xl font-black tracking-tight">
                  {result.recommendedDailyGoal}
                  <span className="ml-1 text-base text-white/65">語 / 日</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-white/78">
                  最初の 2 週間は、このペースで復習を崩さず回せるかを優先してください。
                </p>
              </div>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
              <p className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Next Focus</p>
              <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">このスタート帯で意識すること</h3>
              <div className="mt-4 space-y-3">
                {result.nextFocus.map((focus) => (
                  <div key={focus} className="rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4 text-sm leading-relaxed text-slate-700">
                    {focus}
                  </div>
                ))}
              </div>
            </section>

            <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
              <summary className="cursor-pointer list-none text-lg font-black tracking-tight text-slate-950">診断の内訳</summary>
              <div className="mt-4 grid gap-3">
                {(Object.entries(result.phaseScores) as Array<[keyof typeof result.phaseScores, { correct: number; total: number }]>).map(([phase, score]) => (
                  <div key={phase} className="rounded-3xl border border-medace-100 bg-[#fff8ef] px-4 py-4">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{DIAGNOSTIC_PHASE_LABELS[phase]}</div>
                    <div className="mt-2 text-2xl font-black text-slate-900">
                      {score.correct}
                      <span className="text-base text-slate-400">/{score.total}</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-600">
                      {phase === 'warmup' ? '基礎の安定度' : phase === 'core' ? '標準的な文脈力' : '上位帯の伸びしろ'}
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
              <summary className="cursor-pointer list-none text-lg font-black tracking-tight text-slate-950">スキル別コメント</summary>
              <div className="mt-4 grid gap-3">
                {result.skillSummaries.map((summary) => (
                  <div key={summary.skill} className="rounded-3xl border border-slate-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-base font-bold text-slate-900">{summary.label}</div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        summary.status === 'strong'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : summary.status === 'steady'
                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}>
                        {summary.status === 'strong' ? '安定' : summary.status === 'steady' ? '育成中' : '優先'}
                      </div>
                    </div>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">{summary.message}</p>
                    <div className="mt-3 flex justify-between text-[11px] font-bold text-slate-400">
                      <span>{summary.correct} / {summary.total}</span>
                      <span>{Math.round(summary.ratio * 100)}%</span>
                    </div>
                    <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${
                          summary.status === 'strong'
                            ? 'bg-emerald-500'
                            : summary.status === 'steady'
                              ? 'bg-sky-500'
                              : 'bg-amber-500'
                        }`}
                        style={{ width: `${Math.max(8, Math.round(summary.ratio * 100))}%` }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <details className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-xl">
              <summary className="cursor-pointer list-none text-lg font-black tracking-tight text-slate-950">見直すと効く問題</summary>
              <div className="mt-4 space-y-3">
                {reviewItems.map((item) => (
                  <div key={item.id} className="rounded-3xl border border-medace-100 bg-[#fff8ef] px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-slate-900">
                        {item.skill === 'grammar' ? '文法' : item.skill === 'vocabulary' ? '語彙' : '読解'}
                      </div>
                      <div className={`rounded-full border px-2.5 py-1 text-xs font-bold ${LEVEL_BADGE_STYLE[item.level]}`}>{item.level}</div>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-slate-700">{item.question}</p>
                    <div className="mt-3 text-xs text-slate-500">正解: {item.correctAnswer}</div>
                    <div className="mt-2 text-sm text-slate-600">{item.explanation}</div>
                  </div>
                ))}
                {result.missedCount === 0 && (
                  <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                    取りこぼしはありませんでした。今の帯で十分にスタートできます。
                  </div>
                )}
              </div>
            </details>
          </div>

          <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur">
            <div className="flex flex-col gap-3">
              <button
                type="button"
                data-testid="onboarding-save-button"
                onClick={saveResult}
                disabled={isSaving}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-base font-bold text-white transition-colors hover:bg-medace-700 disabled:opacity-50"
              >
                {isSaving ? '保存中...' : 'このレベルで学習を始める'}
                {!isSaving && <ChevronRight className="h-5 w-5" />}
              </button>
            </div>
          </MobileStickyActionBar>
        </div>
      );
    }

    return (
      <div data-testid="onboarding-result" className="bg-[#fff8f1] px-4 py-10">
        <div className="max-w-6xl mx-auto space-y-6">
        <div className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-8 shadow-xl">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
              <div>
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Placement Result</p>
                <h2 className="mt-2 text-3xl md:text-4xl font-black tracking-tight text-slate-950">推定スタート帯は {finalLevel}</h2>
                <p className="mt-3 text-sm md:text-base text-slate-600 max-w-2xl leading-relaxed">{result.summaryBody}</p>
              </div>

              <div className="flex flex-col gap-3">
                {isRetake && onCancel && (
                  <button
                    type="button"
                    onClick={onCancel}
                    className="self-end inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" /> 閉じる
                  </button>
                )}
                <div className="grid grid-cols-2 gap-3 min-w-[280px]">
                <div className={`rounded-3xl border px-5 py-5 ${LEVEL_BADGE_STYLE[finalLevel]}`}>
                  <div className="text-xs font-bold tracking-[0.18em] uppercase">Estimated Level</div>
                  <div className="mt-3 text-4xl font-black tracking-tight">{finalLevel}</div>
                  <div className="mt-2 text-sm font-medium">{result.summaryTitle}</div>
                </div>
                <div className="rounded-3xl border border-medace-100 bg-medace-50/75 px-5 py-5">
                  <div className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Confidence</div>
                  <div className="mt-3 text-2xl font-black text-slate-900">{result.confidence === 'HIGH' ? '高め' : '標準'}</div>
                  <div className="mt-2 text-sm text-slate-600">{result.correctCount} / {result.totalQuestions} 問正解</div>
                  <div className="text-sm text-slate-500">Weighted score {result.weightedScore}</div>
                </div>
              </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-medace-100 bg-[#fff8ef] px-5 py-4 text-sm leading-relaxed text-medace-900/75">
              {result.alignmentNote}
            </div>
          </div>

          <div className="grid lg:grid-cols-[1.15fr_0.85fr] gap-6">
            <div className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-8 shadow-xl">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-medace-600" />
                <h3 className="text-xl font-black tracking-tight text-slate-950">診断の内訳</h3>
              </div>

              <div className="mt-6 grid md:grid-cols-3 gap-4">
                {(Object.entries(result.phaseScores) as Array<[keyof typeof result.phaseScores, { correct: number; total: number }]>).map(([phase, score]) => (
                  <div key={phase} className="rounded-3xl border border-medace-100 bg-[#fff8ef] px-5 py-5">
                    <div className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">{DIAGNOSTIC_PHASE_LABELS[phase]}</div>
                    <div className="mt-3 text-3xl font-black text-slate-900">{score.correct}<span className="text-lg text-slate-400">/{score.total}</span></div>
                    <div className="mt-2 text-sm text-slate-600">
                      {phase === 'warmup' ? '基礎の安定度' : phase === 'core' ? '標準的な文脈力' : '上位帯の伸びしろ'}
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-8 grid gap-4">
                {result.skillSummaries.map((summary) => (
                  <div key={summary.skill} className="rounded-3xl border border-slate-200 px-5 py-5">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <div className="text-lg font-bold text-slate-900">{summary.label}</div>
                        <p className="mt-1 text-sm text-slate-600">{summary.message}</p>
                      </div>
                      <div className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        summary.status === 'strong'
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : summary.status === 'steady'
                            ? 'border-sky-200 bg-sky-50 text-sky-700'
                            : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}>
                        {summary.status === 'strong' ? '安定' : summary.status === 'steady' ? '育成中' : '優先'}
                      </div>
                    </div>
                    <div className="mt-4">
                      <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                        <span>{summary.correct} / {summary.total}</span>
                        <span>{Math.round(summary.ratio * 100)}%</span>
                      </div>
                      <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            summary.status === 'strong'
                              ? 'bg-emerald-500'
                              : summary.status === 'steady'
                                ? 'bg-sky-500'
                                : 'bg-amber-500'
                          }`}
                          style={{ width: `${Math.max(8, Math.round(summary.ratio * 100))}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-8 shadow-xl">
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Next Focus</p>
                <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">このスタート帯で意識すること</h3>
                <div className="mt-5 space-y-3">
                  {result.nextFocus.map((focus) => (
                    <div key={focus} className="rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4 text-sm leading-relaxed text-slate-700">
                      {focus}
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-slate-200 bg-white p-6 md:p-8 shadow-xl">
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-slate-400">Review</p>
                <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">見直すと効く問題</h3>
                <div className="mt-5 space-y-3">
                  {result.reviewItems.filter((item) => !item.isCorrect).slice(0, 3).map((item) => (
                    <div key={item.id} className="rounded-3xl border border-medace-100 bg-[#fff8ef] px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-slate-900">{item.skill === 'grammar' ? '文法' : item.skill === 'vocabulary' ? '語彙' : '読解'}</div>
                        <div className={`rounded-full border px-2.5 py-1 text-xs font-bold ${LEVEL_BADGE_STYLE[item.level]}`}>{item.level}</div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-700">{item.question}</p>
                      <div className="mt-3 text-xs text-slate-500">正解: {item.correctAnswer}</div>
                      <div className="mt-2 text-sm text-slate-600">{item.explanation}</div>
                    </div>
                  ))}
                  {result.missedCount === 0 && (
                    <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                      取りこぼしはありませんでした。今の帯で十分にスタートできます。
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-[32px] border border-medace-600 bg-medace-500 p-6 text-white shadow-xl md:p-8">
                <p className="text-xs font-bold tracking-[0.18em] uppercase text-white/55">おすすめペース</p>
                <div className="mt-3 text-4xl font-black tracking-tight">{result.recommendedDailyGoal}<span className="text-lg text-white/60 ml-1">語 / 日</span></div>
                <p className="mt-3 text-sm text-white/75 leading-relaxed">
                  最初の 2 週間は、このペースで復習を崩さず回せるかを優先してください。詰め込みより、翌日も再現できることが重要です。
                </p>

                <button
                  type="button"
                  onClick={saveResult}
                  disabled={isSaving}
                  className="mt-6 w-full rounded-2xl bg-white text-slate-950 py-3.5 font-bold hover:bg-medace-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isSaving ? '保存中...' : 'このレベルで学習を始める'}
                  {!isSaving && <ChevronRight className="w-5 h-5" />}
                </button>

                <p className="mt-3 text-xs text-white/55">
                  これは公式 CEFR 認定ではなく、Steady Study 内での開始レベル推定です。
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    isMobileViewport ? (
      <div data-testid="onboarding-test" className="bg-[#fff8f1] px-1 pb-28 pt-1">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-medace-100 bg-medace-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-medace-700">
                  {currentQuestion.skill === 'grammar' ? 'Grammar' : currentQuestion.skill === 'vocabulary' ? 'Vocabulary' : 'Reading'}
                </div>
                <h3 className="mt-3 text-2xl font-black tracking-tight text-slate-950">第 {currentQuestionIndex + 1} 問</h3>
              </div>
              <div className={`rounded-full border px-3 py-1 text-xs font-bold ${LEVEL_BADGE_STYLE[currentQuestion.level]}`}>
                {currentQuestion.level}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">進捗</div>
                <div className="mt-2 text-sm font-black text-slate-950">{currentQuestionIndex + 1} / {DIAGNOSTIC_QUESTIONS.length}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">回答済み</div>
                <div className="mt-2 text-sm font-black text-slate-950">{answeredCount} 問</div>
              </div>
            </div>

            <div className="mt-4">
              <div className="mb-2 flex justify-between text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                <span>全体の進み具合</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-medace-500 transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>

            {isRetake && onCancel && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" /> 閉じる
                </button>
              </div>
            )}
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl">
            <div className="rounded-[24px] border border-medace-100 bg-[#fff8ef] p-4">
              {currentQuestion.prompt && (
                <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                  {currentQuestion.prompt}
                </div>
              )}
              <h4 className={`font-bold leading-relaxed text-slate-950 whitespace-pre-wrap ${
                currentQuestion.prompt ? 'mt-4 text-xl' : 'text-xl'
              }`}>
                {currentQuestion.question}
              </h4>
            </div>

            <div className="mt-4 grid gap-3">
              {currentQuestion.options.map((option, index) => {
                const isSelected = currentAnswer === option;
                return (
                  <button
                    key={option}
                    type="button"
                    data-testid="diagnostic-option"
                    onClick={() => handleSelectAnswer(option)}
                    className={`rounded-3xl border px-4 py-4 text-left transition-all ${
                      isSelected
                        ? 'border-medace-600 bg-medace-500 text-white shadow-[0_18px_40px_rgba(255,130,22,0.18)]'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
                        isSelected ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-slate-50 text-slate-500'
                      }`}>
                        {String.fromCharCode(65 + index)}
                      </div>
                      <div className={`text-sm leading-relaxed font-medium ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                        {option}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <details className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-xl">
            <summary className="cursor-pointer list-none text-sm font-black text-slate-950">この問題で見ていること</summary>
            <div className="mt-4 grid gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">学年</div>
                <div className="mt-2 text-sm font-black text-slate-950">{GRADE_LABELS[selectedGrade]}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">現在の判定帯</div>
                <div className="mt-2 text-sm font-black text-slate-950">{DIAGNOSTIC_PHASE_LABELS[currentQuestion.phase]} · {currentQuestion.level}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
                {currentQuestion.phase === 'warmup'
                  ? 'まずは基礎の安定度を見ています。'
                  : currentQuestion.phase === 'core'
                    ? 'ここから標準的な読解・文脈判断を見ます。'
                    : '上位帯でどこまで届くかを確認しています。'}
              </div>
            </div>
          </details>
        </div>

        <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur">
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleBack}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-medace-50"
            >
              <ChevronLeft className="h-4 w-4" /> 戻る
            </button>

            <button
              type="button"
              data-testid="onboarding-next-button"
              onClick={handleNext}
              disabled={!currentAnswer}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-700 disabled:opacity-50"
            >
              {currentQuestionIndex === DIAGNOSTIC_QUESTIONS.length - 1 ? '判定を見る' : '次へ'}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </MobileStickyActionBar>
      </div>
    ) : (
    <div data-testid="onboarding-test" className="bg-[#fff8f1] px-4 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="overflow-hidden rounded-[32px] border border-medace-100 bg-white shadow-xl">
          <div className="grid lg:grid-cols-[0.33fr_0.67fr]">
            <aside className="bg-medace-500 p-6 text-white md:p-8">
              <p className="text-xs font-bold tracking-[0.18em] uppercase text-white/55">診断の流れ</p>
              <h2 className="mt-3 text-2xl font-black tracking-tight">英語の現在地を確認中</h2>
              <p className="mt-3 text-sm text-white/72 leading-relaxed">
                各問題は文法・語彙・読解のいずれかに対応しています。正答率だけでなく、どの帯で取れているかも見ています。
              </p>

              <div className="mt-6 space-y-3">
                {[
                  { label: '学年', value: GRADE_LABELS[selectedGrade] },
                  { label: '問題数', value: `${currentQuestionIndex + 1} / ${DIAGNOSTIC_QUESTIONS.length}` },
                  { label: '回答済み', value: `${answeredCount} 問` },
                ].map((item) => (
                  <div key={item.label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs font-bold tracking-[0.18em] uppercase text-white/55">{item.label}</div>
                    <div className="mt-2 text-lg font-bold text-white">{item.value}</div>
                  </div>
                ))}
              </div>

              <div className="mt-6">
                <div className="flex justify-between text-[11px] font-bold tracking-[0.18em] uppercase text-white/55 mb-2">
                  <span>全体の進み具合</span>
                  <span>{progressPercent}%</span>
                </div>
                <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full bg-medace-300 transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
                </div>
              </div>

              <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-5">
                <div className="text-xs font-bold tracking-[0.18em] uppercase text-white/55">現在の判定帯</div>
                <div className="mt-3 inline-flex items-center rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
                  {DIAGNOSTIC_PHASE_LABELS[currentQuestion.phase]} · {currentQuestion.level}
                </div>
                <p className="mt-3 text-sm text-white/70 leading-relaxed">
                  {currentQuestion.phase === 'warmup'
                    ? 'まずは基礎の安定度を見ています。'
                    : currentQuestion.phase === 'core'
                      ? 'ここから標準的な読解・文脈判断を見ます。'
                      : '上位帯でどこまで届くかを確認しています。'}
                </p>
              </div>
            </aside>

            <section className="p-6 md:p-8 lg:p-10">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full bg-medace-50 border border-medace-100 px-3 py-1 text-xs font-bold text-medace-700">
                    {currentQuestion.skill === 'grammar' ? 'Grammar' : currentQuestion.skill === 'vocabulary' ? 'Vocabulary' : 'Reading'}
                  </div>
                  <h3 className="mt-4 text-2xl md:text-3xl font-black tracking-tight text-slate-950 leading-tight">
                    第 {currentQuestionIndex + 1} 問
                  </h3>
                </div>
                <div className={`rounded-full border px-3 py-1 text-xs font-bold ${LEVEL_BADGE_STYLE[currentQuestion.level]}`}>
                  {currentQuestion.level}
                </div>
              </div>
              {isRetake && onCancel && (
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" /> 閉じる
                  </button>
                </div>
              )}

              <div className="mt-8 rounded-[28px] border border-medace-100 bg-[#fff8ef] p-5 md:p-6">
                {currentQuestion.prompt && (
                  <div className="rounded-2xl bg-white border border-slate-200 px-4 py-4 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
                    {currentQuestion.prompt}
                  </div>
                )}
                <h4 className="mt-4 text-xl md:text-2xl font-bold leading-relaxed text-slate-950 whitespace-pre-wrap">
                  {currentQuestion.question}
                </h4>
              </div>

              <div className="mt-6 grid gap-3">
                {currentQuestion.options.map((option, index) => {
                  const isSelected = currentAnswer === option;
                  return (
                    <button
                      key={option}
                      type="button"
                      data-testid="diagnostic-option"
                      onClick={() => handleSelectAnswer(option)}
                      className={`rounded-3xl border px-5 py-4 text-left transition-all ${isSelected ? 'border-medace-600 bg-medace-500 text-white shadow-[0_18px_40px_rgba(255,130,22,0.18)]' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-sm font-black shrink-0 ${isSelected ? 'border-white/20 bg-white/10 text-white' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                          {String.fromCharCode(65 + index)}
                        </div>
                        <div className={`text-sm md:text-base leading-relaxed font-medium ${isSelected ? 'text-white' : 'text-slate-800'}`}>
                          {option}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-8 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-medace-50"
                >
                  <ChevronLeft className="w-4 h-4" /> 戻る
                </button>

                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!currentAnswer}
                  className="inline-flex items-center gap-2 rounded-2xl bg-medace-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-700 disabled:opacity-50"
                >
                  {currentQuestionIndex === DIAGNOSTIC_QUESTIONS.length - 1 ? '判定を見る' : '次へ'}
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
    )
  );
};

export default Onboarding;
