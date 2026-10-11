import React from 'react';
import { PRODUCT_SUPPORT_TARGET_VERSION, resolveProductSupportSources, type ProductSupportRole } from '../shared/productSupportKnowledge';

export interface ProductSupportSourceLocation { sourceId: string; targetVersion: string }

/** Capture this before useAppNavigation normalizes the /public query. */
export const readProductSupportSourceLocation = (
  pathname = typeof window === 'undefined' ? '' : window.location.pathname,
  search = typeof window === 'undefined' ? '' : window.location.search,
): ProductSupportSourceLocation | null => {
  if (pathname.replace(/\/+$/, '') !== '/public') return null;
  const params = new URLSearchParams(search);
  if (!params.has('supportSource')) return null;
  const ids = params.getAll('supportSource');
  const versions = params.getAll('supportVersion');
  const sourceId = ids.length === 1 && /^[a-z0-9-]{1,128}$/.test(ids[0]) ? ids[0] : '';
  const targetVersion = !versions.length || versions.length === 1 && versions[0] === PRODUCT_SUPPORT_TARGET_VERSION
    ? PRODUCT_SUPPORT_TARGET_VERSION : 'unsupported';
  return { sourceId, targetVersion };
};

export const buildProductSupportSourcePath = (location: ProductSupportSourceLocation): string =>
  `/public?supportSource=${encodeURIComponent(location.sourceId)}${location.targetVersion === PRODUCT_SUPPORT_TARGET_VERSION ? '' : '&supportVersion=unsupported'}`;

const ProductSupportSourcePage: React.FC<ProductSupportSourceLocation & {
  role: ProductSupportRole; onBack: () => void;
}> = ({ sourceId, targetVersion, role, onBack }) => {
  const resolved = resolveProductSupportSources([sourceId], role, targetVersion);
  const source = resolved?.[0];
  // Student help must not introduce staff entry instructions.
  const visible = source && !(role === 'STUDENT' && source.topic === 'staff-login') ? source : null;
  return <section className="mx-auto w-full max-w-2xl min-w-0 space-y-5 rounded-2xl border border-medace-100 bg-white p-4 text-[#2F1609] sm:p-6 [overflow-wrap:anywhere]" data-testid="product-support-source-page">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-bold">使い方案内の根拠</h2>
      <button type="button" onClick={onBack} className="min-h-11 rounded-xl border border-medace-200 bg-[#FDF3ED] px-4 py-2 text-sm font-bold">{role === 'GUEST' ? '公開案内へ戻る' : '自分の画面へ戻る'}</button>
    </div>
    {visible ? <article className="space-y-3" data-testid="product-support-source-body">
      <h3 className="text-lg font-bold">{visible.title}</h3>
      <p className="whitespace-pre-wrap text-base leading-7">{visible.content}</p>
      <dl className="space-y-2 rounded-xl bg-[#FDF3ED] p-3 text-sm leading-6">
        <div><dt className="font-bold">根拠ID</dt><dd>{visible.sourceId}</dd></div>
        <div><dt className="font-bold">確認日</dt><dd>{visible.checkedAt}</dd></div>
        <div><dt className="font-bold">仕様版</dt><dd>{visible.targetVersion}</dd></div>
      </dl>
      <p className="text-sm leading-6">確認した公開仕様の説明です。個人の保存結果や学習効果を保証するものではありません。</p>
    </article> : <p role="status" className="text-sm leading-7">この根拠を現在の案内で確認できません。上の戻るボタンから、現在の画面へ戻れます。</p>}
  </section>;
};

export default ProductSupportSourcePage;
