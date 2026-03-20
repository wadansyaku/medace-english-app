import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface WorkspaceHeroAction {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  testId?: string;
}

interface WorkspaceDashboardShellProps {
  testId: string;
  eyebrow: string;
  title: string;
  body: string;
  children: React.ReactNode;
  notice?: React.ReactNode;
  banner?: React.ReactNode;
  context?: React.ReactNode;
  userBadge?: React.ReactNode;
  actions?: WorkspaceHeroAction[];
  className?: string;
}

const getActionClassName = (variant: WorkspaceHeroAction['variant']) => (
  variant === 'secondary'
    ? 'border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/15'
    : 'bg-white text-medace-900 transition-colors hover:bg-medace-50'
);

const WorkspaceDashboardShell: React.FC<WorkspaceDashboardShellProps> = ({
  testId,
  eyebrow,
  title,
  body,
  children,
  notice,
  banner,
  context,
  userBadge,
  actions = [],
  className = '',
}) => (
  <div data-testid={testId} className={`space-y-8 pb-12 ${className}`.trim()}>
    {notice}
    {banner}

    <section className="relative overflow-hidden rounded-[32px] bg-medace-500 p-8 text-white shadow-[0_24px_60px_rgba(255,130,22,0.22)]">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.26),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_22%)]" />
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {context}
          </div>
          {userBadge}
        </div>

        <div className="mt-6 max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-white/60">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight">{title}</h2>
          <p className="mt-4 text-sm leading-relaxed text-white/78">{body}</p>
        </div>

        {actions.length > 0 && (
          <div className="mt-7 flex flex-wrap gap-3">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.label}
                  type="button"
                  data-testid={action.testId}
                  onClick={action.onClick}
                  className={`inline-flex items-center gap-2 rounded-2xl px-5 py-3 text-sm font-bold ${getActionClassName(action.variant)}`}
                >
                  {Icon && <Icon className="h-4 w-4" />}
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>

    {children}
  </div>
);

export type { WorkspaceHeroAction };
export default WorkspaceDashboardShell;
