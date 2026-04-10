import type { useBusinessAdminDashboardController } from '../../../hooks/useBusinessAdminDashboardController';
import { StudentRiskLevel } from '../../../types';

export type BusinessAdminDashboardController = ReturnType<typeof useBusinessAdminDashboardController>;

export const riskTone = (riskLevel: StudentRiskLevel): string => {
  if (riskLevel === StudentRiskLevel.DANGER) return 'border-red-200 bg-red-50 text-red-700';
  if (riskLevel === StudentRiskLevel.WARNING) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

export const riskLabel = (riskLevel: StudentRiskLevel): string => {
  if (riskLevel === StudentRiskLevel.DANGER) return '要フォロー';
  if (riskLevel === StudentRiskLevel.WARNING) return '見守り';
  return '安定';
};

export const formatDays = (timestamp: number): string => {
  if (!timestamp) return '未学習';
  const days = Math.max(0, Math.floor((Date.now() - timestamp) / 86400000));
  if (days === 0) return '今日';
  return `${days}日前`;
};

export const formatDateTime = (timestamp: number): string =>
  new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export const formatTrendDate = (dateKey: string): string =>
  new Date(`${dateKey}T00:00:00+09:00`).toLocaleDateString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
  });

export const weaknessTone = (score = 0): string => (
  score >= 55
    ? 'border-red-200 bg-red-50 text-red-700'
    : score >= 30
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700'
);

export const cohortTone = (cohortName?: string): string => (
  cohortName
    ? 'border-sky-200 bg-sky-50 text-sky-700'
    : 'border-dashed border-slate-200 bg-white text-slate-500'
);

export const cohortLabel = (cohortName?: string): string => cohortName || '未設定';
