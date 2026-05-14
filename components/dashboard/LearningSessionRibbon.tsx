import React from 'react';
import { BookOpenCheck, Brain, Flame, Medal, type LucideIcon } from 'lucide-react';

export type LearningSessionKind = 'review' | 'weakness' | 'mission' | 'streak';

export interface LearningSessionRibbonItem {
  id: string;
  kind: LearningSessionKind;
  label: string;
  value: string;
  helper: string;
  active?: boolean;
}

interface LearningSessionRibbonProps {
  title?: string;
  items: LearningSessionRibbonItem[];
  isCompact?: boolean;
}

const kindIcon: Record<LearningSessionKind, LucideIcon> = {
  review: BookOpenCheck,
  weakness: Brain,
  mission: Medal,
  streak: Flame,
};

const kindClass: Record<LearningSessionKind, string> = {
  review: 'border-sky-200 bg-sky-50 text-sky-700',
  weakness: 'border-medace-200 bg-medace-50 text-medace-700',
  mission: 'border-violet-200 bg-violet-50 text-violet-700',
  streak: 'border-rose-200 bg-rose-50 text-rose-700',
};

const LearningSessionRibbon: React.FC<LearningSessionRibbonProps> = ({
  title = '今日の材料',
  items,
  isCompact = false,
}) => {
  const visibleItems = items.slice(0, 6);

  if (visibleItems.length === 0) {
    return null;
  }

  return (
    <section className={`rounded-[28px] border border-slate-200 bg-white shadow-sm ${isCompact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-black text-slate-950">{title}</h3>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-500">
          {visibleItems.length}項目
        </span>
      </div>

      <div className={`mt-4 grid gap-2 ${isCompact ? '' : 'sm:grid-cols-2 xl:grid-cols-4'}`}>
        {visibleItems.map((item) => {
          const Icon = kindIcon[item.kind];
          return (
            <article
              key={item.id}
              className={`min-w-0 rounded-2xl border px-4 py-3 ${kindClass[item.kind]} ${
                item.active ? 'ring-2 ring-medace-300 ring-offset-2' : ''
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/85">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-black text-slate-950">{item.label}</div>
                    <div className="mt-0.5 truncate text-xs font-bold text-slate-500">{item.helper}</div>
                  </div>
                </div>
                <div className="shrink-0 text-right text-lg font-black text-slate-950">{item.value}</div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default LearningSessionRibbon;
