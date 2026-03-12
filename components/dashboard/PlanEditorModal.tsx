import React from 'react';
import { Check, Edit2 } from 'lucide-react';

import type { BookMetadata } from '../../types';
import useIsMobileViewport from '../../hooks/useIsMobileViewport';
import MobileSheetDialog from '../mobile/MobileSheetDialog';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

interface PlanEditorModalProps {
  open: boolean;
  planningBooks: BookMetadata[];
  selectedBookIds: string[];
  dailyGoal: number;
  onClose: () => void;
  onChangeDailyGoal: (value: number) => void;
  onToggleBook: (bookId: string) => void;
  onSave: () => void;
}

const PlanEditorModal: React.FC<PlanEditorModalProps> = ({
  open,
  planningBooks,
  selectedBookIds,
  dailyGoal,
  onClose,
  onChangeDailyGoal,
  onToggleBook,
  onSave,
}) => {
  const isMobileViewport = useIsMobileViewport();
  const selectedBooks = planningBooks.filter((book) => selectedBookIds.includes(book.id));
  const dailyGoalPresets = [10, 15, 20, 30, 40];
  if (!open) return null;

  return (
    <MobileSheetDialog
      onClose={onClose}
      mode="fullscreen"
      panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-lg sm:rounded-[32px] sm:border sm:border-slate-200 sm:shadow-2xl"
    >
      <div data-testid="plan-editor-modal" className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[32px] sm:px-6">
        <div className="flex items-center gap-3">
          <Edit2 className="h-5 w-5 text-medace-600" />
          <div>
            <div className="text-lg font-black text-slate-950">学習プランの編集</div>
            <div className="mt-1 text-sm text-slate-500">1日の目標単語数と学習対象コースを調整します。</div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">
      <div className="space-y-6">
        {isMobileViewport && (
          <div className="rounded-[28px] bg-medace-500 px-4 py-4 text-white">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/58">Plan Summary</div>
            <div className="mt-2 text-lg font-black tracking-tight">{dailyGoal}語 / 日で進める</div>
            <div className="mt-2 text-sm leading-relaxed text-white/78">
              選択中 {selectedBooks.length} 冊。多すぎると毎日の出題が散るので、最初は 1-3 冊がおすすめです。
            </div>
          </div>
        )}
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">1日の目標単語数</label>
          {isMobileViewport && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {dailyGoalPresets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => onChangeDailyGoal(preset)}
                  className={`min-h-11 shrink-0 rounded-full border px-4 py-3 text-sm font-bold transition-colors ${
                    dailyGoal === preset
                      ? 'border-medace-500 bg-medace-50 text-medace-700'
                      : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {preset}語
                </button>
              ))}
            </div>
          )}
          <input
            type="number"
            value={dailyGoal}
            onChange={(event) => onChangeDailyGoal(Number(event.target.value))}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-medace-500"
            min="5"
            max="100"
          />
          <p className="mt-1 text-xs text-slate-400">無理のない範囲で設定しましょう。推奨は 10-30 語です。</p>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="block text-sm font-bold text-slate-700">学習対象のコースを選択</label>
            <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">
              {selectedBooks.length}冊選択中
            </div>
          </div>
          {isMobileViewport && selectedBooks.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              {selectedBooks.map((book) => (
                <span key={book.id} className="shrink-0 rounded-full border border-medace-200 bg-medace-50 px-3 py-1.5 text-xs font-bold text-medace-700">
                  {book.title}
                </span>
              ))}
            </div>
          )}
          <div className={`overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100 ${isMobileViewport ? 'max-h-[36dvh]' : 'max-h-[45dvh]'}`}>
            {planningBooks.map((book) => (
              <div
                key={book.id}
                onClick={() => onToggleBook(book.id)}
                className={`flex min-h-12 cursor-pointer items-center gap-3 p-3 hover:bg-slate-50 ${selectedBookIds.includes(book.id) ? 'bg-medace-50' : ''}`}
              >
                <div className={`flex h-5 w-5 items-center justify-center rounded border ${selectedBookIds.includes(book.id) ? 'border-medace-500 bg-medace-500 text-white' : 'border-slate-300 bg-white'}`}>
                  {selectedBookIds.includes(book.id) && <Check className="h-3 w-3" />}
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-800">{book.title}</div>
                  {book.isPriority && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">推奨</span>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-400">選択したコースから日々の問題が出題されます。</p>
        </div>
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
            onClick={onSave}
            data-testid="plan-editor-save-button"
            className="min-h-11 rounded-xl bg-medace-600 px-5 py-3 font-bold text-white shadow-lg transition-all hover:bg-medace-700"
          >
            設定を更新する
          </button>
        </div>
      </MobileStickyActionBar>
    </MobileSheetDialog>
  );
};

export default PlanEditorModal;
