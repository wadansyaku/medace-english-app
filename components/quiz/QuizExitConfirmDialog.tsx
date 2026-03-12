import React from 'react';
import { XCircle } from 'lucide-react';

interface QuizExitConfirmDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

const QuizExitConfirmDialog: React.FC<QuizExitConfirmDialogProps> = ({
  onCancel,
  onConfirm,
}) => (
  <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-950/40 px-4 pb-4 pt-16 sm:items-center">
    <div
      data-testid="quiz-exit-confirm-dialog"
      className="w-full max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
    >
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-red-50 p-3 text-red-600">
          <XCircle className="h-5 w-5" />
        </div>
        <div>
          <div className="text-lg font-black text-slate-950">今のテストをやめますか？</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            途中結果は保存せずに、条件設定画面へ戻ります。
          </p>
        </div>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          data-testid="quiz-exit-cancel"
          onClick={onCancel}
          className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3 font-bold text-slate-700 transition-colors hover:bg-slate-200"
        >
          続ける
        </button>
        <button
          type="button"
          data-testid="quiz-exit-confirm"
          onClick={onConfirm}
          className="rounded-2xl bg-red-600 px-4 py-3 font-bold text-white transition-colors hover:bg-red-700"
        >
          やめて戻る
        </button>
      </div>
    </div>
  </div>
);

export default QuizExitConfirmDialog;
