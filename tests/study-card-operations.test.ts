import { describe, expect, it } from 'vitest';
import { createStudyCardOperations } from '../utils/studyCardOperations';

describe('study card operation ownership', () => {
  it('synchronously rejects duplicate clicks while allowing independent hint kinds', () => {
    const operations = createStudyCardOperations();
    expect(operations.begin('example', 'word-1', 0)).not.toBeNull();
    expect(operations.begin('example', 'word-1', 0)).toBeNull();
    expect(operations.begin('image', 'word-1', 0)).not.toBeNull();
  });

  it('invalidates responses when a card advances or a session changes, even at the same index', () => {
    const operations = createStudyCardOperations();
    const previous = operations.begin('example', 'word-1', 0)!;
    operations.invalidate();
    const current = operations.begin('example', 'word-2', 0)!;
    expect(operations.isCurrent(previous)).toBe(false);
    expect(operations.isCurrent(current)).toBe(true);
    expect(operations.finish(previous)).toBe(false);
    expect(operations.begin('example', 'word-2', 0)).toBeNull();
    expect(operations.finish(current)).toBe(true);
    expect(operations.begin('example', 'word-2', 0)).not.toBeNull();
  });

  it('retains accepted results after finishing but cannot finish another operation', () => {
    const operations = createStudyCardOperations();
    const first = operations.begin('edit', 'word-1', 0)!;
    expect(operations.finish(first)).toBe(true);
    expect(operations.isCurrent(first)).toBe(true);
    const second = operations.begin('edit', 'word-1', 0)!;
    expect(operations.finish(first)).toBe(false);
    expect(operations.finish(second)).toBe(true);
  });
});
