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
      <div className="relative z-10 flex-grow p-6">
        <div className="mb-4 flex items-start justify-between">
          <div className={`rounded-lg p-3 ${book.isPriority ? 'bg-orange-100 text-medace-600' : 'bg-slate-100 text-slate-500'}`}>
            <Book className="h-6 w-6" />
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
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <h3 className="truncate text-xl font-bold text-slate-800 transition-colors group-hover:text-medace-600" title={book.title}>
          {book.title}
        </h3>
        <p className="mt-2 h-10 line-clamp-2 text-sm text-slate-500">
          {isMine
            ? (book.sourceContext ? `AI分析: ${book.sourceContext}` : 'オリジナル単語帳')
            : (book.description || (isLicensed ? 'ビジネス版向けの既存公式教材' : 'ビジネス版向けの公式教材'))}
        </p>

        <div className="mt-5 space-y-2">
          <div className="flex justify-between text-sm font-bold text-slate-700">
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

      <div className="relative z-10 mt-auto flex gap-3 border-t border-slate-100 bg-slate-50 p-4">
        <button
          onClick={() => onSelect(book.id, 'study')}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white py-2.5 text-sm font-bold text-slate-700 shadow-sm transition-all hover:border-medace-500 hover:text-medace-600"
        >
          <BookOpen className="h-4 w-4" /> 学習
        </button>
        <button
          onClick={() => onSelect(book.id, 'quiz')}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-200 py-2.5 text-sm font-bold text-slate-600 shadow-sm transition-all hover:bg-medace-600 hover:text-white"
        >
          <Play className="h-4 w-4 fill-current" /> テスト
        </button>
      </div>
    </div>
  );
};

export default BookCard;
