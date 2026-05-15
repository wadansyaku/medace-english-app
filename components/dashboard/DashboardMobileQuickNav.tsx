import React from 'react';
import { createPortal } from 'react-dom';
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

const DashboardMobileQuickNav: React.FC<DashboardMobileQuickNavProps> = ({ items }) => {
  const visibleItems = items.slice(0, 4);

  const launcher = (
    <div
      data-testid="dashboard-mobile-quick-nav"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+var(--safe-bottom))] md:hidden"
    >
      <nav
        aria-label="今日の操作"
        className="pointer-events-auto mx-auto max-w-3xl rounded-[24px] border border-slate-200 bg-white/96 p-2 shadow-[0_18px_40px_rgba(15,23,42,0.16)] backdrop-blur"
      >
        <div className="flex min-w-0 gap-2">
          {visibleItems.map((item, index) => {
            const Icon = ICON_BY_KIND[item.kind];
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`dashboard-quicknav-${item.id}`}
                aria-pressed={item.active}
                onClick={item.onClick}
                className={`flex min-h-12 min-w-0 ${index === 0 ? 'flex-[1.35]' : 'flex-1'} items-center justify-center gap-2 rounded-2xl px-2.5 py-2 text-center transition-colors ${
                  item.active
                    ? 'bg-medace-700 text-white shadow-sm'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="truncate text-[11px] font-black">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );

  if (typeof document === 'undefined') return launcher;

  return createPortal(launcher, document.body);
};

export default DashboardMobileQuickNav;
