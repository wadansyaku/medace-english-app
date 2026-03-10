import React from 'react';
import { AlertTriangle, BookOpen, FileText, Loader2, Sparkles, Trash2, Upload } from 'lucide-react';

import { BookCatalogSource, BOOK_CATALOG_SOURCE_LABELS } from '../../types';

interface AdminContentImportViewProps {
  mode: 'csv' | 'ai';
  file: File | null;
  rawText: string;
  contentTitle: string;
  uploading: boolean;
  progress: number;
  log: string[];
  catalogSource: BookCatalogSource;
  onModeChange: (mode: 'csv' | 'ai') => void;
  onCatalogSourceChange: (source: BookCatalogSource) => void;
  onContentTitleChange: (value: string) => void;
  onRawTextChange: (value: string) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onAiImport: () => void;
  onCsvUpload: () => void;
  onOpenResetModal: () => void;
}

const AdminContentImportView: React.FC<AdminContentImportViewProps> = ({
  mode,
  file,
  rawText,
  contentTitle,
  uploading,
  progress,
  log,
  catalogSource,
  onModeChange,
  onCatalogSourceChange,
  onContentTitleChange,
  onRawTextChange,
  onFileChange,
  onAiImport,
  onCsvUpload,
  onOpenResetModal,
}) => (
  <div className="space-y-8">
    <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
      <div>
        <h2 className="text-3xl font-bold text-medace-900">教材運用</h2>
        <p className="text-medace-700/70">教材追加と、ビジネス限定の公式カタログ運用をこの画面から管理します。</p>
      </div>
      <div className="inline-flex rounded-2xl border border-medace-100 bg-medace-50 p-1">
        <button
          onClick={() => onModeChange('ai')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${mode === 'ai' ? 'bg-white text-medace-700 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
        >
          <Sparkles className="w-4 h-4" /> AI生成
        </button>
        <button
          onClick={() => onModeChange('csv')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${mode === 'csv' ? 'bg-white text-medace-700 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
        >
          <FileText className="w-4 h-4" /> CSV一括
        </button>
      </div>
    </div>

    <div className="rounded-[28px] border border-medace-100 bg-white p-8 shadow-[0_18px_50px_rgba(246,109,11,0.08)]">
      <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Catalog Scope</div>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[BookCatalogSource.STEADY_STUDY_ORIGINAL, BookCatalogSource.LICENSED_PARTNER].map((source) => (
            <button
              key={source}
              type="button"
              onClick={() => onCatalogSourceChange(source)}
              className={`rounded-2xl border px-4 py-4 text-left transition-colors ${catalogSource === source ? 'border-medace-500 bg-medace-50 text-medace-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
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

      {mode === 'ai' ? (
        <div className="space-y-6 animate-in fade-in">
          <div className="flex items-start gap-3 rounded-xl border border-medace-100 bg-medace-50 p-4">
            <div className="rounded-full bg-white p-2 shadow-sm">
              <Sparkles className="w-5 h-5 text-medace-600" />
            </div>
            <div>
              <h3 className="font-bold text-medace-900">AI教材生成</h3>
              <p className="mt-1 text-sm text-medace-700">
                プリント、長文問題、Web記事の英語テキストから、学習させたい重要単語を抽出して教材へ変換します。
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">教材タイトル</label>
              <div className="relative">
                <BookOpen className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                <input
                  type="text"
                  value={contentTitle}
                  onChange={(event) => onContentTitleChange(event.target.value)}
                  placeholder="例: 中3定期テスト対策 Lesson 4"
                  className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 font-bold text-slate-700 outline-none transition-all focus:border-medace-500 focus:ring-2 focus:ring-medace-200"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-bold text-slate-700">ソーステキスト (英語)</label>
              <textarea
                value={rawText}
                onChange={(event) => onRawTextChange(event.target.value)}
                placeholder="ここに英文を貼り付けてください..."
                className="h-48 w-full rounded-xl border border-slate-300 p-4 font-mono text-sm text-slate-600 outline-none transition-all focus:border-medace-500 focus:ring-2 focus:ring-medace-200"
              />
            </div>

            <button
              onClick={onAiImport}
              disabled={uploading || !rawText || !contentTitle}
              className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold text-white shadow-lg transition-all ${uploading || !rawText ? 'cursor-not-allowed bg-medace-200' : 'bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_100%)] hover:scale-[1.01]'}`}
            >
              {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
              {uploading ? '生成中...' : '教材を生成する'}
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in">
          <div className="mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-medace-50 p-3">
              <Upload className="w-6 h-6 text-medace-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">CSVインポート</h3>
              <p className="text-sm text-slate-500">既存の単語リストを一括で取り込みたい場合はこちらを利用します。</p>
              <p className="mt-1 text-xs text-slate-400">推奨フォーマット: 1列目=単語帳名, 2列目=番号, 3列目=単語, 4列目=日本語訳</p>
            </div>
          </div>

          <div className="rounded-xl border-2 border-dashed border-medace-200 bg-[#fff8ef] p-10 text-center transition-colors hover:border-medace-400">
            <FileText className="mx-auto mb-4 h-12 w-12 text-slate-400" />
            <p className="mb-4 text-slate-600">
              {file ? `選択中: ${file.name}` : 'ここにCSVをドラッグ＆ドロップ、またはクリックして選択'}
            </p>
            <input type="file" accept=".csv" onChange={onFileChange} className="hidden" id="csv-upload" />
            <label
              htmlFor="csv-upload"
              className="inline-block cursor-pointer rounded-lg border border-medace-200 bg-white px-6 py-3 font-medium text-medace-800 shadow-sm transition-all hover:border-medace-500 hover:bg-medace-50 hover:text-medace-700"
            >
              ファイルを選択
            </label>
          </div>

          {file && (
            <button
              onClick={onCsvUpload}
              disabled={uploading}
              className={`w-full rounded-xl py-3 font-bold text-white transition-colors ${uploading ? 'cursor-not-allowed bg-medace-300' : 'bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_100%)] hover:opacity-95'}`}
            >
              {uploading ? '処理中...' : 'CSVを取り込む'}
            </button>
          )}
        </div>
      )}

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
        className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-600 hover:text-white"
      >
        <Trash2 className="w-4 h-4" /> データをリセット
      </button>
    </div>
  </div>
);

export default AdminContentImportView;
