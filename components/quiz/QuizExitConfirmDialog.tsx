import React from 'react';
import { XCircle } from 'lucide-react';
import ModalOverlay from '../ModalOverlay';

interface QuizExitConfirmDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
  returnDestinationLabel?: string;
  exitBlocked?: boolean;
}

const QuizExitConfirmDialog: React.FC<QuizExitConfirmDialogProps> = ({
  onCancel,
  onConfirm,
  returnDestinationLabel = '条件設定画面',
  exitBlocked = false,
}) => (
  <ModalOverlay
    onClose={onCancel}
    ariaLabel="今のテストをやめますか？"
    initialFocusSelector={'[data-testid="quiz-exit-cancel"]'}
    align="center"
    mobileBehavior="default"
    panelClassName="max-w-md rounded-[28px] border border-slate-200 bg-white p-5 shadow-2xl"
  >
    <div data-testid="quiz-exit-confirm-dialog">
      <div className="flex items-start gap-3">
        <div className="rounded-2xl bg-red-50 p-3 text-red-600">
          <XCircle className="h-5 w-5" />
        </div>
        <div>
          <div className="text-lg font-black text-slate-950">今のテストをやめますか？</div>
          <p className="mt-2 text-sm leading-relaxed text-slate-500">
            {exitBlocked
              ? '採点・保存が完了するまで終了できません。「続ける」で解答に戻り、保存に失敗している場合は同じ解答をもう一度保存してください。'
              : `保存済みの解答は記録に残ります。テストを終了して、${returnDestinationLabel}へ戻ります。`}
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
          disabled={exitBlocked}
          className="rounded-2xl bg-red-600 px-4 py-3 font-bold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
        >
          やめて戻る
        </button>
      </div>
    </div>
  </ModalOverlay>
);

export default QuizExitConfirmDialog;
