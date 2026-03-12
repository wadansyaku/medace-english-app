import React from 'react';
import { BookOpen, FileText, Image as ImageIcon, Loader2, Sparkles, UploadCloud, X } from 'lucide-react';

import MobileSheetDialog from '../mobile/MobileSheetDialog';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

interface PhrasebookCreateModalProps {
  open: boolean;
  createMode: 'TEXT' | 'FILE';
  rawText: string;
  uploadFile: File | null;
  newBookTitle: string;
  creating: boolean;
  errorMsg: string | null;
  canUseSelectedCreateMode: boolean;
  currentPlanLabel: string;
  onClose: () => void;
  onChangeMode: (mode: 'TEXT' | 'FILE') => void;
  onChangeRawText: (value: string) => void;
  onChangeTitle: (value: string) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onCreate: () => void;
}

const PhrasebookCreateModal: React.FC<PhrasebookCreateModalProps> = ({
  open,
  createMode,
  rawText,
  uploadFile,
  newBookTitle,
  creating,
  errorMsg,
  canUseSelectedCreateMode,
  currentPlanLabel,
  onClose,
  onChangeMode,
  onChangeRawText,
  onChangeTitle,
  onFileChange,
  onCreate,
}) => {
  if (!open) return null;

  return (
    <MobileSheetDialog
      onClose={onClose}
      mode="fullscreen"
      panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-lg sm:rounded-[32px] sm:border sm:border-slate-200 sm:shadow-2xl"
    >
      <div data-testid="phrasebook-create-modal" className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[32px] sm:px-6">
        <button onClick={onClose} className="absolute right-4 top-4 font-bold text-slate-400 transition-colors hover:text-slate-600">
          <X className="h-5 w-5" />
        </button>
        <div className="pr-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-medace-100 text-medace-600">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-xl font-bold text-slate-800">My単語帳 作成</h3>
          <p className="text-sm text-slate-500">AIが文脈を解析し、あなただけの教材を生成します。</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {errorMsg && (
          <div className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-3 text-sm text-red-600">
            <span className="mt-0.5">⚠️</span>
            <span>{errorMsg}</span>
          </div>
        )}

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs font-bold uppercase text-slate-500">タイトル</label>
          <input
            type="text"
            className="w-full rounded-lg border border-slate-300 px-3 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-medace-500"
            placeholder="例: 好きな洋楽の歌詞"
            value={newBookTitle}
            onChange={(event) => onChangeTitle(event.target.value)}
          />
        </div>

        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => onChangeMode('TEXT')}
            className={`min-h-11 flex-1 rounded-md py-2 text-sm font-bold transition-all ${createMode === 'TEXT' ? 'bg-white text-medace-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" /> テキスト入力
            </div>
          </button>
          <button
            type="button"
            onClick={() => onChangeMode('FILE')}
            className={`min-h-11 flex-1 rounded-md py-2 text-sm font-bold transition-all ${createMode === 'FILE' ? 'bg-white text-medace-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center justify-center gap-2">
              <ImageIcon className="w-4 h-4" /> 画像/PDF
            </div>
          </button>
        </div>

        {createMode === 'TEXT' ? (
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-500">ソーステキスト</label>
            <textarea
              className="h-40 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-medace-500"
              placeholder="ここに英文を貼り付けてください..."
              value={rawText}
              onChange={(event) => onChangeRawText(event.target.value)}
            />
          </div>
        ) : (
          <div>
            <label className="mb-1 block text-xs font-bold uppercase text-slate-500">ファイルをアップロード</label>
            <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition-colors hover:border-medace-500">
              <input type="file" id="file-upload" accept=".pdf,image/*" className="hidden" onChange={onFileChange} />
              <label htmlFor="file-upload" className="flex cursor-pointer flex-col items-center gap-2">
                <UploadCloud className="w-8 h-8 text-slate-400" />
                <span className="text-sm font-bold text-slate-600">
                  {uploadFile ? uploadFile.name : 'クリックしてPDFまたは写真を選択'}
                </span>
              </label>
            </div>
          </div>
        )}

        {!canUseSelectedCreateMode && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
            {createMode === 'TEXT'
              ? `${currentPlanLabel} ではテキストからのAI教材化は使えません。`
              : `${currentPlanLabel} では画像/PDFからのAI教材化は使えません。`}
          </div>
        )}
      </div>
      </div>

      <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[32px]">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onCreate}
            disabled={creating || !newBookTitle || !canUseSelectedCreateMode}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-medace-600 px-5 py-3 font-bold text-white transition-colors hover:bg-medace-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {creating ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
            {creating ? 'AIが文脈を分析中...' : '作成する'}
          </button>
        </div>
      </MobileStickyActionBar>
    </MobileSheetDialog>
  );
};

export default PhrasebookCreateModal;
