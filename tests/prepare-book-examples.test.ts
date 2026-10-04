import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMonthKey } from '../utils/date';
import { createSqliteD1 } from './helpers/sqlite-d1';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';

const { generateExampleMock } = vi.hoisted(() => ({ generateExampleMock: vi.fn() }));
vi.mock('../functions/_shared/ai-actions', () => ({ generateMeteredGeminiSentence: generateExampleMock }));
import { handlePrepareBookExamples } from '../functions/_shared/storage-book-actions';
import { catalogStorageActionDefinitions } from '../functions/_shared/storage-action-registry/catalog';

const databases: ReturnType<typeof createSqliteD1>[] = [];
beforeEach(() => {
  generateExampleMock.mockReset();
  generateExampleMock.mockResolvedValue({ english: 'An acute problem needs attention.', japanese: '深刻な問題には注意が必要です。' });
});
afterEach(() => { databases.splice(0).forEach(({ sqlite }) => sqlite.close()); });
const setup = (missingCount = 1) => {
  const fixture = createSqliteD1(); databases.push(fixture);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) fixture.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  fixture.sqlite.exec(`INSERT INTO users(id,email,display_name,role,subscription_plan,created_at,updated_at) VALUES ('admin-1','admin@example.test','Admin','ADMIN','TOB_PAID',1,1);
    INSERT INTO books(id,title,word_count,created_by,created_at,updated_at) VALUES ('book-1','Book',${missingCount + 1},'admin-1',1,1);
    INSERT INTO words(id,book_id,word_number,word,definition,search_key,example_sentence,example_meaning,created_at,updated_at)
    VALUES ('saved-word','book-1',0,'saved','保存済み','saved','Source-authored example.','原本の和訳。',1,1);`);
  for (let index = 0; index < missingCount; index++) fixture.sqlite.prepare(`INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES (?,'book-1',?,'acute','深刻な','acute',1,1)`).run(`word-${index}`, index + 1);
  const user = fixture.sqlite.prepare('SELECT * FROM users WHERE id=?').get('admin-1') as unknown as DbUserRow;
  return { ...fixture, env: { DB: fixture.DB, GEMINI_API_KEY: 'test-key' } as AppEnv, user,
    word: (id = 'word-0') => fixture.sqlite.prepare('SELECT * FROM words WHERE id=?').get(id)!,
    claims: () => fixture.sqlite.prepare('SELECT * FROM word_example_generation_claims').all(),
  };
};

describe('administrator book example preparation', () => {
  it.each(['STUDENT', 'INSTRUCTOR'])('rejects %s even when the account owns the book', async (role) => {
    const fixture = setup();
    await expect(handlePrepareBookExamples(fixture.env, { ...fixture.user, role }, 'book-1')).rejects.toMatchObject({ status: 403 });
    expect(generateExampleMock).not.toHaveBeenCalled();
    expect(fixture.claims()).toHaveLength(0);
  });

  it('declares the administrator boundary and rejects all old storage generation payloads', () => {
    expect(catalogStorageActionDefinitions.prepareBookExamples.roles).toEqual(['ADMIN']);
    for (const payload of [undefined, {}, { wordId: 'word-0', assetType: 'EXAMPLE', forceRefresh: true }]) {
      expect(() => catalogStorageActionDefinitions.generateWordHintAsset.parse(payload)).toThrow(expect.objectContaining({ status: 410 }));
    }
  });

  it('checks book write access before acquiring a claim', async () => {
    const fixture = setup();
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'missing-book')).rejects.toMatchObject({ status: 404 });
    expect(fixture.claims()).toHaveLength(0);
    expect(generateExampleMock).not.toHaveBeenCalled();
  });

  it('rejects a missing API key before a claim and permits a later configured attempt', async () => {
    const fixture = setup(); fixture.env.GEMINI_API_KEY = undefined;
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).rejects.toMatchObject({ status: 503 });
    expect(fixture.claims()).toHaveLength(0);
    expect(generateExampleMock).not.toHaveBeenCalled();
    fixture.env.GEMINI_API_KEY = 'test-key';
    expect((await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).preparedCount).toBe(1);
  });

  it('honors the administrator monthly budget without consuming a claim', async () => {
    const fixture = setup();
    fixture.sqlite.prepare(`INSERT INTO ai_usage_events(user_id,action,model,estimated_cost_milli_yen,month_key,created_at) VALUES ('admin-1','generateAIQuiz','test',999999,?,1)`).run(formatMonthKey(Date.now()));
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).rejects.toMatchObject({ status: 429 });
    expect(fixture.claims()).toHaveLength(0);
    expect(generateExampleMock).not.toHaveBeenCalled();
  });

  it('keeps a committed example after a completion marker failure and never regenerates it', async () => {
    const fixture = setup();
    fixture.beforeRun((sql) => { if (sql.includes('UPDATE word_example_generation_claims')) throw new Error('completion marker failure'); });
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).rejects.toThrow('completion marker failure');
    fixture.beforeRun(undefined);
    expect(fixture.word().example_sentence).toBe('An acute problem needs attention.');
    expect(fixture.claims()).toMatchObject([{ completed_at: null }]);
    expect(await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).toEqual({ bookId: 'book-1', preparedCount: 0, remainingCount: 0 });
    expect(generateExampleMock).toHaveBeenCalledTimes(1);
  });

  it('prepares at most ten missing examples, keeps source examples, and saves generated examples pending review', async () => {
    const fixture = setup(12); const savedBefore = fixture.word('saved-word');
    expect(await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).toEqual({ bookId: 'book-1', preparedCount: 10, remainingCount: 2 });
    expect(generateExampleMock).toHaveBeenCalledTimes(10);
    expect(fixture.word('saved-word')).toEqual(savedBefore);
    expect(fixture.word()).toMatchObject({ example_audit_status: 'PENDING', example_audited_at: null, example_sentence: 'An acute problem needs attention.' });
    expect(fixture.claims()).toHaveLength(10);
    expect(fixture.claims().every((claim) => typeof claim.completed_at === 'number')).toBe(true);
    expect(await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).toEqual({ bookId: 'book-1', preparedCount: 2, remainingCount: 0 });
    expect(generateExampleMock).toHaveBeenCalledTimes(12);
    expect((await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).preparedCount).toBe(0);
    expect(generateExampleMock).toHaveBeenCalledTimes(12);
  });

  it('allows only one provider call when two requests have selected the same missing word', async () => {
    const fixture = setup();
    const [first, second] = await Promise.all([
      handlePrepareBookExamples(fixture.env, fixture.user, 'book-1'),
      handlePrepareBookExamples(fixture.env, fixture.user, 'book-1'),
    ]);
    expect(first.preparedCount + second.preparedCount).toBe(1);
    expect(generateExampleMock).toHaveBeenCalledTimes(1);
    expect(fixture.claims()).toHaveLength(1);
  });

  it('retains uncertain provider claims and skips them on a later explicit request', async () => {
    const fixture = setup();
    generateExampleMock.mockRejectedValueOnce(new Error('provider response lost'));
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).rejects.toThrow('provider response lost');
    expect(fixture.claims()).toMatchObject([{ completed_at: null }]);
    expect(await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).toEqual({ bookId: 'book-1', preparedCount: 0, remainingCount: 1 });
    expect(generateExampleMock).toHaveBeenCalledTimes(1);
  });

  it('keeps the claim after a saved-example write failure instead of charging again', async () => {
    const fixture = setup();
    fixture.beforeRun((sql) => { if (sql.includes('UPDATE words')) throw new Error('example write failed'); });
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).rejects.toThrow('example write failed');
    fixture.beforeRun(undefined);
    expect((await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).preparedCount).toBe(0);
    expect(generateExampleMock).toHaveBeenCalledTimes(1);
    expect(fixture.word().example_sentence).toBeNull();
  });

  it('preserves an example saved by another operation while the provider is running', async () => {
    const fixture = setup();
    generateExampleMock.mockImplementationOnce(async () => {
      fixture.sqlite.prepare('UPDATE words SET example_sentence=?, example_meaning=? WHERE id=?').run('Another saved example.', '別途保存された和訳。', 'word-0');
      return { english: 'New AI example.', japanese: 'AIの和訳。' };
    });
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).rejects.toMatchObject({ status: 409 });
    expect(fixture.word()).toMatchObject({ example_sentence: 'Another saved example.', example_meaning: '別途保存された和訳。' });
    expect(fixture.claims()).toMatchObject([{ completed_at: null }]);
  });

  it('skips the provider when the definition changed before the claim', async () => {
    const fixture = setup();
    fixture.beforeRun((sql) => { if (sql.includes('INSERT INTO word_example_generation_claims')) fixture.sqlite.prepare('UPDATE words SET definition=? WHERE id=?').run('変更後', 'word-0'); });
    expect((await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).preparedCount).toBe(0);
    expect(generateExampleMock).not.toHaveBeenCalled();
    expect(fixture.claims()).toHaveLength(0);
  });

  it.each([null, { english: '', japanese: '訳' }, { english: 42, japanese: '訳' }, { english: 'A sentence.', japanese: null }])('rejects unusable provider output without saving or retrying it: %s', async (output) => {
    const fixture = setup(); generateExampleMock.mockResolvedValueOnce(output);
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).rejects.toMatchObject({ status: 502 });
    expect(fixture.word().example_sentence).toBeNull();
    expect(fixture.claims()).toMatchObject([{ completed_at: null }]);
    expect((await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).preparedCount).toBe(0);
    expect(generateExampleMock).toHaveBeenCalledTimes(1);
  });

  it('removes claims only when their word is deleted through the existing foreign key cascade', async () => {
    const fixture = setup(); await handlePrepareBookExamples(fixture.env, fixture.user, 'book-1');
    fixture.sqlite.prepare('DELETE FROM words WHERE id=?').run('word-0');
    expect(fixture.claims()).toHaveLength(0);
  });
});
