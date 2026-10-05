import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('retired administrator live example preparation', () => {
  it.each(['STUDENT', 'INSTRUCTOR'])('retains role denial for %s', async (role) => {
    const fixture = setup();
    await expect(handlePrepareBookExamples(fixture.env, { ...fixture.user, role }, 'book-1')).rejects.toMatchObject({ status: 403 });
    expect(generateExampleMock).not.toHaveBeenCalled();
    expect(fixture.claims()).toHaveLength(0);
  });

  it('retains the administrator action boundary and retired learning generation responses', () => {
    expect(catalogStorageActionDefinitions.prepareBookExamples.roles).toEqual(['ADMIN']);
    for (const payload of [undefined, {}, { wordId: 'word-0', assetType: 'EXAMPLE', forceRefresh: true }]) {
      expect(() => catalogStorageActionDefinitions.generateWordHintAsset.parse(payload)).toThrow(expect.objectContaining({ status: 410 }));
    }
  });

  it('checks book access before the retirement response', async () => {
    const fixture = setup();
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'missing-book')).rejects.toMatchObject({ status: 404 });
    expect(fixture.claims()).toHaveLength(0);
    expect(generateExampleMock).not.toHaveBeenCalled();
  });

  it.each([undefined, 'test-key'])('makes no generation, claim or content write with key state %s', async (key) => {
    const fixture = setup();
    fixture.env.GEMINI_API_KEY = key;
    const before = fixture.sqlite.prepare('SELECT * FROM words ORDER BY id').all();
    fixture.sqlite.exec("INSERT INTO word_example_generation_claims(word_id,claim_id,started_at) VALUES('word-0','existing-uncertain-claim',100)");
    const claimsBefore = fixture.claims();
    await expect(handlePrepareBookExamples(fixture.env, fixture.user, 'book-1')).rejects.toMatchObject({ status: 410 });
    expect(generateExampleMock).not.toHaveBeenCalled();
    expect(fixture.sqlite.prepare('SELECT * FROM words ORDER BY id').all()).toEqual(before);
    expect(fixture.claims()).toEqual(claimsBefore);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM ai_usage_events').get()!.count).toBe(0);
  });
});
