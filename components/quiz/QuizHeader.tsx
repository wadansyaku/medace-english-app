import React from 'react';
import { ArrowLeft } from 'lucide-react';

interface QuizHeaderProps {
  title: string;
  subtitle: string;
  bookLabel?: string;
  onBack: () => void;
  compact?: boolean;
}

const QuizHeader: React.FC<QuizHeaderProps> = ({
  title,
  subtitle,
  bookLabel,
  onBack,
  compact = false,
}) => (
  <div
    className={compact ? 'rounded-2xl border border-slate-200 bg-white px-3 py-2' : '-mx-4 border-b border-slate-200 bg-white/95 px-4 pb-3 sm:mx-0 sm:rounded-[28px] sm:border sm:px-5 sm:pb-4 sm:pt-4'}
    style={compact ? undefined : { paddingTop: 'calc(0.85rem + var(--safe-top))' }}
  >
    <div className="flex items-start gap-3">
      <button
        type="button"
        onClick={onBack}
        data-testid="quiz-back-button"
        aria-label="前の画面に戻る"
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:border-medace-300 hover:text-medace-700"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        {!compact && <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">Quiz Flow</div>}
        {!compact && bookLabel && <p data-testid="quiz-book-label" className="mt-1 break-words text-xs font-bold text-medace-800">{bookLabel}</p>}
        <h1 className={compact ? 'text-base font-bold text-slate-950' : 'mt-1 text-lg font-black tracking-tight text-slate-950 sm:text-[1.55rem]'}>{title}</h1>
        <p className="text-sm leading-snug text-slate-500">{subtitle}</p>
      </div>
    </div>
  </div>
);

export default QuizHeader;
