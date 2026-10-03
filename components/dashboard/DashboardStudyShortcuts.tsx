import React from 'react';
import { ArrowRight, BarChart3, BookOpenText, ClipboardCheck } from 'lucide-react';
import type { BookMetadata } from '../../types';

interface DashboardStudyShortcutsProps {
  quizBook: BookMetadata | null;
  hasProgress: boolean;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  onOpenLibrary: () => void;
  onOpenProgress: () => void;
}

const DashboardStudyShortcuts: React.FC<DashboardStudyShortcutsProps> = ({
  quizBook,
  hasProgress,
  onSelectBook,
  onOpenLibrary,
  onOpenProgress,
}) => {
  const items = [
    {
      id: 'quick-quiz',
      title: '小テストで確かめる',
      helper: quizBook?.title || '教材を用意すると利用できます',
      icon: ClipboardCheck,
      disabled: !quizBook,
      onClick: () => { if (quizBook) onSelectBook(quizBook.id, 'quiz'); },
    },
    {
      id: 'quick-library',
      title: '教材を選ぶ',
      helper: '配布教材・My単語帳',
      icon: BookOpenText,
      disabled: false,
      onClick: onOpenLibrary,
    },
    {
      id: 'quick-progress',
      title: '学習記録を振り返る',
      helper: hasProgress ? '週間の学習記録・定着状況' : '学習を始めると記録が表示されます',
      icon: BarChart3,
      disabled: !hasProgress,
      onClick: onOpenProgress,
    },
  ];

  return (
    <nav aria-label="学習のショートカット" data-testid="dashboard-study-shortcuts" className="order-2 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
      {items.map(({ id, title, helper, icon: Icon, disabled, onClick }) => (
        <button
          key={id}
          type="button"
          data-testid={`dashboard-${id}`}
          disabled={disabled}
          onClick={onClick}
          className="flex min-h-16 min-w-0 items-center gap-3 rounded-card border border-medace-100 bg-white px-4 py-3 text-left transition-colors hover:border-medace-200 hover:bg-medace-50 disabled:opacity-60"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-medace-50 text-medace-900">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-black text-steady-ink">{title}</span>
            <span className="mt-0.5 block truncate text-[11px] text-steady-muted">{helper}</span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-steady-muted" aria-hidden="true" />
        </button>
      ))}
    </nav>
  );
};

export default DashboardStudyShortcuts;
