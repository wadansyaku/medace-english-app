import React from 'react';
import { CheckCircle2, ChevronRight, Compass, GraduationCap, Radar, Target, X } from 'lucide-react';
import { SELF_ASSESSMENT_OPTIONS, type SelfAssessmentKey } from '../../data/diagnostic';
import type { UserGrade } from '../../types';
import MobileStepPager from '../mobile/MobileStepPager';
import OnboardingShell from './OnboardingShell';
import { ONBOARDING_GRADES } from './onboardingShared';

export interface OnboardingProfileStepProps {
  selectedGrade: UserGrade;
  selfAssessment: SelfAssessmentKey | null;
  isRetake: boolean;
  historySummary?: string;
  onCancel?: () => void;
  onSelectGrade: (grade: UserGrade) => void;
  onSelectSelfAssessment: (assessment: SelfAssessmentKey) => void;
  onStart: () => void;
}

const setupHighlights = [
  '問題は固定なので、毎回ぶれずに現在地を比較できます。',
  '文法・語彙・読解を 12 問で短く確認します。',
  '結果画面では、どこを伸ばすと次に進みやすいかまで示します。',
];

const OnboardingProfileStep: React.FC<OnboardingProfileStepProps> = ({
  selectedGrade,
  selfAssessment,
  isRetake,
  historySummary,
  onCancel,
  onSelectGrade,
  onSelectSelfAssessment,
  onStart,
}) => (
  <OnboardingShell
    testId="onboarding-profile"
    footer={
      <button
        type="button"
        data-testid="onboarding-start-button"
        onClick={onStart}
        disabled={!selfAssessment}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-base font-bold text-white transition-colors hover:bg-medace-700 disabled:opacity-50 md:mx-auto md:max-w-sm"
      >
        診断を始める <ChevronRight className="h-5 w-5" />
      </button>
    }
  >
    <section className="grid gap-4 xl:grid-cols-[1.02fr_0.98fr]">
      <div className="relative overflow-hidden rounded-[32px] bg-medace-500 p-6 text-white shadow-[0_24px_70px_rgba(255,130,22,0.2)] md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_24%)]"></div>
        <div className="relative min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-bold text-white/72">
            <Radar className="h-4 w-4" /> 初回レベル診断
          </div>
          <h1 className="mt-4 text-[1.8rem] font-black leading-tight tracking-tight md:text-[2.35rem]">
            {isRetake ? '学習スタート帯を再診断する' : '最初のスタート帯を、短時間で決める'}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/78 md:text-base">
            文法・語彙・読解を 12 問で確認し、Steady Study を始めるための推定レベルを出します。
            公式資格の判定ではなく、最初に取り組む内容を揃えるための目安です。
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              { label: '問題', value: '12' },
              { label: '所要時間', value: '4-5分' },
              { label: '入力形式', value: '選択式' },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-white/6 px-4 py-4">
                <div className="text-2xl font-black text-white">{item.value}</div>
                <div className="mt-1 text-[11px] font-bold text-white/58">{item.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-5 grid gap-3">
            {setupHighlights.map((highlight) => (
              <div key={highlight} className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-medace-200" />
                <span className="text-sm leading-relaxed text-white/86">{highlight}</span>
              </div>
            ))}
          </div>

          {isRetake && historySummary && (
            <div className="mt-5 rounded-[28px] border border-white/10 bg-white/8 px-5 py-4">
                <div className="text-[11px] font-bold text-white/58">前回の学習サマリー</div>
              <p className="mt-2 text-sm leading-relaxed text-white/84">{historySummary}</p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-[32px] border border-slate-200 bg-white p-5 shadow-xl md:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-400">診断準備</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-3xl">
              {isRetake ? 'いまの実感を更新する' : '学年と現在地を選ぶ'}
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              学年と自己認識をそろえてから診断を始めます。入力はここだけです。
            </p>
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

        <div className="mt-5">
          <MobileStepPager
            steps={[
              { id: 'grade', label: '学年・立場' },
              { id: 'assessment', label: 'いまの実感' },
            ]}
            activeStep={selfAssessment ? 1 : 0}
          />
        </div>

        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <GraduationCap className="h-4 w-4 text-medace-600" />
            <h3 className="text-sm font-black text-slate-900">1. 学年・立場</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {ONBOARDING_GRADES.map((grade) => (
              <button
                key={grade.id}
                type="button"
                onClick={() => onSelectGrade(grade.id)}
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
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

        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2">
            <Compass className="h-4 w-4 text-medace-600" />
            <h3 className="text-sm font-black text-slate-900">2. いまの実感</h3>
          </div>
          <div className="grid gap-3">
            {SELF_ASSESSMENT_OPTIONS.map((option) => {
              const isSelected = selfAssessment === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => onSelectSelfAssessment(option.id)}
                  className={`rounded-3xl border px-4 py-4 text-left transition-all ${
                    isSelected
                      ? 'border-medace-600 bg-medace-500 text-white shadow-[0_18px_40px_rgba(255,130,22,0.18)]'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className={`text-sm font-bold ${isSelected ? 'text-white' : 'text-slate-900'}`}>{option.title}</div>
                      <p className={`mt-1 text-[13px] leading-relaxed ${isSelected ? 'text-white/74' : 'text-slate-500'}`}>
                        {option.description}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      isSelected ? 'border-white/20 bg-white/10 text-white/88' : 'border-slate-200 bg-slate-50 text-slate-500'
                    }`}>
                      {option.estimatedBand}
                    </span>
                  </div>
                  <div className={`mt-2 text-[11px] font-bold ${isSelected ? 'text-medace-200' : 'text-medace-600'}`}>
                    {option.helper}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-6 rounded-[28px] border border-medace-100 bg-medace-50/70 px-4 py-4">
          <div className="flex items-start gap-3">
            <Target className="mt-0.5 h-4 w-4 shrink-0 text-medace-600" />
            <div>
              <div className="text-sm font-bold text-slate-900">診断の設計方針</div>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                最初は易しめから入り、後半で抽象度を上げます。タイピング問題は入れず、選択式で最後まで進めやすくしています。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  </OnboardingShell>
);

export default OnboardingProfileStep;
