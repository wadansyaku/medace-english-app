import { digest, ORIGINAL_WORKBOOKS } from '../../scripts/_shared/original-workbook-import.mjs';
import { createNaruWorkbookImport } from '../../scripts/_shared/naru-workbook-import.mjs';
import { NARU_DEFINITION_SUPPLEMENTS } from '../../scripts/_shared/naru-definition-supplements.mjs';
const supplement = NARU_DEFINITION_SUPPLEMENTS.supplements[0];
const heldOriginal = () => {
  const { originalBookName, originalContentHash, sourceSnapshotBookId: _snapshot, ...record } = JSON.parse(supplement.originalPayloadJson);
  return { ...record, bookName: originalBookName, contentHash: originalContentHash };
};
// Portable synthetic catalog with the same audited SHA namespaces, counts and
// insertion position. Only held actually and its archive are the real evidence.
// No Downloads, real database, student record or network is needed for tests.
export const createNaruSupplementFixtureModel = () => createNaruWorkbookImport(ORIGINAL_WORKBOOKS.map(spec => {
  const source = supplement.sources.find(s => s.key === spec.key);
  const count = { verb:353, noun:932, adverb:87, adjective:159 }[spec.key];
  const records = Array.from({ length:count }, (_, i) => {
    if (spec.key === 'adverb' && i === 75) return heldOriginal();
    const record = { sourceKey:`${spec.key}:fixture:R${i+1}C1`, partOfSpeech:spec.key, bookName:spec.title, number:i+1,
      word:`fixture_${spec.key}_${i+1}`, definition:`合成の意味${i+1}`, exampleSentence:`Synthetic example ${i+1}.`, exampleMeaning:'', inflections:'', pronunciation:'', sourceNote:'', category:'fixture', subcategory:'', section:'', sourceSheet:'fixture', sourceRow:i+1, sourceColumn:1,
      sourceEntryId:spec.key === 'noun' ? i+1 : null, rawCells:[], ready:true };
    return { ...record, contentHash:digest(JSON.stringify(record)) };
  });
  const archive = JSON.parse(supplement.originalArchiveRowPayloadJson);
  const sheets = spec.key === 'adverb' ? [{ name:'副詞一覧',range:'A1:H82',originRow:0,originColumn:0,merges:[],cells:archive.cells,
    rows:Array.from({ length:82 }, (_, i) => i === 81 ? archive.values : []) }] : [];
  return { spec,sha256:source.sha256,records,sheets,issues:[{ sourceKey:supplement.sourceKey,severity:'blocking',code:'MISSING_DEFINITION' }] };
}), { timestamp:1 });
