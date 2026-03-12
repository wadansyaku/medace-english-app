import React from 'react';
import { ChevronRight, Sparkles, Target, X } from 'lucide-react';
import { DIAGNOSTIC_PHASE_LABELS, type DiagnosticResult } from '../../data/diagnostic';
import type { EnglishLevel } from '../../types';
import OnboardingShell from './OnboardingShell';
import { LEVEL_BADGE_STYLE } from './onboardingShared';

export interface OnboardingResultStepProps {
  result: DiagnosticResult;
  finalLevel: EnglishLevel;
  isSaving: boolean;
  isRetake: boolean;
  historySummary?: string;
  onCancel?: () => void;
  onSave: () => void;
}

const OnboardingResultStep: React.FC<OnboardingResultStepProps> = ({
  result,
  finalLevel,
  isSaving,
  isRetake,
  historySummary,
  onCancel,
  onSave,
}) => {
  const reviewItems = result.reviewItems.filter((item) => !item.isCorrect).slice(0, 3);

  return (
    <OnboardingShell
      testId="onboarding-result"
      footer={
        <button
          type="button"
          data-testid="onboarding-save-button"
          onClick={onSave}
          disabled={isSaving}
          className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-base font-bold text-white transition-colors hover:bg-medace-700 disabled:opacity-50 md:mx-auto md:max-w-sm"
        >
          {isSaving ? '保存中...' : 'このレベルで学習を始める'}
          {!isSaving && <ChevronRight className="h-5 w-5" />}
        </button>
      }
    >
      <section className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
        <div className="space-y-4">
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-xl md:p-7">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Placement Result</p>
                <h2 className="mt-2 text-[1.85rem] font-black tracking-tight text-slate-950 md:text-[2.5rem]">
                  推定スタート帯は {finalLevel}
                </h2>
              </div>
              {isRetake && onCancel && (
                <button
                  type="button"
                  onClick={onCancel}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <X className="h-4 w-4" /> 閉じる
                </button>
              )}
            </div>

            <p className="mt-3 text-sm leading-relaxed text-slate-600 md:text-base">{result.summaryBody}</p>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className={`rounded-[28px] border px-5 py-5 ${LEVEL_BADGE_STYLE[finalLevel]}`}>
                <div className="text-[11px] font-bold uppercase tracking-[0.16em]">Estimated Level</div>
                <div className="mt-2 text-4xl font-black tracking-tight">{finalLevel}</div>
                <div className="mt-1 text-sm font-medium">{result.summaryTitle}</div>
              </div>
              <div className="rounded-[28px] border border-medace-100 bg-medace-50/75 px-5 py-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">Confidence</div>
                <div className="mt-2 text-2xl font-black text-slate-900">{result.confidence === 'HIGH' ? '高め' : '標準'}</div>
                <div className="mt-1 text-sm text-slate-600">{result.correctCount} / {result.totalQuestions} 問正解</div>
                <div className="mt-1 text-sm text-slate-500">Weighted score {result.weightedScore}</div>
              </div>
            </div>

            <div className="mt-4 rounded-[28px] border border-medace-100 bg-[#fff8ef] px-4 py-4 text-sm leading-relaxed text-medace-900/80">
              {result.alignmentNote}
            </div>
          </div>

          <div className="rounded-[32px] border border-medace-600 bg-medace-500 p-5 text-white shadow-xl md:p-7">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/55">おすすめペース</div>
            <div className="mt-3 text-4xl font-black tracking-tight">
              {result.recommendedDailyGoal}
              <span className="ml-1 text-lg text-white/65">語 / 日</span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-white/78">
              最初の 2 週間は、このペースで復習を崩さず回せるかを優先してください。詰め込みより、翌日も再現できることが重要です。
            </p>
          </div>

          {isRetake && historySummary && (
            <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">前回の学習サマリー</div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{historySummary}</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="flex items-center gap-2">
              <Target className="h-5 w-5 text-medace-600" />
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Next Focus</div>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">このスタート帯で意識すること</h3>
              </div>
            </div>
            <div className="mt-5 grid gap-3">
              {result.nextFocus.map((focus) => (
                <div key={focus} className="rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4 text-sm leading-relaxed text-slate-700">
                  {focus}
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-medace-600" />
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Breakdown</div>
                <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">診断の内訳</h3>
              </div>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {(Object.entries(result.phaseScores) as Array<[keyof typeof result.phaseScores, { correct: number; total: number }]>).map(([phase, score]) => (
                <div key={phase} className="rounded-[28px] border border-medace-100 bg-[#fff8ef] px-4 py-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{DIAGNOSTIC_PHASE_LABELS[phase]}</div>
                  <div className="mt-2 text-3xl font-black text-slate-900">
                    {score.correct}
                    <span className="text-lg text-slate-400">/{score.total}</span>
                  </div>
                  <div className="mt-1 text-sm text-slate-600">
                    {phase === 'warmup' ? '基礎の安定度' : phase === 'core' ? '標準的な文脈力' : '上位帯の伸びしろ'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Skill Review</div>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">スキル別コメント</h3>
            <div className="mt-5 grid gap-3">
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
          </div>

          <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Review</div>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">見直すと効く問題</h3>
            <div className="mt-5 space-y-3">
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
              {reviewItems.length === 0 && (
                <div className="rounded-3xl border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                  取りこぼしはありませんでした。今の帯で十分にスタートできます。
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </OnboardingShell>
  );
};

export default OnboardingResultStep;
