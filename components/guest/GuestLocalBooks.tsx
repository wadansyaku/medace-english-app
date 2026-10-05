import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Trash2 } from 'lucide-react';
import {
  createGuestLocalBook, GUEST_LOCAL_BOOK_LIMITS, parseGuestLocalBookCsv,
  readGuestLocalBooks, removeGuestLocalBook, saveGuestLocalBook,
  type GuestBookInputWord, type GuestLocalBook,
} from '../../shared/guestLocalBooks';

export interface GuestLocalBooksProps { onBack: () => void; onSelect: (book: GuestLocalBook) => void }
const inputClass = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-normal';
const buttonClass = 'min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-medace-800 hover:bg-medace-50 disabled:opacity-50';

const GuestLocalBooks: React.FC<GuestLocalBooksProps> = ({ onBack, onSelect }) => {
  const [snapshot, setSnapshot] = useState(readGuestLocalBooks);
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<GuestBookInputWord[]>([]);
  const [word, setWord] = useState('');
  const [definition, setDefinition] = useState('');
  const [exampleSentence, setExampleSentence] = useState('');
  const [exampleMeaning, setExampleMeaning] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const importLock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const addWord = (event: React.FormEvent) => {
    event.preventDefault(); setError('');
    try {
      if (rows.length >= GUEST_LOCAL_BOOK_LIMITS.words) throw new Error('1冊に追加できる単語は200語までです。');
      const validated = createGuestLocalBook('入力の確認', [{ word, definition, exampleSentence, exampleMeaning }]);
      const next = validated.words[0];
      setRows(previous => [...previous, { word: next.word, definition: next.definition, exampleSentence: next.exampleSentence ?? undefined, exampleMeaning: next.exampleMeaning ?? undefined }]);
      setWord(''); setDefinition(''); setExampleSentence(''); setExampleMeaning('');
      setMessage('単語を下書きに追加しました。最後に「単語帳を作成する」を押してください。');
    } catch (cause) { setError(cause instanceof Error ? cause.message : '単語の内容を確認してください。'); }
  };
  const importCsv = async (file: File | undefined) => {
    if (!file || importLock.current) return;
    importLock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('拡張子が.csvのファイルを選んでください。ExcelやPDFには対応していません。');
      if (file.size > GUEST_LOCAL_BOOK_LIMITS.importBytes) throw new Error('CSVは256KB以内にしてください。');
      const csv = await file.text();
      const imported = parseGuestLocalBookCsv(csv, title.trim() || file.name.replace(/\.csv$/i, '').slice(0, 80));
      if (rows.length + imported.length > GUEST_LOCAL_BOOK_LIMITS.words) throw new Error('下書きとCSVの合計が200語を超えています。');
      if (!alive.current) return;
      setRows(previous => [...previous, ...imported]);
      if (!title.trim()) setTitle(file.name.replace(/\.csv$/i, '').slice(0, 80));
      setMessage(`${imported.length}語を下書きに取り込みました。内容を確認して単語帳を作成してください。`);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'CSVを読み込めませんでした。'); }
    finally { importLock.current = false; if (alive.current) setBusy(false); }
  };
  const save = () => {
    if (busy) return;
    setError(''); setMessage('');
    try {
      if (word.trim() || definition.trim() || exampleSentence.trim() || exampleMeaning.trim()) throw new Error('入力中の単語を「下書きに追加」してから作成してください。');
      setSnapshot(saveGuestLocalBook(createGuestLocalBook(title, rows)));
      setTitle(''); setRows([]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '単語帳を作成できませんでした。'); }
  };

  return <section className="mx-auto w-full min-w-0 max-w-3xl py-3 sm:py-6" data-testid="guest-local-books-screen">
    <button type="button" onClick={onBack} className={`${buttonClass} mb-3 inline-flex items-center gap-2`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />ゲストホームへ戻る</button>
    <div className="min-w-0 rounded-panel border border-medace-200 bg-white p-4 sm:p-7">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-black text-steady-ink outline-none">この端末の単語帳</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">手入力とUTF-8のCSVで、自分の単語帳を作れます。この端末で最大7日間使う一時的な教材です。クラウドや登録後のアカウントには引き継がれません。ブラウザのデータ削除でも消えます。</p>
      {snapshot.notice && <p role="status" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">{snapshot.notice}</p>}
      <h2 className="mt-6 text-lg font-black text-steady-ink">作成済みの単語帳</h2>
      {snapshot.books.length ? <ul className="mt-3 space-y-3">
        {snapshot.books.map(book => <li key={book.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
          <p className="break-words font-bold text-slate-800">{book.title}</p><p className="mt-1 text-xs text-slate-500">{book.words.length}語 · {snapshot.persisted ? 'この端末に保存' : '画面を開いている間だけ'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onSelect(book)} className={`${buttonClass} inline-flex items-center gap-2`}><BookOpen className="h-4 w-4" aria-hidden="true" />この単語帳で学ぶ</button>
            <button type="button" aria-label={`${book.title}をこの端末から削除`} onClick={() => { setSnapshot(removeGuestLocalBook(book.id)); setError(''); }} className={`${buttonClass} inline-flex items-center gap-2 text-slate-600`}><Trash2 className="h-4 w-4" aria-hidden="true" />削除</button>
          </div>
        </li>)}
      </ul> : <p className="mt-3 text-sm text-slate-500">まだ単語帳がありません。</p>}
      <h2 className="mt-7 text-lg font-black text-steady-ink">単語帳を作成する</h2>
      <label className="mt-4 block text-sm font-bold text-slate-700">単語帳名（80文字以内）<input value={title} onChange={event => setTitle(event.target.value)} disabled={busy} maxLength={80} className={inputClass} /></label>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <label className="block text-sm font-bold text-slate-700">CSVを下書きに取り込む<input type="file" accept=".csv,text/csv" disabled={busy} className="mt-2 block w-full min-w-0 max-w-full text-sm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importCsv(file); }} /></label>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">UTF-8、256KB以内。見出しはWord,Meaning（または単語,意味）。例文はExampleSentence,ExampleMeaning列を使います。最大200語。Excel・PDF・画像には対応していません。</p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-white p-2 text-xs" aria-label="CSVの例">{'Word,Meaning\napple,りんご\nbook,本'}</pre>
      </div>
      <form onSubmit={addWord} className="mt-4">
        <fieldset disabled={busy} className="min-w-0"><legend className="text-sm font-bold text-slate-700">単語を手入力する</legend>
          <div className="mt-2 grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="min-w-0 text-sm font-bold text-slate-700">英単語<input value={word} onChange={event => setWord(event.target.value)} maxLength={120} className={inputClass} /></label>
            <label className="min-w-0 text-sm font-bold text-slate-700">意味<input value={definition} onChange={event => setDefinition(event.target.value)} maxLength={1000} className={inputClass} /></label>
          </div>
          <details className="mt-3"><summary className="min-h-8 cursor-pointer text-sm text-medace-800">例文・例文訳を追加（任意）</summary>
            <label className="mt-2 block text-sm font-bold text-slate-700">例文<textarea value={exampleSentence} onChange={event => setExampleSentence(event.target.value)} maxLength={2000} rows={2} className={inputClass} /></label>
            <label className="mt-2 block text-sm font-bold text-slate-700">例文訳<textarea value={exampleMeaning} onChange={event => setExampleMeaning(event.target.value)} maxLength={2000} rows={2} className={inputClass} /></label>
          </details>
          <button type="submit" disabled={busy || rows.length >= 200} className={`${buttonClass} mt-3`}>下書きに追加</button>
        </fieldset>
      </form>
      <p className="mt-5 text-sm font-bold text-slate-700">下書き: {rows.length} / 200語</p>
      {rows.length > 0 && <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3">
        {rows.map((row, index) => <li key={index} className="flex min-w-0 items-start gap-2"><p className="min-w-0 flex-1 break-words text-sm"><strong lang="en">{row.word}</strong> — {row.definition}</p><button type="button" disabled={busy} aria-label={`${index + 1}語目の${row.word}を下書きから削除`} onClick={() => setRows(previous => previous.filter((_, position) => position !== index))} className={`${buttonClass} shrink-0`}>削除</button></li>)}
      </ul>}
      {busy && <p role="status" className="mt-3 text-sm text-slate-600">CSVを読み込んでいます…</p>}
      {message && <p role="status" className="mt-3 text-sm leading-relaxed text-medace-900">{message}</p>}
      {error && <p role="alert" className="mt-3 break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      <button type="button" disabled={busy || !rows.length || snapshot.books.length >= 10} onClick={save} className="mt-4 min-h-12 w-full rounded-xl bg-steady-action px-4 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50">単語帳を作成する</button>
      {snapshot.books.length >= 10 && <p className="mt-2 text-sm text-amber-900">上限の10冊に達しています。不要な単語帳を削除してから作成してください。</p>}
    </div>
  </section>;
};

export default GuestLocalBooks;
