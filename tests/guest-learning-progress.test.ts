import { describe, expect, it, vi } from 'vitest';
import { createGuestLearningProgressStore } from '../services/guestLearningProgress';
import {
  GUEST_LEARNING_MAX_ATTEMPTS, GUEST_LEARNING_TTL_MS, GUEST_LEARNING_VERSION,
  parseGuestLearningProgress, type GuestLearningProgress,
} from '../shared/guestLearning';

const NOW = 1_790_000_000_000;
const uuid = (id: number) => `00000000-0000-4000-8000-${id.toString(16).padStart(12, '0')}`;
const setup = () => {
  let now = NOW; let id = 0;
  const store = createGuestLearningProgressStore({ factory: () => undefined, now: () => now, createId: () => uuid(++id) });
  return { store, now: () => now, advance: (ms: number) => { now += ms; } };
};

// Commit-aware IDB adapter with read/write serialization shared across store
// instances. It models tab concurrency, transaction abort and delayed opens.
const deviceDb = (initial?: unknown) => {
  let saved = structuredClone(initial);
  let failWrites = false; let blocked = false; let automaticOpen = true;
  let active = false;
  const transactions: Array<() => void> = [];
  const requests: any[] = [];
  const pump = () => { if (!active && transactions.length) { active = true; transactions.shift()!(); } };
  const db: any = {
    close: vi.fn(), onversionchange: null,
    objectStoreNames: { contains: () => true },
    transaction: vi.fn(() => {
      let aborted = false; let changed = false; let next: unknown; let read: any;
      let finished = false;
      const finish = () => { if (finished) return; finished = true; active = false; pump(); };
      const tx: any = {
        abort() { aborted = true; queueMicrotask(() => { tx.onabort?.(); finish(); }); },
        objectStore() { return {
          get() { read = {}; return read; },
          put(value: unknown) { if (failWrites) throw new DOMException('quota', 'QuotaExceededError'); changed = true; next = structuredClone(value); },
          delete() { if (failWrites) throw new DOMException('quota', 'QuotaExceededError'); changed = true; next = undefined; },
        }; },
      };
      transactions.push(() => queueMicrotask(() => {
        read.result = structuredClone(saved); read.onsuccess?.();
        queueMicrotask(() => {
          if (!aborted) { if (changed) saved = next; tx.oncomplete?.(); finish(); }
        });
      }));
      pump(); return tx;
    }),
  };
  const open = vi.fn(() => {
    const request: any = { result: db }; requests.push(request);
    if (automaticOpen) queueMicrotask(() => blocked ? request.onblocked?.() : request.onsuccess?.());
    return request;
  });
  return {
    db, open, factory: { open } as unknown as IDBFactory,
    failWrites: (value: boolean) => { failWrites = value; }, block: () => { blocked = true; },
    holdOpens: () => { automaticOpen = false; }, releaseOpen: (index: number) => requests[index].onsuccess?.(),
    persisted: () => structuredClone(saved),
  };
};

describe('unregistered Naru device progress', () => {
  it('records repeated words beyond the legacy five and keeps explicit retries immutable', async () => {
    const { store, advance } = setup();
    const started = await store.start(); const sessionId = started.progress!.sessionId;
    expect(started).toMatchObject({ persistent: false, notice: expect.stringContaining('アカウントにはまだ保存されていません') });
    const first = await store.answer(sessionId, 'naru-word-1', 0, 40, uuid(100));
    advance(200);
    const retry = await store.answer(sessionId, 'naru-word-1', 0, 40, uuid(100));
    expect(retry.progress!.attempts).toEqual(first.progress!.attempts);
    await expect(store.answer(sessionId, 'naru-word-1', 3, 40, uuid(100))).rejects.toThrow('内容を変更');
    for (let index = 0; index < 8; index++) await store.answer(sessionId, 'naru-word-1', 3, 60);
    expect((await store.load()).progress!.attempts).toHaveLength(9);
    expect(new Set((await store.load()).progress!.attempts.map(a => a.attemptId)).size).toBe(9);
  });

  it('preserves account isolation and marks only acknowledged known attempts', async () => {
    const { store } = setup(); const sessionId = (await store.start()).progress!.sessionId;
    const first = (await store.answer(sessionId, 'naru-word-1', 2, 10)).progress!.attempts[0];
    await expect(store.acknowledge(sessionId, undefined as unknown as string, [first.attemptId])).rejects.toThrow('保存先');
    await store.answer(sessionId, 'naru-word-2', 3, 5);
    await store.bind(sessionId, 'account-A');
    await expect(store.bind(sessionId, 'account-B')).rejects.toThrow('別のアカウント');
    await expect(store.acknowledge(sessionId, 'account-B', [first.attemptId])).rejects.toThrow('保存先');
    await expect(store.acknowledge(sessionId, 'account-A', [uuid(999)])).rejects.toThrow('保存先');
    const ack = await store.acknowledge(sessionId, 'account-A', [first.attemptId, first.attemptId]);
    expect(ack.progress!.attempts).toHaveLength(2);
    expect(ack.progress!.importedAttemptIds).toEqual([first.attemptId]);
    expect((await store.load()).progress!.boundUserId).toBe('account-A');
  });

  it('keeps the bound snapshot unchanged when a stale anonymous tab rates another card', async () => {
    const fixture = deviceDb(); let id = 0;
    const options = { factory: () => fixture.factory, now: () => NOW, createId: () => uuid(++id) };
    const anonymous = createGuestLearningProgressStore(options); const importer = createGuestLearningProgressStore(options);
    const sessionId = (await anonymous.start()).progress!.sessionId;
    await anonymous.answer(sessionId, 'word-1', 2, 30, uuid(100));
    const [bound, late] = await Promise.all([
      importer.bind(sessionId, 'account-A'),
      anonymous.answer(sessionId, 'word-2', 3, 40, uuid(101)),
    ]);
    expect(late.progress).toEqual(bound.progress);
    expect(late.progress!.attempts).toHaveLength(1);
    expect(late.progress!.boundUserId).toBe('account-A');
    expect((await anonymous.answer(sessionId, 'word-1', 2, 30, uuid(100))).progress).toEqual(bound.progress);
  });

  it('does not label confirmed cloud imports as unsaved when device storage is unavailable', async () => {
    const { store } = setup(); const sessionId = (await store.start()).progress!.sessionId;
    const answered = await store.answer(sessionId, 'word-1', 3, 10, uuid(100));
    expect(answered.notice).toContain('アカウントにはまだ保存されていません');
    await store.bind(sessionId, 'account-A');
    const imported = await store.acknowledge(sessionId, 'account-A', [uuid(100)]);
    expect(imported.notice).toContain('再読み込みすると消える');
    expect(imported.notice).not.toContain('アカウントにはまだ保存されていません');
    expect(imported.progress!.importedAttemptIds).toEqual([uuid(100)]);
  });

  it('rejects malformed answers without damaging valid progress', async () => {
    const { store } = setup(); const sessionId = (await store.start()).progress!.sessionId;
    await expect(store.answer('old-session', 'naru-word-1', 1, 0)).rejects.toThrow('記録が変わりました');
    for (const [wordId, rating, responseTime] of [['bad/id', 1, 0], ['word', 4, 0], ['word', 1, -1], ['word', 1, 0.5], ['word', 1, 3_600_001]] as const) {
      await expect(store.answer(sessionId, wordId, rating, responseTime)).rejects.toThrow('回答を確認');
    }
    await expect(store.answer(sessionId, 'word', 1, 0, 'not-uuid')).rejects.toThrow('回答を確認');
    expect((await store.load()).progress!.attempts).toEqual([]);
  });

  it('limits transferable storage while letting learning continue', async () => {
    const progress: GuestLearningProgress = {
      sessionId: uuid(1), version: GUEST_LEARNING_VERSION, startedAt: NOW,
      attempts: Array.from({ length: GUEST_LEARNING_MAX_ATTEMPTS }, (_, index) => ({
        attemptId: uuid(index + 10), wordId: 'naru-word-1', rating: 3, responseTimeMs: 10, answeredAt: NOW,
      })), importedAttemptIds: [],
    };
    const fixture = deviceDb(progress);
    const store = createGuestLearningProgressStore({ factory: () => fixture.factory, now: () => NOW });
    const next = await store.answer(progress.sessionId, 'naru-word-2', 2, 10);
    expect(next.progress!.attempts).toHaveLength(GUEST_LEARNING_MAX_ATTEMPTS);
    expect(next.progress!.recordingLimitReached).toBe(true);
    expect(next.notice).toContain('学習は続けられます');
    expect(next.notice).toContain('以降の回答はアカウントへ引き継げません');
    expect((await store.load()).progress!.recordingLimitReached).toBe(true);
    await expect(store.answer(progress.sessionId, 'naru-word-3', 0, 1)).resolves.toMatchObject({ persistent: true });
  });

  it('expires only device state and rejects old answer/import/clear operations after restart', async () => {
    const { store, advance } = setup(); const old = (await store.start()).progress!.sessionId;
    await store.answer(old, 'naru-word-1', 1, 0); await store.bind(old, 'account-A');
    advance(GUEST_LEARNING_TTL_MS + 1);
    expect((await store.load()).progress).toBeNull();
    const fresh = (await store.start()).progress!;
    expect(fresh.sessionId).not.toBe(old);
    await expect(store.answer(old, 'naru-word-1', 1, 0)).rejects.toThrow('記録が変わりました');
    await expect(store.acknowledge(old, 'account-A', [])).rejects.toThrow('記録が変わりました');
    await expect(store.clear(old)).rejects.toThrow('記録が変わりました');
    expect((await store.load()).progress).toEqual(fresh);
    expect((await store.clear(fresh.sessionId)).progress).toBeNull();
  });

  it('does not mix legacy records or malformed, oversized and unknown-field data', async () => {
    const { store, now } = setup(); const p = (await store.start()).progress!;
    expect(parseGuestLearningProgress({ ...p, email: 'private@example.invalid' }, now())).toEqual(p);
    expect(parseGuestLearningProgress({ ...p, trialId: 'old-trial', version: 'original-v1' }, now())).toBeNull();
    expect(parseGuestLearningProgress({ ...p, startedAt: now() + 60_001 }, now())).toBeNull();
    expect(parseGuestLearningProgress({ ...p, importedAttemptIds: [uuid(5)] }, now())).toBeNull();
    expect(parseGuestLearningProgress({ ...p, recordingLimitReached: true }, now())).toBeNull();
    const answered = (await store.answer(p.sessionId, 'naru-word-1', 2, 10)).progress!;
    expect(parseGuestLearningProgress({ ...answered, importedAttemptIds: [answered.attempts[0].attemptId] }, now())).toBeNull();
    expect(parseGuestLearningProgress({ ...answered, attempts: [...answered.attempts, ...answered.attempts] }, now())).toBeNull();
    expect(parseGuestLearningProgress({ ...answered, attempts: Array(GUEST_LEARNING_MAX_ATTEMPTS + 1).fill(answered.attempts[0]) }, now())).toBeNull();
  });

  it('serializes multiple tabs without losing attempts and commits one stable session', async () => {
    const fixture = deviceDb(); let id = 0;
    const options = { factory: () => fixture.factory, now: () => NOW, createId: () => uuid(++id) };
    const one = createGuestLearningProgressStore(options); const two = createGuestLearningProgressStore(options);
    const [a, b] = await Promise.all([one.start(), two.start()]);
    expect(a.progress!.sessionId).toBe(b.progress!.sessionId);
    const sessionId = a.progress!.sessionId;
    await Promise.all([one.answer(sessionId, 'word-1', 0, 30, uuid(101)), two.answer(sessionId, 'word-2', 3, 40, uuid(102))]);
    expect((await one.load()).progress!.attempts.map(a => a.attemptId)).toEqual([uuid(101), uuid(102)]);
    await Promise.all([one.answer(sessionId, 'word-3', 1, 15, uuid(103)), two.answer(sessionId, 'word-3', 1, 15, uuid(103))]);
    expect((await two.load()).progress!.attempts).toHaveLength(3);
    const [bindingA, bindingB] = await Promise.allSettled([one.bind(sessionId, 'account-A'), two.bind(sessionId, 'account-B')]);
    expect(bindingA.status).toBe('fulfilled'); expect(bindingB.status).toBe('rejected');
    expect((await two.load()).progress!.boundUserId).toBe('account-A');
  });

  it('keeps fallback immutable answers, binding and ack after a failed commit and later storage recovery', async () => {
    const fixture = deviceDb(); let id = 0;
    const store = createGuestLearningProgressStore({ factory: () => fixture.factory, now: () => NOW, createId: () => uuid(++id) });
    const sessionId = (await store.start()).progress!.sessionId;
    fixture.failWrites(true);
    const answer = await store.answer(sessionId, 'word-1', 1, 30, uuid(100));
    expect(answer.persistent).toBe(false); expect((fixture.persisted() as GuestLearningProgress).attempts).toEqual([]);
    await store.bind(sessionId, 'account-A');
    const ack = await store.acknowledge(sessionId, 'account-A', [uuid(100)]);
    fixture.failWrites(false); const opens = fixture.open.mock.calls.length;
    expect(await store.load()).toEqual(ack);
    expect((await store.answer(sessionId, 'word-1', 1, 30, uuid(100))).progress!.attempts).toEqual(answer.progress!.attempts);
    await expect(store.bind(sessionId, 'account-B')).rejects.toThrow('別のアカウント');
    expect(fixture.open).toHaveBeenCalledTimes(opens);
  });

  it('serializes delayed reads before clear/start and blocks old acknowledgements', async () => {
    const fixture = deviceDb(); let id = 0;
    const store = createGuestLearningProgressStore({ factory: () => fixture.factory, now: () => NOW, createId: () => uuid(++id) });
    const old = (await store.start()).progress!.sessionId;
    await store.bind(old, 'account-A'); fixture.holdOpens();
    const pendingLoad = store.load(); const clearing = store.clear(old); const starting = store.start();
    await Promise.resolve();
    expect(fixture.open).toHaveBeenCalledTimes(3);
    fixture.releaseOpen(2); await pendingLoad;
    await Promise.resolve(); fixture.releaseOpen(3); await clearing;
    await Promise.resolve(); fixture.releaseOpen(4); const fresh = await starting;
    expect(fresh.progress!.sessionId).not.toBe(old);
    const late = store.acknowledge(old, 'account-A', []);
    await Promise.resolve(); fixture.releaseOpen(5);
    await expect(late).rejects.toThrow('記録が変わりました');
    expect((fixture.persisted() as GuestLearningProgress).sessionId).toBe(fresh.progress!.sessionId);
  });

  it('closes a blocked or timed-out delayed open and prevents stale operations from restoring it', async () => {
    const fixture = deviceDb(); fixture.block();
    const store = createGuestLearningProgressStore({ factory: () => fixture.factory, now: () => NOW });
    expect((await store.load()).persistent).toBe(false);
    fixture.releaseOpen(0); expect(fixture.db.close).toHaveBeenCalledTimes(1);
    expect(fixture.db.transaction).not.toHaveBeenCalled();
    await store.start(); expect(fixture.open).toHaveBeenCalledTimes(1);
    const delayed = deviceDb(); delayed.holdOpens();
    const timed = createGuestLearningProgressStore({ factory: () => delayed.factory, now: () => NOW, openTimeoutMs: 5 });
    expect((await timed.start()).persistent).toBe(false);
    await timed.clear(); const fresh = await timed.start();
    delayed.releaseOpen(0); expect(delayed.db.close).toHaveBeenCalledTimes(1);
    expect(await timed.load()).toEqual(fresh);
  });

  it('does not expose saved state before transaction completion or let listeners break saves', async () => {
    const fixture = deviceDb(); const store = createGuestLearningProgressStore({ factory: () => fixture.factory, now: () => NOW });
    const observe = vi.fn(() => { expect(fixture.persisted()).toBeDefined(); throw new Error('observer failed'); });
    store.subscribe(observe);
    const started = await store.start();
    expect(started.persistent).toBe(true); expect(observe).toHaveBeenCalledTimes(1);
    expect(fixture.db.close).toHaveBeenCalledTimes(1);
    fixture.db.onversionchange(); expect(fixture.db.close).toHaveBeenCalledTimes(2);
    const mutated = started.progress!; mutated.attempts.push({ attemptId: uuid(99), wordId: 'bad', rating: 0, responseTimeMs: 0, answeredAt: NOW });
    expect((await store.load()).progress!.attempts).toEqual([]);
  });
});
