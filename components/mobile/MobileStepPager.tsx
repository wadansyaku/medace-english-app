import React from 'react';

interface MobileStepPagerProps {
  steps: Array<{
    id: string;
    label: string;
    description?: string;
  }>;
  activeStep: number;
  onSelectStep?: (index: number) => void;
}

const MobileStepPager: React.FC<MobileStepPagerProps> = ({ steps, activeStep, onSelectStep }) => (
  <div className="flex gap-2 overflow-x-auto pb-1">
    {steps.map((step, index) => {
      const isActive = index === activeStep;
      const isAvailable = index <= activeStep;
      return (
        <button
          key={step.id}
          type="button"
          onClick={() => onSelectStep?.(index)}
          disabled={!onSelectStep || !isAvailable}
          className={`min-w-[120px] shrink-0 rounded-2xl border px-4 py-3 text-left transition-colors ${
            isActive
              ? 'border-medace-600 bg-medace-50 text-medace-900'
              : isAvailable
                ? 'border-slate-200 bg-white text-slate-700'
                : 'border-slate-200 bg-slate-100 text-slate-400'
          }`}
        >
          <div className="text-[11px] font-black">
            手順 {index + 1}
          </div>
          <div className="mt-2 text-sm font-bold">{step.label}</div>
          {step.description && (
            <div className="mt-1 text-xs leading-relaxed opacity-80">{step.description}</div>
          )}
        </button>
      );
    })}
  </div>
);

export default MobileStepPager;
