import React from 'react';

interface WorkspaceStageStripProps {
  steps: Array<{
    id: string;
    index: number;
    label: string;
    value: string;
    hint: string;
    active?: boolean;
  }>;
}

const WorkspaceStageStrip: React.FC<WorkspaceStageStripProps> = ({ steps }) => (
  <div className="grid gap-3 lg:grid-cols-4">
    {steps.map((step) => (
      <div
        key={step.id}
        className={`rounded-3xl border px-4 py-4 ${
          step.active
            ? 'border-medace-300 bg-medace-50'
            : 'border-slate-200 bg-white'
        }`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Step {step.index}</div>
          <div className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${step.active ? 'bg-medace-700 text-white' : 'bg-slate-100 text-slate-500'}`}>
            {step.label}
          </div>
        </div>
        <div className="mt-3 text-2xl font-black tracking-tight text-slate-950">{step.value}</div>
        <div className="mt-2 text-sm leading-relaxed text-slate-500">{step.hint}</div>
      </div>
    ))}
  </div>
);

export default WorkspaceStageStrip;
