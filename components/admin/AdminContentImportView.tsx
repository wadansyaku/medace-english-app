import React, { useRef } from 'react';
import { AlertTriangle, FileText, Loader2, Trash2, Upload } from 'lucide-react';

import {
  BookCatalogSource,
  BOOK_CATALOG_SOURCE_LABELS,
  type BookMetadata,
} from '../../types';

interface AdminContentImportViewProps {
  file: File | null;
  uploading: boolean;
  progress: number;
  log: string[];
  catalogSource: BookCatalogSource;
  onCatalogSourceChange: (source: BookCatalogSource) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCsvUpload: () => void;
  officialBooks: BookMetadata[];
  loadingOfficialBooks: boolean;
  officialBooksError: string | null;
  onRetryOfficialBooks: () => void;
  onInspectExamples: (book: BookMetadata) => void;
  onOpenResetModal: () => void;
  destructiveActionsEnabled: boolean;
  destructiveActionsMessage: string;
}

const AdminContentImportView: React.FC<AdminContentImportViewProps> = ({
  file,
  uploading,
  progress,
  log,
  catalogSource,
  onCatalogSourceChange,
  onFileChange,
  onCsvUpload,
  officialBooks,
  loadingOfficialBooks,
  officialBooksError,
  onRetryOfficialBooks,
  onInspectExamples,
  onOpenResetModal,
  destructiveActionsEnabled,
  destructiveActionsMessage,
}) => {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
  <div className="space-y-8" aria-busy={uploading}>
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h2 className="text-3xl font-bold text-medace-900">教材運用</h2>
        <p className="text-medace-700/70">教材追加と、ビジネス限定の公式カタログ運用をこの画面から管理します。</p>
      </div>
    </div>

    <div className="rounded-[28px] border border-medace-100 bg-white p-8 shadow-[0_18px_50px_rgba(246,109,11,0.08)]">
      {!destructiveActionsEnabled && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-900">
          {destructiveActionsMessage}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-bold text-slate-400">教材カタログ範囲</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[BookCatalogSource.STEADY_STUDY_ORIGINAL, BookCatalogSource.LICENSED_PARTNER].map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => onCatalogSourceChange(source)}
              disabled={!destructiveActionsEnabled || uploading}
              className={`rounded-2xl border px-4 py-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${catalogSource === source ? 'border-medace-500 bg-medace-50 text-medace-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              <div className="font-bold">{BOOK_CATALOG_SOURCE_LABELS[source]}</div>
              <div className="mt-1 text-sm">
                {source === BookCatalogSource.STEADY_STUDY_ORIGINAL
                  ? 'Steady Study原本として、ビジネス限定の公式教材カタログへ登録します。'
                  : '既存の公式教材として、ビジネス限定の公式教材カタログへ登録します。'}
              </div>
            </button>
          ))}
        </div>
        <p className="mt-3 text-sm text-slate-500">
          現在の方針では、ここで登録した公式教材は個人/無料ユーザーには表示されません。
        </p>
      </div>

      <div className="space-y-6 animate-in fade-in">
        <div className="mb-6 flex items-center gap-3">
          <div className="rounded-lg bg-medace-50 p-3">
            <Upload className="w-6 h-6 text-medace-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-800">校正済み教材のCSV取込</h3>
            <p className="text-sm text-slate-500">事前に内容を確認した単語・語義・例文・和訳を取り込みます。取込は権利や公開の承認を意味しません。</p>
            <p className="mt-1 text-xs text-slate-400">CSV は 1列目=単語帳名, 2列目=番号, 3列目=単語, 4列目=日本語訳, 5列目=例文, 6列目=例文訳。ヘッダー付きCSVも利用できます。名詞 workbook は npm run noun:analyze で未確認差分を 0 にしたうえで、CSV化済みデータを取り込みます。</p>
          </div>
        </div>

        <div className="rounded-xl border-2 border-dashed border-medace-200 bg-[#fff8ef] p-10 text-center transition-colors hover:border-medace-400">
          <FileText className="mx-auto mb-4 h-12 w-12 text-slate-400" />
          <p className="mb-4 text-slate-600">
            {file ? `選択中: ${file.name}` : 'CSV ファイルを選択してください'}
          </p>
          <input ref={fileInput} type="file" accept=".csv" onChange={onFileChange} className="hidden" id="csv-upload" disabled={!destructiveActionsEnabled || uploading} />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={!destructiveActionsEnabled || uploading}
            aria-controls="csv-upload"
            className={`inline-block rounded-lg border border-medace-200 bg-white px-6 py-3 font-medium text-medace-800 shadow-sm transition-all ${
              destructiveActionsEnabled && !uploading
                ? 'cursor-pointer hover:border-medace-500 hover:bg-medace-50 hover:text-medace-700'
                : 'cursor-not-allowed opacity-60'
            }`}
          >
            ファイルを選択
          </button>
        </div>

        {file && (
          <button
            onClick={onCsvUpload}
            disabled={!destructiveActionsEnabled || uploading}
            className={`w-full rounded-xl py-3 font-bold text-steady-on-action transition-colors ${!destructiveActionsEnabled || uploading ? 'cursor-not-allowed bg-medace-300' : 'bg-steady-action hover:bg-steady-action-hover'}`}
          >
            {uploading ? '処理中...' : 'CSVを取り込む'}
          </button>
        )}
      </div>

      {(uploading || progress > 0) && (
        <div className="mt-8">
          <div className="mb-2 flex justify-between text-sm font-medium">
            <span className="text-slate-600">ステータス</span>
            <span className="text-medace-600">{Math.round(progress)}%</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-medace-50">
            <div className="h-3 rounded-full bg-medace-500 transition-all duration-200" style={{ width: `${progress}%` }}></div>
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-8 max-h-48 overflow-y-auto rounded-xl border border-medace-800 bg-medace-900 p-6 font-mono text-xs text-medace-100 shadow-inner">
          {log.map((line, index) => <div key={index} className="mb-1">&gt; {line}</div>)}
        </div>
      )}
    </div>

    <div className="rounded-[28px] border border-slate-200 bg-white p-8 shadow-sm">
      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-bold text-slate-400">保存済み例文</div>
          <h3 className="mt-2 text-xl font-black tracking-tight text-slate-950">公式教材の例文を確認する</h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
            校正した例文と和訳を事前に保存し、学習画面では再利用します。ここでは表示できる例文と欠損を確認できます。
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
          外部AI呼出しなし
        </div>
      </div>

      {loadingOfficialBooks ? (
        <div className="mt-6 flex min-h-[120px] items-center justify-center text-sm font-medium text-slate-500">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-medace-500" />
          公式教材を読み込み中...
        </div>
      ) : officialBooksError ? (
        <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p role="alert" className="text-sm text-red-800">{officialBooksError}</p>
          <button type="button" onClick={onRetryOfficialBooks} className="mt-3 min-h-11 rounded-lg border border-red-200 bg-white px-4 text-sm font-bold text-red-800">教材一覧を再取得</button>
        </div>
      ) : officialBooks.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-500">
          公式教材はまだありません。
        </div>
      ) : (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {officialBooks.map((book) => (
            <article key={book.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-950">{book.title}</div>
                  <div className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                    {BOOK_CATALOG_SOURCE_LABELS[book.catalogSource || BookCatalogSource.LICENSED_PARTNER]}
                  </div>
                </div>
                <div className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-600">
                  {book.wordCount}語
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-500">
                {book.description || '保存した例文と和訳を確認します。追加は原本を保持して承認待ちで行います。'}
              </p>
              <button
                type="button"
                onClick={() => onInspectExamples(book)}
                disabled={uploading}
                className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 transition-colors hover:bg-amber-100 disabled:opacity-60"
              >
                保存済み例文・欠損を確認
              </button>
            </article>
          ))}
        </div>
      )}
    </div>

    <div className="rounded-2xl border border-red-100 bg-red-50 p-8 shadow-sm">
      <div className="mb-4 flex items-center gap-3">
        <AlertTriangle className="w-6 h-6 text-red-500" />
        <h3 className="text-lg font-bold text-red-700">システムリセット</h3>
      </div>
      <p className="mb-4 text-sm text-red-600">
        デモ用のデータをすべて消去し、初期状態に戻します。分析データも含めて削除されます。
      </p>
      <button
        onClick={onOpenResetModal}
        disabled={!destructiveActionsEnabled || uploading}
        className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-600 hover:text-slate-950 disabled:cursor-not-allowed disabled:bg-white disabled:text-red-300"
      >
        <Trash2 className="w-4 h-4" /> データをリセット
      </button>
    </div>
  </div>
);
};

export default AdminContentImportView;
