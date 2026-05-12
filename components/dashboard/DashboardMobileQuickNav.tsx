import React from 'react';
import {
  BookOpenText,
  Flag,
  Languages,
  MessageSquareText,
  NotebookPen,
  Target,
  type LucideIcon,
} from 'lucide-react';

type DashboardMobileQuickNavKind = 'today' | 'englishPractice' | 'weakness' | 'mission' | 'writing' | 'coach' | 'plan' | 'library';

export interface DashboardMobileQuickNavItem {
  id: string;
  label: string;
  kind: DashboardMobileQuickNavKind;
  active: boolean;
  onClick: () => void;
}

const ICON_BY_KIND: Record<DashboardMobileQuickNavKind, LucideIcon> = {
  today: Target,
  englishPractice: Languages,
  weakness: Target,
  mission: Flag,
  writing: NotebookPen,
  coach: MessageSquareText,
  plan: MessageSquareText,
  library: BookOpenText,
};

interface DashboardMobileQuickNavProps {
  items: DashboardMobileQuickNavItem[];
}

const DashboardMobileQuickNav: React.FC<DashboardMobileQuickNavProps> = ({ items }) => (
  <div
    data-testid="dashboard-mobile-quick-nav"
    className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-4 pb-[calc(0.75rem+var(--safe-bottom))] md:hidden"
  >
    <nav className="pointer-events-auto mx-auto max-w-3xl rounded-[26px] border border-slate-200 bg-white/96 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur">
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const Icon = ICON_BY_KIND[item.kind];
          return (
            <button
              key={item.id}
              type="button"
              data-testid={`dashboard-quicknav-${item.id}`}
              aria-pressed={item.active}
              onClick={item.onClick}
              className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-center transition-colors ${
                item.active
                  ? 'bg-medace-700 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-[11px] font-bold tracking-[0.04em]">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  </div>
);

export default DashboardMobileQuickNav;
