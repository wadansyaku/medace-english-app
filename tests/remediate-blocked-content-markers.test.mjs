import { describe, expect, it } from 'vitest';

import {
  applyRemediation,
  buildApplySqls,
  buildDeleteTargetWordsSql,
  buildReferenceCountSql,
  buildTargetWordsSql,
  fetchRemediationPlan,
  parseCliArgs,
  validatePlanForApply,
} from '../scripts/analysis/remediate-blocked-content-markers.mjs';

const baseOptions = {
  database: 'medace-db',
  mode: 'remote',
  marker: '[未抽出]',
  apply: false,
  expectRows: null,
  sampleLimit: 25,
  includeUserBooks: false,
  bookIds: [],
  catalogSources: [],
  accessScopes: [],
  titleLike: null,
};

const wranglerPayload = (results = [], meta = {}) => [{
  success: true,
  results,
  meta: {
    changes: 0,
    rows_read: 0,
    rows_written: 0,
    duration: 1,
    ...meta,
  },
}];

const referenceCounts = (overrides = {}) => ({
  target_rows: 2,
  learning_histories: 0,
  word_reports: 0,
  learning_interaction_events: 0,
  ai_generated_contents: 0,
  ai_generated_examples: 0,
  ai_generated_problems: 0,
  assessment_item_metadata_via_ai_problem: 0,
  cbt_problem_stats_via_ai_problem: 0,
  japanese_translation_feedback_events: 0,
  english_practice_attempts: 0,
  cbt_learner_word_states: 0,
  weekly_mission_assignment_json: 0,
  product_events_soft_word_subject: 0,
  words_with_r2_example_image_key: 0,
  ...overrides,
});

const fakeExecuteFactory = (calls, counts = referenceCounts()) => {
  let applied = false;
  return (_options, sql) => {
    calls.push(sql);
    if (/DELETE FROM words/i.test(sql)) {
      applied = true;
      return wranglerPayload([], { changes: 2, rows_written: 2 });
    }
    if (/UPDATE books/i.test(sql)) return wranglerPayload([], { changes: 1, rows_written: 1 });
    if (/WITH target_words/i.test(sql)) return wranglerPayload([applied ? referenceCounts({ target_rows: 0 }) : counts]);
    if (/GROUP BY b\.id/i.test(sql)) {
      return wranglerPayload(applied ? [] : [
        {
          book_id: 'book-a',
          title: 'Book A',
          declared_word_count: 3,
          target_rows: 2,
          min_word_number: 1,
          max_word_number: 2,
        },
      ]);
    }
    if (/SELECT\s+w\.id/i.test(sql)) {
      return wranglerPayload(applied ? [] : [
        { id: 'word-1', book_id: 'book-a', title: 'Book A', word_number: 1, word: '[未抽出]', definition: '[未抽出]' },
        { id: "word-'2", book_id: 'book-a', title: 'Book A', word_number: 2, word: '[未抽出]', definition: '[未抽出]' },
      ]);
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  };
};

describe('remediate-blocked-content-markers', () => {
  it('requires explicit mode and bounds apply with expected row count', () => {
    expect(() => parseCliArgs([])).toThrow('Pass either --remote or --local');
    expect(parseCliArgs(['--remote'])).toEqual(expect.objectContaining({
      database: 'medace-db',
      mode: 'remote',
      apply: false,
      expectRows: null,
    }));
    expect(parseCliArgs(['--local', '--persist-to', '/tmp/d1'])).toEqual(expect.objectContaining({
      mode: 'local',
      persistTo: '/tmp/d1',
    }));
    expect(() => parseCliArgs(['--remote', '--persist-to', '/tmp/d1'])).toThrow('--persist-to');
    expect(() => parseCliArgs(['--remote', '--apply'])).toThrow('--apply requires --expect-rows');
    expect(() => parseCliArgs(['--remote', '--apply', '--expect-rows', '0'])).toThrow('--expect-rows');
    expect(parseCliArgs(['--remote', '--apply', '--expect-rows', '582'])).toEqual(expect.objectContaining({
      apply: true,
      expectRows: 582,
    }));
  });

  it('builds SELECT-only dry-run SQL and includes all reference guards', () => {
    const targetSql = buildTargetWordsSql({ ...baseOptions, marker: "x'y" });
    const referenceSql = buildReferenceCountSql(baseOptions);

    expect(targetSql).toContain("LIKE '%x''y%'");
    expect(targetSql).toContain('b.created_by IS NULL');
    expect(`${targetSql}\n${referenceSql}`).not.toMatch(/\b(UPDATE|INSERT|DELETE|DROP|ALTER)\b/i);
    expect(referenceSql).toContain('assessment_item_metadata');
    expect(referenceSql).toContain('cbt_problem_stats');
    expect(referenceSql).toContain('product_events');
    expect(referenceSql).toContain('example_image_key');
  });

  it('builds apply SQL from confirmed word ids without transactions', () => {
    const sqls = buildApplySqls(
      [{ id: 'word-1' }, { id: "word-'2" }],
      [{ book_id: 'book-a' }],
      1800000000000,
    );
    const joined = sqls.join('\n');

    expect(joined).toContain('DELETE FROM words');
    expect(joined).toContain("'word-''2'");
    expect(joined).toContain('UPDATE books');
    expect(joined).toContain('SELECT COUNT(*)');
    expect(joined).not.toMatch(/\b(BEGIN|COMMIT|SAVEPOINT|TRANSACTION)\b/i);
    expect(buildDeleteTargetWordsSql([])).toBeNull();
  });

  it('produces a dry-run plan without mutation statements', () => {
    const calls = [];
    const plan = fetchRemediationPlan(baseOptions, fakeExecuteFactory(calls));

    expect(plan).toEqual(expect.objectContaining({
      targetRows: 2,
      referenceTargetRows: 2,
      countsConsistent: true,
      canApply: true,
    }));
    expect(plan.targetWords.map((word) => word.id)).toEqual(['word-1', "word-'2"]);
    expect(calls).toHaveLength(3);
    expect(calls.join('\n')).not.toMatch(/\b(UPDATE|DELETE|INSERT|DROP|ALTER)\b/i);
  });

  it('refuses apply on mismatched expected count, references, count drift, or duplicate ids', () => {
    const readyPlan = {
      targetRows: 2,
      referenceTargetRows: 2,
      countsConsistent: true,
      blockedReferences: [],
      targetWords: [{ id: 'word-1' }, { id: 'word-2' }],
    };

    expect(() => validatePlanForApply({ ...baseOptions, apply: true, expectRows: 1 }, readyPlan)).toThrow('expected 1');
    expect(() => validatePlanForApply({
      ...baseOptions,
      apply: true,
      expectRows: 2,
    }, {
      ...readyPlan,
      blockedReferences: [{ key: 'product_events_soft_word_subject', count: 1 }],
    })).toThrow('still referenced');
    expect(() => validatePlanForApply({
      ...baseOptions,
      apply: true,
      expectRows: 2,
    }, {
      ...readyPlan,
      countsConsistent: false,
      referenceTargetRows: 3,
    })).toThrow('differs from reference count');
    expect(() => validatePlanForApply({
      ...baseOptions,
      apply: true,
      expectRows: 2,
    }, {
      ...readyPlan,
      targetWords: [{ id: 'word-1' }, { id: 'word-1' }],
    })).toThrow('duplicates');
  });

  it('does not mutate when references are present and applies in the expected order when clear', () => {
    const blockedCalls = [];
    expect(() => applyRemediation(
      { ...baseOptions, apply: true, expectRows: 2 },
      fakeExecuteFactory(blockedCalls, referenceCounts({ learning_histories: 1 })),
      () => 1800000000000,
    )).toThrow('still referenced');
    expect(blockedCalls.join('\n')).not.toMatch(/\b(DELETE|UPDATE)\b/i);

    const calls = [];
    const result = applyRemediation(
      { ...baseOptions, apply: true, expectRows: 2 },
      fakeExecuteFactory(calls),
      () => 1800000000000,
    );

    expect(result.action).toBe('apply');
    expect(result.after.targetRows).toBe(0);
    expect(calls).toHaveLength(8);
    expect(calls[0]).toMatch(/GROUP BY b\.id/i);
    expect(calls[1]).toMatch(/SELECT\s+w\.id/i);
    expect(calls[2]).toMatch(/WITH target_words/i);
    expect(calls[3]).toMatch(/DELETE FROM words/i);
    expect(calls[4]).toMatch(/UPDATE books/i);
    expect(calls.slice(5).join('\n')).not.toMatch(/\b(DELETE|UPDATE)\b/i);
  });
});
