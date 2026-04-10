import React from 'react';

import type { UserProfile } from '../../../types';
import WorksheetPrintLauncher from '../../WorksheetPrintLauncher';

interface BusinessAdminWorksheetsSectionProps {
  user: UserProfile;
}

const BusinessAdminWorksheetsSection: React.FC<BusinessAdminWorksheetsSectionProps> = ({ user }) => (
  <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Worksheet Ops</p>
      <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">配布用PDF問題を独立して作る</h3>
      <p className="mt-3 text-sm leading-relaxed text-slate-600">
        組織運用と同じ画面に混ぜず、配布物作成だけをここで処理します。今日の授業や面談で配る問題を短時間で用意できます。
      </p>
    </section>
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm">
      <WorksheetPrintLauncher
        user={user}
        buttonLabel="生徒別にPDF問題を作る"
        buttonClassName="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
      />
    </section>
  </div>
);

export default BusinessAdminWorksheetsSection;
