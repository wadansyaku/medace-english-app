import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGuestLocalBook, parseGuestLocalBookCsv, GUEST_LOCAL_BOOK_LIMITS, createGuestDraftRow,
  emptyGuestWordbookDraft, prepareGuestWordbookDraft } from '../shared/guestLocalBooks';
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
  it('saves the current single word with a default title and stable preview IDs', () => {
    const draft = { ...emptyGuestWordbookDraft(), title: '', rows: [createGuestDraftRow({ word: 'ice cream', definition: 'アイスクリーム' }), createGuestDraftRow()] };
    const preview = prepareGuestWordbookDraft(draft);
    expect(preview.book.title).toBe('自分の単語帳');
    expect(preview.book.words).toHaveLength(1);
    expect(preview.book.words[0]).toMatchObject({ word: 'ice cream', definition: 'アイスクリーム', bookId: preview.book.id, id: `${preview.book.id}:word:1` });
    expect(preview.duplicateRowNumbers).toEqual([]);
  });
  it('rejects an incomplete current row without modifying or silently dropping it', () => {
    const draft = { ...emptyGuestWordbookDraft(), rows: [createGuestDraftRow({ word: 'apple', definition: 'りんご' }), createGuestDraftRow({ word: 'book', definition: '' })] };
    const before = structuredClone(draft);
    expect(() => prepareGuestWordbookDraft(draft)).toThrow('2行目の意味');
    expect(draft).toEqual(before);
  });
  it('reports exact duplicate rows and preserves different meanings and examples', () => {
    const draft = { ...emptyGuestWordbookDraft(), rows: [
      createGuestDraftRow({ word: 'bank', definition: '銀行' }),
      createGuestDraftRow({ word: 'bank', definition: ' 銀行 ' }),
      createGuestDraftRow({ word: 'bank', definition: '岸' }),
      createGuestDraftRow({ word: 'bank', definition: '銀行', exampleSentence: 'Go to the bank.' }),
    ] };
    const result = prepareGuestWordbookDraft(draft);
    expect(result.duplicateRowNumbers).toEqual([2]);
    expect(result.book.words.map(row => row.definition)).toEqual(['銀行', '岸', '銀行']);
    expect(result.book.words.map(row => row.number)).toEqual([1, 2, 3]);
    expect(new Set(result.book.words.map(row => row.id)).size).toBe(3);
  });
  it('retains source text as inert text and validates its length in direct entry and CSV', () => {
    const book = createGuestLocalBook('教材', [{ word: 'book', definition: '本', sourceNote: '<script>source</script>' }]);
    expect(book.words[0].sourceNote).toBe('<script>source</script>');
    expect(parseGuestLocalBookCsv('Word,Meaning,SourceNote\nbook,本,授業ノート', '教材')[0].sourceNote).toBe('授業ノート');
    expect(() => createGuestLocalBook('教材', [{ word: 'book', definition: '本', sourceNote: 'a'.repeat(1001) }])).toThrow('出典は1000');
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
  it('retains a partially entered draft across reopening only in the guest namespace and expires it', async () => {
    const local = storage(); vi.stubGlobal('localStorage', local);
    local.setItem('steady-study:personal-wordbook-draft:v1:student-A', JSON.stringify({ title: '個人教材', rows: [{ word: 'private', definition: '個人' }] }));
    const store = await import('../shared/guestLocalBooks');
    const draft = { ...store.emptyGuestWordbookDraft(100), rows: [store.createGuestDraftRow({ word: 'apple', definition: '' })] };
    expect(store.writeGuestWordbookDraft(draft, 100).persisted).toBe(true);
    const restored = store.readGuestWordbookDraft(101).draft;
    expect(restored.rows).toEqual(draft.rows);
    expect(local.setItem.mock.calls.at(-1)?.[0]).toBe('steady-study:guest-wordbook-draft:v1');
    expect(local.getItem('steady-study:personal-wordbook-draft:v1:student-A')).toContain('private');
    expect(store.readGuestWordbookDraft(100 + GUEST_LOCAL_BOOK_LIMITS.lifetimeMs).draft.rows[0].word).toBe('');
  });
  it('keeps the guest draft in memory across reopening and warns when browser persistence fails', async () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } });
    const store = await import('../shared/guestLocalBooks');
    const draft = { ...store.emptyGuestWordbookDraft(), rows: [store.createGuestDraftRow({ word: 'book', definition: '本' })] };
    expect(store.writeGuestWordbookDraft(draft).persisted).toBe(false);
    const restored = store.readGuestWordbookDraft();
    expect(restored.persisted).toBe(false);
    expect(restored.draft.rows[0].word).toBe('book');
  });
  it('does not create another book when the same confirmed book is saved twice', async () => {
    const local = storage(); vi.stubGlobal('localStorage', local);
    const store = await import('../shared/guestLocalBooks');
    const preview = store.prepareGuestWordbookDraft({ ...store.emptyGuestWordbookDraft(), rows: [store.createGuestDraftRow({ word: 'book', definition: '本', sourceNote: '授業' })] });
    store.saveGuestLocalBook(preview.book);
    const saved = store.saveGuestLocalBook(preview.book);
    expect(saved.books).toHaveLength(1);
    expect(saved.books[0].id).toBe(preview.book.id);
    expect(saved.books[0].words[0].sourceNote).toBe('授業');
  });
  it('discards malformed draft row IDs or source fields rather than restoring unvalidated data', async () => {
    const local = storage(); vi.stubGlobal('localStorage', local);
    const store = await import('../shared/guestLocalBooks');
    const draft = store.emptyGuestWordbookDraft();
    local.setItem('steady-study:guest-wordbook-draft:v1', JSON.stringify({ ...draft, rows: [{ draftId: 'same', word: 'private', definition: '本', sourceNote: 42 }] }));
    expect(store.readGuestWordbookDraft().draft.rows[0].word).toBe('');
    local.setItem('steady-study:guest-wordbook-draft:v1', JSON.stringify({ ...draft, rows: [store.createGuestDraftRow({ word: 'book', definition: '本' }), { ...store.createGuestDraftRow(), draftId: '' }] }));
    expect(store.readGuestWordbookDraft().draft.rows[0].word).toBe('');
  });
});
