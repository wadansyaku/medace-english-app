import { describe, expect, it } from 'vitest';

import { getBookProgressionIndex } from '../shared/bookProgression';

describe('getBookProgressionIndex', () => {
  it('prefers explicit grade labels over generic middle-school wording', () => {
    expect(getBookProgressionIndex({
      title: '中学生用名詞教材 中3 完成',
      description: '',
      sourceContext: '',
    })).toBe(3);
  });

  it('keeps generic middle-school titles as the band 2 fallback', () => {
    expect(getBookProgressionIndex({
      title: '中学生用名詞教材',
      description: '',
      sourceContext: '',
    })).toBe(2);
  });
});
