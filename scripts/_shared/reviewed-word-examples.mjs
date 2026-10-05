import { createHash } from 'node:crypto';

const sha256 = value => createHash('sha256').update(value).digest('hex');
const quoted = value => `'${String(value).replaceAll("'", "''")}'`;
const optionalQuoted = value => value === null ? 'NULL' : quoted(value);
const BLOCKED = /\[?未抽出\]?|\[?要確認\]?|^(?:未設定|TODO|TBD|N\/A)$/iu;

const object = (value, label, allowed) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label}: object required`);
  const unknown = Object.keys(value).filter(key => !allowed.includes(key));
  if (unknown.length) throw new Error(`${label}: unexpected fields ${unknown.join(', ')}`);
  return value;
};
const text = (value, label, maximum, trim = true) => {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || value.includes('\0')) {
    throw new Error(`${label}: nonblank string up to ${maximum} characters required`);
  }
  if (BLOCKED.test(value.trim())) throw new Error(`${label}: unfinished content marker`);
  return trim ? value.trim() : value;
};
const timestamp = (value, label) => {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label}: positive safe integer required`);
  return value;
};

// This package attests preparation evidence only; it cannot request publication.
export const normalizeReviewedWordExamples = input => {
  const record = object(input, 'package', ['version', 'sourceFile', 'preparedWith', 'reviewReference', 'rows']);
  if (record.version !== 1) throw new Error('version: must be 1');
  if (!['MANUAL', 'GPT_WORK'].includes(record.preparedWith)) throw new Error('preparedWith: must be MANUAL or GPT_WORK');
  const evidence = {
    version: 1,
    sourceFile: text(record.sourceFile, 'sourceFile', 1000),
    preparedWith: record.preparedWith,
    reviewReference: text(record.reviewReference, 'reviewReference', 2000),
  };
  if (!Array.isArray(record.rows) || record.rows.length < 1 || record.rows.length > 500) {
    throw new Error('rows: 1 to 500 entries required');
  }
  const wordIds = new Set();
  const rows = record.rows.map((raw, index) => {
    const label = `rows[${index}]`;
    const row = object(raw, label, ['wordId', 'bookId', 'patchKind', 'expectedWord', 'expectedDefinition', 'expectedUpdatedAt', 'expectedExampleSentence', 'exampleSentence', 'exampleMeaning']);
    const wordId = text(row.wordId, `${label}.wordId`, 200, false);
    if (wordIds.has(wordId)) throw new Error(`${label}: duplicate wordId`);
    wordIds.add(wordId);
    if (!['EXAMPLE_PAIR', 'TRANSLATION_ONLY'].includes(row.patchKind)) throw new Error(`${label}.patchKind: invalid`);
    const pair = row.patchKind === 'EXAMPLE_PAIR';
    if (pair && row.expectedExampleSentence !== undefined && row.expectedExampleSentence !== null) {
      throw new Error(`${label}: EXAMPLE_PAIR must target a missing original example`);
    }
    const expectedExampleSentence = pair ? null : text(row.expectedExampleSentence, `${label}.expectedExampleSentence`, 4000, false);
    if (!pair && row.exampleSentence !== undefined) {
      throw new Error(`${label}: TRANSLATION_ONLY must not replace the original example`);
    }
    return {
      wordId,
      bookId: text(row.bookId, `${label}.bookId`, 200, false),
      patchKind: row.patchKind,
      expectedWord: text(row.expectedWord, `${label}.expectedWord`, 512, false),
      expectedDefinition: text(row.expectedDefinition, `${label}.expectedDefinition`, 4000, false),
      expectedUpdatedAt: timestamp(row.expectedUpdatedAt, `${label}.expectedUpdatedAt`),
      expectedExampleSentence,
      exampleSentence: pair ? text(row.exampleSentence, `${label}.exampleSentence`, 4000) : expectedExampleSentence,
      exampleMeaning: text(row.exampleMeaning, `${label}.exampleMeaning`, 4000),
    };
  });
  return { ...evidence, rows };
};

export const buildReviewedWordExamplesSql = (input, createdAt = Date.now()) => {
  timestamp(createdAt, 'createdAt');
  const normalized = normalizeReviewedWordExamples(input);
  const inputSha256 = sha256(JSON.stringify(normalized));
  const { rows, ...evidence } = normalized;
  const preparationEvidence = JSON.stringify({ ...evidence, inputSha256, publicationApproval: 'NOT_GRANTED' });
  const draftIds = [];
  const statements = rows.map(row => {
    const draftId = `word-example-draft-${sha256(JSON.stringify({ evidence, row }))}`;
    draftIds.push(draftId);
    const missing = row.patchKind === 'EXAMPLE_PAIR'
      ? "NULLIF(TRIM(w.example_sentence), '') IS NULL AND NULLIF(TRIM(w.example_meaning), '') IS NULL"
      : `w.example_sentence IS ${quoted(row.expectedExampleSentence)} AND NULLIF(TRIM(w.example_meaning), '') IS NULL`;
    return `INSERT INTO word_example_drafts (
  id, word_id, book_id, patch_kind, expected_word, expected_definition,
  expected_updated_at, expected_example_sentence, proposed_example_sentence,
  proposed_example_meaning, input_sha256, preparation_evidence_json, review_status, created_at
)
SELECT ${quoted(draftId)}, w.id, w.book_id, ${quoted(row.patchKind)},
  ${quoted(row.expectedWord)}, ${quoted(row.expectedDefinition)}, ${row.expectedUpdatedAt},
  ${optionalQuoted(row.expectedExampleSentence)}, ${quoted(row.exampleSentence)},
  ${quoted(row.exampleMeaning)}, ${quoted(inputSha256)}, ${quoted(preparationEvidence)}, 'PENDING', ${createdAt}
FROM words w
WHERE w.id IS ${quoted(row.wordId)} AND w.book_id IS ${quoted(row.bookId)}
  AND w.word IS ${quoted(row.expectedWord)} AND w.definition IS ${quoted(row.expectedDefinition)}
  AND w.updated_at IS ${row.expectedUpdatedAt}
  AND ${missing}
ON CONFLICT(id) DO NOTHING;`;
  });
  return {
    sql: `-- Review only: this file does not connect to or execute against D1.\n-- Requires additive migration 0049. PENDING staging only; no learner content updates.\n-- Missing or stale targets are skipped. Compare inserted IDs/counts before accepting the import.\n-- Input SHA256: ${inputSha256}\n\n${statements.join('\n\n')}\n`,
    manifest: {
      version: 1, inputSha256, rowCount: rows.length, draftIds,
      reviewStatus: 'PENDING', publicationApproval: 'NOT_GRANTED',
      execution: 'NOT_EXECUTED', createdAt,
    },
  };
};
