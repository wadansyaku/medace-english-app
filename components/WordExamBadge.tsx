import React from 'react';
import type { WordData } from '../types';

/** The server marks only words matched to verified Aichi exam source entries. */
const WordExamBadge: React.FC<{ word?: Pick<WordData, 'aichiExamAppeared'> | null }> = ({ word }) => {
  if (word?.aichiExamAppeared !== true) return null;
  return <span data-testid="aichi-exam-badge" lang="ja" className="inline-flex max-w-full items-center rounded-full border border-medace-200 bg-medace-50 px-2.5 py-1 text-xs font-bold leading-relaxed text-medace-900 whitespace-normal">愛知県高校入試 出題済み</span>;
};

export default WordExamBadge;
