import React from 'react';
import { AlertCircle } from 'lucide-react';

const B2BStorageModeBanner: React.FC = () => (
  <div data-testid="b2b-storage-mode-banner" className="rounded-[24px] border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-900">
    <div className="flex items-start gap-3">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
      <div>
        <div className="font-bold text-amber-800">ローカル擬似データを表示中</div>
        <div className="mt-1 leading-relaxed text-amber-900/85">
          現在の B2B 指標は IndexedDB 上のローカル参考値です。担当割当率や通知後再開率は実運用の意思決定には使わず、画面確認用として扱ってください。
        </div>
      </div>
    </div>
  </div>
);

export default B2BStorageModeBanner;
