import React, { useEffect, useRef } from 'react';
import { ArrowRight } from 'lucide-react';

export interface OnboardingChoiceStepProps {
  isSaving: boolean;
  saveError?: string | null;
  onStartLearning: () => void;
  onChooseDiagnostic: () => void;
}

const OnboardingChoiceStep: React.FC<OnboardingChoiceStepProps> = ({
  isSaving,
  saveError,
  onStartLearning,
  onChooseDiagnostic,
}) => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => { headingRef.current?.focus(); }, []);

  return (
    <div data-testid="onboarding-choice" className="bg-[#FDF3ED] px-3 py-5 sm:px-6 sm:py-10">
      <section aria-labelledby="onboarding-choice-heading" aria-busy={isSaving} className="mx-auto max-w-xl rounded-panel border border-slate-200 bg-white p-5 shadow-panel sm:p-8">
        <p className="text-xs font-bold text-slate-500">Steady Study</p>
        <h1 id="onboarding-choice-heading" ref={headingRef} tabIndex={-1} className="mt-2 text-2xl font-black leading-tight tracking-tight text-slate-950 focus:outline-none sm:text-3xl">
          さっそく学習を始めましょう
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          まずは入門の少量練習から。レベル診断は任意で、あとから設定で受けられます。
        </p>
        <div className="mt-5 grid gap-3">
          <button
            type="button"
            data-testid="onboarding-skip-button"
            disabled={isSaving}
            onClick={onStartLearning}
            className="flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-steady-action px-3 py-3 text-base font-bold text-steady-on-action transition-colors hover:bg-steady-action-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steady-action disabled:opacity-50"
          >
            {isSaving ? '保存中...' : '今すぐ学習を始める'}
            {!isSaving && <ArrowRight aria-hidden="true" className="h-5 w-5 shrink-0" />}
          </button>
          <button
            type="button"
            data-testid="onboarding-choose-diagnostic-button"
            disabled={isSaving}
            onClick={onChooseDiagnostic}
            className="min-h-12 rounded-2xl border border-slate-200 bg-white px-3 py-3 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-steady-action disabled:opacity-50"
          >
            レベルを確認する（任意・12問）
          </button>
        </div>
        {saveError && <p role="alert" data-testid="onboarding-defer-error" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800">{saveError}</p>}
        {isSaving && <p role="status" className="mt-4 text-sm leading-relaxed text-slate-600">学習開始の設定を保存しています。</p>}
      </section>
    </div>
  );
};

export default OnboardingChoiceStep;
