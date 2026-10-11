import { normalizeStudySessionStartId, studySessionStartFingerprint, type StudySessionStartRequest } from '../shared/studySessionStart';

const HISTORY_KEY = 'steadyStudyStart';

/** Keeps one start per browser history entry, including refresh and Back.
 * Navigation writes the entry before the controller calls this helper. */
export const getStudySessionStartId = (uid: string, request: StudySessionStartRequest): string => {
  const fingerprint = studySessionStartFingerprint(request);
  if (typeof window === 'undefined') return crypto.randomUUID();
  const route = `${window.location.pathname}${window.location.search}`;
  const state = window.history.state;
  const stored = state && typeof state === 'object' ? state[HISTORY_KEY] : undefined;
  if (stored?.uid === uid && stored?.route === route && stored?.fingerprint === fingerprint) {
    try {
      const id = normalizeStudySessionStartId(stored.id);
      if (id) return id;
    } catch { /* An invalid browser-local value is replaced, never trusted. */ }
  }
  const id = crypto.randomUUID();
  window.history.replaceState({ ...(state && typeof state === 'object' ? state : {}),
    [HISTORY_KEY]: { uid, route, fingerprint, id } }, '', route);
  return id;
};
