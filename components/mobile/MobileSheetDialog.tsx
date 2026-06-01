import React from 'react';
import ModalOverlay from '../ModalOverlay';

interface MobileSheetDialogProps {
  children: React.ReactNode;
  onClose: () => void;
  mode?: 'sheet' | 'fullscreen';
  panelClassName?: string;
  closeOnOverlayClick?: boolean;
  zIndexClassName?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  initialFocusSelector?: string;
}

const MobileSheetDialog: React.FC<MobileSheetDialogProps> = ({
  children,
  onClose,
  mode = 'sheet',
  panelClassName = '',
  closeOnOverlayClick = true,
  zIndexClassName,
  ariaLabel,
  ariaLabelledBy,
  initialFocusSelector,
}) => (
  <ModalOverlay
    onClose={onClose}
    mobileBehavior={mode}
    closeOnOverlayClick={closeOnOverlayClick}
    panelClassName={panelClassName}
    zIndexClassName={zIndexClassName}
    ariaLabel={ariaLabel}
    ariaLabelledBy={ariaLabelledBy}
    initialFocusSelector={initialFocusSelector}
  >
    {children}
  </ModalOverlay>
);

export default MobileSheetDialog;
