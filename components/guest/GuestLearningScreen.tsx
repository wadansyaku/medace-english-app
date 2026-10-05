import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Check, Loader2, Volume2 } from 'lucide-react';
import type { WordData } from '../../types';
import type { GuestLearningCatalogResponse } from '../../contracts/guestLearning';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS } from '../../shared/naruBook';
import { selectGuestLearningWords } from '../../shared/guestLearning';
import { STUDY_RATING_FEEDBACK_MIN_MS } from '../../shared/studyPresentation';
import { getGuestLearningCatalog } from '../../services/guestLearning';
import { createGuestLearningAttemptId, guestLearningProgressStore } from '../../services/guestLearningProgress';
import { useGuestLearningProgress } from '../../hooks/useGuestLearningProgress';
import type { GuestLocalBook } from '../../shared/guestLocalBooks';

const GuestPractice = lazy(() => import('./GuestPractice'));
const GuestLocalBooks = lazy(() => import('./GuestLocalBooks'));
type View = 'home' | 'study' | 'practice' | 'books';
const parseView = (): View => {
  const view = new URLSearchParams(window.location.search).get('guest');
  return view === 'study' || view === 'practice' || view === 'books' ? view : 'home';
};
const RATINGS = [
  { id: 0, label: 'もう一回', color: 'border-red-200 bg-red-50 text-red-800' },
  { id: 1, label: 'あとで復習', color: 'border-amber-200 bg-amber-50 text-amber-900' },
  { id: 2, label: 'だいたいOK', color: 'border-blue-200 bg-blue-50 text-blue-800' },
  { id: 3, label: 'すぐ分かる', color: 'border-green-200 bg-green-50 text-green-800' },
] as const;

const GuestLearningScreen: React.FC<{
  onBack: () => void;
  onOpenAuth: (mode: 'LOGIN' | 'SIGNUP') => void;
  onReturnToAccount?: () => void;
  onOpenLegacy?: () => void;
}> = ({ onBack, onOpenAuth, onReturnToAccount, onOpenLegacy }) => {
  const device = useGuestLearningProgress();
  const [catalog, setCatalog] = useState<GuestLearningCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [view, setView] = useState<View>(parseView);
  const [chapter, setChapter] = useState('all');
  const [startNumber, setStartNumber] = useState(1);
  const [count, setCount] = useState(10);
  const [order, setOrder] = useState<'number' | 'random'>('number');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [localBook, setLocalBook] = useState<GuestLocalBook | null>(null);
  const [queue, setQueue] = useState<WordData[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [translation, setTranslation] = useState(false);
  const [selectedRating, setSelectedRating] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [sessionRatings, setSessionRatings] = useState<Array<{ word: WordData; rating: number }>>([]);
  const lock = useRef(false);
  const generation = useRef(0);
  const begunAt = useRef(Date.now());
  const pendingAnswer = useRef<{ key: string; rating: number; attemptId: string; responseTimeMs: number; clickedAt: number } | null>(null);
  const heading = useRef<HTMLHeadingElement | null>(null);
  const frontHeading = useRef<HTMLHeadingElement | null>(null);
  const meaningHeading = useRef<HTMLHeadingElement | null>(null);
  const resultHeading = useRef<HTMLHeadingElement | null>(null);
  const request = useRef(0);
  const viewRef = useRef(view);
  viewRef.current = view;
  const [supports3D, setSupports3D] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setSupports3D(!media.matches);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  const load = async () => {
    const seq = ++request.current; setLoading(true); setCatalogError(null);
    try {
      const response = await getGuestLearningCatalog();
      if (response.book.id !== NARU_BOOK_ID || !Array.isArray(response.words)
        || response.words.some(w => w.bookId !== NARU_BOOK_ID || !w.id || !w.word || !w.definition)
        || new Set(response.words.map(w => w.id)).size !== response.words.length) throw new Error('INVALID_CATALOG');
      if (seq === request.current) setCatalog(response);
    } catch { if (seq === request.current) setCatalogError('Naruシストを読み込めませんでした。通信を確認して、もう一度お試しください。'); }
    finally { if (seq === request.current) setLoading(false); }
  };
  useEffect(() => { void load(); return () => { request.current++; generation.current++; }; }, []);
  useEffect(() => {
    const pop = () => {
      const next = parseView();
      // Closing an auth overlay leaves the same guest route in history. Keep
      // the active card when Back reaches that route again.
      if (next === viewRef.current) return;
      generation.current++; lock.current = false; setBusy(false); setView(next); setQueue([]); setFlipped(false);
    };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [view]);
  useEffect(() => { if (view === 'study') (queue[index] ? (flipped ? meaningHeading.current : frontHeading.current) : resultHeading.current)?.focus({ preventScroll: true }); }, [view, index, flipped, queue.length]);
  const go = (next: View) => {
    if (lock.current) return;
    const url = new URL(window.location.href);
    if (next === 'home') url.searchParams.delete('guest'); else url.searchParams.set('guest', next);
    window.history.pushState(window.history.state, '', url);
    generation.current++; setView(next); setMessage(null);
    window.scrollTo({ top: 0, behavior: 'instant' });
  };
  const range = NARU_RANGE_PRESETS.find(p => p.id === chapter) || NARU_RANGE_PRESETS[0];
  const baseWords = localBook?.words || catalog?.words || [];
  const allWords = useMemo(() => {
    if (!localBook) return selectGuestLearningWords(catalog?.words || [], range, order);
    const words = [...localBook.words].sort((a, b) => a.number - b.number);
    if (order === 'random') for (let i = words.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1)); [words[i], words[j]] = [words[j], words[i]];
    }
    return words;
  }, [catalog, range, order, localBook]);
  const practiced = new Set(device.progress?.boundUserId ? [] : device.progress?.attempts.map(a => a.wordId) || []);
  const filtered = baseWords.filter(w => !search.trim() || `${w.word} ${w.definition}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const startStudy = async (explicit?: WordData[], from = startNumber, repeat = false) => {
    if (lock.current || loading || device.loading) return;
    lock.current = true; setBusy(true); setMessage(null);
    const seq = generation.current;
    try {
      if (!explicit && (!Number.isInteger(from) || from < (isNaru ? range.start : 1) || from > (isNaru ? range.end : baseWords.length))) {
        setMessage('選んだ範囲の開始番号を入力してください。'); return;
      }
      const selected = explicit || allWords.filter(w => w.number >= from && (repeat || localBook || !practiced.has(w.id)));
      const words = selected.slice(0, count || selected.length);
      if (!words.length) { setMessage('この範囲の新しい語は練習済みです。「もう一度学ぶ」か、別の範囲を選べます。'); return; }
      if (!localBook && !device.progress?.boundUserId) device.changed(await guestLearningProgressStore.start());
      if (seq !== generation.current) return;
      setQueue(words); setIndex(0); setFlipped(false); setTranslation(false); setSelectedRating(null); setSaveError(false); pendingAnswer.current = null; setSessionRatings([]); begunAt.current = Date.now();
      lock.current = false; go('study');
    } catch { setMessage('学習を開始できませんでした。もう一度お試しください。'); }
    finally { lock.current = false; setBusy(false); }
  };
  const current = queue[index];
  const rate = async (rating: number) => {
    if (!current || !flipped || lock.current) return;
    const key = `${index}:${current.id}`;
    const answer = pendingAnswer.current || { key, rating, attemptId: createGuestLearningAttemptId(),
      responseTimeMs: Math.max(0, Math.min(3_600_000, Date.now() - begunAt.current)), clickedAt: Date.now() };
    if (answer.key !== key) return;
    pendingAnswer.current = answer;
    lock.current = true; setBusy(true); setSelectedRating(answer.rating); setMessage(null); setSaveError(false);
    const seq = generation.current;
    try {
      if (current.bookId === NARU_BOOK_ID && device.progress && !device.progress.boundUserId) {
        const next = await guestLearningProgressStore.answer(device.progress.sessionId, current.id, answer.rating, answer.responseTimeMs, answer.attemptId);
        device.changed(next);
      }
      const wait = Math.max(0, STUDY_RATING_FEEDBACK_MIN_MS - (Date.now() - answer.clickedAt));
      await new Promise(resolve => window.setTimeout(resolve, wait));
      if (seq !== generation.current) return;
      setSessionRatings(prev => [...prev, { word: current, rating: answer.rating }]);
      if (answer.rating === 0) setQueue(prev => [...prev, current]);
      pendingAnswer.current = null; setFlipped(false); setTranslation(false); setSelectedRating(null); setIndex(i => i + 1); begunAt.current = Date.now();
    } catch { if (seq === generation.current) { setSaveError(true); setMessage('端末への記録を確認できませんでした。同じ回答でもう一度保存できます。'); } }
    finally { if (seq === generation.current) { lock.current = false; setBusy(false); } }
  };
  const speak = (text: string) => {
    if (!('speechSynthesis' in window)) { setMessage('このブラウザーでは読み上げを利用できません。'); return; }
    window.speechSynthesis.cancel(); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US';
    utterance.onerror = () => setMessage('読み上げを開始できませんでした。もう一度お試しください。');
    window.speechSynthesis.speak(utterance);
  };
  const backHome = () => { if (!busy) { setQueue([]); go('home'); } };
  const isNaru = !localBook;
  const clearRecord = async () => {
    if (busy || lock.current || !device.progress) return;
    lock.current = true; setBusy(true);
    try { device.changed(await guestLearningProgressStore.clear(device.progress.sessionId)); setConfirmClear(false); setMessage('端末の一時記録を消しました。新しく学習を始められます。'); }
    catch { setMessage('記録が別の画面で更新された可能性があります。もう一度確認して操作してください。'); void device.refresh(); }
    finally { lock.current = false; setBusy(false); }
  };
  const reviewWords = Array.from(new Map<string, WordData>(sessionRatings.filter(a => a.rating <= 1).map(a => [a.word.id, a.word] as const)).values());
  return <section data-testid="guest-learning-screen" className="mx-auto w-full max-w-3xl py-2 sm:py-4">
    <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
      {(view === 'home' || view === 'study') && <button type="button" disabled={busy} onClick={view === 'home' ? onBack : backHome} className="ui-button-ghost px-2"><ArrowLeft className="h-4 w-4" />{view === 'home' ? 'ホームへ' : '教材へ戻る'}</button>}
      <button type="button" onClick={() => onReturnToAccount ? onReturnToAccount() : onOpenAuth('LOGIN')} disabled={busy} data-testid="guest-learning-login" className="ui-button-secondary">{onReturnToAccount ? 'アカウントへ戻る' : '記録保存・振り返りはログイン'}</button>
    </header>
    {(view === 'home' || view === 'study') && <><h1 ref={heading} tabIndex={-1} className="mb-1 min-w-0 break-words text-xl font-black text-steady-ink outline-none sm:text-2xl">{localBook?.title || 'Naruシスト'}</h1>
    <p className="mb-4 text-xs leading-relaxed text-slate-600">登録なしで学習できます。{isNaru ? '単語の回答はこの端末に7日間だけ残ります。' : '自作単語帳の成績はこの回だけの結果です。'}継続記録・同期はログイン後です。</p></>}
    {(device.error || device.notice || message) && <p role={device.error ? 'alert' : 'status'} className="mb-3 rounded-xl border border-medace-200 bg-medace-50 p-3 text-sm leading-relaxed text-medace-900">{message || device.error || device.notice}</p>}
    {device.progress?.boundUserId && <p role="status" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">この端末の記録は保存を開始したアカウントに紐づいています。今の学習はこの回だけの結果として進められます。</p>}
    <Suspense fallback={<p role="status" className="py-8">画面を準備しています…</p>}>
    {view === 'books' ? <GuestLocalBooks onBack={backHome} onSelect={book => { setLocalBook(book); setStartNumber(1); go('home'); }} />
      : view === 'practice' ? <GuestPractice words={allWords} onBack={backHome} />
      : view === 'study' && current ? <>
        <div className="mb-2 flex justify-between text-xs font-bold text-slate-500"><span>意味を思い出してから答えを確認</span><span>{index + 1} / {queue.length}</span></div>
        <div className="study-card-shell" style={{ height: 'min(46dvh, 24rem)', minHeight: '15rem' }}>
          <div className="study-card-3d"><div key={`${index}:${current.id}`} data-testid="guest-study-card" className={`study-card-inner ${flipped ? 'is-flipped' : ''} ${supports3D ? '' : 'instant-swap'}`}>
            {(supports3D || !flipped) && <div data-testid="guest-card-front" aria-hidden={flipped} inert={flipped} className="study-card-face items-center border border-slate-200 bg-white px-5 py-6 shadow-sm">
              <p className="shrink-0 text-xs font-bold text-slate-500">No. {current.number}</p>
              <div data-testid="guest-word-scroll" className="min-h-0 w-full flex-1 overflow-y-auto"><div className="flex min-h-full items-center justify-center py-2"><h2 ref={frontHeading} tabIndex={-1} lang="en" className="min-w-0 w-full break-words text-center text-4xl font-black text-steady-ink outline-none sm:text-5xl">{current.word}</h2></div></div>
              <button type="button" disabled={busy} onClick={() => speak(current.word)} className="ui-button-ghost mt-2 shrink-0"><Volume2 className="h-5 w-5" /><span className="text-sm">発音を聞く</span></button>
            </div>}
            {(supports3D || flipped) && <div data-testid="guest-card-back" aria-hidden={!flipped} inert={!flipped} className="study-card-face study-card-face-back border border-medace-200 bg-medace-50 p-4 shadow-sm sm:p-6">
              <p className="text-xs font-bold text-medace-800">意味 / {current.word}</p>
              <div className="mt-3 min-h-0 min-w-0 flex-1 overflow-y-auto"><h2 ref={meaningHeading} tabIndex={-1} className="break-words rounded-xl border border-medace-200 bg-white p-4 text-center text-xl font-black text-steady-ink outline-none sm:text-3xl">{current.definition}</h2>
                {current.exampleSentence?.trim() ? <section data-testid="guest-saved-example" className="mt-3 rounded-xl border border-medace-200 bg-white p-3"><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-bold text-slate-500">収録済みの例文</h3><button type="button" onClick={() => speak(current.exampleSentence!)} className="ui-button-ghost min-h-11 px-2" aria-label="例文を読み上げる"><Volume2 className="h-4 w-4" /></button></div><p lang="en" className="break-words text-base font-semibold leading-relaxed text-steady-ink">{current.exampleSentence}</p>
                  {current.exampleMeaning?.trim() && (translation ? <p className="mt-2 break-words text-sm text-slate-600">{current.exampleMeaning}</p> : <button type="button" onClick={() => setTranslation(true)} className="ui-button-ghost mt-1 px-0 text-sm">例文の訳を表示</button>)}</section>
                  : <p className="mt-3 text-sm text-slate-600">例文は準備中です。意味で学習を続けられます。</p>}
              </div>
            </div>}
          </div></div>
        </div>
        <div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
          {flipped ? <><div data-testid="guest-rating-actions" aria-busy={busy} className="grid grid-cols-2 gap-2 sm:grid-cols-4">{RATINGS.map(option => <button type="button" key={option.id} disabled={busy || saveError} data-testid={`guest-rate-${option.id}`} aria-pressed={selectedRating === option.id} onClick={() => void rate(option.id)} className={`min-h-12 rounded-xl border px-2 py-3 text-sm font-bold ${option.color} ${selectedRating === option.id ? 'ring-2 ring-medace-700 ring-offset-2' : ''}`}><span>{option.label}</span><Check aria-hidden="true" className={`mx-auto mt-1 h-4 w-4 ${selectedRating === option.id ? 'opacity-100' : 'opacity-0'}`} /></button>)}</div><p role="status" data-testid="guest-rating-feedback" className="mt-2 h-10 text-center text-xs leading-5 text-slate-600">{busy ? `選択：${RATINGS.find(r => r.id === selectedRating)?.label || ''}` : '「もう一回」はこの回で再出題。「あとで復習」は最後にまとめて復習できます。'}</p>{saveError && <button type="button" disabled={busy} onClick={() => void rate(selectedRating!)} className="ui-button-primary w-full">同じ回答を端末に保存する</button>}</>
            : <button type="button" data-testid="guest-flip" onClick={() => setFlipped(true)} className="ui-button-primary w-full">答えを確認<ArrowRight className="h-4 w-4" /></button>}
        </div>
      </>
      : view === 'study' ? <div data-testid="guest-session-result" className="rounded-panel border border-medace-200 bg-white p-5"><h2 ref={resultHeading} tabIndex={-1} className="text-lg font-black outline-none">{sessionRatings.length ? `${sessionRatings.length}回答を練習しました` : '学習の範囲を選びましょう'}</h2><p className="mt-2 text-sm leading-relaxed text-slate-600">{sessionRatings.length ? 'この回の結果です。アカウントにはまだ保存していません。' : '再読み込み後も端末の回答は残っています。教材へ戻ると、練習していない語から再開できます。'}</p><div className="mt-4 flex flex-wrap gap-2">{reviewWords.length > 0 && <button type="button" onClick={() => void startStudy(reviewWords, 1, true)} className="ui-button-primary">復習する（{reviewWords.length}語）</button>}<button type="button" onClick={backHome} className="ui-button-secondary">教材へ戻る</button>{isNaru && !onReturnToAccount && <button type="button" onClick={() => onOpenAuth('SIGNUP')} className="ui-button-secondary">登録して単語の記録を保存</button>}</div></div>
      : <div className="space-y-4">
        <div className="rounded-panel border border-medace-200 bg-white p-4 sm:p-6">
          <p data-testid="guest-selected-book" className="flex min-w-0 items-center gap-2 break-words text-sm font-bold text-medace-800"><BookOpen className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 break-words">選択中：{localBook?.title || 'Naruシスト'}{localBook ? `（${localBook.words.length}語・端末内）` : catalog ? `（${catalog.words.length}語）` : ''}</span></p>
          {loading && !localBook ? <p role="status" className="mt-4 flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />承認済み教材を読み込んでいます…</p>
            : catalogError && !localBook ? <div className="mt-4"><p role="alert" className="text-sm text-red-700">{catalogError}</p><button type="button" onClick={() => void load()} className="ui-button-secondary mt-3">教材をもう一度読み込む</button></div>
            : <><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">{isNaru && <label className="text-sm font-bold text-slate-600">範囲<select value={chapter} onChange={e => { setChapter(e.target.value); setStartNumber(NARU_RANGE_PRESETS.find(p => p.id === e.target.value)?.start || 1); }} className="ui-input mt-1 w-full">{NARU_RANGE_PRESETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>}<label className="text-sm font-bold text-slate-600">開始番号<input type="number" min={isNaru ? range.start : 1} max={isNaru ? range.end : localBook?.words.length} value={startNumber} onChange={e => setStartNumber(Math.max(1, Number(e.target.value) || 1))} className="ui-input mt-1 w-full" /></label><label className="text-sm font-bold text-slate-600">1回の語数<select value={count} onChange={e => setCount(Number(e.target.value))} className="ui-input mt-1 w-full"><option value={10}>10語</option><option value={20}>20語</option><option value={0}>選択範囲のすべて</option></select></label><label className="text-sm font-bold text-slate-600">語順<select value={order} onChange={e => setOrder(e.target.value === 'random' ? 'random' : 'number')} className="ui-input mt-1 w-full"><option value="number">番号順</option><option value="random">ランダム</option></select></label></div>
              <button type="button" data-testid="guest-study-start" disabled={busy || device.loading || !allWords.length} onClick={() => void startStudy()} className="ui-button-primary mt-4 w-full">{busy ? '準備しています…' : '単語を学ぶ'}<ArrowRight className="h-4 w-4" /></button><button type="button" disabled={busy} onClick={() => void startStudy(undefined, startNumber, true)} className="ui-button-ghost mt-1 w-full">同じ範囲をもう一度学ぶ</button></>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => go('practice')} className="ui-button-secondary">クイズ・英語練習</button><button type="button" onClick={() => go('books')} className="ui-button-secondary">自分の単語帳を作る・取り込む</button></div>
        {localBook && <button type="button" onClick={() => { setLocalBook(null); setStartNumber(1); }} className="ui-button-ghost">Naruシストに戻る</button>}
        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">収録語を検索・選択する</summary><label className="mt-2 block text-sm">単語・意味を検索<input value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} className="ui-input mt-1 w-full" placeholder="例：appear、見える" /></label><p className="mt-2 text-xs text-slate-500">{filtered.length}語</p><ul className="mt-2 divide-y divide-slate-100">{filtered.slice(page * 20, page * 20 + 20).map(w => <li key={w.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><p className="break-words text-sm font-bold">{w.number}. {w.word}</p><p className="break-words text-sm text-slate-600">{w.definition}</p></div><button type="button" disabled={busy} onClick={() => void startStudy(baseWords.filter(word => word.number >= w.number).sort((a, b) => a.number - b.number), w.number, true)} className="ui-button-ghost">この語から学ぶ</button></li>)}</ul><div className="flex justify-between gap-2"><button type="button" disabled={page === 0} onClick={() => setPage(p => p - 1)} className="ui-button-ghost">前の20語</button><button type="button" disabled={(page + 1) * 20 >= filtered.length} onClick={() => setPage(p => p + 1)} className="ui-button-ghost">次の20語</button></div></details>
        <details className="rounded-xl border border-slate-200 bg-white p-4"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold">記録とログインについて</summary><p className="text-sm leading-relaxed text-slate-600">Naruの単語回答は端末に7日間だけ残し、登録後に保存先を確認して引き継げます。クイズ・英語練習・自作単語帳の成績はこの回だけの結果です。復習日の管理、記録の振り返り、別端末との同期、講師の課題や個人教材の保存はログイン後に使えます。</p>{onOpenLegacy && <button type="button" onClick={onOpenLegacy} className="ui-button-ghost mt-2">以前の5語体験を開く</button>}
          {device.progress && <div className="mt-2 border-t border-slate-100 pt-2">{confirmClear ? <><p className="text-sm leading-relaxed text-slate-600">未保存の端末回答を消して、新しい学習記録を始めます。アカウントに保存済みの記録は残ります。</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void clearRecord()} className="ui-button-secondary">端末記録を消して新しく始める</button><button type="button" disabled={busy} onClick={() => setConfirmClear(false)} className="ui-button-ghost">キャンセル</button></div></> : <button type="button" disabled={busy} onClick={() => setConfirmClear(true)} className="ui-button-ghost">端末の一時記録を消す</button>}</div>}
        </details>
      </div>}
    </Suspense>
  </section>;
};
export default GuestLearningScreen;
