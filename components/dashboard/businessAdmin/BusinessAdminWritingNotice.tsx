import React from 'react';

import {
  getBusinessAdminWritingNotice,
  type BusinessAdminWritingState,
} from '../../../shared/businessAdminWritingState';

interface BusinessAdminWritingNoticeProps {
  state: BusinessAdminWritingState;
  onRetry?: () => Promise<void>;
}

const BusinessAdminWritingNotice: React.FC<BusinessAdminWritingNoticeProps> = ({ state, onRetry }) => {
  const notice = getBusinessAdminWritingNotice(state);
  if (!notice) return null;

  return (
    <section
      data-testid="business-admin-writing-state"
      data-writing-state={state}
      tabIndex={-1}
      role={state === 'ERROR' ? 'alert' : 'status'}
      className="min-w-0 rounded-3xl border border-medace-200 bg-medace-50 p-5 text-medace-950 sm:p-6"
    >
      <p className="text-sm font-bold text-medace-800">作文機能：{notice.value}</p>
      <h3 className="mt-2 text-xl font-black">{notice.title}</h3>
      <p className="mt-3 text-sm leading-relaxed">{notice.description}</p>
      {state === 'ERROR' && onRetry && (
        <button
          type="button"
          onClick={(event) => {
            event.currentTarget.parentElement?.focus();
            void onRetry();
          }}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-xl border border-medace-300 bg-white px-4 py-2 text-sm font-bold text-medace-950 hover:bg-medace-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medace-600"
        >
          作文情報を再取得
        </button>
      )}
    </section>
  );
};

export default BusinessAdminWritingNotice;
