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
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-medace-700 disabled:opacity-50 md:min-w-[180px]"
        >
          {currentQuestionIndex === DIAGNOSTIC_QUESTIONS.length - 1 ? '判定を見る' : '次へ'}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    }
  >
    <section className="grid gap-4 xl:grid-cols-[0.38fr_0.62fr]">
      <div className="space-y-4">
        <div className="relative overflow-hidden rounded-[32px] bg-medace-500 p-5 text-white shadow-[0_22px_60px_rgba(255,130,22,0.2)] md:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_26%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_24%)]"></div>
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] font-bold text-white/75">
                  {getDiagnosticSkillLabel(currentQuestion.skill)}
                </div>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-white">第 {currentQuestionIndex + 1} 問</h2>
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
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-sm font-bold text-white/82 transition-colors hover:bg-white/12"
                >
                  <X className="h-4 w-4" /> 閉じる
                </button>
              </div>
            )}

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
                <div className="text-[11px] font-bold text-white/55">進捗</div>
                <div className="mt-2 text-base font-black text-white">
                  {currentQuestionIndex + 1} / {DIAGNOSTIC_QUESTIONS.length}
                </div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/8 px-4 py-3">
                <div className="text-[11px] font-bold text-white/55">回答済み</div>
                <div className="mt-2 text-base font-black text-white">{answeredCount} 問</div>
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 flex justify-between text-[11px] font-bold text-white/58">
                <span>全体の進み具合</span>
                <span>{progressPercent}%</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/12">
                <div className="h-full rounded-full bg-white/90 transition-all duration-300" style={{ width: `${progressPercent}%` }}></div>
              </div>
            </div>

            <div className="mt-5 rounded-[28px] border border-white/10 bg-white/8 px-4 py-4">
              <div className="text-[11px] font-bold text-white/58">現在見ている帯</div>
              <div className="mt-2 text-base font-black text-white">
                {DIAGNOSTIC_PHASE_LABELS[currentQuestion.phase]} · {currentQuestion.level}
              </div>
              <p className="mt-2 text-sm leading-relaxed text-white/76">
                {getDiagnosticPhaseExplanation(currentQuestion.phase)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
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

      <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-xl md:p-7">
        <div className="rounded-[28px] border border-medace-100 bg-[#fff8ef] p-5">
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
                  <div className={`text-sm leading-relaxed font-medium md:text-[15px] ${isSelected ? 'text-white' : 'text-slate-800'}`}>
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
