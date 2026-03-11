import React from 'react';
import ModalOverlay from '../ModalOverlay';

interface MobileSheetDialogProps {
  children: React.ReactNode;
  onClose: () => void;
  mode?: 'sheet' | 'fullscreen';
  panelClassName?: string;
  closeOnOverlayClick?: boolean;
  zIndexClassName?: string;
}

const MobileSheetDialog: React.FC<MobileSheetDialogProps> = ({
  children,
  onClose,
  mode = 'sheet',
  panelClassName = '',
  closeOnOverlayClick = true,
  zIndexClassName,
}) => (
  <ModalOverlay
    onClose={onClose}
    mobileBehavior={mode}
    closeOnOverlayClick={closeOnOverlayClick}
    panelClassName={panelClassName}
    zIndexClassName={zIndexClassName}
  >
    {children}
  </ModalOverlay>
);

export default MobileSheetDialog;
