import React from 'react';
import { ANNOUNCEMENT_SEVERITY_LABELS, type ProductAnnouncementFeed } from '../../types';

interface DashboardAnnouncementSectionProps {
  feed: ProductAnnouncementFeed;
}

const DashboardAnnouncementSection: React.FC<DashboardAnnouncementSectionProps> = ({ feed }) => {
  if (feed.announcements.length === 0) return null;

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm" data-testid="dashboard-announcement-section">
      <p className="text-xs font-bold text-slate-400">お知らせ</p>
      <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">最近のお知らせ</h3>
      <div className="mt-5 space-y-3">
        {feed.announcements.slice(0, 3).map((announcement) => (
          <div key={announcement.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-bold text-slate-900">{announcement.title}</div>
              <div className="rounded-full border border-medace-200 bg-white px-3 py-1 text-xs font-bold text-medace-700">
                {ANNOUNCEMENT_SEVERITY_LABELS[announcement.severity]}
              </div>
            </div>
            <div className="mt-2 text-sm leading-relaxed text-slate-600">{announcement.body}</div>
          </div>
        ))}
      </div>
    </section>
  );
};

export default DashboardAnnouncementSection;
