import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GuestPractice from '../components/guest/GuestPractice';
import GuestLanguagePractice from '../components/guest/GuestLanguagePractice';
import { createGuestLocalBook } from '../shared/guestLocalBooks';

describe('guest practice render and static content boundaries', () => {
  it('exposes all six basic practice lanes and identifies session-only results', () => {
    const book = createGuestLocalBook('教材', [{ word: 'apple', definition: 'りんご' }, { word: 'book', definition: '本' }]);
    const html = renderToStaticMarkup(<GuestPractice words={book.words} onBack={() => undefined} />);
    for (const lane of ['意味クイズ', 'スペル', '文法', '和訳', '読解', '英作文']) expect(html).toContain(lane);
    expect(html).toContain('クラウドの学習記録や復習予定には保存されません');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('答えを確認する');
  });
  it('uses authored translations as reference without implying automated grading', () => {
    const html = renderToStaticMarkup(<GuestLanguagePractice mode="translation" />);
    expect(html).toContain('自動採点は行いません');
    expect(html).toContain('自分の日本語訳');
    expect(html).toContain('参考訳を確認する');
    expect(html).not.toContain('満点答案');
  });
  it('renders static passage and answer choices directly', () => {
    const html = renderToStaticMarkup(<GuestLanguagePractice mode="reading" />);
    expect(html).toContain('英文を読む');
    expect(html).toContain('答えを確認する');
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain('AI_GENERATED');
  });
  it('shows writing task, bounded local draft and self checks with an explicit limitation', () => {
    const html = renderToStaticMarkup(<GuestLanguagePractice mode="writing" />);
    expect(html).toContain('採点・添削・提出は行いません');
    expect(html).toContain('自分の英文');
    expect(html).toContain('自分で確認する');
    expect(html).toContain('maxLength="10000"');
    expect(html).toContain('現在0語');
  });
});
