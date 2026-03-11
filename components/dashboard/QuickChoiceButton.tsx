import React from 'react';

interface QuickChoiceButtonProps {
  active: boolean;
  label: string;
  onClick: () => void;
  className?: string;
}

const QuickChoiceButton: React.FC<QuickChoiceButtonProps> = ({ active, label, onClick, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full border px-4 py-3 text-[0.95rem] font-bold transition-colors ${className} ${
      active
        ? 'border-medace-500 bg-medace-50 text-medace-700'
        : 'border-slate-200 bg-white text-slate-500 hover:border-medace-200 hover:text-medace-700'
    }`}
  >
    {label}
  </button>
);

export default QuickChoiceButton;
