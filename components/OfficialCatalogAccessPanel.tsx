import React, { useEffect, useMemo, useState } from 'react';
import {
  BookCatalogSource,
  BookMetadata,
  UserProfile,
} from '../types';
import { dashboardService } from '../services/dashboard';
import { AlertCircle, AlertTriangle, BookOpen, Library, Loader2, Play, RefreshCw, ShieldCheck } from 'lucide-react';
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
  const [books, setBooks] = useState<BookMetadata[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadBooks = async () => {
      setLoading(true);
      setError(null);
      try {
        const nextBooks = await dashboardService.getBooks();
        if (!cancelled) setBooks(nextBooks);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) setError('教材一覧を取得できませんでした。通信を確認して、もう一度読み込んでください。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadBooks();
    return () => { cancelled = true; };
  }, [user.uid, user.subscriptionPlan, loadAttempt]);

  const officialBooks = useMemo(
    () =>
      (books || [])
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
          {loading ? '教材を確認中' : error ? '件数は未確認' : `${approvedOfficialBookCount} / ${officialBooks.length} 冊 利用可`}
        </div>
      </div>

      {loading ? (
        <div role="status" aria-live="polite" aria-busy="true" className="mt-6 flex min-h-[160px] flex-col items-center justify-center text-slate-500">
          <Loader2 className="h-7 w-7 animate-spin text-medace-500" aria-hidden="true" />
          <div className="mt-3 text-sm font-medium">公式単語帳を読み込み中...</div>
        </div>
      ) : error ? (
        <div role="alert" data-testid="official-catalog-load-error" className="mt-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          <p>{error}</p>
          <button type="button" onClick={() => setLoadAttempt((previous) => previous + 1)} className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 font-bold"><RefreshCw className="h-4 w-4" aria-hidden="true" />もう一度読み込む</button>
        </div>
      ) : officialBooks.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          <p className="font-bold text-slate-700">このワークスペースで利用できる公式教材はまだありません。</p>
          <p className="mt-2 leading-relaxed">教材の配布設定を教室の管理者に確認してください。教材が配布されると、ここから学習や小テストを開けます。</p>
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
                    className="inline-flex items-center justify-center gap-2 rounded-2xl bg-steady-action px-4 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
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
