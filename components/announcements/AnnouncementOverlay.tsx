import React from 'react';
import { AlertTriangle, BellRing } from 'lucide-react';
import { AnnouncementSeverity, type ProductAnnouncementFeed } from '../../types';

interface AnnouncementOverlayProps {
  feed: ProductAnnouncementFeed;
  onAcknowledge: (announcementId: string) => void;
  onDismissMajor: (announcementId: string) => void;
}

const AnnouncementOverlay: React.FC<AnnouncementOverlayProps> = ({
  feed,
  onAcknowledge,
  onDismissMajor,
}) => {
  return (
    <>
      {feed.stickyBanner && (
        <div className="fixed left-4 right-4 top-4 z-[65] mx-auto max-w-4xl rounded-2xl border border-red-200 bg-red-50 px-4 py-4 shadow-lg" data-testid="announcement-sticky-banner">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-red-700">
                <AlertTriangle className="h-4 w-4" />
                <span className="text-sm font-black">重要なお知らせ</span>
              </div>
              <div className="mt-2 text-base font-black text-slate-950">{feed.stickyBanner.title}</div>
              <div className="mt-2 text-sm leading-relaxed text-slate-700">{feed.stickyBanner.body}</div>
            </div>
            <button
              type="button"
              onClick={() => onAcknowledge(feed.stickyBanner!.id)}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white"
            >
              確認しました
            </button>
          </div>
        </div>
      )}

      {feed.highestPriorityModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/55 px-4" data-testid="announcement-modal">
          <div className="max-w-xl rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-2 text-medace-700">
              <BellRing className="h-5 w-5" />
              <span className="text-sm font-bold">
                {feed.highestPriorityModal.severity === AnnouncementSeverity.CRITICAL ? '重要なお知らせ' : '重要アップデート'}
              </span>
            </div>
            <div className="mt-4 text-2xl font-black tracking-tight text-slate-950">{feed.highestPriorityModal.title}</div>
            <div className="mt-3 text-sm leading-relaxed text-slate-700">{feed.highestPriorityModal.body}</div>
            <div className="mt-6 flex justify-end gap-3">
              {feed.highestPriorityModal.severity !== AnnouncementSeverity.CRITICAL && (
                <button
                  type="button"
                  onClick={() => onDismissMajor(feed.highestPriorityModal!.id)}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
                >
                  閉じる
                </button>
              )}
              <button
                type="button"
                onClick={() => onAcknowledge(feed.highestPriorityModal!.id)}
                className="rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-white"
              >
                確認しました
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AnnouncementOverlay;
