import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, BookOpen, Trash2 } from 'lucide-react';
import PersonalWordbookEditor from '../dashboard/PersonalWordbookEditor';
import { hasPersonalDraftContent } from '../../shared/personalWordbookDraft';
import {
  createGuestDraftRow, emptyGuestWordbookDraft, GUEST_LOCAL_BOOK_LIMITS, parseGuestLocalBookCsv,
  prepareGuestWordbookDraft, readGuestLocalBooks, readGuestWordbookDraft, removeGuestLocalBook,
  saveGuestLocalBook, writeGuestWordbookDraft, type GuestLocalBook, type GuestWordbookDraft,
} from '../../shared/guestLocalBooks';

export interface GuestLocalBooksProps { onBack: () => void; onSelect: (book: GuestLocalBook) => void }
const inputClass = 'mt-1 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-base font-normal';
const buttonClass = 'min-h-11 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-medace-800 hover:bg-medace-50 disabled:opacity-50';
type Preview = ReturnType<typeof prepareGuestWordbookDraft>;

const GuestLocalBooks: React.FC<GuestLocalBooksProps> = ({ onBack, onSelect }) => {
  const [snapshot, setSnapshot] = useState(readGuestLocalBooks);
  const [draftSnapshot, setDraftSnapshot] = useState(readGuestWordbookDraft);
  const currentDraft = useRef(draftSnapshot.draft);
  const draft = draftSnapshot.draft;
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useRef<Preview | null>(null);
  const [savedBook, setSavedBook] = useState<GuestLocalBook | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const heading = useRef<HTMLHeadingElement>(null);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const operationLock = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (preview) confirmationHeading.current?.focus(); }, [preview]);
  useEffect(() => { if (savedBook) savedHeading.current?.focus(); }, [savedBook]);
  const updateDraft = (next: GuestWordbookDraft) => {
    const nextSnapshot = writeGuestWordbookDraft(next);
    currentDraft.current = nextSnapshot.draft;
    setDraftSnapshot(nextSnapshot);
    setError(''); setMessage('');
  };
  const importCsv = async (file: File | undefined) => {
    if (!file || operationLock.current) return;
    operationLock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      if (!/\.csv$/i.test(file.name)) throw new Error('拡張子が.csvのファイルを選んでください。ExcelやPDFには対応していません。');
      if (file.size > GUEST_LOCAL_BOOK_LIMITS.importBytes) throw new Error('CSVは256KB以内にしてください。');
      const csv = await file.text();
      const previous = currentDraft.current;
      const title = previous.title.trim() || '自分の単語帳';
      const imported = parseGuestLocalBookCsv(csv, title);
      const entered = previous.rows.filter(hasPersonalDraftContent);
      if (entered.length + imported.length > GUEST_LOCAL_BOOK_LIMITS.words) throw new Error('入力中の単語とCSVの合計が200語を超えています。');
      if (!alive.current) return;
      updateDraft({ ...previous, rows: [...entered, ...imported.map(createGuestDraftRow)] });
      setMessage(`${imported.length}語を取り込みました。各行を編集し、内容を確認して作成できます。`);
    } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : 'CSVを読み込めませんでした。'); }
    finally { operationLock.current = false; if (alive.current) setBusy(false); }
  };
  const confirm = () => {
    if (operationLock.current) return;
    setError(''); setMessage('');
    try {
      const next = prepareGuestWordbookDraft(currentDraft.current);
      previewRef.current = next; setPreview(next);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '単語と意味を確認してください。'); }
  };
  const returnToInput = () => {
    if (operationLock.current) return;
    previewRef.current = null; setPreview(null); setError('');
    requestAnimationFrame(() => document.getElementById('personal-wordbook-word')?.focus());
  };
  const save = () => {
    const confirmed = previewRef.current;
    if (!confirmed || operationLock.current) return;
    operationLock.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const nextSnapshot = saveGuestLocalBook(confirmed.book);
      setSnapshot(nextSnapshot);
      setSavedBook(nextSnapshot.books.find(book => book.id === confirmed.book.id) ?? confirmed.book);
      const cleared = writeGuestWordbookDraft(emptyGuestWordbookDraft());
      currentDraft.current = cleared.draft; setDraftSnapshot(cleared);
      previewRef.current = null; setPreview(null);
    } catch (cause) { setError(cause instanceof Error ? cause.message : '単語帳を作成できませんでした。'); }
    finally { operationLock.current = false; setBusy(false); }
  };
  const enteredCount = draft.rows.filter(hasPersonalDraftContent).length;

  return <section className="mx-auto w-full min-w-0 max-w-3xl py-3 sm:py-6" data-testid="guest-local-books-screen">
    <button type="button" disabled={busy} onClick={onBack} className={`${buttonClass} mb-3 inline-flex items-center gap-2`}><ArrowLeft className="h-4 w-4" aria-hidden="true" />ゲストホームへ戻る</button>
    <div className="min-w-0 rounded-panel border border-medace-200 bg-white p-4 sm:p-7">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-black text-steady-ink outline-none">この端末の単語帳</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">単語と意味を1語から入力して学べます。この端末に最大7日間保存され、登録後のアカウントやクラウドには引き継がれません。</p>
      {snapshot.notice && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">{snapshot.notice}</p>}
      {!draftSnapshot.persisted && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">入力の下書きをこの端末に保存できません。今の画面では続けられますが、再読み込みすると消える場合があります。</p>}
      {savedBook && <div className="mt-4 rounded-xl border border-medace-200 bg-medace-50 p-3" data-testid="guest-wordbook-created">
        <h2 ref={savedHeading} tabIndex={-1} className="break-words font-bold text-steady-ink outline-none">{savedBook.title} · {savedBook.words.length}語を作成しました</h2>
        <p className="mt-1 text-sm text-slate-600">{snapshot.persisted ? 'この端末に保存済み。作成した単語帳からすぐに学べます。' : '画面を開いている間だけ利用できます。端末への保存は確認できません。'}</p>
        <button type="button" onClick={() => onSelect(savedBook)} className={`${buttonClass} mt-3 inline-flex items-center gap-2`}><BookOpen className="h-4 w-4" aria-hidden="true" />作成した単語帳で学ぶ</button>
      </div>}

      <h2 className="mt-5 text-lg font-black text-steady-ink">単語帳を作成する</h2>
      {!preview ? <div className="mt-3 space-y-4">
        <PersonalWordbookEditor rows={draft.rows} onChange={rows => updateDraft({ ...currentDraft.current, rows })} disabled={busy} maxRows={200}
          fieldLimits={{ word: 120, definition: 1000, exampleSentence: 2000, exampleMeaning: 2000, sourceNote: 1000 }} />
        <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-medace-800">単語帳名を変更（任意）</summary>
          <label className="mt-2 block text-sm font-bold text-slate-700">単語帳名（80文字以内）<input value={draft.title} onChange={event => updateDraft({ ...currentDraft.current, title: event.target.value })} disabled={busy} maxLength={80} className={inputClass} /></label>
          <p className="mt-2 text-xs text-slate-600">空欄の場合は「自分の単語帳」で作成します。</p>
        </details>
        <details className="rounded-xl border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-medace-800">CSVファイルがある場合は取り込む</summary>
          <label className="mt-2 block text-sm font-bold text-slate-700">CSVファイル<input type="file" accept=".csv,text/csv" disabled={busy} className="mt-2 block w-full min-w-0 max-w-full text-sm" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void importCsv(file); }} /></label>
          <p className="mt-2 text-xs leading-relaxed text-slate-600">UTF-8、256KB以内、最大200語。見出しはWord,Meaning（または単語,意味）。例文はExampleSentence,ExampleMeaning列。Excel・PDF・画像には対応していません。</p>
          <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-50 p-2 text-xs" aria-label="CSVの例">{'Word,Meaning\napple,りんご\nbook,本'}</pre>
        </details>
        <p className="text-xs leading-relaxed text-slate-600">入力の下書きもこの端末に最大7日間残ります。1冊200語・合計10冊まで。ブラウザのデータ削除で消えます。</p>
        <button type="button" data-testid="guest-wordbook-confirm" disabled={busy || !enteredCount || snapshot.books.length >= 10} onClick={confirm} className="min-h-12 w-full rounded-xl bg-steady-action px-4 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50">内容を確認する</button>
      </div> : <div className="mt-3 space-y-3" data-testid="guest-wordbook-confirmation">
        <h3 ref={confirmationHeading} tabIndex={-1} className="break-words font-bold text-steady-ink outline-none">{preview.book.title} · 保存する内容</h3>
        <p className="text-sm text-slate-600">{preview.book.words.length}語をこの端末に保存します。クラウドやアカウントには保存されません。</p>
        {!!preview.duplicateRowNumbers.length && <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">内容がすべて同じ単語が{preview.duplicateRowNumbers.length}件あります。同じ内容は1語として保存します。意味や例文が違う単語は別々に保存します。</p>}
        <ul className="max-h-72 space-y-2 overflow-y-auto rounded-xl border border-slate-200 p-3" aria-label="保存する単語">
          {preview.book.words.map(row => <li key={row.id} className="whitespace-pre-wrap break-words text-sm"><strong lang="en">{row.word}</strong><span className="block text-slate-600">{row.definition}</span>
            {row.exampleSentence && <span className="mt-1 block text-slate-600" lang="en">例文: {row.exampleSentence}</span>}
            {row.exampleMeaning && <span className="block text-slate-600">例文訳: {row.exampleMeaning}</span>}
            {row.sourceNote && <span className="block text-slate-600">出典: {row.sourceNote}</span>}
          </li>)}
        </ul>
        <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={returnToInput} className={buttonClass}>入力へ戻る</button>
          <button type="button" disabled={busy} data-testid="guest-wordbook-save" onClick={save} className="min-h-12 flex-1 rounded-xl bg-steady-action px-4 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50">単語帳を作成する</button>
        </div>
      </div>}
      {busy && <p role="status" className="mt-3 text-sm text-slate-600">CSVを読み込んでいます…</p>}
      {message && <p role="status" className="mt-3 text-sm leading-relaxed text-medace-900">{message}</p>}
      {error && <p ref={errorRef} tabIndex={-1} role="alert" className="mt-3 break-words rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800 outline-none">{error}</p>}
      {snapshot.books.length >= 10 && <p className="mt-2 text-sm text-amber-900">上限の10冊に達しています。不要な単語帳を削除してから作成してください。</p>}

      <h2 className="mt-7 text-lg font-black text-steady-ink">作成済みの単語帳</h2>
      {snapshot.books.length ? <ul className="mt-3 space-y-3">
        {snapshot.books.map(book => <li key={book.id} className="min-w-0 rounded-xl border border-slate-200 p-3">
          <p className="break-words font-bold text-slate-800">{book.title}</p><p className="mt-1 text-xs text-slate-500">{book.words.length}語 · {snapshot.persisted ? 'この端末に保存' : '画面を開いている間だけ'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => onSelect(book)} className={`${buttonClass} inline-flex items-center gap-2`}><BookOpen className="h-4 w-4" aria-hidden="true" />この単語帳で学ぶ</button>
            <button type="button" aria-label={`${book.title}をこの端末から削除`} onClick={() => { setSnapshot(removeGuestLocalBook(book.id)); if (savedBook?.id === book.id) setSavedBook(null); setError(''); }} className={`${buttonClass} inline-flex items-center gap-2 text-slate-600`}><Trash2 className="h-4 w-4" aria-hidden="true" />削除</button>
          </div>
        </li>)}
      </ul> : <p className="mt-3 text-sm text-slate-500">まだ単語帳がありません。</p>}
    </div>
  </section>;
};

export default GuestLocalBooks;
