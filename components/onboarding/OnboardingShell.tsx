import React from 'react';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';

export interface OnboardingShellProps {
  testId: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  containerClassName?: string;
  footerClassName?: string;
}

const OnboardingShell: React.FC<OnboardingShellProps> = ({
  testId,
  children,
  footer,
  containerClassName = 'max-w-6xl',
  footerClassName = 'max-w-6xl',
}) => (
  <div data-testid={testId} className="bg-[#fff8f1] px-3 pb-24 pt-3 sm:px-4 md:px-6 md:pb-8 md:pt-8">
    <div className={`mx-auto ${containerClassName} space-y-4 md:space-y-6`}>{children}</div>
    {footer && (
      <MobileStickyActionBar className={`safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur md:static md:z-auto md:mx-auto md:mt-6 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none ${footerClassName}`}>
        {footer}
      </MobileStickyActionBar>
    )}
  </div>
);

export default OnboardingShell;
