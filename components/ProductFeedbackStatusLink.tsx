import React from 'react';
import type { ProductFeedbackStatus } from '../contracts/productFeedback';
import { useProductFeedbackStatus } from '../hooks/useProductFeedbackStatus';

export interface ProductFeedbackStatusLinkProps {
  contextKey: string | null;
  audience: 'teacher' | 'admin';
  onOpen: (status?: ProductFeedbackStatus) => void;
  refreshKey?: string | number;
}

export const ProductFeedbackStatusLink: React.FC<ProductFeedbackStatusLinkProps> = ({ contextKey, audience, onOpen, refreshKey }) => {
  const state = useProductFeedbackStatus(contextKey, true, refreshKey);
  if (!contextKey) return null;
  const correctScope = state.data?.canManage === (audience === 'admin');
  const data = correctScope ? state.data : null;
  const scopeChanged = Boolean(state.data && !correctScope);
  const buttons: { status: ProductFeedbackStatus; label: string }[] = audience === 'teacher'
    ? [{ status: 'FIXED', label: '再テスト待ち' }]
    : [{ status: 'NEW', label: '確認待ち' }, { status: 'RETEST_FAIL', label: '再テスト失敗' }, { status: 'FIXED', label: '全体の再テスト待ち' }];
  return (
    <div className="rounded-2xl border border-orange-200 bg-[#FDF3ED] p-4 text-[#2F1609]" aria-busy={state.loading} data-testid="product-feedback-status">
      <p className="text-sm font-bold">{audience === 'teacher' ? '自分の操作報告' : '操作報告の対応状況'}</p>
      {state.loading && <p className="mt-2 text-sm" role="status">{data ? '件数を更新しています（前回取得した件数を表示）。' : '報告状況を取得しています。'}</p>}
      {(state.error || scopeChanged) && (
        <div className="mt-2 text-sm" role="alert">
          <p>{scopeChanged ? '権限が変わりました。報告状況を再取得してください。' : state.message}</p>
          {data && <p>前回取得した件数を表示しています。</p>}
          <button type="button" disabled={state.loading} onClick={() => { void state.refresh(); }} className="mt-1 min-h-11 rounded-lg px-3 font-bold underline disabled:opacity-60">件数を再取得</button>
        </div>
      )}
      {data && <div className="mt-2 flex flex-wrap gap-2">
        {buttons.map(({ status, label }) => <button key={status} type="button" onClick={() => onOpen(status)} className="min-h-11 max-w-full break-words rounded-xl border border-orange-300 bg-white px-3 py-2 text-sm font-bold hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F1609]">{label} {data.counts[status]}件</button>)}
      </div>}
      <button type="button" onClick={() => onOpen()} className="mt-2 min-h-11 max-w-full break-words rounded-xl bg-[#F66D0B] px-3 py-2 text-sm font-bold text-[#2F1609] hover:bg-orange-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2F1609]">{audience === 'teacher' ? '報告する・対応を見る' : 'すべての報告を見る'}</button>
    </div>
  );
};

export default ProductFeedbackStatusLink;
