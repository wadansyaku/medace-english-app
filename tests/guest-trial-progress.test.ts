import { describe, expect, it, vi } from 'vitest';
import { createGuestTrialProgressStore, parseGuestTrialProgress } from '../services/guestTrialProgress';
import { GUEST_TRIAL_QUESTIONS, GUEST_TRIAL_TTL_MS } from '../shared/guestTrial';

const setup = () => {
  let now = 1_790_000_000_000;
  let id = 0;
  const store = createGuestTrialProgressStore({ factory: () => undefined, now: () => now, createId: () => `synthetic-id-${++id}` });
  return { store, advance: (ms: number) => { now += ms; }, now: () => now };
};

// Small asynchronous IDB adapter for failure/recovery and connection lifecycle.
// Writes become visible only on completion; abort keeps the persisted snapshot.
const deviceDb = () => {
  let saved: unknown;
  let failWrites = false;
  let blocked = false;
  const pending: any[] = [];
  const db: any = { close: vi.fn(), onversionchange: null, transaction: vi.fn(() => {
    let aborted = false;
    let changed = false;
    let next: unknown;
    const tx: any = { abort() { aborted = true; queueMicrotask(() => tx.onabort?.()); }, objectStore() { return {
      get() {
        const request: any = { result: structuredClone(saved) };
        queueMicrotask(() => {
          request.onsuccess?.();
          queueMicrotask(() => { if (!aborted) { if (changed) saved = next; tx.oncomplete?.(); } });
        });
        return request;
      },
      put(value: unknown) { if (failWrites) throw new DOMException('quota', 'QuotaExceededError'); next = structuredClone(value); changed = true; },
      delete() { if (failWrites) throw new DOMException('quota', 'QuotaExceededError'); next = undefined; changed = true; },
    }; } };
    return tx;
  }) };
  const open = vi.fn(() => {
    const request: any = { result: db }; pending.push(request);
    queueMicrotask(() => blocked ? request.onblocked?.() : request.onsuccess?.());
    return request;
  });
  return { db, open, factory: { open } as unknown as IDBFactory,
    failWrites: (value: boolean) => { failWrites = value; }, block: () => { blocked = true; },
    releaseBlocked: () => { pending.forEach(request => request.onsuccess?.()); },
    persisted: () => structuredClone(saved),
  };
};

describe('guest device progress', () => {
  it('keeps the active trial and first confirmed answer stable through retries', async () => {
    const { store } = setup();
    const started = await store.start();
    expect(started.persistent).toBe(false);
    expect(started.notice).toContain('再読み込み');
    const trialId = started.progress!.trialId;
    const q = GUEST_TRIAL_QUESTIONS[0];
    const first = await store.answer(trialId, q.id, 1);
    const second = await store.answer(trialId, q.id, 0);
    expect(second.progress!.answers).toEqual(first.progress!.answers);
    expect((await store.start()).progress).toEqual(first.progress);
  });
  it('pins an explicit account and blocks another account before acknowledgement', async () => {
    const { store } = setup();
    const trialId = (await store.start()).progress!.trialId;
    await store.answer(trialId, GUEST_TRIAL_QUESTIONS[0].id, 0);
    await store.bind(trialId, 'synthetic-account-A');
    await expect(store.bind(trialId, 'synthetic-account-B')).rejects.toThrow('別のアカウント');
    await expect(store.acknowledge(trialId, 'synthetic-account-B', [])).rejects.toThrow('保存先');
    expect((await store.load()).progress!.boundUserId).toBe('synthetic-account-A');
    expect((await store.load()).progress!.importedAttemptIds).toEqual([]);
  });
  it('keeps answers after failed or lost-response imports and marks only acknowledged attempts', async () => {
    const { store } = setup();
    const trialId = (await store.start()).progress!.trialId;
    const one = await store.answer(trialId, GUEST_TRIAL_QUESTIONS[0].id, 0);
    await store.bind(trialId, 'synthetic-account-A');
    const snapshot = structuredClone(one.progress!.answers);
    expect((await store.load()).progress!.answers).toEqual(snapshot);
    await store.answer(trialId, GUEST_TRIAL_QUESTIONS[1].id, 1);
    const confirmed = await store.acknowledge(trialId, 'synthetic-account-A', snapshot.map(a => a.attemptId));
    expect(confirmed.progress!.answers).toHaveLength(2);
    expect(confirmed.progress!.importedAttemptIds).toEqual([snapshot[0].attemptId]);
    await expect(store.acknowledge(trialId, 'synthetic-account-A', ['unknown-attempt'])).rejects.toThrow('保存先');
  });
  it('rejects wrong trials and invalid choices without changing valid local answers', async () => {
    const { store } = setup();
    const trialId = (await store.start()).progress!.trialId;
    await expect(store.answer('different-trial', GUEST_TRIAL_QUESTIONS[0].id, 0)).rejects.toThrow('記録が変わりました');
    await expect(store.answer(trialId, 'licensed-book-word', 0)).rejects.toThrow('回答を選び直して');
    await expect(store.answer(trialId, GUEST_TRIAL_QUESTIONS[0].id, 4)).rejects.toThrow('回答を選び直して');
    expect((await store.load()).progress!.answers).toEqual([]);
  });
  it('expires only device state, and clearing starts a fresh anonymous trial', async () => {
    const { store, advance } = setup();
    const trialId = (await store.start()).progress!.trialId;
    await store.answer(trialId, GUEST_TRIAL_QUESTIONS[0].id, 0);
    advance(GUEST_TRIAL_TTL_MS + 1);
    expect((await store.load()).progress).toBeNull();
    expect((await store.start()).progress!.trialId).not.toBe(trialId);
    expect((await store.clear()).progress).toBeNull();
  });
  it('accepts only original bounded records and strips unrelated personal fields', async () => {
    const { store, now } = setup();
    const p = (await store.start()).progress!;
    expect(parseGuestTrialProgress({ ...p, email: 'should-not-be-stored@example.invalid' }, now())).toEqual(p);
    expect(parseGuestTrialProgress({ ...p, version: 'licensed' }, now())).toBeNull();
    expect(parseGuestTrialProgress({ ...p, startedAt: now() + 60_001 }, now())).toBeNull();
    expect(parseGuestTrialProgress({ ...p, importedAttemptIds: ['unknown'] }, now())).toBeNull();
  });
  it('keeps answers, account pin, and acknowledgement when unavailable storage later recovers empty', async () => {
    const fixture = deviceDb(); let available = false; let id = 0;
    const store = createGuestTrialProgressStore({ factory: () => available ? fixture.factory : undefined,
      now: () => 1_790_000_000_000, createId: () => `synthetic-recovery-${++id}` });
    const trialId = (await store.start()).progress!.trialId;
    const answered = await store.answer(trialId, GUEST_TRIAL_QUESTIONS[0].id, 0);
    await store.bind(trialId, 'synthetic-account-A');
    const marked = await store.acknowledge(trialId, 'synthetic-account-A', [answered.progress!.answers[0].attemptId]);
    available = true;
    expect(await store.load()).toEqual(marked);
    expect((await store.start()).progress).toEqual(marked.progress);
    expect(fixture.open).not.toHaveBeenCalled();
    await expect(store.bind(trialId, 'synthetic-account-B')).rejects.toThrow('別のアカウント');
  });
  it('keeps the immutable fallback answer when failed writes recover with an older DB snapshot', async () => {
    const fixture = deviceDb(); let id = 0;
    const store = createGuestTrialProgressStore({ factory: () => fixture.factory,
      now: () => 1_790_000_000_000, createId: () => `synthetic-quota-${++id}` });
    const started = await store.start(); expect(started.persistent).toBe(true);
    fixture.failWrites(true);
    const answer = await store.answer(started.progress!.trialId, GUEST_TRIAL_QUESTIONS[0].id, 1);
    expect(answer.persistent).toBe(false);
    expect((fixture.persisted() as any).answers).toEqual([]);
    fixture.failWrites(false);
    const openCount = fixture.open.mock.calls.length;
    expect(await store.load()).toEqual(answer);
    expect((await store.answer(started.progress!.trialId, GUEST_TRIAL_QUESTIONS[0].id, 0)).progress!.answers).toEqual(answer.progress!.answers);
    expect(fixture.open).toHaveBeenCalledTimes(openCount);
  });
  it('closes a delayed successful DB open after blocked rejection and keeps memory mode', async () => {
    const fixture = deviceDb(); fixture.block();
    const store = createGuestTrialProgressStore({ factory: () => fixture.factory });
    expect((await store.load()).persistent).toBe(false);
    fixture.releaseBlocked();
    expect(fixture.db.close).toHaveBeenCalledTimes(1);
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    await store.load(); expect(fixture.open).toHaveBeenCalledTimes(1);
  });
  it('keeps fallback answers when an already pending open succeeds after another operation failed', async () => {
    const fixture = deviceDb(); const requests: any[] = []; let id = 0;
    const factory = { open() {
      const request: any = { result: fixture.db }; requests.push(request);
      if (requests.length > 1) queueMicrotask(() => request.onerror?.());
      return request;
    } } as unknown as IDBFactory;
    const store = createGuestTrialProgressStore({ factory: () => factory, now: () => 1_790_000_000_000,
      createId: () => `synthetic-pending-${++id}` });
    const pendingLoad = store.load();
    const trialId = (await store.start()).progress!.trialId;
    const answer = await store.answer(trialId, GUEST_TRIAL_QUESTIONS[0].id, 0);
    requests[0].onsuccess();
    expect(await pendingLoad).toEqual(answer);
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    expect(fixture.db.close).toHaveBeenCalledTimes(1);
  });
  it('closes successful transactions and cooperates with a later DB version change', async () => {
    const fixture = deviceDb();
    const store = createGuestTrialProgressStore({ factory: () => fixture.factory });
    expect((await store.start()).persistent).toBe(true);
    expect(fixture.db.close).toHaveBeenCalledTimes(1);
    fixture.db.onversionchange(); expect(fixture.db.close).toHaveBeenCalledTimes(2);
  });
});
