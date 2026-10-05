import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGuestLocalBook, parseGuestLocalBookCsv, GUEST_LOCAL_BOOK_LIMITS } from '../shared/guestLocalBooks';
import { buildGuestMeaningQuestions, isGuestSpellingCorrect } from '../shared/guestPractice';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('guest practice questions', () => {
  it('uses original IDs and distinct normalized meanings without invented distractors', () => {
    const book = createGuestLocalBook('小さな単語帳', [
      { word: 'book', definition: '本' }, { word: 'volume', definition: ' 本 ' },
      { word: 'apple', definition: 'りんご' }, { word: 'water', definition: '水' },
      { word: 'light', definition: '光' }, { word: 'bright', definition: '明るい' },
    ]);
    const questions = buildGuestMeaningQuestions([...book.words, book.words[0]]);
    expect(questions).toHaveLength(6);
    expect(questions[0].id).toBe(book.words[0].id);
    for (const question of questions) {
      expect(new Set(question.choices).size).toBe(4);
      expect(question.choices.filter(choice => choice === question.answer)).toHaveLength(1);
    }
    expect(buildGuestMeaningQuestions(book.words.slice(0, 2))[0].choices).toEqual(['本']);
  });
  it('accepts spelling case, Unicode width and boundary whitespace but preserves interior words', () => {
    expect(isGuestSpellingCorrect(' ＢＯＯＫ ', 'book')).toBe(true);
    expect(isGuestSpellingCorrect('icecream', 'ice cream')).toBe(false);
  });
  it('does not grade another meaning of the same headword as a distractor', () => {
    const book = createGuestLocalBook('複数の意味', [{ word: 'bank', definition: '銀行' }, { word: 'BANK', definition: '岸' }, { word: 'apple', definition: 'りんご' }]);
    const questions = buildGuestMeaningQuestions(book.words);
    expect(questions[0].choices).toEqual(['銀行', 'りんご']);
    expect(questions[1].choices).toEqual(['りんご', '岸']);
  });
});

describe('guest CSV and manual entry', () => {
  it('accepts BOM, Japanese headers, quoted comma and multiline examples', () => {
    expect(parseGuestLocalBookCsv('\uFEFF単語,意味,例文,例文訳\r\nbook,"本, 書籍","Read\nthis book.",本を読む', '教材')).toEqual([
      { word: 'book', definition: '本, 書籍', exampleSentence: 'Read\nthis book.', exampleMeaning: '本を読む' },
    ]);
  });
  it('rejects the complete batch when any row is missing its meaning', () => {
    expect(() => parseGuestLocalBookCsv('Word,Meaning\napple,りんご\nbook,', '教材')).toThrow();
  });
  it.each(['Word,Meaning\nbo"ok,本', 'Word,Meaning\n"book"extra,本', 'Word,Meaning\n"book,本', 'Word,Meaning\nbook,本,ignored'])('rejects malformed CSV without partial import: %s', csv => {
    expect(() => parseGuestLocalBookCsv(csv, '教材')).toThrow();
  });
  it('bounds raw files, word counts, required and optional fields', () => {
    expect(() => parseGuestLocalBookCsv('a'.repeat(GUEST_LOCAL_BOOK_LIMITS.importBytes + 1), '教材')).toThrow('256KB');
    expect(() => parseGuestLocalBookCsv('Word,Meaning\nbook,\uFFFD', '教材')).toThrow('UTF-8');
    expect(() => createGuestLocalBook('教材', Array.from({ length: 201 }, () => ({ word: 'book', definition: '本' })))).toThrow('200語');
    expect(() => createGuestLocalBook(' ', [{ word: 'book', definition: '本' }])).toThrow();
    expect(() => createGuestLocalBook('教材', [{ word: 'book', definition: '本', exampleMeaning: 'a'.repeat(2001) }])).toThrow('2000');
  });
  it('keeps HTML and formula-like text inert as text with separate local IDs', () => {
    const book = createGuestLocalBook('<b>教材</b>', [{ word: '=SUM(A1)', definition: '<script>text</script>' }]);
    expect(book.title).toBe('<b>教材</b>');
    expect(book.words[0].definition).toBe('<script>text</script>');
    expect(book.words[0].bookId).toBe(book.id);
    expect(book.id).toMatch(/^guest-local-/);
  });
});

describe('temporary device storage', () => {
  const storage = () => {
    const values = new Map<string, string>();
    return { getItem: vi.fn((key: string) => values.get(key) ?? null), setItem: vi.fn((key: string, value: string) => values.set(key, value)) };
  };
  it('persists only in its namespace, expires after seven days, and removes a selected book', async () => {
    const local = storage(); vi.stubGlobal('localStorage', local);
    const store = await import('../shared/guestLocalBooks');
    const book = store.createGuestLocalBook('教材', [{ word: 'book', definition: '本' }]);
    expect(store.saveGuestLocalBook(book).persisted).toBe(true);
    expect(local.setItem.mock.calls[0][0]).toBe('steady-study:guest-local-books:v1');
    expect(store.readGuestLocalBooks().books[0].words[0].id).toBe(book.words[0].id);
    expect(store.readGuestLocalBooks(book.createdAt + GUEST_LOCAL_BOOK_LIMITS.lifetimeMs).books).toEqual([]);
    store.saveGuestLocalBook(book);
    expect(store.removeGuestLocalBook(book.id).books).toEqual([]);
  });
  it('retains a usable in-memory book and explicit warning when browser storage fails', async () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } });
    const store = await import('../shared/guestLocalBooks');
    const book = store.createGuestLocalBook('教材', [{ word: 'book', definition: '本' }]);
    const saved = store.saveGuestLocalBook(book);
    expect(saved.persisted).toBe(false);
    expect(saved.notice).toContain('保存できない');
    expect(store.readGuestLocalBooks().books).toEqual([book]);
  });
  it('rejects damaged browser content instead of exposing unvalidated words', async () => {
    const local = storage(); vi.stubGlobal('localStorage', local);
    local.setItem('steady-study:guest-local-books:v1', JSON.stringify([{ id: 'foreign', title: 'wrong', words: [] }]));
    const store = await import('../shared/guestLocalBooks');
    expect(store.readGuestLocalBooks().books).toEqual([]);
    expect(store.readGuestLocalBooks().notice).toContain('読み込めない');
  });
});
