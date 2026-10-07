import React from 'react';
import type { WordData } from '../types';

/** The server distinguishes verified exam marks from app-supplemented translations. */
const WordExamBadge: React.FC<{ word?: Pick<WordData, 'aichiExamAppeared' | 'definitionSupplemented'> | null }> = ({ word }) => {
  const examAppeared = word?.aichiExamAppeared === true;
  const supplemented = word?.definitionSupplemented === true;
  if (!examAppeared && !supplemented) return null;
  return <>
    {examAppeared && <span data-testid="aichi-exam-badge" lang="ja" className="inline-flex max-w-full items-center rounded-full border border-medace-200 bg-medace-50 px-2.5 py-1 text-xs font-bold leading-relaxed text-medace-900 whitespace-normal">愛知県高校入試 出題済み</span>}
    {supplemented && <span data-testid="word-definition-supplement-note" role="note" lang="ja" className="mt-1 block max-w-full break-words text-xs font-medium leading-relaxed text-medace-900">訳・例文訳：アプリ補完（辞書を参照）</span>}
  </>;
};

export default WordExamBadge;
