import React, { useEffect, useMemo, useState } from 'react';
import {
  BookCatalogSource,
  BookMetadata,
  UserProfile,
} from '../types';
import { dashboardService } from '../services/dashboard';
import { AlertCircle, AlertTriangle, BookOpen, Library, Loader2, Play, ShieldCheck } from 'lucide-react';
import {
  getLearnerMaterialQualityMessage,
  isBookApprovedForLearner,
  resolveLearnerMaterialQualityGate,
} from '../shared/materialQuality';

interface OfficialCatalogAccessPanelProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  eyebrow?: string;
  title?: string;
  description?: string;
}

const catalogWeight = (book: BookMetadata): number => {
  if (book.isPriority) return 0;
  if (book.catalogSource === BookCatalogSource.LICENSED_PARTNER) return 1;
  if (book.catalogSource === BookCatalogSource.STEADY_STUDY_ORIGINAL) return 2;
  return 3;
};

const OfficialCatalogAccessPanel: React.FC<OfficialCatalogAccessPanelProps> = ({
  user,
  onSelectBook,
  eyebrow = '教材カタログ',
  title = '承認済み公式コースを開く',
  description = '承認済み教材は学習・テストで使えます。確認中の教材は承認後に利用できます。',
}) => {
  const [books, setBooks] = useState<BookMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadBooks = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextBooks = await dashboardService.getBooks();
        setBooks(nextBooks);
      } catch (loadError) {
        console.error(loadError);
        setError((loadError as Error).message || '単語帳一覧の取得に失敗しました。');
      } finally {
        setLoading(false);
      }
    };

    void loadBooks();
  }, [user.uid, user.subscriptionPlan]);

  const officialBooks = useMemo(
    () =>
      books
        .filter((book) => book.catalogSource !== BookCatalogSource.USER_GENERATED)
        .sort((left, right) => {
          const byWeight = catalogWeight(left) - catalogWeight(right);
          if (byWeight !== 0) return byWeight;
          return left.title.localeCompare(right.title, 'ja');
        }),
    [books],
  );
  const approvedOfficialBookCount = officialBooks.filter(isBookApprovedForLearner).length;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl border border-medace-100 bg-medace-50 p-3 text-medace-700">
            <Library className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{eyebrow}</p>
            <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">{title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-500">{description}</p>
          </div>
        </div>
        <div className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-xs font-bold text-medace-700">
          {approvedOfficialBookCount} / {officialBooks.length} 冊 利用可
        </div>
      </div>

      {loading ? (
        <div className="mt-6 flex min-h-[160px] flex-col items-center justify-center text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-medace-500" />
          <div className="mt-3 text-sm font-medium">公式単語帳を読み込み中...</div>
        </div>
      ) : error ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {error}
        </div>
      ) : officialBooks.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          この体験アカウントで開ける公式単語帳はまだありません。
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {officialBooks.map((book) => {
            const canStart = isBookApprovedForLearner(book);
            const qualityGate = resolveLearnerMaterialQualityGate(book);
            const qualityMessage = getLearnerMaterialQualityMessage(qualityGate);
            const fallbackDescription = book.catalogSource === BookCatalogSource.LICENSED_PARTNER
              ? '承認済みの公式教材は学習・テストで使えます。'
              : 'スターター導線で使うオリジナル単語データベース教材です。';

            return (
              <div key={book.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex flex-wrap items-center gap-2">
                  {book.isPriority && (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-800">
                      推奨
                    </span>
                  )}
                  {qualityGate && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-bold ${
                      canStart
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : 'border-amber-200 bg-amber-50 text-amber-800'
                    }`}
                    >
                      {canStart ? <ShieldCheck className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {qualityGate.label}
                    </span>
                  )}
                </div>

                <div className="mt-3 text-lg font-black tracking-tight text-slate-950">{book.title}</div>
                <div className="mt-2 text-sm leading-relaxed text-slate-500">
                  {book.description || fallbackDescription}
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs font-bold text-slate-400">
                  <AlertCircle className="h-3.5 w-3.5" />
                  {book.wordCount} 語を収録
                </div>
                {!canStart && (
                  <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-relaxed text-amber-800">
                    {qualityMessage}
                  </div>
                )}

                <div className="mt-5 grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (canStart) onSelectBook(book.id, 'study');
                    }}
                    disabled={!canStart}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-300 hover:text-medace-700 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                  >
                    <BookOpen className="h-4 w-4" />
                    学習
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (canStart) onSelectBook(book.id, 'quiz');
                    }}
                    disabled={!canStart}
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-slate-950 hover:bg-medace-700 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    <Play className="h-4 w-4 fill-current" />
                    テスト
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};

export default OfficialCatalogAccessPanel;
