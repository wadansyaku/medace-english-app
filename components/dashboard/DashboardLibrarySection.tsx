import React from 'react';
import { ChevronDown, ChevronUp, Library, Plus } from 'lucide-react';
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

const emptyProgress = (book: BookMetadata): BookProgress => ({
  bookId: book.id,
  percentage: 0,
  learnedCount: 0,
  totalCount: book.wordCount,
});

const DashboardLibrarySection: React.FC<DashboardLibrarySectionProps> = ({
  books,
  myBooks,
  primaryRecommendedBook,
  secondaryRecommendedBooks,
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
}) => (
  <div className={isCompact ? 'space-y-5' : 'space-y-7 md:space-y-10'}>
    <div className="min-h-[200px]">
      <div className="mb-4 flex items-center justify-between gap-3 md:mb-6">
        <h3 className="min-w-0 border-l-4 border-medace-500 pl-3 text-lg font-bold text-slate-800 md:text-xl">My単語帳</h3>
        {myBooks.length > 0 && (
          <button
            onClick={onOpenCreateModal}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-[13px] font-bold text-medace-600 transition-colors hover:bg-medace-50 md:text-sm"
          >
            <Plus className="h-4 w-4" /> {isCompact ? '作成' : '新規作成'}
          </button>
        )}
      </div>
      {myBooks.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
          {myBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isMine
              progress={progressMap[book.id] || emptyProgress(book)}
              preparingExamples={preparingExamplesBookId === book.id}
              onDelete={onDelete}
              onPrepareExamples={onPrepareExamples}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className={`rounded-3xl border-2 border-dashed border-slate-200 bg-slate-100 text-center ${isCompact ? 'p-5' : 'p-8'}`}>
          <p className="font-bold text-slate-700">まだMy単語帳がありません</p>
          <p className={`mt-2 text-sm leading-relaxed ${isCompact ? 'text-slate-500' : 'text-slate-400'}`}>
            最初の教材を作ると、ここに単語帳と進捗が表示されます。
          </p>
        </div>
      )}
    </div>

    <div>
      <div className="mb-4 flex items-center justify-between md:mb-6">
        <h3 className="border-l-4 border-medace-500 pl-3 text-lg font-bold text-slate-800 md:text-xl">推奨コース</h3>
      </div>
      <div className="mb-4 grid grid-cols-1 gap-4 md:mb-6">
        {primaryRecommendedBook ? (
          <BookCard
            key={primaryRecommendedBook.id}
            book={primaryRecommendedBook}
            progress={progressMap[primaryRecommendedBook.id] || emptyProgress(primaryRecommendedBook)}
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
        {books.length > 0 && !primaryRecommendedBook && (
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
                progress={progressMap[book.id] || emptyProgress(book)}
                onDelete={onDelete}
                onSelect={onSelect}
              />
            ))}
          </div>
        </details>
      )}

      <div className="border-t border-slate-200 pt-5 md:pt-6">
        <button
          onClick={onToggleLibrary}
          className="group flex w-full items-center justify-between gap-3 rounded-xl bg-slate-50 p-4 transition-colors hover:bg-slate-100"
        >
          <div className="flex items-center gap-3">
            <Library className="h-5 w-5 text-slate-400 group-hover:text-medace-500" />
            <span className="min-w-0 text-left font-bold text-slate-600 group-hover:text-slate-800">
              {isCompact ? '公式コースをもっと見る' : 'すべての公式コースを見る'}
            </span>
          </div>
          {showLibrary ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
        </button>

        {showLibrary && (
          books.length > 0 ? (
            <div className="mt-6 grid grid-cols-1 gap-6 animate-in slide-in-from-top-4 md:grid-cols-2 lg:grid-cols-3">
              {books.map((book) => (
                <BookCard
                  key={book.id}
                  book={book}
                  progress={progressMap[book.id] || emptyProgress(book)}
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
    </div>
  </div>
);

export default DashboardLibrarySection;
