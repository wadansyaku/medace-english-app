import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE_SELECTOR = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), details > summary:first-of-type, [tabindex]:not([tabindex="-1"])';
const getFocusableControls = (panel: HTMLElement): HTMLElement[] => Array.from(panel.querySelectorAll(FOCUSABLE_SELECTOR))
  .filter((element): element is HTMLElement => {
    if (!(element instanceof HTMLElement) || element.hasAttribute('disabled') || element.tabIndex < 0 || element.getClientRects().length === 0) return false;
    // Chrome can expose layout boxes for controls inside closed details.
    // Only that details element's first summary remains keyboard reachable.
    for (let ancestor = element.parentElement; ancestor && ancestor !== panel; ancestor = ancestor.parentElement) {
      if (ancestor instanceof HTMLDetailsElement && !ancestor.open) {
        const summary = Array.from(ancestor.children).find(child => child.tagName === 'SUMMARY');
        if (!summary?.contains(element)) return false;
      }
    }
    return true;
  });

interface OpenPanel {
  panel: HTMLDivElement;
  focusPriority: number;
}

const openPanels: OpenPanel[] = [];
const getTopPanel = (): HTMLDivElement | undefined => {
  let top: OpenPanel | undefined;
  for (const entry of openPanels) {
    const { panel } = entry;
    if (!panel.isConnected || panel.closest('[inert], [hidden], [aria-hidden="true"]') || panel.getClientRects().length === 0) continue;
    const visibility = window.getComputedStyle(panel).visibility;
    if (visibility === 'hidden' || visibility === 'collapse') continue;
    // Equal priorities keep the existing last-opened-modal ordering.
    if (!top || entry.focusPriority >= top.focusPriority) top = entry;
  }
  return top?.panel;
};
let scrollStyleBeforeModals: { bodyOverflow: string; htmlOverflow: string; bodyPaddingRight: string } | null = null;

interface ModalOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
  zIndexClassName?: string;
  closeOnOverlayClick?: boolean;
  align?: 'top' | 'center';
  mobileBehavior?: 'default' | 'sheet' | 'fullscreen';
  ariaLabel?: string;
  ariaLabelledBy?: string;
  initialFocusSelector?: string;
  returnFocusSelector?: string;
  focusPriority?: number;
}

const ModalOverlay: React.FC<ModalOverlayProps> = ({
  children,
  onClose,
  panelClassName = '',
  zIndexClassName = 'z-50',
  closeOnOverlayClick = true,
  align = 'top',
  mobileBehavior = 'default',
  ariaLabel,
  ariaLabelledBy,
  initialFocusSelector,
  returnFocusSelector,
  focusPriority = 0,
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusSelectorRef = useRef(returnFocusSelector);

  useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusSelectorRef.current = returnFocusSelector;
  }, [onClose, returnFocusSelector]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    if (openPanels.length === 0) {
      scrollStyleBeforeModals = {
        bodyOverflow: document.body.style.overflow,
        htmlOverflow: document.documentElement.style.overflow,
        bodyPaddingRight: document.body.style.paddingRight,
      };
      const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);
      const currentPadding = parseFloat(window.getComputedStyle(document.body).paddingRight) || 0;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
    }
    const entry = { panel, focusPriority };
    openPanels.push(entry);
    const isTopPanel = () => getTopPanel() === panel;

    // Focus before the first paint. A delayed frame can move focus back to
    // the first field after someone has already started the next one.
    const initialFocusTarget = initialFocusSelector
        ? panel?.querySelector<HTMLElement>(initialFocusSelector)
        : null;
    const fallbackFocusTarget = getFocusableControls(panel)[0];
    // A deferred background dialog must not steal focus from a higher-priority
    // notice, even before that notice's observer makes its portal inert.
    if (isTopPanel()) (initialFocusTarget || fallbackFocusTarget || panel).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopPanel()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab' || !panelRef.current) {
        return;
      }

      const focusableElements = getFocusableControls(panelRef.current);

      if (focusableElements.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }

      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];
      if (document.activeElement === panelRef.current || !panelRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus();
        return;
      }
      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const wasTopPanel = isTopPanel();
      const panelIndex = openPanels.indexOf(entry);
      if (panelIndex >= 0) openPanels.splice(panelIndex, 1);
      if (openPanels.length === 0 && scrollStyleBeforeModals) {
        document.body.style.overflow = scrollStyleBeforeModals.bodyOverflow;
        document.documentElement.style.overflow = scrollStyleBeforeModals.htmlOverflow;
        document.body.style.paddingRight = scrollStyleBeforeModals.bodyPaddingRight;
        scrollStyleBeforeModals = null;
      }
      if (!wasTopPanel) return;
      const previousFocus = previouslyFocusedRef.current;
      const canRestorePrevious = previousFocus?.isConnected && previousFocus !== document.body && previousFocus !== document.documentElement;
      const fallback = returnFocusSelectorRef.current
        ? document.querySelector<HTMLElement>(returnFocusSelectorRef.current)
        : null;
      const nextPanel = getTopPanel();
      const focusTarget = canRestorePrevious ? previousFocus : fallback;
      (nextPanel && (!focusTarget || !nextPanel.contains(focusTarget)) ? nextPanel : focusTarget)?.focus({ preventScroll: true });
    };
  }, [initialFocusSelector, focusPriority]);

  if (typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      className={`fixed inset-0 ${zIndexClassName} overflow-y-auto bg-medace-900/45 backdrop-blur-sm`}
      onClick={(event) => {
        if (closeOnOverlayClick && event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        onClick={(event) => {
          if (closeOnOverlayClick && event.target === event.currentTarget) onClose();
        }}
        className={`flex min-h-full justify-center ${
          mobileBehavior === 'default'
            ? `p-3 sm:p-6 ${align === 'center' ? 'items-center' : 'items-start sm:items-center'}`
            : `items-end p-0 sm:p-6 sm:${align === 'center' ? 'items-center' : 'items-center'}`
        }`}
      >
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabelledBy ? undefined : (ariaLabel || 'ダイアログ')}
          aria-labelledby={ariaLabelledBy}
          tabIndex={-1}
          className={`relative w-full outline-none ${panelClassName} ${
            mobileBehavior === 'sheet'
              ? 'my-0 min-h-[72dvh] max-h-[92dvh] rounded-t-[32px] rounded-b-none w-screen max-w-none sm:my-4 sm:min-h-0 sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:max-w-[min(100vw,48rem)] sm:rounded-[32px]'
              : mobileBehavior === 'fullscreen'
                ? 'my-0 min-h-[100dvh] max-h-[100dvh] w-screen max-w-none rounded-none sm:my-4 sm:min-h-0 sm:max-h-[calc(100dvh-3rem)] sm:w-full sm:max-w-[min(100vw,64rem)] sm:rounded-[32px]'
                : 'my-4'
          }`}
          onClick={(event) => event.stopPropagation()}
        >
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ModalOverlay;
