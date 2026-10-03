import { createHash } from 'node:crypto';

export const ORIGINAL_WORKBOOKS = Object.freeze([
  { key: 'verb', file: 'verb_list.xlsx', title: 'Naruシスト 動詞', legacyTitle: 'メッドエース オリジナル動詞（原本監査版）', contentSheet: '文法分類' },
  { key: 'noun', file: 'noun_list_修正版_監査付き_20260411.xlsx', title: 'Naruシスト 名詞', legacyTitle: 'メッドエース オリジナル名詞（原本監査版）' },
  { key: 'adverb', file: 'adverb_list.xlsx', title: 'Naruシスト 副詞', legacyTitle: 'メッドエース オリジナル副詞（原本監査版）', contentSheet: '副詞一覧' },
  { key: 'adjective', file: 'adjective_list.xlsx', title: 'Naruシスト 形容詞', legacyTitle: 'メッドエース オリジナル形容詞（原本監査版）', contentSheet: '形容詞' },
]);

export const digest = (value) => createHash('sha256').update(value).digest('hex');
export const text = (value) => value == null ? '' : String(value).replace(/\r\n?/g, '\n').trim();
export const lookup = (value) => text(value).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ');
const latin = (value) => /[A-Za-z]/.test(value);
const japanese = (value) => /[ぁ-んァ-ヶ一-龠々]/.test(value);
const lexical = (value) => latin(value) && !japanese(value);
const blockedMarkers = ['[未抽出]', '[要確認]', '未抽出', '要確認', '未設定', 'TODO', 'TBD', 'N/A', 'n/a'].map(lookup);
const qualityFields = ['word', 'definition', 'exampleSentence', 'exampleMeaning', 'inflections', 'pronunciation', 'sourceNote', 'category', 'subcategory', 'section', 'sourceSheet'];
const sentinelFields = (record) => qualityFields.filter((field) => blockedMarkers.some((marker) => {
  const value = lookup(record[field]);
  return value === marker || ((marker.includes('[') || marker.includes('未抽出') || marker.includes('要確認')) && value.includes(marker));
}));
const rate = (matched, total) => total ? Number((matched / total).toFixed(4)) : 0;

// Numeric source IDs and addressed workbook cells are different provenance
// methods. Missing numeric IDs are reported, never invented or made required.
export const measureOriginalSourceCoverage = (records, sheets) => {
  const byName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  const columnLetters = (column) => {
    let value = column;
    let letters = '';
    while (value > 0) { value -= 1; letters = String.fromCharCode(65 + value % 26) + letters; value = Math.floor(value / 26); }
    return letters;
  };
  const numericIds = records.filter((record) => text(record.sourceSheet) && Number.isSafeInteger(record.sourceEntryId) && record.sourceEntryId > 0).length;
  const coordinates = records.filter((record) => Number.isSafeInteger(record.sourceRow) && record.sourceRow > 0
    && Number.isSafeInteger(record.sourceColumn) && record.sourceColumn > 0
    && byName.get(record.sourceSheet)?.cells.some((cell) => cell.address === `${columnLetters(record.sourceColumn)}${record.sourceRow}` && text(cell.value) === record.word)).length;
  return { wordCount: records.length, sheetAndEntryIdCount: numericIds, sheetAndEntryIdCoverageRate: rate(numericIds, records.length),
    coordinateCount: coordinates, coordinateCoverageRate: rate(coordinates, records.length) };
};

// Preserve every populated cell, formulas, comments, and correction colors. This
// is a semantic archive, not a byte-for-byte replacement for the original XLSX.
export const archiveWorkbook = (workbook, XLSX) => workbook.SheetNames.map((name) => {
  const sheet = workbook.Sheets[name];
  const range = sheet['!ref'] || 'A1';
  const bounds = XLSX.utils.decode_range(range);
  return {
    name, range, originRow: bounds.s.r, originColumn: bounds.s.c,
    rows: XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: null, blankrows: true }),
    cells: Object.entries(sheet).filter(([address]) => !address.startsWith('!')).map(([address, cell]) => ({
      address, type: cell.t, value: cell.v ?? null,
      ...(cell.f ? { formula: cell.f } : {}),
      ...(cell.w !== undefined ? { displayed: cell.w } : {}),
      ...(cell.c ? { comments: cell.c.map((comment) => ({ author: comment.a, text: comment.t })) } : {}),
      ...(cell.s ? { style: cell.s } : {}),
      ...(cell.l ? { link: cell.l } : {}),
    })),
    merges: sheet['!merges'] || [],
  };
});

const duplicateGroups = (records, keyFn) => {
  const map = new Map();
  for (const record of records) {
    const key = keyFn(record);
    if (!key) continue;
    map.set(key, [...(map.get(key) || []), record.sourceKey]);
  }
  return [...map].filter(([, keys]) => keys.length > 1).map(([key, sourceKeys]) => ({ key, sourceKeys }));
};

const sourceRowAt = (sheet, rowIndex) => rowIndex + (sheet.originRow ?? 0) + 1;
const sourceColumnAt = (sheet, columnIndex) => columnIndex + sheet.originColumn + 1;

export const parseOriginalWorkbook = ({ spec, sha256, sheets }) => {
  const records = [];
  const indexEntries = [];
  const issues = [];
  const sectionMarkers = [];
  const sheetByName = new Map(sheets.map((sheet) => [sheet.name, sheet]));
  const requireSheet = (name) => {
    const sheet = sheetByName.get(name);
    if (!sheet) throw new Error(`${spec.file}: required sheet ${name} missing`);
    return sheet;
  };
  const add = (sheet, rowIndex, wordColumn, fields) => {
    const word = text(fields.word);
    const definition = text(fields.definition);
    if (!word) return;
    const sourceKey = `${spec.key}:${sheet.name}:R${sourceRowAt(sheet, rowIndex)}C${sourceColumnAt(sheet, wordColumn)}`;
    const record = {
      sourceKey, partOfSpeech: spec.key, bookName: spec.title,
      number: records.length + 1, word, definition,
      exampleSentence: text(fields.exampleSentence), exampleMeaning: text(fields.exampleMeaning),
      inflections: text(fields.inflections), pronunciation: '', sourceNote: text(fields.sourceNote),
      category: text(fields.category), subcategory: text(fields.subcategory), section: text(fields.section),
      sourceSheet: sheet.name, sourceRow: sourceRowAt(sheet, rowIndex), sourceColumn: sourceColumnAt(sheet, wordColumn),
      sourceEntryId: Number.isInteger(fields.sourceEntryId) ? fields.sourceEntryId : null,
      rawCells: fields.rawCells,
      ready: Boolean(definition && japanese(definition)),
    };
    const blockedFields = sentinelFields(record);
    if (blockedFields.length) record.ready = false;
    record.contentHash = digest(JSON.stringify(record));
    records.push(record);
    if (!definition) issues.push({ severity: 'blocking', code: 'MISSING_DEFINITION', sourceKey, word });
    else if (!japanese(definition)) issues.push({ severity: 'blocking', code: 'NON_JAPANESE_DEFINITION', sourceKey, word });
    if (blockedFields.length) issues.push({ severity: 'blocking', code: 'BLOCKED_CONTENT_MARKER', sourceKey, word, fields: blockedFields });
    if (!record.exampleSentence) issues.push({ severity: 'review', code: 'MISSING_EXAMPLE', sourceKey, word });
  };
  const addIndex = (sheet, rowIndex, column, category = '', inflections = '', note = '') => {
    const word = text(sheet.rows[rowIndex]?.[column]);
    if (lexical(word)) indexEntries.push({
      word, sourceSheet: sheet.name, sourceRow: sourceRowAt(sheet, rowIndex),
      sourceColumn: sourceColumnAt(sheet, column), category, inflections, note,
    });
  };

  if (spec.key === 'noun') {
    const index = requireSheet('名詞一覧');
    index.rows.forEach((row, i) => addIndex(index, i, 0));
    for (const sheet of sheets.filter((s) => !['名詞一覧', '修正ログ'].includes(s.name))) {
      const width = Math.max(...sheet.rows.map((row) => row.length), 0);
      const sections = new Map();
      sheet.rows.slice(1).forEach((row, i) => {
        for (let c = 0; c < width; c += 5) {
          const [id, word, definition, exampleSentence, note] = row.slice(c, c + 5);
          const headword = text(word);
          if (!headword) continue;
          if (!lexical(headword)) {
            sections.set(c, headword);
            sectionMarkers.push({ sheet: sheet.name, row: sourceRowAt(sheet, i + 1), column: sourceColumnAt(sheet, c + 1), text: headword });
            continue;
          }
          add(sheet, i + 1, c + 1, {
            word, definition, exampleSentence, sourceNote: note,
            sourceEntryId: typeof id === 'number' && Number.isInteger(id) ? id : null,
            category: sheet.name, subcategory: sheet.rows[0]?.[c + 1], section: sections.get(c),
            rawCells: row.slice(c, c + 5),
          });
        }
      });
    }
  } else if (spec.key === 'verb') {
    const sheet = requireSheet(spec.contentSheet);
    let section = '';
    sheet.rows.forEach((row, i) => {
      if (lexical(text(row[0]))) add(sheet, i, 0, {
        word: row[0], inflections: row[1], definition: row[2], exampleSentence: row[3],
        sourceNote: row[4], category: section, rawCells: row,
      });
      else if (text(row[0])) {
        section = text(row[0]);
        sectionMarkers.push({ sheet: sheet.name, row: sourceRowAt(sheet, i), column: sourceColumnAt(sheet, 0), text: section });
      }
    });
    const index = requireSheet('動詞一覧');
    let category = '';
    index.rows.forEach((row, i) => {
      if (lexical(text(row[0]))) addIndex(index, i, 0, category, text(row[4]), text(row[3]));
      else if (text(row[0])) category = text(row[0]);
    });
    const memo = requireSheet('メモ');
    memo.rows.forEach((row, i) => addIndex(memo, i, 0));
  } else if (spec.key === 'adverb') {
    const sheet = requireSheet(spec.contentSheet);
    let category = '';
    sheet.rows.forEach((row, i) => {
      addIndex(sheet, i, 0);
      if (lexical(text(row[5]))) add(sheet, i, 5, {
        word: row[5], definition: row[6], exampleSentence: row[7], category, rawCells: row.slice(5),
      });
      else if (text(row[5])) {
        category = text(row[5]);
        sectionMarkers.push({ sheet: sheet.name, row: sourceRowAt(sheet, i), column: sourceColumnAt(sheet, 5), text: category });
      }
    });
  } else if (spec.key === 'adjective') {
    const sheet = requireSheet(spec.contentSheet);
    sheet.rows.forEach((row, i) => {
      if (lexical(text(row[0]))) add(sheet, i, 0, { word: row[0], definition: row[1], exampleSentence: row[2], rawCells: row });
    });
    const index = requireSheet('形容詞一覧');
    index.rows.forEach((row, i) => row.forEach((cell, c) => addIndex(index, i, c)));
  } else throw new Error(`Unsupported workbook kind: ${spec.key}`);

  const readyRecords = records.filter((record) => record.ready);
  const headwords = new Set(readyRecords.map((record) => lookup(record.word)));
  const indexWords = new Set(indexEntries.map((entry) => lookup(entry.word)));
  const indexOnly = indexEntries.filter((entry) => !headwords.has(lookup(entry.word)));
  const contentOnly = readyRecords.filter((record) => !indexWords.has(lookup(record.word)));
  const duplicateHeadwords = duplicateGroups(records, (r) => lookup(r.word));
  const duplicateSourceIds = duplicateGroups(records, (r) => r.sourceEntryId == null ? '' : String(r.sourceEntryId));
  const rawVariants = duplicateGroups(records, (r) => lookup(r.word)).filter((group) =>
    new Set(records.filter((r) => group.sourceKeys.includes(r.sourceKey)).map((r) => r.word)).size > 1);
  const auditSheet = sheetByName.get('修正ログ');
  const auditHeader = auditSheet?.rows.findIndex((row) => text(row[0]) === '状態' && text(row[3]) === 'セル') ?? -1;
  const auditChanges = auditHeader < 0 ? [] : auditSheet.rows.slice(auditHeader + 1).filter((row) => text(row[0])).map((row) => {
    const [status, sheetName, sourceId, address, field, before, after, reason] = row.map(text);
    const targetSheet = sheetByName.get(sheetName);
    const values = targetSheet?.cells.filter((cell) => cell.address === address).map((cell) => text(cell.value)) || [];
    let verified = values.length === 1 && values[0] === after;
    if (status === '除外' && after === '空欄') {
      const rowNumber = Number(address.match(/\d+/)?.[0]);
      const rangeColumns = address.replace(/\d/g, '').split(':');
      const columnNumber = (letters) => [...letters].reduce((n, letter) => n * 26 + letter.charCodeAt(0) - 64, 0);
      const start = columnNumber(rangeColumns[0]);
      const end = columnNumber(rangeColumns[1] || rangeColumns[0]);
      verified = Boolean(targetSheet) && targetSheet.cells.filter((cell) => Number(cell.address.match(/\d+/)?.[0]) === rowNumber
        && columnNumber(cell.address.replace(/\d/g, '')) >= start && columnNumber(cell.address.replace(/\d/g, '')) <= end)
        .every((cell) => !text(cell.value));
    }
    return { status, sheetName, sourceId, address, field, before, after, reason, verified };
  });
  const sourceIds = [...new Set(records.flatMap((r) => r.sourceEntryId == null ? [] : [r.sourceEntryId]))].sort((a, b) => a - b);
  const missingSourceIds = sourceIds.length ? Array.from({ length: sourceIds.at(-1) - sourceIds[0] + 1 }, (_, i) => sourceIds[0] + i).filter((id) => !sourceIds.includes(id)) : [];
  return {
    spec, sha256, sheets, records, indexEntries, issues, sectionMarkers,
    indexOnly, contentOnly, duplicateHeadwords, duplicateSourceIds, rawVariants, auditChanges, missingSourceIds,
    summary: {
      sourceFile: spec.file, partOfSpeech: spec.key, sheetCount: sheets.length,
      candidateCount: records.length, readyCount: readyRecords.length,
      indexOccurrenceCount: indexEntries.length, indexUniqueCount: indexWords.size,
      indexOnlyUniqueCount: new Set(indexOnly.map((e) => lookup(e.word))).size,
      contentOnlyUniqueCount: new Set(contentOnly.map((e) => lookup(e.word))).size,
      missingDefinitionCount: records.filter((r) => !r.definition).length,
      missingExampleCount: records.filter((r) => !r.exampleSentence).length,
      inflectionCount: records.filter((r) => r.inflections).length,
      pronunciationCount: 0,
      noteCount: records.filter((r) => r.sourceNote).length,
      duplicateHeadwordGroupCount: duplicateHeadwords.length,
      duplicateSourceIdGroupCount: duplicateSourceIds.length,
      missingSourceIdCount: records.filter((r) => r.sourceEntryId == null).length,
      sourceCoverage: measureOriginalSourceCoverage(readyRecords, sheets),
      blockedMarkerRowCount: records.filter((record) => sentinelFields(record).length).length,
      variantGroupCount: rawVariants.length,
      auditNonemptyRowCount: auditSheet?.rows.filter((row) => row.some((v) => v != null && v !== '')).length || 0,
      correctionCommentCount: sheets.reduce((n, s) => n + s.cells.filter((c) => c.comments?.length).length, 0),
      correctionLogEntryCount: auditChanges.length,
      correctionLogMismatchCount: auditChanges.filter((change) => !change.verified).length,
      sourceIdMin: sourceIds[0] ?? null,
      sourceIdMax: sourceIds.at(-1) ?? null,
      sourceIdGapCount: missingSourceIds.length,
    },
  };
};

// Comparison is deliberately stricter than headword equality. Existing IDs are
// reused only for a unique source locator AND equal meanings/examples.
export const compareOriginalCatalog = (workbooks, existingRows = null, {
  correspondenceScope = 'UNRELATED_CATALOG_RECOMPOSITION', sourceBookIdsByPartOfSpeech = null,
} = {}) => {
  const sourceLineage = correspondenceScope === 'SOURCE_WORKBOOK_LINEAGE';
  if (sourceLineage && (!sourceBookIdsByPartOfSpeech || ORIGINAL_WORKBOOKS.some((spec) => !Array.isArray(sourceBookIdsByPartOfSpeech[spec.key])))) {
    throw new Error('Source lineage comparison requires an explicitly verified book-ID map for all four workbook namespaces');
  }
  if (existingRows === null) return { verified: false, correspondenceScope, reason: 'No confirmed source-workbook namespace export supplied', records: [] };
  const existing = existingRows.map((row) => ({
    id: row.id, bookId: row.bookId ?? row.book_id, bookTitle: row.bookTitle ?? row.book_title,
    word: text(row.word), definition: text(row.definition),
    exampleSentence: text(row.exampleSentence ?? row.example_sentence), exampleMeaning: text(row.exampleMeaning ?? row.example_meaning),
    sourceSheet: text(row.sourceSheet ?? row.source_sheet), sourceEntryId: row.sourceEntryId ?? row.source_entry_id ?? null,
    partOfSpeech: text(row.partOfSpeech ?? row.part_of_speech),
    inflections: text(row.inflections), pronunciation: text(row.pronunciation), sourceNote: text(row.sourceNote ?? row.source_note),
  }));
  const records = workbooks.flatMap((workbook) => workbook.records.map((record) => {
    const namespaceBookIds = sourceLineage ? sourceBookIdsByPartOfSpeech[workbook.spec.key] : null;
    const comparable = sourceLineage ? existing.filter((e) => namespaceBookIds.includes(e.bookId)) : existing;
    const posCompatible = (e) => !e.partOfSpeech || e.partOfSpeech === record.partOfSpeech;
    const meaningEqual = (e) => lookup(e.word) === lookup(record.word) && text(e.definition) === record.definition;
    // Compare only examples actually supplied by this source. An unprovided
    // Japanese example translation cannot be treated as a mismatch.
    const providedExamplesEqual = (e) => (!record.exampleSentence || e.exampleSentence === record.exampleSentence)
      && (!record.exampleMeaning || e.exampleMeaning === record.exampleMeaning);
    const contentEqual = (e) => meaningEqual(e) && providedExamplesEqual(e);
    const sourceEqual = (e) => record.sourceEntryId != null && e.sourceEntryId === record.sourceEntryId
      && e.sourceSheet === record.sourceSheet && posCompatible(e);
    const sourceMatches = comparable.filter(sourceEqual);
    const exact = sourceMatches.filter(contentEqual);
    const contentMatches = comparable.filter((e) => posCompatible(e) && contentEqual(e));
    const headwordMatches = comparable.filter((e) => posCompatible(e) && lookup(e.word) === lookup(record.word));
    const meaningMatches = headwordMatches.filter(meaningEqual);
    const status = !record.ready ? 'source_requires_review'
      : sourceLineage && namespaceBookIds.length === 0 ? 'missing_source_namespace'
      : exact.length === 1 ? 'exact_source_match'
        : exact.length > 1 ? 'ambiguous_source_match'
          : sourceMatches.length ? 'source_content_changed'
            : contentMatches.length ? 'content_match_needs_source_confirmation'
              : meaningMatches.length ? 'meaning_match_examples_differ'
                : headwordMatches.length ? 'headword_only_match' : 'missing';
    const match = exact.length === 1 ? exact[0] : null;
    const metadataDifferences = match ? ['partOfSpeech', 'inflections', 'pronunciation', 'sourceNote'].filter((field) => text(match[field]) !== text(record[field])) : [];
    return {
      sourceKey: record.sourceKey, word: record.word, definition: record.definition, partOfSpeech: record.partOfSpeech,
      sourceSheet: record.sourceSheet, sourceEntryId: record.sourceEntryId,
      status: !sourceLineage && status === 'missing' ? 'no_lexical_overlap'
        : !sourceLineage && status === 'headword_only_match' ? 'headword_overlap'
          : !sourceLineage && status === 'meaning_match_examples_differ' ? 'meaning_overlap'
            : !sourceLineage && status === 'content_match_needs_source_confirmation' ? 'content_overlap'
              : !sourceLineage && status.includes('source_match') ? 'content_overlap' : status,
      namespaceBookIds,
      matchedWordId: match?.id ?? null, candidateWordIds: [...new Set([...sourceMatches, ...contentMatches, ...headwordMatches].map((e) => e.id))],
      wordPresent: headwordMatches.length > 0,
      wordMeaningPresent: meaningMatches.length > 0,
      wordMeaningProvidedExamplesPresent: contentMatches.length > 0,
      matchingMeaningWordIds: meaningMatches.map((e) => e.id),
      matchingContentWordIds: contentMatches.map((e) => e.id),
      matchingContentPartOfSpeechUnknown: contentMatches.some((e) => !e.partOfSpeech),
      matchingMeaningPartOfSpeechUnknown: meaningMatches.some((e) => !e.partOfSpeech),
      metadataDifferences,
    };
  }));
  const coverageFor = (rows) => {
    const eligible = rows.filter((r) => r.status !== 'source_requires_review');
    return {
      sourceReadyRecords: eligible.length,
      wordPresent: eligible.filter((r) => r.wordPresent).length,
      wordMeaningPresent: eligible.filter((r) => r.wordMeaningPresent).length,
      wordMeaningProvidedExamplesPresent: eligible.filter((r) => r.wordMeaningProvidedExamplesPresent).length,
      meaningMatchesWithUnknownPartOfSpeech: eligible.filter((r) => r.matchingMeaningPartOfSpeechUnknown).length,
      contentMatchesWithUnknownPartOfSpeech: eligible.filter((r) => r.matchingContentPartOfSpeechUnknown).length,
      unambiguousSourceIdMatch: eligible.filter((r) => r.status === 'exact_source_match').length,
    };
  };
  const overlapMetrics = (rows) => {
    const { unambiguousSourceIdMatch, ...metrics } = coverageFor(rows);
    return metrics;
  };
  if (!sourceLineage) return {
    verified: false, correspondenceScope: 'UNRELATED_CATALOG_RECOMPOSITION',
    reason: 'Existing recomposed level catalog is a different teaching lineage. Lexical overlap is reference only and proves neither reflection nor missing workbook entries.',
    records: [],
    lexicalOverlapReference: {
      existingRowCount: existing.length, metrics: overlapMetrics(records),
      metricsByPartOfSpeech: Object.fromEntries(workbooks.map((w) => [w.spec.key, overlapMetrics(records.filter((r) => r.partOfSpeech === w.spec.key))])),
      records,
    },
  };
  return {
    verified: true, correspondenceScope, sourceBookIdsByPartOfSpeech, existingRowCount: existing.length,
    counts: records.reduce((counts, record) => ({ ...counts, [record.status]: (counts[record.status] || 0) + 1 }), {}),
    coverage: coverageFor(records),
    coverageByPartOfSpeech: Object.fromEntries(workbooks.map((w) => [w.spec.key, coverageFor(records.filter((r) => r.partOfSpeech === w.spec.key))])),
    records,
  };
};

const sqlValue = (value) => value == null || value === '' ? 'NULL' : typeof value === 'number'
  ? String(value) : `'${String(value).replace(/'/g, "''")}'`;
const insert = (table, columns, values) => `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${values.map(sqlValue).join(', ')}) ON CONFLICT DO NOTHING;`;
export const workbookBookId = (workbook) => `workbook-${workbook.spec.key}-${workbook.sha256.slice(0, 16)}`;

// Generate a separate, repeatable title refresh for already-imported snapshots.
// Full source SHA, file, ledger and historical title must match. Source archives,
// word IDs, histories, timestamps and material approval/access fields stay intact.
export const buildOriginalWorkbookTitleSql = (workbooks) => {
  const statements = ['-- Local review only: refresh the four original workbook display titles.',
    '-- No source content, history, access scope or material approval changes.'];
  for (const workbook of workbooks) {
    const spec = ORIGINAL_WORKBOOKS.find((entry) => entry.key === workbook.spec.key);
    const { sha256 } = workbook;
    if (!spec || spec.file !== workbook.spec.file || !/^[a-f0-9]{64}$/.test(sha256)) {
      throw new Error('Title refresh requires a known original workbook and full source SHA');
    }
    const bookId = sqlValue(workbookBookId(workbook));
    const title = sqlValue(spec.title);
    const allowedTitles = [spec.legacyTitle, spec.title].map(sqlValue).join(', ');
    const sourceId = sqlValue(`xlsx-${spec.key}-${sha256}`);
    const sourceFile = sqlValue(spec.file);
    const revision = sqlValue(sha256);
    const context = sqlValue(`原本由来:${spec.file}; source_revision:${sha256}`);
    const sourceMatch = `EXISTS (SELECT 1 FROM catalog_workbook_sources s WHERE s.id=${sourceId} AND s.series_key=${sqlValue(spec.key)} AND s.source_file=${sourceFile} AND s.sha256=${revision})`;
    const ledgerMatch = `EXISTS (SELECT 1 FROM material_source_ledger m WHERE m.source_id=${sqlValue(`ledger-${workbookBookId(workbook)}`)} AND m.book_id=${bookId} AND m.catalog_source='STEADY_STUDY_ORIGINAL' AND m.source_file=${sourceFile} AND m.edition=${revision} AND m.book_title IN (${allowedTitles}))`;
    statements.push(`UPDATE books SET title=${title} WHERE id=${bookId} AND title IN (${allowedTitles}) AND catalog_source='STEADY_STUDY_ORIGINAL' AND source_context=${context} AND ${sourceMatch} AND ${ledgerMatch};`);
    statements.push(`UPDATE material_source_ledger SET book_title=${title} WHERE source_id=${sqlValue(`ledger-${workbookBookId(workbook)}`)} AND book_id=${bookId} AND catalog_source='STEADY_STUDY_ORIGINAL' AND source_file=${sourceFile} AND edition=${revision} AND book_title IN (${allowedTitles}) AND ${sourceMatch} AND EXISTS (SELECT 1 FROM books b WHERE b.id=${bookId} AND b.title=${title} AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.source_context=${context});`);
  }
  return `${statements.join('\n')}\n`;
};

// Generates SQL only. No connection, exec, remote flag, deletes, or updates.
// Snapshot books never reuse old word IDs; exact existing matches are reported
// separately and any eventual mapping must be reviewed before a real cutover.
export const buildOriginalWorkbookSql = (workbooks, { localPreview = false, timestamp = Date.now() } = {}) => {
  const statements = [
    '-- LOCAL snapshot import only. Apply 0043 first; do not use this file on production.',
    '-- Existing books, words, users, and learning histories are never changed.',
    `-- Material ledger: ${localPreview ? 'approved for isolated local preview only' : 'pending review'}.`,
    'PRAGMA foreign_keys = ON;',
  ];
  for (const workbook of workbooks) {
    const { spec, sha256, records, sheets } = workbook;
    const sourceId = `xlsx-${spec.key}-${sha256}`;
    const bookId = workbookBookId(workbook);
    const ready = records.filter((record) => record.ready);
    const sourceCoverage = measureOriginalSourceCoverage(ready, sheets);
    const requiredBlankRows = ready.filter((record) => !text(record.word) || !text(record.definition)).length;
    const sentinelCounts = ready.map((record) => sentinelFields(record).length);
    const archiveMetadata = sheets.map(({ name, range, originRow = 0, originColumn, merges, cells }) => ({ name, range, originRow, originColumn, merges, cellCount: cells.length }));
    statements.push(insert('catalog_workbook_sources', ['id', 'series_key', 'source_file', 'sha256', 'archive_json', 'created_at'],
      [sourceId, spec.key, spec.file, sha256, JSON.stringify(archiveMetadata), timestamp]));
    for (const sheet of sheets) {
      const cellsByRow = new Map();
      for (const cell of sheet.cells) {
        const row = Number(cell.address.match(/\d+$/)?.[0]);
        cellsByRow.set(row, [...(cellsByRow.get(row) || []), cell]);
      }
      for (let i = 0; i < sheet.rows.length; i += 1) {
        const rowNumber = sourceRowAt(sheet, i);
        statements.push(insert('catalog_workbook_sheet_rows', ['source_id', 'sheet_name', 'row_number', 'payload_json'],
          [sourceId, sheet.name, rowNumber, JSON.stringify({ values: sheet.rows[i], cells: cellsByRow.get(rowNumber) || [] })]));
      }
    }
    statements.push(insert('books', ['id', 'title', 'word_count', 'is_priority', 'description', 'source_context', 'created_by', 'catalog_source', 'access_scope', 'created_at', 'updated_at'],
      [bookId, spec.title, ready.length, 0, '原本の語義・用例・活用・注記を保持するローカル監査版。既存レベル教材とは別の系統です。索引差分・原本誤記は監査レポート参照。', `原本由来:${spec.file}; source_revision:${sha256}`, null, 'STEADY_STUDY_ORIGINAL', 'BUSINESS_ONLY', timestamp, timestamp]));
    statements.push(insert('material_source_ledger', [
      'source_id', 'book_id', 'catalog_source', 'book_title', 'edition', 'rights_status', 'review_status', 'source_file', 'extracted_at', 'transform_log', 'content_qa_report', 'qa_word_count', 'qa_required_blank_rows', 'qa_rows_with_sentinel', 'qa_sentinel_value_count', 'qa_duplicate_headword_count', 'qa_source_coverage_rate', 'qa_example_pair_coverage_rate', 'notes', 'created_at', 'updated_at',
    ], [
      `ledger-${bookId}`, bookId, 'STEADY_STUDY_ORIGINAL', spec.title, sha256,
      localPreview ? 'approved' : 'pending', localPreview ? 'approved' : 'needs_review', spec.file,
      new Date(timestamp).toISOString(), 'scripts/audit-original-workbooks.mjs', 'original-workbook-audit.json', ready.length,
      requiredBlankRows, sentinelCounts.filter(Boolean).length, sentinelCounts.reduce((sum, count) => sum + count, 0),
      ready.length - new Set(ready.map((record) => lookup(record.word))).size, sourceCoverage.sheetAndEntryIdCoverageRate,
      rate(ready.filter((record) => record.exampleSentence && record.exampleMeaning).length, ready.length),
      localPreview ? 'ローカルの講師確認用。配備・本番教材承認・generator照合は未実施。' : '原本監査版。配備前に索引差分・原本誤記・教材承認を確認。', timestamp, timestamp,
    ]));
    for (const record of records) {
      const entryId = `entry-${digest(`${sourceId}:${record.sourceKey}`)}`;
      statements.push(insert('catalog_source_entries', ['id', 'source_id', 'source_key', 'content_hash', 'payload_json', 'ready'],
        [entryId, sourceId, record.sourceKey, record.contentHash, JSON.stringify(record), record.ready ? 1 : 0]));
      if (!record.ready) continue;
      const wordId = `${bookId}-${digest(record.sourceKey).slice(0, 20)}`;
      statements.push(insert('words', [
        'id', 'book_id', 'word_number', 'word', 'definition', 'search_key', 'category', 'subcategory', 'section', 'source_sheet', 'source_entry_id', 'example_sentence', 'example_meaning', 'part_of_speech', 'inflections', 'pronunciation', 'source_note', 'is_reported', 'created_at', 'updated_at',
      ], [wordId, bookId, record.number, record.word, record.definition, lookup(record.word), record.category, record.subcategory, record.section, record.sourceSheet, record.sourceEntryId, record.exampleSentence, record.exampleMeaning, record.partOfSpeech, record.inflections, record.pronunciation, record.sourceNote, 0, timestamp, timestamp]));
      statements.push(insert('catalog_word_source_links', ['source_entry_id', 'word_id', 'match_kind'], [entryId, wordId, 'snapshot_import']));
    }
  }
  return `${statements.join('\n')}\n`;
};
