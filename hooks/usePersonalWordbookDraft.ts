import { useCallback, useEffect, useRef, useState } from 'react';
import { readPersonalWordbookDraft, readPersonalWordbookDraftSnapshot, writePersonalWordbookDraft, type PersonalWordbookDraft } from '../shared/personalWordbookDraft';

export const usePersonalWordbookDraft = (ownerUid: string) => {
  const [state, setState] = useState(() => readPersonalWordbookDraft(ownerUid));
  const [persisted, setPersisted] = useState(true);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const current = useRef(state);
  const lastWriteSucceeded = useRef(true);
  const failedWriteBase = useRef<string | null>(null);
  // Never render another account's draft while the effect is waiting to run.
  if (current.current.ownerUid !== ownerUid) current.current = readPersonalWordbookDraft(ownerUid);
  const draft = state.ownerUid === ownerUid ? state : current.current;
  useEffect(() => { if (state.ownerUid !== ownerUid) { setState(current.current); setPersisted(true); } }, [ownerUid, state.ownerUid]);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key !== `steady-study:personal-wordbook-draft:v1:${encodeURIComponent(ownerUid)}`) return;
      const next = readPersonalWordbookDraft(ownerUid);
      current.current = next; setState(next); setChangedElsewhere(true);
    };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, [ownerUid]);
  const updateDraft = useCallback((value: PersonalWordbookDraft | ((previous: PersonalWordbookDraft) => PersonalWordbookDraft), resolvedRequestId?: string) => {
    const next = { ...(typeof value === 'function' ? value(current.current) : value), ownerUid, updatedAt: Date.now() };
    const snapshot = readPersonalWordbookDraftSnapshot(ownerUid);
    const latest = snapshot.available ? snapshot.draft : current.current;
    // Completing an old request must not replace a new draft from another tab.
    // A failed local write may still complete its own in-memory request, but
    // only while the stored value has not changed since that failed write.
    const ownMemoryRequest = current.current.pendingRequest?.clientImportId === resolvedRequestId
      && !lastWriteSucceeded.current && snapshot.raw === failedWriteBase.current;
    if (resolvedRequestId && latest.pendingRequest?.clientImportId !== resolvedRequestId
      && !ownMemoryRequest) {
      current.current = latest; setState(latest); setChangedElsewhere(true);
      return latest;
    }
    // A stale tab must not replace another tab's unconfirmed immutable request.
    if (latest.pendingRequest && latest.pendingRequest.clientImportId !== resolvedRequestId
      && JSON.stringify(latest.pendingRequest) !== JSON.stringify(next.pendingRequest)) {
      current.current = latest; setState(latest); setChangedElsewhere(true);
      return latest;
    }
    current.current = next;
    const stored = writePersonalWordbookDraft(next);
    if (!stored) failedWriteBase.current = snapshot.raw;
    lastWriteSucceeded.current = stored;
    setPersisted(stored);
    setState(next);
    return next;
  }, [ownerUid]);
  const syncCurrentRequest = useCallback((requestId: string | undefined) => {
    const snapshot = readPersonalWordbookDraftSnapshot(ownerUid);
    const latest = snapshot.available ? snapshot.draft : current.current;
    const matches = latest.pendingRequest?.clientImportId === requestId
      || (current.current.pendingRequest?.clientImportId === requestId && !lastWriteSucceeded.current
        && snapshot.raw === failedWriteBase.current);
    if (!matches) { current.current = latest; setState(latest); setChangedElsewhere(true); }
    return matches;
  }, [ownerUid]);
  return { draft, updateDraft, persisted, changedElsewhere, syncCurrentRequest };
};
