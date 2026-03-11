import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
  zIndexClassName?: string;
  closeOnOverlayClick?: boolean;
  align?: 'top' | 'center';
  mobileBehavior?: 'default' | 'sheet' | 'fullscreen';
}

const ModalOverlay: React.FC<ModalOverlayProps> = ({
  children,
  onClose,
  panelClassName = '',
  zIndexClassName = 'z-50',
  closeOnOverlayClick = true,
  align = 'top',
  mobileBehavior = 'default',
}) => {
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    const previousBodyPaddingRight = document.body.style.paddingRight;
    const scrollbarWidth = Math.max(0, window.innerWidth - document.documentElement.clientWidth);

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
      document.body.style.paddingRight = previousBodyPaddingRight;
    };
  }, [onClose]);

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
