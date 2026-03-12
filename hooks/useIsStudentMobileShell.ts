import type { UserProfile } from '../types';
import { UserRole } from '../types';
import useIsMobileViewport from './useIsMobileViewport';

const useIsStudentMobileShell = (user: UserProfile | null | undefined): boolean => {
  const isMobileViewport = useIsMobileViewport();
  return isMobileViewport && user?.role === UserRole.STUDENT;
};

export default useIsStudentMobileShell;
