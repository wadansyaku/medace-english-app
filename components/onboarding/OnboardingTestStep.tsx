import React from 'react';
import { ChevronLeft, ChevronRight, Sparkles, X } from 'lucide-react';
import { DIAGNOSTIC_PHASE_LABELS, DIAGNOSTIC_QUESTIONS, type DiagnosticQuestion } from '../../data/diagnostic';
import { GRADE_LABELS, type UserGrade } from '../../types';
import OnboardingShell from './OnboardingShell';
import { getDiagnosticPhaseExplanation, getDiagnosticSkillLabel, LEVEL_BADGE_STYLE } from './onboardingShared';

export interface OnboardingTestStepProps {
  selectedGrade: UserGrade;
  currentQuestion: DiagnosticQuestion;
  currentQuestionIndex: number;
  answeredCount: number;
  progressPercent: number;
  currentAnswer: string;
  isRetake: boolean;
  onCancel?: () => void;
  onSelectAnswer: (answer: string) => void;
  onBack: () => void;
  onNext: () => void;
}

const OnboardingTestStep: React.FC<OnboardingTestStepProps> = ({
  selectedGrade,
  currentQuestion,
  currentQuestionIndex,
  answeredCount,
  progressPercent,
  currentAnswer,
  isRetake,
  onCancel,
  onSelectAnswer,
  onBack,
  onNext,
}) => (
  <OnboardingShell
    testId="onboarding-test"
    footer={
      <div className="grid grid-cols-2 gap-3 md:flex md:justify-between">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-medace-50 md:min-w-[160px]"
        >
          <ChevronLeft className="h-4 w-4" /> 戻る
        </button>
        <button
          type="button"
          data-testid="onboarding-next-button"
          onClick={onNext}
          disabled={!currentAnswer}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-medace-700 disabled:opacity-50 md:min-w-[180px]"
        >
          {currentQuestionIndex === DIAGNOSTIC_QUESTIONS.length - 1 ? '判定を見る' : '次へ'}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    }
  >
    <section className="grid gap-3 xl:grid-cols-[0.38fr_0.62fr] xl:gap-4">
      <div className="space-y-3 md:space-y-4">
        <div className="relative overflow-hidden rounded-[24px] border border-medace-200 bg-medace-50 p-4 text-slate-950 shadow-[0_18px_44px_rgba(255,122,0,0.12)] md:rounded-[32px] md:p-6">
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-medace-200 bg-white px-3 py-1 text-[11px] font-bold text-medace-800">
                  {getDiagnosticSkillLabel(currentQuestion.skill)}
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-950 md:mt-3 md:text-2xl">第 {currentQuestionIndex + 1} 問</h2>
              </div>
              <div className={`hidden rounded-full border px-3 py-1 text-xs font-bold sm:block ${LEVEL_BADGE_STYLE[currentQuestion.level]}`}>
                {currentQuestion.level}
              </div>
            </div>

            {isRetake && onCancel && (
              <div className="mt-4 flex justify-end">
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-medace-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-medace-100"
                >
                  <X className="h-4 w-4" /> 閉じる
                </button>
              </div>
            )}

            <div className="mt-5 hidden gap-3 sm:grid sm:grid-cols-2">
              <div className="rounded-2xl border border-medace-200 bg-white px-4 py-3">
                <div className="text-[11px] font-bold text-slate-500">進捗</div>
                <div className="mt-2 text-base font-black text-slate-950">
                  {currentQuestionIndex + 1} / {DIAGNOSTIC_QUESTIONS.length}
                </div>
              </div>
              <div className="rounded-2xl border border-medace-200 bg-white px-4 py-3">
                <div className="text-[11px] font-bold text-slate-500">回答済み</div>
                <div className="mt-2 text-base font-black text-slate-950">{answeredCount} 問</div>
              </div>
            </div>

            <div data-testid="onboarding-test-mobile-progress" className="mt-4 md:mt-5">
              <div className="mb-2 flex justify-between text-[11px] font-bold text-slate-500">
                <span className="sm:hidden">{currentQuestionIndex + 1} / {DIAGNOSTIC_QUESTIONS.length}</span>
                <span className="hidden sm:inline">全体の進み具合</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-medace-100">
                <div className="h-full rounded-full bg-medace-500 transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>

            <div className="mt-5 hidden rounded-[28px] border border-medace-200 bg-white px-4 py-4 sm:block">
              <div className="text-[11px] font-bold text-slate-500">現在見ている帯</div>
              <div className="mt-2 text-base font-black text-slate-950">
                {DIAGNOSTIC_PHASE_LABELS[currentQuestion.phase]} · {currentQuestion.level}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                {getDiagnosticPhaseExplanation(currentQuestion.phase)}
              </p>
            </div>
          </div>
        </div>

        <div className="hidden rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:block">
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Sparkles className="h-4 w-4 text-medace-600" />
            この問題で見ていること
          </div>
          <div className="mt-4 grid gap-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold text-slate-400">学年・立場</div>
              <div className="mt-2 text-sm font-black text-slate-950">{GRADE_LABELS[selectedGrade]}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[11px] font-bold text-slate-400">スキル</div>
              <div className="mt-2 text-sm font-black text-slate-950">{getDiagnosticSkillLabel(currentQuestion.skill)}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
              {getDiagnosticPhaseExplanation(currentQuestion.phase)}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-xl md:rounded-[32px] md:p-7">
        <div className="rounded-[22px] border border-medace-100 bg-[#fff8ef] p-4 md:rounded-[28px] md:p-5">
          {currentQuestion.prompt && (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-relaxed text-slate-600 whitespace-pre-wrap">
              {currentQuestion.prompt}
            </div>
          )}
          <h3 className={`font-black leading-relaxed tracking-tight text-slate-950 whitespace-pre-wrap ${currentQuestion.prompt ? 'mt-4 text-[1.35rem]' : 'text-[1.35rem]'} md:text-[1.65rem]`}>
            {currentQuestion.question}
          </h3>
        </div>

        <div className="mt-5 grid gap-3">
          {currentQuestion.options.map((option, index) => {
            const isSelected = currentAnswer === option;
            return (
              <button
                key={option}
                type="button"
                data-testid="diagnostic-option"
                onClick={() => onSelectAnswer(option)}
                className={`rounded-2xl border px-4 py-3 text-left transition-all md:rounded-3xl md:py-4 ${
                  isSelected
                    ? 'border-medace-500 bg-medace-50 text-slate-950 shadow-[0_18px_40px_rgba(255,122,0,0.12)]'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-black ${
                    isSelected ? 'border-medace-200 bg-white text-medace-800' : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}>
                    {String.fromCharCode(65 + index)}
                  </div>
                  <div className={`text-sm leading-relaxed font-medium md:text-[15px] ${isSelected ? 'text-slate-950' : 'text-slate-800'}`}>
                    {option}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  </OnboardingShell>
);

export default OnboardingTestStep;
