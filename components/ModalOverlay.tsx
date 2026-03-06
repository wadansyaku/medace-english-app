import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

interface ModalOverlayProps {
  children: React.ReactNode;
  onClose: () => void;
  panelClassName?: string;
  zIndexClassName?: string;
  closeOnOverlayClick?: boolean;
  align?: 'top' | 'center';
}

const ModalOverlay: React.FC<ModalOverlayProps> = ({
  children,
  onClose,
  panelClassName = '',
  zIndexClassName = 'z-50',
  closeOnOverlayClick = true,
  align = 'top',
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
      <div className={`flex min-h-full justify-center p-3 sm:p-6 ${align === 'center' ? 'items-center' : 'items-start sm:items-center'}`}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          tabIndex={-1}
          className={`relative my-4 w-full outline-none ${panelClassName}`}
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
