import React, { useId, useLayoutEffect, useRef } from 'react';
import { AlertTriangle, BellRing } from 'lucide-react';
import { AnnouncementSeverity, type ProductAnnouncementFeed } from '../../types';
import ModalOverlay from '../ModalOverlay';

interface AnnouncementOverlayProps {
  feed: ProductAnnouncementFeed;
  onAcknowledge: (announcementId: string) => void;
  onDismissMajor: (announcementId: string) => void;
  suppressModal?: boolean;
}

interface AnnouncementModalProps {
  announcement: NonNullable<ProductAnnouncementFeed['highestPriorityModal']>;
  onAcknowledge: AnnouncementOverlayProps['onAcknowledge'];
  onDismissMajor: AnnouncementOverlayProps['onDismissMajor'];
}

const AnnouncementModal: React.FC<AnnouncementModalProps> = ({ announcement, onAcknowledge, onDismissMajor }) => {
  const contentRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();
  const isCritical = announcement.severity === AnnouncementSeverity.CRITICAL;

  // This parent cleans up before ModalOverlay restores focus, including the
  // StrictMode effect replay. The previous control must be usable again first.
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    const previousInert = new Map<HTMLElement, string | null>();
    const disableBackground = () => {
      for (const child of Array.from(document.body.children)) {
        if (!(child instanceof HTMLElement) || child.contains(content) || ['SCRIPT', 'STYLE', 'LINK'].includes(child.tagName)) continue;
        if (!previousInert.has(child)) previousInert.set(child, child.getAttribute('inert'));
        child.setAttribute('inert', '');
      }
    };
    disableBackground();
    const observer = new MutationObserver(disableBackground);
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      for (const [element, attribute] of previousInert) {
        if (attribute === null) element.removeAttribute('inert');
        else element.setAttribute('inert', attribute);
      }
    };
  }, []);

  return (
    <ModalOverlay
      onClose={() => { if (!isCritical) onDismissMajor(announcement.id); }}
      closeOnOverlayClick={false}
      align="center"
      zIndexClassName="z-[80]"
      panelClassName="max-w-xl"
      ariaLabelledBy={titleId}
      initialFocusSelector="[data-testid='announcement-acknowledge']"
      focusPriority={100}
    >
      <div ref={contentRef} className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl" data-testid="announcement-modal">
        <div className="flex items-center gap-2 text-medace-700">
          <BellRing className="h-5 w-5" />
          <span className="text-sm font-bold">{isCritical ? '重要なお知らせ' : '重要アップデート'}</span>
        </div>
        <h2 id={titleId} className="mt-4 text-2xl font-black tracking-tight text-slate-950">{announcement.title}</h2>
        <div className="mt-3 text-sm leading-relaxed text-slate-700">{announcement.body}</div>
        <div className="mt-6 flex justify-end gap-3">
          {!isCritical && (
            <button
              type="button"
              onClick={() => onDismissMajor(announcement.id)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
            >
              閉じる
            </button>
          )}
          <button
            type="button"
            data-testid="announcement-acknowledge"
            onClick={() => onAcknowledge(announcement.id)}
            className="rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-slate-950"
          >
            確認しました
          </button>
        </div>
      </div>
    </ModalOverlay>
  );
};

const AnnouncementOverlay: React.FC<AnnouncementOverlayProps> = ({
  feed,
  onAcknowledge,
  onDismissMajor,
  suppressModal = false,
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

      {!suppressModal && feed.highestPriorityModal && (
        <AnnouncementModal
          key={feed.highestPriorityModal.id}
          announcement={feed.highestPriorityModal}
          onAcknowledge={onAcknowledge}
          onDismissMajor={onDismissMajor}
        />
      )}
    </>
  );
};

export default AnnouncementOverlay;
