import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const openPanels: HTMLDivElement[] = [];
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
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const returnFocusSelectorRef = useRef(returnFocusSelector);

  useEffect(() => {
    onCloseRef.current = onClose;
    returnFocusSelectorRef.current = returnFocusSelector;
  }, [onClose, returnFocusSelector]);

  useEffect(() => {
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
    openPanels.push(panel);
    const isTopPanel = () => openPanels[openPanels.length - 1] === panel;

    const frame = window.requestAnimationFrame(() => {
      if (!isTopPanel()) return;
      const initialFocusTarget = initialFocusSelector
        ? panel?.querySelector<HTMLElement>(initialFocusSelector)
        : null;
      const fallbackFocusTarget = panel?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      (initialFocusTarget || fallbackFocusTarget || panel)?.focus();
    });

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

      const focusableElements = Array.from(
        panelRef.current.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element): element is HTMLElement => (
        element instanceof HTMLElement
          && !element.hasAttribute('disabled')
          && element.offsetParent !== null
      ));

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
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      const wasTopPanel = isTopPanel();
      const panelIndex = openPanels.indexOf(panel);
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
      const nextPanel = openPanels[openPanels.length - 1];
      const focusTarget = canRestorePrevious ? previousFocus : fallback;
      (nextPanel && (!focusTarget || !nextPanel.contains(focusTarget)) ? nextPanel : focusTarget)?.focus({ preventScroll: true });
    };
  }, [initialFocusSelector]);

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
