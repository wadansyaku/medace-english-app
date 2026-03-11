import React from 'react';

interface MobileStickyActionBarProps {
  children: React.ReactNode;
  className?: string;
}

const MobileStickyActionBar: React.FC<MobileStickyActionBarProps> = ({ children, className = '' }) => (
  <div className={`mobile-sticky-action-bar ${className}`}>
    {children}
  </div>
);

export default MobileStickyActionBar;
