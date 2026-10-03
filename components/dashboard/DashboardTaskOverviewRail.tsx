import React from 'react';
import { BarChart3, BookOpenText, ChevronDown } from 'lucide-react';
import type { StudentDashboardTaskId, StudentDashboardTaskItem } from '../../hooks/useStudentDashboardViewModel';

interface DashboardTaskOverviewRailProps {
  referenceTasks: StudentDashboardTaskItem[];
  activeSection?: StudentDashboardTaskId | null;
  onSelectReferenceTask: (taskId: StudentDashboardTaskId) => void;
}

/** One resource entry per destination; low-frequency tools stay outside the learning action. */
const DashboardTaskOverviewRail: React.FC<DashboardTaskOverviewRailProps> = ({ referenceTasks, activeSection, onSelectReferenceTask }) => {
  const menuRef = React.useRef<HTMLDetailsElement>(null);
  const tasks = referenceTasks.filter((task, index, all) => all.findIndex(candidate => candidate.id === task.id) === index);
  const core = tasks.filter(task => task.id === 'library' || task.id === 'progress');
  const other = tasks.filter(task => task.id !== 'library' && task.id !== 'progress');
  if (!tasks.length) return null;
  const select = (id: StudentDashboardTaskId) => {
    if (menuRef.current) menuRef.current.open = false;
    onSelectReferenceTask(id);
  };
  return (
    <nav aria-label="教材・学習記録" data-testid="dashboard-task-overview-rail" className="flex min-w-0 flex-wrap items-start gap-2">
      {core.map(task => {
        const Icon = task.id === 'library' ? BookOpenText : BarChart3;
        return <button key={task.id} type="button" data-testid={`dashboard-task-reference-${task.id}`} aria-pressed={activeSection === task.id} onClick={() => select(task.id)} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-bold ${activeSection === task.id ? 'border-medace-300 bg-medace-50 text-medace-900' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}><Icon className="h-4 w-4" aria-hidden="true" />{task.id === 'library' ? '教材' : '学習記録'}</button>;
      })}
      {other.length > 0 && <details ref={menuRef} className="min-w-0 rounded-lg border border-slate-200 bg-white" onKeyDown={event => {
        if (event.key === 'Escape' && menuRef.current?.open) {
          event.preventDefault(); menuRef.current.open = false;
          menuRef.current.querySelector('summary')?.focus();
        }
      }}>
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 py-2 text-sm font-bold text-slate-600">その他<ChevronDown className="h-4 w-4" aria-hidden="true" /></summary>
        <div className="grid gap-1 border-t border-slate-100 p-2 sm:grid-cols-2">
          {other.map(task => <button key={task.id} type="button" data-testid={`dashboard-task-reference-${task.id}`} aria-pressed={activeSection === task.id} onClick={() => select(task.id)} className="min-h-11 rounded-md px-3 py-2 text-left text-sm font-bold text-slate-700 hover:bg-slate-50">{task.mobileLabel}</button>)}
        </div>
      </details>}
    </nav>
  );
};
export default DashboardTaskOverviewRail;
