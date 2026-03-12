import React from 'react';
import { Trash2 } from 'lucide-react';
import MobileSheetDialog from '../mobile/MobileSheetDialog';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

export interface DashboardDeleteBookDialogProps {
  pendingDeleteBook: { id: string; title: string } | null;
  isMobileViewport: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}

const DashboardDeleteBookDialog: React.FC<DashboardDeleteBookDialogProps> = ({
  pendingDeleteBook,
  isMobileViewport,
  onClose,
  onConfirm,
}) => {
  if (!pendingDeleteBook) return null;

  return (
    <MobileSheetDialog
      onClose={onClose}
      mode={isMobileViewport ? 'fullscreen' : 'sheet'}
      panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-lg sm:rounded-[32px] sm:border sm:border-slate-200 sm:shadow-2xl"
    >
      <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[32px] sm:px-6">
        <div className="flex items-center gap-3">
          <Trash2 className="h-5 w-5 text-red-500" />
          <div>
            <div className="text-lg font-black text-slate-950">単語帳を削除する</div>
            <div className="mt-1 text-sm text-slate-500">「{pendingDeleteBook.title}」を削除します。</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
        <div className="rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          学習履歴との関連データも一緒に削除されます。この操作は取り消せません。
        </div>
      </div>

      <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[32px]">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white"
          >
            <Trash2 className="h-4 w-4" />
            削除する
          </button>
        </div>
      </MobileStickyActionBar>
    </MobileSheetDialog>
  );
};

export default DashboardDeleteBookDialog;
