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
  hideHero?: boolean;
  className?: string;
}

const getActionClassName = (variant: WorkspaceHeroAction['variant']) => (
  variant === 'secondary'
    ? 'border border-[#2F1609]/15 bg-[#FDF3ED] text-[#2F1609] transition-colors hover:bg-white'
    : 'bg-white text-[#2F1609] transition-colors hover:bg-[#FDF3ED]'
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
  hideHero = false,
  className = '',
}) => (
  <div data-testid={testId} className={`space-y-8 pb-12 ${className}`.trim()}>
    {notice}
    {banner}

    {!hideHero && <section className="relative overflow-hidden rounded-[32px] bg-medace-600 p-8 text-[#2F1609] shadow-[0_24px_60px_rgba(255,122,0,0.16)]">
      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            {context}
          </div>
          {userBadge}
        </div>

        <div className="mt-6 max-w-3xl">
          <p className="text-xs font-bold text-[#2F1609]">{eyebrow}</p>
          <h2 className="mt-3 text-3xl font-black tracking-tight">{title}</h2>
          <p className="mt-4 text-sm leading-relaxed text-[#2F1609]">{body}</p>
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
    </section>}

    {children}
  </div>
);

export type { WorkspaceHeroAction };
export default WorkspaceDashboardShell;
