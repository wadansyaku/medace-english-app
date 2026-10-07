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
