import React from 'react';
import { ChevronDown, ChevronUp, Library, Plus, Search, X } from 'lucide-react';
import type { BookMetadata, BookProgress } from '../../types';
import BookCard from './BookCard';

interface DashboardLibrarySectionProps {
  books: BookMetadata[];
  myBooks: BookMetadata[];
  primaryRecommendedBook: BookMetadata | null;
  secondaryRecommendedBooks: BookMetadata[];
  blockedOfficialBookCount?: number;
  progressMap: Record<string, BookProgress>;
  showLibrary: boolean;
  isCompact?: boolean;
  preparingExamplesBookId?: string | null;
  onToggleLibrary: () => void;
  onOpenCreateModal: () => void;
  onDelete: (event: React.MouseEvent, bookId: string, bookTitle: string) => void;
  onPrepareExamples: (book: BookMetadata) => void;
  onSelect: (bookId: string, mode: 'study' | 'quiz') => void;
}

const DashboardLibrarySection: React.FC<DashboardLibrarySectionProps> = ({
  books: allBooks,
  myBooks: allMyBooks,
  primaryRecommendedBook: recommendedBook,
  secondaryRecommendedBooks: otherRecommendedBooks,
  blockedOfficialBookCount = 0,
  progressMap,
  showLibrary,
  isCompact = false,
  preparingExamplesBookId,
  onToggleLibrary,
  onOpenCreateModal,
  onDelete,
  onPrepareExamples,
  onSelect,
}) => {
  const [query, setQuery] = React.useState('');
  const [scope, setScope] = React.useState<'all' | 'official' | 'mine'>('all');
  const normalizedQuery = query.normalize('NFKC').trim().toLocaleLowerCase('ja');
  const matches = (book: BookMetadata) => !normalizedQuery || [book.title, book.description, book.sourceContext].filter(Boolean).join(' ').normalize('NFKC').toLocaleLowerCase('ja').includes(normalizedQuery);
  const books = scope === 'mine' ? [] : allBooks.filter(matches);
  const myBooks = scope === 'official' ? [] : allMyBooks.filter(matches);
  const isFiltering = Boolean(normalizedQuery) || scope !== 'all';
  const primaryRecommendedBook = !isFiltering && recommendedBook && matches(recommendedBook) ? recommendedBook : null;
  const secondaryRecommendedBooks = isFiltering ? [] : otherRecommendedBooks.filter(matches);
  const hasMaterials = allBooks.length > 0 || allMyBooks.length > 0;
  const canCreateFirstPersonalBook = scope === 'mine' && allMyBooks.length === 0 && allBooks.length > 0;
  const libraryContent = hasMaterials && books.length === 0 && myBooks.length === 0 ? (
    <div role="status" className="rounded-card border border-dashed border-medace-200 bg-white px-5 py-8 text-center">
      <Search className="mx-auto h-6 w-6 text-steady-muted" aria-hidden="true" />
      <p className="mt-3 text-sm font-bold text-steady-ink">{canCreateFirstPersonalBook ? 'まだMy単語帳がありません' : '条件に合う教材がありません'}</p>
      <p className="mt-1 text-xs text-steady-muted">{canCreateFirstPersonalBook ? '自分用の教材を作成すると、ここに表示されます。' : '教材名を短くするか、絞り込みを変更してください。'}</p>
      {canCreateFirstPersonalBook ? (
        <button type="button" data-testid="library-create-first-personal-book" onClick={onOpenCreateModal} className="mt-4 min-h-11 rounded-xl border border-medace-200 bg-medace-50 px-4 text-sm font-bold text-medace-900 hover:bg-medace-100">My単語帳を作る</button>
      ) : (
        <button type="button" onClick={() => { setQuery(''); setScope('all'); }} className="mt-4 min-h-11 rounded-xl border border-medace-200 bg-medace-50 px-4 text-sm font-bold text-medace-900">検索条件をクリア</button>
      )}
    </div>
  ) : !hasMaterials ? (
  <section data-testid="dashboard-library-empty" className="rounded-lg border border-slate-200 bg-white p-5">
    <h3 className="text-base font-bold text-slate-900">教材</h3>
    <p className="mt-2 text-sm font-bold text-slate-700">まだMy単語帳がありません</p>
    <p className="mt-1 text-sm leading-relaxed text-slate-500">最初の教材を作ると、ここに単語帳と進捗が表示されます。</p>
  </section>
) : (
  <div className={isCompact ? 'space-y-5' : 'space-y-7 md:space-y-10'}>
    {myBooks.length > 0 && <div>
      <div className="mb-4 flex items-center justify-between gap-3 md:mb-6">
        <h3 className="min-w-0 border-l-4 border-medace-500 pl-3 text-lg font-bold text-slate-800 md:text-xl">My単語帳</h3>
        {myBooks.length > 0 && (
          <button
            onClick={onOpenCreateModal}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-bold text-medace-800 transition-colors hover:bg-medace-50 md:text-sm"
          >
            <Plus className="h-4 w-4" /> {isCompact ? '作成' : '新規作成'}
          </button>
        )}
      </div>
      {(
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {myBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isMine
              progress={progressMap[book.id]}
              preparingExamples={preparingExamplesBookId === book.id}
              onDelete={onDelete}
              onPrepareExamples={onPrepareExamples}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>}

    {scope !== 'mine' && <div>
      <div className="mb-4 flex items-center justify-between md:mb-6">
        <h3 className="border-l-4 border-medace-500 pl-3 text-lg font-bold text-slate-800 md:text-xl">{isFiltering ? '教材の検索結果' : 'おすすめ教材'}</h3>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 md:mb-6">
        {primaryRecommendedBook ? (
          <BookCard
            key={primaryRecommendedBook.id}
            book={primaryRecommendedBook}
            progress={progressMap[primaryRecommendedBook.id]}
            onDelete={onDelete}
            onSelect={onSelect}
          />
        ) : null}
        {primaryRecommendedBook && blockedOfficialBookCount > 0 && (
          <div className={`rounded-2xl border border-amber-200 bg-amber-50 text-sm font-bold leading-relaxed text-amber-800 ${isCompact ? 'p-4' : 'p-5'}`}>
            配布教材 {blockedOfficialBookCount} 冊は確認中です。承認後に学習・テストで使えます。
          </div>
        )}
        {books.length === 0 && (
          <div className={`rounded-2xl border border-dashed border-slate-200 bg-slate-50 text-sm leading-relaxed text-slate-600 ${isCompact ? 'p-4' : 'p-6'}`}>
            現在のワークスペースには利用可能な公式コースがありません。My単語帳を作成するか、教材配信設定を確認してください。
          </div>
        )}
        {books.length > 0 && !primaryRecommendedBook && !isFiltering && (
          <div className={`rounded-2xl border border-amber-200 bg-amber-50 text-sm font-bold leading-relaxed text-amber-800 ${isCompact ? 'p-4' : 'p-5'}`}>
            {blockedOfficialBookCount > 0
              ? `配布教材 ${blockedOfficialBookCount} 冊は確認中です。承認後に学習・テストで使えます。`
              : '推奨コースはありません'}
          </div>
        )}
      </div>

      {secondaryRecommendedBooks.length > 0 && (
        <details className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 md:mb-8">
          <summary className="cursor-pointer list-none text-sm font-bold text-slate-700">
            他の候補をみる ({secondaryRecommendedBooks.length}冊)
          </summary>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
            {secondaryRecommendedBooks.map((book) => (
              <BookCard
                key={book.id}
                book={book}
                progress={progressMap[book.id]}
                onDelete={onDelete}
                onSelect={onSelect}
              />
            ))}
          </div>
        </details>
      )}

      <div className="border-t border-slate-200 pt-5 md:pt-6">
        {!isFiltering && <button
          type="button"
          onClick={onToggleLibrary}
          aria-expanded={showLibrary || isFiltering}
          aria-controls="student-official-library"
          className="group flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 transition-colors hover:bg-slate-100"
        >
          <div className="flex items-center gap-3">
            <Library className="h-5 w-5 text-slate-400 group-hover:text-medace-500" />
            <span className="min-w-0 text-left font-bold text-slate-600 group-hover:text-slate-800">
              {showLibrary ? '教材一覧を閉じる' : isCompact ? '配布教材をもっと見る' : 'すべての配布教材を見る'}
            </span>
          </div>
          {showLibrary ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </button>}

        {(showLibrary || isFiltering) && (
          books.length > 0 ? (
            <div id="student-official-library" className="mt-6 grid grid-cols-1 gap-6 animate-in slide-in-from-top-4 md:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  progress={progressMap[book.id]}
                  onDelete={onDelete}
                  onSelect={onSelect}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 animate-in rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-600 slide-in-from-top-4">
              公式コースは教室契約の教材配信で利用できます。個人利用では My単語帳 を使って学習を進めてください。
            </div>
          )
        )}
      </div>
    </div>}
  </div>
  );

  return (
    <section aria-label="教材ライブラリ" className="min-w-0 space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="text-[11px] font-black tracking-[0.16em] text-medace-800">YOUR LIBRARY</p><h2 className="mt-1 text-xl font-black text-steady-ink">自分に合う一冊を</h2><p className="mt-1 text-xs text-steady-muted">教材ごとに学習や小テストを始められます。</p></div>
        {hasMaterials && <span className="rounded-full border border-medace-200 bg-white px-3 py-1.5 text-xs font-bold text-steady-muted">{allBooks.length + allMyBooks.length}冊の教材</span>}
      </div>
      {hasMaterials && <div className="rounded-card border border-medace-100 bg-white p-3 sm:p-4">
        <label htmlFor="student-library-search" className="sr-only">教材名・説明・取り込みメモで検索</label>
        <div className="relative"><Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-steady-muted" aria-hidden="true" /><input id="student-library-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="教材名で検索" className="min-h-12 w-full rounded-xl border border-medace-100 bg-medace-50 py-2 pl-10 pr-12 text-sm text-steady-ink" />{query && <button type="button" onClick={() => setQuery('')} aria-label="検索文字を消す" className="absolute right-1 top-1/2 flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-steady-muted"><X className="h-4 w-4" aria-hidden="true" /></button>}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-label="教材の絞り込み">
          {([{ id: 'all', label: 'すべて' }, { id: 'official', label: '配布教材' }, { id: 'mine', label: 'My単語帳' }] as const).map((item) => <button key={item.id} type="button" aria-pressed={scope === item.id} onClick={() => setScope(item.id)} className={'min-h-11 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ' + (scope === item.id ? 'border-medace-200 bg-medace-100 text-medace-950' : 'border-transparent text-steady-muted hover:bg-medace-50')}>{item.label}</button>)}
          {isFiltering && <span role="status" className="ml-auto text-xs font-bold text-steady-muted">{books.length + myBooks.length}冊が一致</span>}
        </div>
      </div>}
      {libraryContent}
    </section>
  );
};

export default DashboardLibrarySection;
