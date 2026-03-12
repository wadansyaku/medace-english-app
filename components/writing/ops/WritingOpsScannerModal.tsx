import React from 'react';
import { Loader2, ScanText } from 'lucide-react';

import type { WritingAssignment } from '../../../types';
import ModalOverlay from '../../ModalOverlay';

interface WritingOpsScannerModalProps {
  scannerTarget: WritingAssignment;
  scannerFiles: File[];
  scannerManualTranscript: string;
  submittingScan: boolean;
  onClose: () => void;
  onFilesChange: (files: File[]) => void;
  onManualTranscriptChange: (value: string) => void;
  onSubmit: () => void;
}

const WritingOpsScannerModal: React.FC<WritingOpsScannerModalProps> = ({
  scannerTarget,
  scannerFiles,
  scannerManualTranscript,
  submittingScan,
  onClose,
  onFilesChange,
  onManualTranscriptChange,
  onSubmit,
}) => (
  <ModalOverlay
    onClose={onClose}
    panelClassName="max-w-3xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl"
  >
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Staff Scanner Submit</p>
      <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{scannerTarget.promptTitle}</h3>
      <p className="mt-2 text-sm text-slate-500">
        校舎で取り込んだ PDF 1枚または画像最大4枚まで提出できます。OCR補助用のテキストも入力できます。
      </p>
      <div className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">答案ファイル</label>
          <input
            type="file"
            accept="application/pdf,image/*"
            multiple
            onChange={(event) => onFilesChange(Array.from(event.target.files || []))}
            className="mt-2 block w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 file:mr-3 file:rounded-full file:border-0 file:bg-white file:px-3 file:py-2 file:text-sm file:font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">補助テキスト（任意）</label>
          <textarea
            value={scannerManualTranscript}
            onChange={(event) => onManualTranscriptChange(event.target.value)}
            className="mt-2 min-h-32 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
            placeholder="OCR 補助のために本文を入力できます。"
          />
        </div>
      </div>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600"
        >
          キャンセル
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submittingScan || scannerFiles.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
        >
          {submittingScan ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanText className="h-4 w-4" />}
          スキャン答案を登録する
        </button>
      </div>
    </div>
  </ModalOverlay>
);

export default WritingOpsScannerModal;
