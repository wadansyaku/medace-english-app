import React from 'react';
import type { WordData } from '../../types';

const partOfSpeechLabels = {
  verb: '動詞', noun: '名詞', adverb: '副詞', adjective: '形容詞',
} as const;

/** Original workbook details remain separate from generated hints. */
const WordSourceDetails: React.FC<{ word: WordData; compact?: boolean }> = ({ word, compact = false }) => {
  if (compact) {
    if (!word.partOfSpeech && !word.pronunciation) return null;
    return (
      <div data-testid="word-source-summary" className="mt-3 flex flex-wrap items-center justify-center gap-2 text-sm text-steady-muted">
        {word.partOfSpeech && <span className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 font-bold">{partOfSpeechLabels[word.partOfSpeech]}</span>}
        {word.pronunciation && <span aria-label="原本の発音表記">{word.pronunciation}</span>}
      </div>
    );
  }
  if (!word.inflections && !word.sourceNote && !word.sourceSheet && word.sourceEntryId == null) return null;
  return (
    <section data-testid="word-source-details" aria-label="原本の補足" className="mb-3 rounded-2xl border border-medace-200 bg-white p-4 text-left text-sm text-steady-ink">
      <p className="mb-2 text-xs font-bold text-steady-muted">単語帳の補足</p>
      <dl className="space-y-3">
        {word.inflections && <div><dt className="font-bold">活用</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{word.inflections}</dd></div>}
        {word.sourceNote && <div><dt className="font-bold">原本の注記</dt><dd className="mt-1 whitespace-pre-wrap break-words leading-relaxed">{word.sourceNote}</dd></div>}
      </dl>
      {(word.sourceSheet || word.sourceEntryId != null) && (
        <details className="mt-3 border-t border-medace-100 pt-3 text-steady-muted" onClick={event => event.stopPropagation()}>
          <summary className="cursor-pointer font-bold">出典を確認</summary>
          <p className="mt-2 break-words leading-relaxed">
            {word.sourceSheet && <>原本シート：{word.sourceSheet}<br /></>}
            {word.sourceEntryId != null && <>原本ID：{word.sourceEntryId}</>}
          </p>
        </details>
      )}
    </section>
  );
};

export default WordSourceDetails;
