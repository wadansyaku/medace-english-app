import { describe, expect, it } from 'vitest';
import { splitStudyMeaning } from '../components/StudyMode';

describe('compact study meaning preservation', () => {
  it('preserves distinctions, newlines and unicode through every page', () => {
    const text = '実は、実際には（予想と違う事実・訂正）\n実際に、本当に（事実の強調）😀'.repeat(20);
    const pages = splitStudyMeaning(text, 27);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.join('')).toBe(text);
    expect(pages.every(page => Array.from(page).length <= 27)).toBe(true);
    expect(pages.some(page => page.includes('\uFFFD'))).toBe(false);
  });
  it('keeps all text even in the smallest budget and empty definition', () => {
    expect(splitStudyMeaning('意味\n区別', 0).join('')).toBe('意味\n区別');
    expect(splitStudyMeaning('', 20)).toEqual(['']);
  });
});

describe('meaning boundaries', () => {
  it('keeps actually’s two complete senses on two pages', () => {
    const text = '実は、実際には（予想と違う事実・訂正）\n実際に、本当に（事実の強調）';
    expect(splitStudyMeaning(text, 27)).toEqual([
      '実は、実際には（予想と違う事実・訂正）\n',
      '実際に、本当に（事実の強調）',
    ]);
  });
  it('prefers paragraphs to arbitrary cuts and preserves separator at a tiny budget', () => {
    expect(splitStudyMeaning('意味1\n意味2', 4)).toEqual(['意味1\n', '意味2']);
    expect(splitStudyMeaning('意味1\n意味2', 3)).toEqual(['意味1\n', '意味2']);
  });
  it('keeps bracketed distinctions intact when they fit and prefers clauses', () => {
    expect(splitStudyMeaning('実際に（事実の強調）、本当に確かである', 12)).toEqual(['実際に（事実の強調）、', '本当に確かである']);
    expect(splitStudyMeaning('訂正。実際の事実を述べる。追加の意味', 13)).toEqual(['訂正。実際の事実を述べる。', '追加の意味']);
  });
  it('prefers English word boundaries for a long paragraph', () => {
    expect(splitStudyMeaning('really in fact certainly true', 14)).toEqual(['really in fact', ' certainly ', 'true']);
  });
  it('falls back without losing oversized bracket content or Unicode', () => {
    const text = '（非常に長い区別😀を説明する）';
    const pages = splitStudyMeaning(text, 3);
    expect(pages.join('')).toBe(text);
    expect(pages.every(page => Array.from(page).length <= 3)).toBe(true);
  });
});


describe('separator-only page merging', () => {
  it.each(['意味1\n\n意味2', '   意味1\n意味2', '意味1\n意味2\n\n', '\n\n意味1\n\n意味2'])('keeps separators without blank learning steps: %j', text => {
    const pages = splitStudyMeaning(text, 3);
    expect(pages.join('')).toBe(text);
    expect(pages.every(page => page.trim().length > 0)).toBe(true);
    expect(pages.every(page => Array.from(page.replace(/\s/gu, '')).length <= 3)).toBe(true);
  });
  it('retains an empty or separators-only source as one lossless value', () => {
    expect(splitStudyMeaning('', 3)).toEqual(['']);
    expect(splitStudyMeaning(' \n\n ', 1)).toEqual([' \n\n ']);
  });
});
