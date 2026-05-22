import React from 'react';
import {
  ArrowRight,
  BarChart3,
  Bell,
  BookOpenText,
  CalendarClock,
  Languages,
  MessageSquareText,
  NotebookPen,
  Sparkles,
  Target,
  type LucideIcon,
} from 'lucide-react';

import type {
  StudentDashboardTaskId,
  StudentDashboardTaskItem,
} from '../../hooks/useStudentDashboardViewModel';

interface DashboardTaskOverviewRailProps {
  primaryTask: StudentDashboardTaskItem | null;
  urgentTasks: StudentDashboardTaskItem[];
  supportingTasks: StudentDashboardTaskItem[];
  referenceTasks: StudentDashboardTaskItem[];
  onSelectTask: (taskId: StudentDashboardTaskId) => void;
  onSelectReferenceTask: (taskId: StudentDashboardTaskId) => void;
  onStartPrimary: () => void;
}

const TASK_GROUP_LABELS: Record<StudentDashboardTaskItem['group'], string> = {
  primary: '最初',
  urgent: '急ぎ',
  supporting: '次',
  reference: '確認',
};

const TASK_ICON_BY_ID: Partial<Record<StudentDashboardTaskId, LucideIcon>> = {
  today: Target,
  englishPractice: Languages,
  weakness: Target,
  mission: CalendarClock,
  writing: NotebookPen,
  coach: MessageSquareText,
  plan: CalendarClock,
  library: BookOpenText,
  progress: BarChart3,
  announcements: Bell,
  companion: Sparkles,
  motivation: Sparkles,
  account: MessageSquareText,
};

const uniqueTasks = (tasks: StudentDashboardTaskItem[]): StudentDashboardTaskItem[] => {
  const seen = new Set<StudentDashboardTaskId>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
};

const actionToneClass = (task: StudentDashboardTaskItem): string => {
  if (task.group === 'primary') {
    return 'border-medace-200 bg-white text-medace-900 hover:border-medace-300 hover:bg-orange-50';
  }
  if (task.group === 'urgent' || task.id === 'mission' || task.id === 'writing') {
    return 'border-amber-200 bg-white text-amber-950 hover:border-amber-300 hover:bg-amber-50';
  }
  return 'border-orange-100 bg-white text-slate-800 hover:border-medace-200 hover:bg-white';
};

const DashboardTaskOverviewRail: React.FC<DashboardTaskOverviewRailProps> = ({
  primaryTask,
  urgentTasks,
  supportingTasks,
  referenceTasks,
  onSelectTask,
  onSelectReferenceTask,
  onStartPrimary,
}) => {
  const actionTasks = uniqueTasks([
    ...(primaryTask ? [primaryTask] : []),
    ...urgentTasks,
    ...supportingTasks,
  ]).slice(0, 3);
  const referenceShortcutTasks = uniqueTasks(referenceTasks).slice(0, 4);
  const headlineTask = primaryTask || actionTasks[0] || referenceShortcutTasks[0] || null;

  if (!headlineTask) return null;

  return (
    <section
      data-testid="dashboard-task-overview-rail"
      className="min-w-0 rounded-lg border border-orange-100 bg-medace-50/70 px-3 py-3 shadow-[0_10px_30px_rgba(194,65,12,0.05)]"
    >
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black text-medace-700">今日の順番</p>
          <h3 className="mt-0.5 truncate text-sm font-black text-slate-950">{headlineTask.title}</h3>
        </div>
        <span className="shrink-0 rounded-md border border-orange-100 bg-white px-2 py-1 text-[11px] font-bold text-slate-600">
          {headlineTask.stateLabel}
        </span>
      </div>

      {actionTasks.length > 0 && (
        <div className="mt-3 grid min-w-0 gap-2">
          {actionTasks.map((task) => {
            const Icon = TASK_ICON_BY_ID[task.id] || Target;
            return (
              <button
                key={task.id}
                type="button"
                data-testid={`dashboard-task-overview-${task.id}`}
                onClick={() => (task.id === primaryTask?.id ? onStartPrimary() : onSelectTask(task.id))}
                className={`flex min-h-11 min-w-0 items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${actionToneClass(task)}`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-current/10 bg-white/70">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[11px] font-black text-slate-500">{TASK_GROUP_LABELS[task.group]}</span>
                    <span className="block truncate text-sm font-black">{task.mobileLabel}</span>
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-1 text-right text-[11px] font-bold text-slate-500">
                  <span className="max-w-[5.6rem] truncate">{task.metricLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </span>
              </button>
            );
          })}
        </div>
      )}

      {referenceShortcutTasks.length > 0 && (
        <div className="mt-3 flex min-w-0 flex-wrap gap-2 border-t border-orange-100 pt-3">
          <span className="mr-1 self-center text-[11px] font-black text-slate-400">あとで見る</span>
          {referenceShortcutTasks.map((task) => {
            const Icon = TASK_ICON_BY_ID[task.id] || BookOpenText;
            return (
              <button
                key={task.id}
                type="button"
                data-testid={`dashboard-task-reference-${task.id}`}
                onClick={() => onSelectReferenceTask(task.id)}
                className="inline-flex min-h-9 min-w-0 items-center gap-1.5 rounded-md border border-orange-100 bg-white px-2.5 py-1.5 text-xs font-black text-slate-700 transition-colors hover:border-medace-200 hover:text-medace-800"
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{task.mobileLabel}</span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default DashboardTaskOverviewRail;
