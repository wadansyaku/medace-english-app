import type { WordData } from '../types';
import { normalizeCatalogImport } from './catalogImport';

export interface GuestLocalBook {
  id: string;
  title: string;
  words: WordData[];
  createdAt: number;
}

export const GUEST_LOCAL_BOOK_LIMITS = {
  books: 10, words: 200, title: 80, word: 120, definition: 1000,
  example: 2000, importBytes: 256 * 1024, storedChars: 2 * 1024 * 1024,
  lifetimeMs: 7 * 24 * 60 * 60 * 1000,
} as const;
const STORAGE_KEY = 'steady-study:guest-local-books:v1';
let memoryBooks: GuestLocalBook[] = [];
let memoryOnly = false;

export interface GuestBookInputWord {
  word: string;
  definition: string;
  exampleSentence?: string;
  exampleMeaning?: string;
}

const requiredText = (value: string, label: string, max: number): string => {
  const text = value.trim();
  if (!text) throw new Error(`${label}を入力してください。`);
  if (text.length > max) throw new Error(`${label}は${max}文字以内にしてください。`);
  return text;
};

export const createGuestLocalBook = (
  title: string, rows: readonly GuestBookInputWord[], now = Date.now(),
): GuestLocalBook => {
  const normalizedTitle = requiredText(title, '単語帳名', GUEST_LOCAL_BOOK_LIMITS.title);
  if (!rows.length) throw new Error('単語を1語以上追加してください。');
  if (rows.length > GUEST_LOCAL_BOOK_LIMITS.words) throw new Error('1冊に追加できる単語は200語までです。');
  const unique = globalThis.crypto?.randomUUID?.() ?? `${now}-${Math.random().toString(36).slice(2)}`;
  const id = `guest-local-${unique}`;
  return {
    id, title: normalizedTitle, createdAt: now,
    words: rows.map((row, index) => {
      const word = requiredText(row.word, `${index + 1}行目の英単語`, GUEST_LOCAL_BOOK_LIMITS.word);
      const definition = requiredText(row.definition, `${index + 1}行目の意味`, GUEST_LOCAL_BOOK_LIMITS.definition);
      const exampleSentence = row.exampleSentence?.trim();
      const exampleMeaning = row.exampleMeaning?.trim();
      if ((exampleSentence?.length ?? 0) > GUEST_LOCAL_BOOK_LIMITS.example || (exampleMeaning?.length ?? 0) > GUEST_LOCAL_BOOK_LIMITS.example) {
        throw new Error(`${index + 1}行目の例文・例文訳は2000文字以内にしてください。`);
      }
      return { id: `${id}:word:${index + 1}`, bookId: id, number: index + 1, word, definition,
        ...(exampleSentence ? { exampleSentence } : {}), ...(exampleMeaning ? { exampleMeaning } : {}) };
    }),
  };
};

// Catalog parsing is permissive about embedded quotes; reject malformed rows first.
const validateCsvStructure = (text: string): void => {
  let quoted = false;
  let closed = false;
  let field = '';
  let columns = 1;
  let expectedColumns: number | undefined;
  let hasContent = false;
  const finishRow = () => {
    if (hasContent) {
      if (expectedColumns !== undefined && columns !== expectedColumns) throw new Error('CSVの各行の列数を見出しに合わせてください。');
      expectedColumns ??= columns;
    }
    columns = 1; field = ''; closed = false; hasContent = false;
  };
  const source = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') { index += 1; continue; }
        quoted = false; closed = true;
      }
      continue;
    }
    if (char === ',') { columns += 1; field = ''; closed = false; hasContent = true; continue; }
    if (char === '\r' || char === '\n') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      finishRow(); continue;
    }
    if (char === '"') {
      if (field.length || closed) throw new Error('CSVの引用符の位置が不正です。値全体を引用符で囲んでください。');
      quoted = true; hasContent = true; continue;
    }
    if (closed && char.trim()) throw new Error('CSVの閉じた引用符の後には区切り文字が必要です。');
    field += char;
    if (char.trim()) hasContent = true;
  }
  if (quoted) throw new Error('CSVの引用符が閉じていません。');
  finishRow();
};

/** Reuses quoted-field, Japanese-header and content validation from catalog CSV. */
export const parseGuestLocalBookCsv = (text: string, title: string): GuestBookInputWord[] => {
  if (new TextEncoder().encode(text).byteLength > GUEST_LOCAL_BOOK_LIMITS.importBytes) {
    throw new Error('CSVは256KB以内にしてください。');
  }
  if (text.includes('\uFFFD') || text.includes('\0')) throw new Error('UTF-8形式のCSVを選んでください。');
  validateCsvStructure(text);
  const parsed = normalizeCatalogImport({ defaultBookName: title, source: { kind: 'csv', csvText: text } });
  if (parsed.warnings.length) {
    const issue = parsed.warnings[0];
    throw new Error(`${issue.rowNumber ? `${issue.rowNumber}行目: ` : ''}${issue.message} CSVを修正して再度選んでください。`);
  }
  if (!parsed.rows.length) throw new Error('CSVに単語がありません。WordとMeaning列を確認してください。');
  // Validate the complete batch before any book is added; never silently discard rows.
  const validated = createGuestLocalBook(title, parsed.rows);
  return validated.words.map(({ word, definition, exampleSentence, exampleMeaning }) => ({
    word, definition,
    ...(exampleSentence ? { exampleSentence } : {}), ...(exampleMeaning ? { exampleMeaning } : {}),
  }));
};

const isBook = (value: unknown, now: number): value is GuestLocalBook => {
  if (!value || typeof value !== 'object') return false;
  const book = value as GuestLocalBook;
  if (typeof book.id !== 'string' || !book.id.startsWith('guest-local-') || typeof book.title !== 'string'
    || !book.title.trim() || book.title.length > GUEST_LOCAL_BOOK_LIMITS.title
    || !Number.isFinite(book.createdAt) || book.createdAt > now || book.createdAt <= now - GUEST_LOCAL_BOOK_LIMITS.lifetimeMs
    || !Array.isArray(book.words) || !book.words.length || book.words.length > GUEST_LOCAL_BOOK_LIMITS.words) return false;
  const ids = new Set<string>();
  return book.words.every((word, index) => {
    if (!word || typeof word.id !== 'string' || word.id !== `${book.id}:word:${index + 1}` || ids.has(word.id)
      || word.bookId !== book.id || word.number !== index + 1
      || typeof word.word !== 'string' || !word.word.trim() || word.word.length > GUEST_LOCAL_BOOK_LIMITS.word
      || typeof word.definition !== 'string' || !word.definition.trim() || word.definition.length > GUEST_LOCAL_BOOK_LIMITS.definition
      || (word.exampleSentence != null && (typeof word.exampleSentence !== 'string' || word.exampleSentence.length > GUEST_LOCAL_BOOK_LIMITS.example))
      || (word.exampleMeaning != null && (typeof word.exampleMeaning !== 'string' || word.exampleMeaning.length > GUEST_LOCAL_BOOK_LIMITS.example))) return false;
    ids.add(word.id);
    return true;
  });
};

export interface GuestLocalBooksSnapshot { books: GuestLocalBook[]; notice: string | null; persisted: boolean }
const memoryNotice = 'この端末に保存できないため、この画面を開いている間だけ利用できます。再読み込みで単語帳が消える場合があります。';

export const readGuestLocalBooks = (now = Date.now()): GuestLocalBooksSnapshot => {
  memoryBooks = memoryBooks.filter(book => isBook(book, now));
  if (memoryOnly) return { books: memoryBooks, notice: memoryNotice, persisted: false };
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { books: [], notice: null, persisted: true };
    if (raw.length > GUEST_LOCAL_BOOK_LIMITS.storedChars) throw new Error('too large');
    const data: unknown = JSON.parse(raw);
    if (!Array.isArray(data) || data.length > GUEST_LOCAL_BOOK_LIMITS.books) throw new Error('invalid');
    const seen = new Set<string>();
    const books = data.filter((book): book is GuestLocalBook => {
      if (!isBook(book, now) || seen.has(book.id)) return false;
      seen.add(book.id); return true;
    });
    memoryBooks = books;
    return { books, notice: books.length !== data.length ? '保存期限を過ぎた単語帳、または読み込めない単語帳を一覧から除きました。' : null, persisted: true };
  } catch {
    memoryOnly = true;
    return { books: memoryBooks, notice: memoryNotice, persisted: false };
  }
};

const writeBooks = (books: GuestLocalBook[]): GuestLocalBooksSnapshot => {
  memoryBooks = books;
  try {
    const payload = JSON.stringify(books);
    if (payload.length > GUEST_LOCAL_BOOK_LIMITS.storedChars) throw new Error('too large');
    globalThis.localStorage.setItem(STORAGE_KEY, payload);
    memoryOnly = false;
    return { books, notice: '単語帳をこの端末に保存しました。クラウドには保存されません。', persisted: true };
  } catch {
    memoryOnly = true;
    return { books, notice: memoryNotice, persisted: false };
  }
};

export const saveGuestLocalBook = (book: GuestLocalBook): GuestLocalBooksSnapshot => {
  if (!isBook(book, Date.now())) throw new Error('単語帳の内容を確認してください。');
  const { books } = readGuestLocalBooks();
  const others = books.filter(existing => existing.id !== book.id);
  if (others.length >= GUEST_LOCAL_BOOK_LIMITS.books) throw new Error('保存できる単語帳は10冊までです。不要な単語帳を削除してください。');
  return writeBooks([...others, book]);
};

export const removeGuestLocalBook = (id: string): GuestLocalBooksSnapshot => {
  const snapshot = writeBooks(readGuestLocalBooks().books.filter(book => book.id !== id));
  return { ...snapshot, notice: snapshot.persisted ? 'この端末から単語帳を削除しました。' : snapshot.notice };
};
