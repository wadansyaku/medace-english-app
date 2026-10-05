import React from 'react';
import { BookOpen, FileText, Loader2, UploadCloud, X } from 'lucide-react';

import { isPreparedCatalogCsvFile, PERSONAL_CATALOG_OCR_UNAVAILABLE } from '../../shared/preparedPersonalCatalog';

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
  onCreate: () => void | Promise<void>;
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
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);
  const submittingRef = React.useRef(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [submissionError, setSubmissionError] = React.useState<string | null>(null);
  const pending = creating || submitting;
  const isPending = () => creating || submittingRef.current;

  React.useEffect(() => {
    if (!open) setSubmissionError(null);
  }, [open]);

  if (!open) return null;

  const trimmedTitle = newBookTitle.trim();
  const hasSource = createMode === 'TEXT' ? rawText.trim().length > 0 : Boolean(uploadFile);
  const createDisabledReason = !trimmedTitle
    ? 'タイトルを入力してください。'
    : !hasSource
      ? createMode === 'TEXT'
        ? '単語・語義をCSV形式で入力してください。'
        : '内容を確認したCSVを選択してください。'
      : createMode === 'FILE' && uploadFile && !isPreparedCatalogCsvFile(uploadFile)
        ? PERSONAL_CATALOG_OCR_UNAVAILABLE
      : !canUseSelectedCreateMode
        ? `${currentPlanLabel} ではこの作成方法を使えません。`
        : null;
	  const createDisabled = pending || Boolean(createDisabledReason);
	  const titleInputId = 'phrasebook-create-book-title';
	  const sourceTextInputId = 'phrasebook-create-source-text';
	  const fileInputId = 'phrasebook-create-file-upload';

  const close = () => {
    if (!isPending()) onClose();
  };
  const create = async () => {
    if (isPending() || createDisabledReason) return;
    // React's next render can lag a second event in the same tick.
    submittingRef.current = true;
    setSubmitting(true);
    setSubmissionError(null);
    try {
      await onCreate();
    } catch (error: unknown) {
      setSubmissionError(error instanceof Error ? error.message : '作成に失敗しました。もう一度お試しください。');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };
  const visibleError = errorMsg || submissionError;

	  return (
    <MobileSheetDialog
      onClose={close}
      closeOnOverlayClick={!pending}
      mode="fullscreen"
      ariaLabelledBy="phrasebook-create-title"
      initialFocusSelector="button[aria-label='閉じる']"
      panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-lg sm:rounded-[32px] sm:border sm:border-slate-200 sm:shadow-2xl"
    >
      <div data-testid="phrasebook-create-modal" className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[32px] sm:px-6">
        <button type="button" onClick={close} disabled={pending} aria-label="閉じる" className="absolute right-4 top-4 rounded-lg p-2 font-bold text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50">
          <X className="h-5 w-5" />
        </button>
        <div className="pr-12 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-medace-100 text-medace-600">
            <BookOpen className="w-6 h-6" />
          </div>
          <h3 id="phrasebook-create-title" className="text-xl font-bold text-slate-800">My単語帳 作成</h3>
          <p className="text-sm text-slate-500">内容を確認した単語・語義・例文から作成します。</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        {visibleError && (
          <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-3 text-sm text-red-600">
            <span className="mt-0.5">⚠️</span>
            <span>{visibleError}</span>
          </div>
        )}

      <div className="space-y-4">
	        <div>
	          <label htmlFor={titleInputId} className="mb-1 block text-xs font-bold uppercase text-slate-500">タイトル</label>
	          <input
	            id={titleInputId}
	            type="text"
	            className="w-full rounded-lg border border-slate-300 px-3 py-3 font-bold text-slate-700 outline-none focus:ring-2 focus:ring-medace-500"
            placeholder="例: 今週覚えたい単語"
            value={newBookTitle}
            readOnly={pending}
            onChange={(event) => { if (!isPending()) onChangeTitle(event.target.value); }}
          />
        </div>

        <div className="flex rounded-lg bg-slate-100 p-1">
          <button
            type="button"
            disabled={pending}
            onClick={() => { if (!isPending()) onChangeMode('TEXT'); }}
            className={`min-h-11 flex-1 rounded-md py-2 text-sm font-bold transition-all ${createMode === 'TEXT' ? 'bg-white text-medace-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" /> 手入力
            </div>
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => { if (!isPending()) onChangeMode('FILE'); }}
            className={`min-h-11 flex-1 rounded-md py-2 text-sm font-bold transition-all ${createMode === 'FILE' ? 'bg-white text-medace-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" /> CSV取込
            </div>
          </button>
        </div>

	        {createMode === 'TEXT' ? (
	          <div>
	            <label htmlFor={sourceTextInputId} className="mb-1 block text-xs font-bold uppercase text-slate-500">単語・語義（CSV形式）</label>
	            <textarea
	              id={sourceTextInputId}
	              className="h-40 w-full resize-none rounded-lg border border-slate-300 p-3 text-sm text-slate-700 outline-none focus:ring-2 focus:ring-medace-500"
              placeholder={'Word,Meaning,ExampleSentence,ExampleMeaning\nsource,出典,Please check the source.,出典を確認してください。'}
              value={rawText}
              readOnly={pending}
              onChange={(event) => { if (!isPending()) onChangeRawText(event.target.value); }}
            />
          </div>
	        ) : (
	          <div>
	            <label htmlFor={fileInputId} className="mb-1 block text-xs font-bold uppercase text-slate-500">ファイルをアップロード</label>
	            <div className="rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center transition-colors hover:border-medace-500">
	              <input ref={fileInputRef} type="file" id={fileInputId} accept=".csv,text/csv" className="hidden" disabled={pending} onChange={(event) => { if (!isPending()) onFileChange(event); }} />
	              <button type="button" data-testid="phrasebook-create-file-picker" disabled={pending} onClick={() => { if (!isPending()) fileInputRef.current?.click(); }} className="flex min-h-11 w-full cursor-pointer flex-col items-center gap-2 rounded-lg disabled:cursor-not-allowed disabled:opacity-60">
                <UploadCloud className="w-8 h-8 text-slate-400" />
                <span className="text-sm font-bold text-slate-600">
                  {uploadFile ? uploadFile.name : '校正したCSVを選択'}
                </span>
              </button>
            </div>
          </div>
        )}

        <p className="text-xs leading-relaxed text-slate-600">先頭行は Word,Meaning。例文と和訳は ExampleSentence,ExampleMeaning 列を追加できます。1回500語まで。外部AIへ送信せず、入力した内容をそのまま保存します。</p>
        <p className="text-xs leading-relaxed text-slate-600">画像・PDFの自動抽出は現在停止しています。原本の内容と利用権利を確認してから入力してください。</p>

        {!canUseSelectedCreateMode && (
          <div data-testid="phrasebook-create-plan-warning" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-800">
            {`${currentPlanLabel} ではこの単語帳の作成は使えません。`}
          </div>
        )}
        {pending && (
          <p role="status" className="text-sm leading-relaxed text-slate-600">保存しています。完了するまでこの内容を保持します。</p>
        )}
        {createDisabledReason && canUseSelectedCreateMode && !pending && (
          <div data-testid="phrasebook-create-validation-message" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm font-bold text-amber-800">
            {createDisabledReason}
          </div>
        )}
      </div>
      </div>

      <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[32px]">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="min-h-11 rounded-xl border border-slate-200 bg-white px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-50"
          >
            キャンセル
          </button>
          <button
            type="button"
            data-testid="phrasebook-create-submit"
            onClick={create}
            disabled={createDisabled}
            className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-steady-action px-5 py-3 font-bold text-steady-on-action transition-colors hover:bg-steady-action-hover disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {pending ? <Loader2 className="h-5 w-5 animate-spin" /> : <BookOpen className="h-5 w-5" />}
            {pending ? '保存しています...' : '作成する'}
          </button>
        </div>
      </MobileStickyActionBar>
    </MobileSheetDialog>
  );
};

export default PhrasebookCreateModal;
