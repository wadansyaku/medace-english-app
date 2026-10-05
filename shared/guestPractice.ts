import type { WordData } from '../types';

export interface GuestMeaningQuestion {
  id: string;
  word: WordData;
  choices: string[];
  answer: string;
}

const normalizeText = (text: string): string => text.normalize('NFKC').trim().replace(/\s+/g, ' ');

/** Only real, distinct definitions become choices. Small books use fewer than four. */
export const buildGuestMeaningQuestions = (words: readonly WordData[]): GuestMeaningQuestion[] => {
  const seenIds = new Set<string>();
  const valid = words.filter(word => {
    if (!word.id || seenIds.has(word.id) || !word.word.trim() || !word.definition.trim()) return false;
    seenIds.add(word.id);
    return true;
  });
  const definitions = [...new Set(valid.map(word => normalizeText(word.definition)))];
  const meaningsByHeadword = new Map<string, Set<string>>();
  for (const word of valid) {
    const headword = normalizeText(word.word).toLowerCase();
    const meanings = meaningsByHeadword.get(headword) ?? new Set<string>();
    meanings.add(normalizeText(word.definition)); meaningsByHeadword.set(headword, meanings);
  }
  return valid.map((word, index) => {
    const answer = normalizeText(word.definition);
    const sameHeadwordMeanings = meaningsByHeadword.get(normalizeText(word.word).toLowerCase())!;
    const distractors = definitions.filter(definition => !sameHeadwordMeanings.has(definition));
    const offset = distractors.length ? index % distractors.length : 0;
    const choices = [...distractors.slice(offset), ...distractors.slice(0, offset)].slice(0, 3);
    choices.splice(index % (choices.length + 1), 0, answer);
    return { id: word.id, word, choices, answer };
  });
};

export const isGuestSpellingCorrect = (input: string, answer: string): boolean => (
  normalizeText(input).toLocaleLowerCase('en') === normalizeText(answer).toLocaleLowerCase('en')
);
