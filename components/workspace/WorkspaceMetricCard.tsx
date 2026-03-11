import React from 'react';

interface WorkspaceMetricCardProps {
  label: string;
  value: string;
  detail: string;
  tone?: 'default' | 'accent' | 'warning' | 'danger' | 'success';
}

const TONE_CLASS: Record<NonNullable<WorkspaceMetricCardProps['tone']>, string> = {
  default: 'border-slate-200 bg-white text-slate-950',
  accent: 'border-medace-200 bg-medace-50 text-slate-950',
  warning: 'border-amber-200 bg-amber-50 text-slate-950',
  danger: 'border-red-200 bg-red-50 text-slate-950',
  success: 'border-emerald-200 bg-emerald-50 text-slate-950',
};

const WorkspaceMetricCard: React.FC<WorkspaceMetricCardProps> = ({
  label,
  value,
  detail,
  tone = 'default',
}) => (
  <div className={`rounded-[28px] border p-5 shadow-sm ${TONE_CLASS[tone]}`}>
    <div className="text-sm font-bold text-slate-500">{label}</div>
    <div className="mt-3 text-3xl font-black tracking-tight">{value}</div>
    <div className="mt-2 text-sm text-slate-500">{detail}</div>
  </div>
);

export default WorkspaceMetricCard;
