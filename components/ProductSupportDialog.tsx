import React, { useState } from 'react';
import ModalOverlay from './ModalOverlay';
import ProductSupportConversation, { type ProductSupportConversationProps } from './ProductSupportConversation';

export interface ProductSupportDialogProps extends Omit<ProductSupportConversationProps, 'open' | 'onDraft'> {
  open: boolean;
  onClose: () => void;
  onDraft?: (question: string) => void;
}

const OpenProductSupportDialog: React.FC<ProductSupportDialogProps> = props => {
  const [draft, setDraft] = useState<string | null>(null);
  const [copyNotice, setCopyNotice] = useState('');
  const prepareDraft = (question: string) => {
    if (props.onDraft) props.onDraft(question);
    else { setDraft(question); setCopyNotice(''); }
  };
  return <ModalOverlay onClose={props.onClose} ariaLabel="公開案内の会話" mobileBehavior="fullscreen"
    panelClassName="overflow-y-auto bg-[#FDF3ED] p-4 text-[#2F1609] sm:p-6"
    initialFocusSelector="[data-support-dialog-close]" returnFocusSelector="[data-product-support-trigger]">
    <div className="sticky -top-4 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-medace-100 bg-[#FDF3ED] px-4 py-3 sm:-top-6 sm:-mx-6 sm:px-6">
      <h2 className="text-lg font-bold">公開案内の会話（生成OFF）</h2>
      <button type="button" data-support-dialog-close onClick={props.onClose} className="min-h-11 rounded-xl border border-medace-200 bg-white px-3 py-2 text-sm font-bold">戻る・閉じる</button>
    </div>
    <p className="my-3 text-sm leading-6">確認済みの公開案内から答えます。AIによる回答生成は停止中です。分からない内容は確認をお願いするか、報告の下書きにできます。</p>
    <ProductSupportConversation role={props.role} contextKey={props.contextKey} ready={props.ready}
      disabledReason={props.disabledReason} targetVersion={props.targetVersion} onAsk={props.onAsk} onDraft={prepareDraft} />
    {draft !== null && <section className="mt-4 rounded-xl border border-medace-200 bg-white p-4" data-testid="support-local-draft">
      <h3 className="font-bold">報告に使う下書き</h3>
      <p className="mt-2 text-sm leading-6">まだ送信していません。個人の情報を含めず、必要なら内容を確認して手動で伝えてください。</p>
      <label className="mt-3 block text-sm font-bold">下書きの文章<textarea aria-label="報告の下書き" readOnly value={draft} rows={3} className="mt-1 w-full min-w-0 rounded-xl border border-medace-200 p-3 text-base font-normal" /></label>
      <button type="button" className="mt-3 min-h-11 rounded-xl border border-medace-200 px-3 py-2 text-sm font-bold" onClick={() => {
        if (!navigator.clipboard) { setCopyNotice('下書きの文章を選んでコピーできます。'); return; }
        void navigator.clipboard.writeText(draft).then(() => setCopyNotice('下書きをコピーしました。送信はしていません。'))
          .catch(() => setCopyNotice('コピーできませんでした。下書きの文章を選んでコピーできます。'));
      }}>下書きをコピー</button>
      {copyNotice && <p role="status" className="mt-2 text-sm leading-6">{copyNotice}</p>}
    </section>}
  </ModalOverlay>;
};

const ProductSupportDialog: React.FC<ProductSupportDialogProps> = props => props.open
  ? <OpenProductSupportDialog key={JSON.stringify([props.role, props.contextKey, props.targetVersion])} {...props} />
  : null;

export default ProductSupportDialog;
