import React from 'react';

import {
  getBusinessAdminWritingNotice,
  type BusinessAdminWritingState,
} from '../../../shared/businessAdminWritingState';

interface BusinessAdminWritingNoticeProps {
  state: BusinessAdminWritingState;
}

const BusinessAdminWritingNotice: React.FC<BusinessAdminWritingNoticeProps> = ({ state }) => {
  const notice = getBusinessAdminWritingNotice(state);
  if (!notice) return null;

  return (
    <section
      data-testid="business-admin-writing-state"
      data-writing-state={state}
      role={state === 'ERROR' ? 'alert' : 'status'}
      className="min-w-0 rounded-3xl border border-medace-200 bg-medace-50 p-5 text-medace-950 sm:p-6"
    >
      <p className="text-sm font-bold text-medace-800">作文機能：{notice.value}</p>
      <h3 className="mt-2 text-xl font-black">{notice.title}</h3>
      <p className="mt-3 text-sm leading-relaxed">{notice.description}</p>
    </section>
  );
};

export default BusinessAdminWritingNotice;
