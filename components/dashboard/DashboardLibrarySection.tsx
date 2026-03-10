import React from 'react';
import { ChevronDown, ChevronUp, Library, Plus } from 'lucide-react';
import type { BookMetadata, BookProgress } from '../../types';
import BookCard from './BookCard';

interface DashboardLibrarySectionProps {
  books: BookMetadata[];
  myBooks: BookMetadata[];
  recommendedOfficialBooks: BookMetadata[];
  progressMap: Record<string, BookProgress>;
  showLibrary: boolean;
  onToggleLibrary: () => void;
  onOpenCreateModal: () => void;
  onDelete: (event: React.MouseEvent, bookId: string, bookTitle: string) => void;
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
  recommendedOfficialBooks,
  progressMap,
  showLibrary,
  onToggleLibrary,
  onOpenCreateModal,
  onDelete,
  onSelect,
}) => (
  <div className="space-y-10">
    <div className="min-h-[200px]">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="border-l-4 border-purple-500 pl-3 text-xl font-bold text-slate-800">My単語帳</h3>
        <button
          onClick={onOpenCreateModal}
          className="flex items-center gap-1 rounded-lg px-3 py-1.5 text-sm font-bold text-medace-600 transition-colors hover:bg-medace-50"
        >
          <Plus className="h-4 w-4" /> 新規作成
        </button>
      </div>
      {myBooks.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {myBooks.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isMine
              progress={progressMap[book.id] || emptyProgress(book)}
              onDelete={onDelete}
              onSelect={onSelect}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-100 p-8 text-center">
          <p className="mb-2 font-bold text-slate-500">まだMy単語帳がありません</p>
          <p className="mb-4 text-sm text-slate-400">教科書の写真やPDFから、あなただけの教材を作成しましょう！</p>
          <button onClick={onOpenCreateModal} className="font-bold text-medace-600 underline hover:text-medace-700">
            今すぐ作成する
          </button>
        </div>
      )}
    </div>

    <div>
      <div className="mb-6 flex items-center justify-between">
        <h3 className="border-l-4 border-medace-500 pl-3 text-xl font-bold text-slate-800">推奨コース</h3>
      </div>
      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {recommendedOfficialBooks.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            progress={progressMap[book.id] || emptyProgress(book)}
            onDelete={onDelete}
            onSelect={onSelect}
          />
        ))}
        {books.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm leading-relaxed text-slate-600 md:col-span-2 lg:col-span-3">
            現在のワークスペースには利用可能な公式コースがありません。My単語帳を作成するか、教材配信設定を確認してください。
          </div>
        )}
        {books.length > 0 && recommendedOfficialBooks.length === 0 && (
          <p className="text-sm text-slate-400">推奨コースはありません</p>
        )}
      </div>

      <div className="border-t border-slate-200 pt-6">
        <button
          onClick={onToggleLibrary}
          className="group flex w-full items-center justify-between rounded-xl bg-slate-50 p-4 transition-colors hover:bg-slate-100"
        >
          <div className="flex items-center gap-3">
            <Library className="h-5 w-5 text-slate-400 group-hover:text-medace-500" />
            <span className="font-bold text-slate-600 group-hover:text-slate-800">すべての公式コースを見る</span>
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
              公式コースはビジネス本導入プラン向けに限定されています。個人利用では My単語帳 を使って学習を進めてください。
            </div>
          )
        )}
      </div>
    </div>
  </div>
);

export default DashboardLibrarySection;
