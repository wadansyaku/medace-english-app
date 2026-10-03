import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import WordSourceDetails from '../components/study/WordSourceDetails';
import { NARU_BOOK_ID } from '../shared/naruBook';
import type { WordData } from '../types';

const word: WordData = {
  id: 'synthetic-source-word', bookId: NARU_BOOK_ID, number: 1,
  word: 'be', definition: '〜である', partOfSpeech: 'verb',
  inflections: 'be-am, is, are', sourceNote: '学習用の注記',
  sourceSheet: 'Synthetic internal sheet', sourceEntryId: 42,
};

describe('Naru learner source display', () => {
  it('keeps learning notes while hiding internal coordinates without modifying the word', () => {
    const before = JSON.stringify(word);
    const html = renderToStaticMarkup(<WordSourceDetails word={word} />);
    expect(html).toContain('be-am, is, are');
    expect(html).toContain('学習用の注記');
    expect(html).not.toContain('Synthetic internal sheet');
    expect(html).not.toContain('原本ID');
    expect(html).not.toContain('出典を確認');
    expect(JSON.stringify(word)).toBe(before);
  });
  it('does not hide another book’s provenance', () => {
    const html = renderToStaticMarkup(<WordSourceDetails word={{ ...word, bookId: 'licensed-synthetic-book' }} />);
    expect(html).toContain('Synthetic internal sheet');
    expect(html).toContain('原本ID：42');
    expect(html).toContain('出典を確認');
  });
  it('does not render an empty supplement for a Naru word with only internal coordinates', () => {
    expect(renderToStaticMarkup(<WordSourceDetails word={{ ...word, inflections: undefined, sourceNote: undefined }} />)).toBe('');
  });
});
