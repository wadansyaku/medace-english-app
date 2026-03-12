import React from 'react';
import { Book, BookOpen, Play, Star, Trash2, Trophy } from 'lucide-react';
import { BookCatalogSource, type BookMetadata, type BookProgress } from '../../types';

interface BookCardProps {
  book: BookMetadata;
  isMine?: boolean;
  progress: BookProgress;
  onDelete: (event: React.MouseEvent, bookId: string, bookTitle: string) => void;
  onSelect: (bookId: string, mode: 'study' | 'quiz') => void;
}

const BookCard: React.FC<BookCardProps> = ({ book, isMine, progress, onDelete, onSelect }) => {
  const isLicensed = book.catalogSource === BookCatalogSource.LICENSED_PARTNER;

  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
      <div className="relative z-10 flex-grow p-4 sm:p-6">
        <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
          <div className={`rounded-lg p-2.5 sm:p-3 ${book.isPriority ? 'bg-orange-100 text-medace-600' : 'bg-slate-100 text-slate-500'}`}>
            <Book className="h-5 w-5 sm:h-6 sm:w-6" />
          </div>
          <div className="flex items-center gap-2">
            {progress.percentage >= 100 ? (
              <span className="flex items-center gap-1 rounded-full border border-green-200 bg-green-100 px-2 py-1 text-xs font-bold text-green-700">
                <Trophy className="h-3 w-3 fill-current" /> 完了
              </span>
            ) : book.isPriority ? (
              <span className="flex items-center gap-1 rounded-full bg-medace-500 px-2 py-1 text-xs font-bold text-white shadow-sm">
                <Star className="h-3 w-3 fill-current" /> 推奨
              </span>
            ) : null}
            {isMine && (
              <button
                onClick={(event) => onDelete(event, book.id, book.title)}
                className="z-20 cursor-pointer rounded-full border border-slate-200 bg-white p-1.5 text-slate-400 shadow-sm transition-all hover:border-red-200 hover:bg-red-50 hover:text-red-500"
                title="削除する"
                data-testid={`book-delete-${book.id}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <h3 className="line-clamp-2 text-base font-bold leading-snug text-slate-800 transition-colors group-hover:text-medace-600 sm:text-xl" title={book.title}>
          {book.title}
        </h3>
        <p className="mt-1.5 min-h-8 line-clamp-2 text-[13px] leading-relaxed text-slate-500 sm:mt-2 sm:min-h-9 sm:text-sm">
          {isMine
            ? (book.sourceContext ? `AI分析: ${book.sourceContext}` : 'オリジナル単語帳')
            : (book.description || (isLicensed ? 'ビジネス版向けの既存公式教材' : 'ビジネス版向けの公式教材'))}
        </p>

        <div className="mt-3 space-y-2 sm:mt-5">
          <div className="flex justify-between text-[13px] font-bold text-slate-700 sm:text-sm">
            <span>進捗率</span>
            <span>{progress.percentage}%</span>
          </div>
          <div className="relative h-3 overflow-hidden rounded-full border border-slate-100 bg-slate-100">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${progress.percentage === 100 ? 'bg-green-500' : 'bg-medace-500'}`}
              style={{ width: `${progress.percentage}%` }}
            ></div>
          </div>
          <p className="text-right font-mono text-xs text-slate-400">
            {progress.learnedCount} <span className="text-slate-300">/</span> {progress.totalCount} 単語
          </p>
        </div>
      </div>

      <div className="relative z-10 mt-auto flex flex-col gap-2 border-t border-slate-100 bg-slate-50 p-3 sm:flex-row sm:gap-3 sm:p-4">
        <button
          onClick={() => onSelect(book.id, 'study')}
          data-testid={`book-study-${book.id}`}
          className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-medace-500 hover:text-medace-600"
        >
          <BookOpen className="h-4 w-4" /> 学習
        </button>
        <button
          onClick={() => onSelect(book.id, 'quiz')}
          data-testid={`book-quiz-${book.id}`}
          className="flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-[13px] font-bold text-slate-500 transition-all hover:border-medace-300 hover:text-medace-700 sm:min-h-11 sm:flex-1 sm:bg-slate-200 sm:px-3 sm:py-2.5 sm:text-sm sm:text-slate-600 sm:shadow-sm sm:hover:bg-medace-600 sm:hover:text-white"
        >
          <Play className="h-4 w-4 fill-current" /> テスト
        </button>
      </div>
    </div>
  );
};

export default BookCard;
