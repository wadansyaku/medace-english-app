import { useCallback, useEffect, useRef, useState } from 'react';
import { readPersonalWordbookDraftSnapshot, writePersonalWordbookDraft, type PersonalWordbookDraft } from '../shared/personalWordbookDraft';

export interface PersonalWordbookDraftRevision { ownerUid: string; revision: number }

export const usePersonalWordbookDraft = (ownerUid: string) => {
  const observedRaw = useRef<string | null>(null);
  const initialStorageAvailable = useRef(true);
  const revision = useRef(0);
  const [state, setState] = useState(() => {
    const snapshot = readPersonalWordbookDraftSnapshot(ownerUid);
    observedRaw.current = snapshot.raw; initialStorageAvailable.current = snapshot.available;
    return snapshot.draft;
  });
  const [persisted, setPersisted] = useState(initialStorageAvailable.current);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const current = useRef(state);
  const lastWriteSucceeded = useRef(initialStorageAvailable.current);
  const failedWriteBase = useRef<string | null>(null);
  // Never render another account's draft while the effect is waiting to run.
  if (current.current.ownerUid !== ownerUid) {
    const snapshot = readPersonalWordbookDraftSnapshot(ownerUid);
    current.current = snapshot.draft; observedRaw.current = snapshot.raw;
    initialStorageAvailable.current = snapshot.available; lastWriteSucceeded.current = snapshot.available;
    failedWriteBase.current = null; revision.current += 1;
  }
  const draft = state.ownerUid === ownerUid ? state : current.current;
  useEffect(() => { if (state.ownerUid !== ownerUid) { setState(current.current); setPersisted(initialStorageAvailable.current); setChangedElsewhere(false); } }, [ownerUid, state.ownerUid]);
  const syncLatestDraft = useCallback(() => {
    if (current.current.ownerUid !== ownerUid) return { snapshot: { draft: current.current, raw: observedRaw.current, available: false }, latest: current.current };
    const snapshot = readPersonalWordbookDraftSnapshot(ownerUid);
    // A failed write can leave an old pending request on disk after a definite
    // rejection. Until that exact disk value changes, the corrected memory
    // draft is authoritative. A read failure must not adopt an empty draft.
    const ownUnpersistedDraft = !lastWriteSucceeded.current && snapshot.raw === failedWriteBase.current;
    if (snapshot.available && snapshot.raw !== observedRaw.current && !ownUnpersistedDraft) {
      current.current = snapshot.draft; observedRaw.current = snapshot.raw;
      lastWriteSucceeded.current = true; failedWriteBase.current = null; revision.current += 1;
      setState(snapshot.draft); setPersisted(true); setChangedElsewhere(true);
    } else if (!snapshot.available) setPersisted(false);
    return { snapshot, latest: current.current };
  }, [ownerUid]);
  useEffect(() => {
    const receive = (event: StorageEvent) => {
      if (event.key !== `steady-study:personal-wordbook-draft:v1:${encodeURIComponent(ownerUid)}`) return;
      syncLatestDraft();
    };
    window.addEventListener('storage', receive);
    return () => window.removeEventListener('storage', receive);
  }, [ownerUid, syncLatestDraft]);
  const captureDraftRevision = useCallback((): PersonalWordbookDraftRevision => ({ ownerUid, revision: revision.current }), [ownerUid]);
  const updateDraft = useCallback((value: PersonalWordbookDraft | ((previous: PersonalWordbookDraft) => PersonalWordbookDraft), resolvedRequestId?: string, expectedRevision?: PersonalWordbookDraftRevision) => {
    if (current.current.ownerUid !== ownerUid) return current.current;
    const { snapshot, latest } = syncLatestDraft();
    // Async CSV belongs to the draft selected when the read started. Never
    // append it to a newer draft, even if that draft has no pending save.
    if (expectedRevision && (expectedRevision.ownerUid !== ownerUid || expectedRevision.revision !== revision.current)) return latest;
    // Completing an old request must not replace a new draft from another tab.
    // A failed local write may still complete its own in-memory request, but
    // only while the stored value has not changed since that failed write.
    if (resolvedRequestId && latest.pendingRequest?.clientImportId !== resolvedRequestId) {
      setChangedElsewhere(true);
      return latest;
    }
    const next = { ...(typeof value === 'function' ? value(latest) : value), ownerUid, updatedAt: Date.now() };
    // A stale tab must not replace another tab's unconfirmed immutable request.
    if (latest.pendingRequest && latest.pendingRequest.clientImportId !== resolvedRequestId
      && JSON.stringify(latest.pendingRequest) !== JSON.stringify(next.pendingRequest)) {
      setChangedElsewhere(true);
      return latest;
    }
    current.current = next;
    // Do not overwrite an unseen external request when only reads are denied.
    const stored = snapshot.available && writePersonalWordbookDraft(next);
    // Unavailable reads have raw=null, which does not mean the key is absent.
    // Preserve the last value actually observed until storage can be read.
    const diskBase = snapshot.available ? snapshot.raw : observedRaw.current;
    failedWriteBase.current = stored ? null : diskBase;
    observedRaw.current = stored ? JSON.stringify(next) : diskBase;
    lastWriteSucceeded.current = stored;
    revision.current += 1;
    setPersisted(stored);
    setState(next);
    return next;
  }, [ownerUid, syncLatestDraft]);
  const syncCurrentRequest = useCallback((requestId: string | undefined) => {
    if (current.current.ownerUid !== ownerUid) return false;
    const { latest } = syncLatestDraft();
    const matches = latest.pendingRequest?.clientImportId === requestId;
    if (!matches) setChangedElsewhere(true);
    return matches;
  }, [ownerUid, syncLatestDraft]);
  return { draft, updateDraft, persisted, changedElsewhere, syncCurrentRequest, captureDraftRevision };
};
