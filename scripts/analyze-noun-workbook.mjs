import path from 'node:path';
import XLSXImport from 'xlsx';

import {
  parseNounWorkbookSheets,
  workbookToSheetEntries,
} from '../utils/nounWorkbookImport.js';

const inputPath = process.argv[2];

if (!inputPath) {
  console.error('Usage: node scripts/analyze-noun-workbook.mjs /path/to/noun_list.xlsx');
  process.exit(1);
}

const XLSX = XLSXImport?.default ?? XLSXImport;

const workbook = XLSX.readFile(inputPath, { cellText: false });
const parsed = parseNounWorkbookSheets(workbookToSheetEntries(
  workbook,
  (sheet) => XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null, blankrows: true }),
));

console.log(`Source: ${path.basename(inputPath)}`);
console.log(`Book title: ${parsed.summary.bookTitle}`);
console.log(`Books: ${parsed.summary.importBookCount}`);
console.log(`Words: ${parsed.summary.importWordCount}`);
console.log(`Categories: ${parsed.summary.categoryCount}`);
console.log(`Index words: ${parsed.summary.indexWordCount} (marked: ${parsed.summary.indexMarkedCount})`);
console.log(`Missing example sentences: ${parsed.summary.missingSentenceCount}`);
console.log(`Section markers skipped: ${parsed.summary.sectionMarkerCount}`);
console.log(`Duplicate headwords: ${parsed.summary.duplicateHeadwordCount}`);
console.log(`Index only (exact normalized): ${parsed.summary.unmatchedIndexWordCount}`);
console.log(`Imported only (exact normalized): ${parsed.summary.unmatchedImportedWordCount}`);
console.log(`Reviewed index-only exceptions: ${parsed.summary.reviewedIndexOnlyWordCount}`);
console.log(`Reviewed imported-only exceptions: ${parsed.summary.reviewedImportedOnlyWordCount}`);
console.log(`Reviewed duplicate headwords: ${parsed.summary.reviewedDuplicateHeadwordCount}`);
console.log(`Unreviewed index-only: ${parsed.summary.unreviewedIndexOnlyWordCount}`);
console.log(`Unreviewed imported-only: ${parsed.summary.unreviewedImportedOnlyWordCount}`);
console.log(`Unreviewed duplicate headwords: ${parsed.summary.unreviewedDuplicateHeadwordCount}`);
console.log('');

console.log('Books detail:');
parsed.books.forEach((book) => {
  const sourceIdRange = book.minSourceId === null || book.maxSourceId === null
    ? '-'
    : `${book.minSourceId}-${book.maxSourceId}`;
  console.log(`- ${book.bookName}: ${book.wordCount} words / missing examples ${book.missingSentenceCount} / categories ${book.categoryCount} / source ids ${sourceIdRange}`);
});

if (parsed.categories.length > 0) {
  console.log('');
  console.log('Category detail:');
  parsed.categories.forEach((category) => {
    console.log(`- ${category.category}: ${category.wordCount} words / missing examples ${category.missingSentenceCount}`);
  });
}

if (parsed.duplicateHeadwords.length > 0) {
  console.log('');
  console.log('Top duplicate headwords:');
  parsed.duplicateHeadwords.slice(0, 20).forEach((entry) => {
    console.log(`- ${entry.headword}: ${entry.count}`);
  });
}

if (parsed.unreviewedIndexOnlyWords.length > 0 || parsed.unreviewedImportedOnlyWords.length > 0 || parsed.unreviewedDuplicateHeadwords.length > 0) {
  console.log('');
  console.log('Unreviewed guardrail blockers:');
  parsed.unreviewedIndexOnlyWords.slice(0, 40).forEach((word) => {
    console.log(`- index-only: ${word}`);
  });
  parsed.unreviewedImportedOnlyWords.slice(0, 40).forEach((word) => {
    console.log(`- imported-only: ${word}`);
  });
  parsed.unreviewedDuplicateHeadwords.slice(0, 40).forEach((word) => {
    console.log(`- duplicate: ${word}`);
  });
}

if (parsed.missingExampleRows.length > 0) {
  console.log('');
  console.log('Missing example words:');
  parsed.missingExampleRows.forEach((entry) => {
    const sourceId = entry.sourceEntryId === null || entry.sourceEntryId === undefined ? '-' : entry.sourceEntryId;
    const sectionLabel = entry.section ? ` / ${entry.section}` : '';
    console.log(`- [${sourceId}] ${entry.word} (${entry.category} / ${entry.subcategory}${sectionLabel})`);
  });
}

if (parsed.issues.length > 0) {
  console.log('');
  console.log('Issues:');
  parsed.issues.slice(0, 40).forEach((issue) => {
    const sourceId = issue.sourceEntryId === null || issue.sourceEntryId === undefined ? '-' : issue.sourceEntryId;
    console.log(`- [${issue.code}] ${issue.sheetName} row ${issue.sheetRow} / source ${sourceId}: ${issue.message}${issue.word ? ` (${issue.word})` : ''}`);
  });
  if (parsed.issues.length > 40) {
    console.log(`- ... ${parsed.issues.length - 40} more`);
  }
}
