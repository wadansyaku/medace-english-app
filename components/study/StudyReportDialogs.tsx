import React from 'react';
import { Flag } from 'lucide-react';

import MobileSheetDialog from '../mobile/MobileSheetDialog';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

interface StudyReportDialogsProps {
  mode: 'fullscreen' | 'sheet';
  showReportModal: boolean;
  reportReason: string;
  reportNotice: string | null;
  reportError?: string | null;
  isSubmitting?: boolean;
  onChangeReportReason: (value: string) => void;
  onCloseReportModal: () => void;
  onSubmitReport: () => void;
  onCloseNotice: () => void;
}

export const StudyReportDialogs: React.FC<StudyReportDialogsProps> = ({
  mode,
  showReportModal,
  reportReason,
  reportNotice,
  reportError,
  isSubmitting = false,
  onChangeReportReason,
  onCloseReportModal,
  onSubmitReport,
  onCloseNotice,
}) => (
  <>
    {showReportModal && (
      <MobileSheetDialog
        onClose={onCloseReportModal}
        mode={mode}
        ariaLabel="問題を報告"
        panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-md sm:rounded-[28px] sm:border sm:border-medace-100 sm:shadow-2xl"
      >
        <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[28px] sm:px-6">
          <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
            <Flag className="h-5 w-5 text-red-500" /> 問題を報告
          </h3>
          <p className="mt-3 text-sm text-slate-500">
            不適切な例文や間違いを報告してください。講師が確認後、修正を行います。
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <textarea
            aria-label="報告する内容"
            disabled={isSubmitting}
            value={reportReason}
            onChange={(event) => onChangeReportReason(event.target.value)}
            className="h-32 w-full rounded-2xl border border-slate-200 p-3 text-sm"
            placeholder="例: 例文が古文として不自然です / 意味が間違っています"
          />
          {reportError && <p role="alert" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{reportError}</p>}
        </div>
        <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[28px]">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onCloseReportModal} disabled={isSubmitting} className="min-h-11 rounded-2xl border border-slate-200 px-4 py-3 font-bold text-slate-700 disabled:opacity-50">キャンセル</button>
            <button type="button" onClick={onSubmitReport} disabled={isSubmitting || !reportReason.trim()} className="min-h-11 rounded-2xl bg-red-500 px-4 py-3 font-bold text-white disabled:opacity-50">{isSubmitting ? '送信中…' : '報告する'}</button>
          </div>
        </MobileStickyActionBar>
      </MobileSheetDialog>
    )}

    {reportNotice && (
      <MobileSheetDialog
        onClose={onCloseNotice}
        mode={mode}
        ariaLabel="報告受付完了"
        panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-md sm:rounded-[28px] sm:border sm:border-medace-100 sm:shadow-[0_18px_50px_rgba(15,23,42,0.18)]"
      >
        <div className="flex-1 px-4 py-8 sm:px-6 sm:py-6">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Report Saved</div>
          <h3 className="mt-3 text-xl font-black text-slate-950">報告を受け付けました</h3>
          <p className="mt-3 text-sm leading-relaxed text-slate-600">{reportNotice}</p>
        </div>
        <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[28px]">
          <button
            onClick={onCloseNotice}
            className="w-full rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-medace-700"
          >
            閉じる
          </button>
        </MobileStickyActionBar>
      </MobileSheetDialog>
    )}
  </>
);

export default StudyReportDialogs;
