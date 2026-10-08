import corrections from '../data/naru-source-corrections.json';

/** Fixed, reviewed two-cell source repair; never an open-ended override list. */
export const reviewedNaruSourceCorrection = corrections.corrections[0];
const { archiveRows, ...proof } = reviewedNaruSourceCorrection;
export const naruSourceCorrectionExpectation = JSON.stringify({ ...proof, archiveRowCount: archiveRows.length });
export const matchesReviewedNaruCorrectedWord = (word: {
  id:string; book_id:string; word_number:number; word:string; definition:string;
  example_sentence?:string|null; example_meaning?:string|null; part_of_speech?:string|null;
  category?:string|null; source_sheet?:string|null; source_entry_id?:number|null;
  search_key?:string|null; subcategory?:string|null; section?:string|null;
  inflections?:string|null; pronunciation?:string|null; source_note?:string|null;
  aichi_exam_appeared?:number; definition_supplemented?:number; example_meaning_supplemented?:number;
}): boolean => {
  const m = reviewedNaruSourceCorrection;
  return word.id === m.originalWordId && word.book_id === m.bookId && word.word_number === 1361
    && word.word === 'actually' && word.definition === '実際には'
    && word.example_sentence === m.exampleSentence && word.example_meaning === m.exampleMeaning
    && word.part_of_speech === 'adverb' && word.category === '文副詞' && word.source_sheet === '副詞一覧'
    && word.source_entry_id === null && word.search_key === 'actually' && word.subcategory === ''
    && word.section === '' && word.inflections === '' && word.pronunciation === '' && word.source_note === ''
    && word.aichi_exam_appeared === 1 && word.definition_supplemented === 0 && word.example_meaning_supplemented === 1;
};
