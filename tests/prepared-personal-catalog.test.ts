import { describe, expect, it, vi } from 'vitest';
import {
  buildPreparedPersonalCatalogImport,
  readPreparedCatalogCsvFile,
  PERSONAL_CATALOG_OCR_UNAVAILABLE,
} from '../shared/preparedPersonalCatalog';

describe('personal prepared CSV import', () => {
  it('keeps example pairs and source fields, chooses one personal title and includes the logged-in owner', () => {
    const request = buildPreparedPersonalCatalogImport(' My book ', [
      'BookName,Number,Word,Meaning,ExampleSentence,ExampleMeaning,SourceSheet,SourceEntryId,PartOfSpeech,SourceNote',
      'Old title,8,source,出典,Please check the source.,出典を確認してください。,Original,12,noun,原本注記',
    ].join('\n'), 'synthetic-owner');
    expect(request).toEqual({
      defaultBookName: 'My book', createdByUid: 'synthetic-owner',
      source: { kind: 'rows', rows: [{ bookName: 'My book', number: 8, word: 'source', definition: '出典',
        exampleSentence: 'Please check the source.', exampleMeaning: '出典を確認してください。',
        sourceSheet: 'Original', sourceEntryId: 12, partOfSpeech: 'noun', sourceNote: '原本注記' }] },
    });
    expect(request.options).toBeUndefined();
  });
  it('accepts manually prepared Word/Meaning pairs and quoted example commas', () => {
    const request = buildPreparedPersonalCatalogImport('My book', 'Word,Meaning,ExampleSentence,ExampleMeaning\nsource,出典,"First, check the source.",最初に出典を確認。', 'synthetic-owner');
    expect(request.source).toMatchObject({ kind: 'rows', rows: [{ exampleSentence: 'First, check the source.' }] });
  });
  it.each(['Word,Meaning\nsource,', 'Word,Meaning\nsource,[要確認]', 'Word,Meaning\n"unterminated,出典', 'Ordinary unstructured prose.'])('holds incomplete input before any save: %s', csv => {
    expect(() => buildPreparedPersonalCatalogImport('My book', csv, 'synthetic-owner')).toThrow();
  });
  it('does not partially import good rows when another row is invalid', () => {
    expect(() => buildPreparedPersonalCatalogImport('My book', 'Word,Meaning\nsource,出典\nnext,', 'synthetic-owner')).toThrow('3行目');
  });
  it('limits local input and does not manufacture an owner', () => {
    expect(() => buildPreparedPersonalCatalogImport('', 'Word,Meaning\nsource,出典', 'synthetic-owner')).toThrow();
    expect(() => buildPreparedPersonalCatalogImport('My book', 'Word,Meaning\nsource,出典', '')).toThrow();
    expect(() => buildPreparedPersonalCatalogImport('My book', 'x'.repeat(1_000_001), 'synthetic-owner')).toThrow();
    expect(() => buildPreparedPersonalCatalogImport('My book', 'Word,Meaning\n' + Array.from({ length: 501 }, (_, i) => `word${i},語義${i}`).join('\n'), 'synthetic-owner')).toThrow('500語');
  });
  it.each([{ name: 'source.pdf', type: 'application/pdf' }, { name: 'source.png', type: 'image/png' }, { name: 'disguised.csv', type: 'image/png' }])('never reads or sends an OCR source: %s', async file => {
    const text = vi.fn();
    await expect(readPreparedCatalogCsvFile({ ...file, size: 1, text })).rejects.toThrow(PERSONAL_CATALOG_OCR_UNAVAILABLE);
    expect(text).not.toHaveBeenCalled();
  });
  it('reads only a bounded CSV file and retains its exact contents', async () => {
    const text = vi.fn().mockResolvedValue('Word,Meaning\nsource,出典');
    const file = { name: 'reviewed.CSV', type: 'text/csv', size: 50, text };
    await expect(readPreparedCatalogCsvFile(file)).resolves.toBe('Word,Meaning\nsource,出典');
    expect(text).toHaveBeenCalledTimes(1);
    await expect(readPreparedCatalogCsvFile({ ...file, size: 1_000_001 })).rejects.toThrow('1MB');
    expect(text).toHaveBeenCalledTimes(1);
  });
});
