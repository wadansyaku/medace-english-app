import { afterEach, describe, expect, it } from 'vitest';
import { readWeaknessProfilesByUserIds } from '../functions/_shared/weakness-actions';
import { readEnglishPracticeLaneStatsByUserIds } from '../functions/_shared/organization-student-read-model';
import type { AppEnv, D1Database } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => databases.splice(0).forEach(({ sqlite }) => sqlite.close()));
const setup = () => {
  const database = createSqliteD1(); databases.push(database);
  const bindings: unknown[][] = [];
  const DB: D1Database = {
    ...database.DB,
    prepare(sql) {
      const statement = database.DB.prepare(sql);
      return { ...statement, bind(...values) {
        if (values.length > 100) throw new Error('too many SQL variables');
        expect((sql.match(/\?/g) ?? []).length).toBe(values.length);
        bindings.push(values);
        return statement.bind(...values);
      } };
    },
  };
  return { ...database, bindings, env: { DB } as AppEnv };
};

describe('bounded student read enrichment', () => {
  it('does not query either enrichment for an empty scope', async () => {
    const fixture = setup();
    expect(await readWeaknessProfilesByUserIds(fixture.env, [])).toEqual(new Map());
    expect(await readEnglishPracticeLaneStatsByUserIds(fixture.env, [], 100)).toEqual(new Map());
    expect(fixture.bindings).toEqual([]);
  });

  it('reads all weakness profiles once, preserving signal priorities, NULL bands and global newest-first order', async () => {
    const fixture = setup();
    fixture.sqlite.exec(`CREATE TABLE student_weakness_signals (
      user_id TEXT, dimension TEXT, level TEXT, score INTEGER, sample_size INTEGER,
      reason TEXT, next_action_label TEXT, recommended_action_type TEXT,
      target_question_modes_json TEXT, target_band_index INTEGER, updated_at INTEGER
    )`);
    const ids = Array.from({ length: 205 }, (_, index) => `student-${index}`);
    const insert = fixture.sqlite.prepare(`INSERT INTO student_weakness_signals VALUES (
      ?, ?, 'HIGH', ?, 8, 'reason', 'next', 'REVIEW', ?, NULL, ?
    )`);
    [...ids, 'outside'].forEach((uid, index) => {
      insert.run(uid, 'MEANING_RECALL', 60, '["EN_TO_JA"]', index);
      insert.run(uid, 'SPELLING_RECALL', 80, 'invalid-json', index);
    });
    const profiles = await readWeaknessProfilesByUserIds(fixture.env, [...ids, ids[0], 'no-data']);
    expect([...profiles.keys()]).toEqual([...ids].reverse());
    ids.forEach((uid, index) => {
      const profile = profiles.get(uid)!;
      expect(profile.updatedAt).toBe(index);
      expect(profile.signals).toHaveLength(2);
      expect(profile.topWeaknesses.map(signal => signal.dimension)).toEqual(['SPELLING_RECALL', 'MEANING_RECALL']);
      expect(profile.signals[0].targetBandIndex).toBeUndefined();
      expect(profile.signals[0].targetQuestionModes).toEqual(['EN_TO_JA', 'JA_TO_EN']);
    });
    expect(fixture.bindings.map(values => values.length)).toEqual([100, 100, 6]);
    expect(fixture.bindings.flat()).toEqual([...ids, 'no-data']);
  });

  it('preserves complete lane aggregates and selectable-material/time filters across 205 users', async () => {
    const fixture = setup();
    fixture.sqlite.exec(`
      CREATE TABLE english_practice_attempts (user_id TEXT, lane TEXT, correct INTEGER, created_at INTEGER, book_id TEXT);
      CREATE TABLE books (id TEXT PRIMARY KEY, created_by TEXT, word_count INTEGER);
      CREATE TABLE material_source_ledger (
        book_id TEXT, rights_status TEXT, review_status TEXT, qa_word_count INTEGER,
        qa_required_blank_rows INTEGER, qa_rows_with_sentinel INTEGER, qa_sentinel_value_count INTEGER
      );
      INSERT INTO books VALUES ('approved', NULL, 10), ('unapproved', NULL, 10), ('foreign', 'outside', 10);
      INSERT INTO material_source_ledger VALUES ('approved', 'approved', 'approved', 10, 0, 0, 0);
    `);
    const ids = Array.from({ length: 205 }, (_, index) => `student-${index}`);
    const insert = fixture.sqlite.prepare('INSERT INTO english_practice_attempts VALUES (?, ?, ?, ?, ?)');
    [...ids, 'outside'].forEach(uid => {
      fixture.sqlite.prepare('INSERT INTO books VALUES (?, ?, 10)').run(`owned-${uid}`, uid);
      insert.run(uid, 'translation', 1, 100, null);
      insert.run(uid, 'translation', 0, 110, 'approved');
      insert.run(uid, 'translation', null, 120, `owned-${uid}`);
      insert.run(uid, 'grammar', 1, 105, null);
      insert.run(uid, 'translation', 1, 99, null);
      insert.run(uid, 'translation', 1, 1000, 'unapproved');
      insert.run(uid, 'translation', 1, 1000, 'foreign');
    });
    const stats = await readEnglishPracticeLaneStatsByUserIds(fixture.env, [...ids, ids[0], 'no-data'], 100);
    expect(stats.size).toBe(205);
    ids.forEach(uid => expect(stats.get(uid)).toEqual([
      { lane: 'grammar', total: 1, correct: 1, accuracy: 100, lastPracticedAt: 105 },
      { lane: 'translation', total: 3, correct: 1, accuracy: 33, lastPracticedAt: 120 },
    ]));
    expect(stats.has('outside')).toBe(false);
    expect(stats.has('no-data')).toBe(false);
    expect(fixture.bindings.map(values => values.length)).toEqual([100, 100, 9]);
    expect(fixture.bindings.every(values => values.at(-1) === 100)).toBe(true);
    expect(fixture.bindings.flatMap(values => values.slice(0, -1))).toEqual([...ids, 'no-data']);
  });
});
