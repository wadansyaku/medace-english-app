export interface JapaneseTranslationOrderAssessment {
  status: 'correct' | 'incorrect' | 'unassessed';
  reasonJa: string;
}

export const normalizeJapaneseTranslationText = (text: string): string => text
  .normalize('NFKC').replace(/\s+/g, '').replace(/[、,]/g, '').replace(/[。.]$/g, '').trim();

/** A different word order is not evidence of a meaning error. */
export const assessJapaneseTranslationOrder = ({
  tokens, answerTokenIds, orderedTokenIds, referenceTranslation,
  acceptedTranslations = [], knownIncorrectTranslations = [],
}: {
  tokens: readonly { id: string; text: string }[];
  answerTokenIds: readonly string[];
  orderedTokenIds: readonly string[];
  referenceTranslation: string;
  acceptedTranslations?: readonly string[];
  knownIncorrectTranslations?: readonly { text: string; reasonJa: string }[];
}): JapaneseTranslationOrderAssessment => {
  const tokenById = new Map(tokens.map(token => [token.id, token.text]));
  const expectedIds = new Set(answerTokenIds);
  if (tokenById.size !== tokens.length || expectedIds.size !== answerTokenIds.length
    || answerTokenIds.length === 0 || answerTokenIds.length !== tokens.length
    || orderedTokenIds.length !== answerTokenIds.length
    || new Set(orderedTokenIds).size !== orderedTokenIds.length
    || orderedTokenIds.some(id => !expectedIds.has(id) || !tokenById.has(id))) {
    return { status: 'unassessed', reasonJa: '全ての語句を一度ずつ使って並べてください。点数・誤答履歴には保存していません。' };
  }
  const reference = normalizeJapaneseTranslationText(referenceTranslation);
  const canonical = normalizeJapaneseTranslationText(answerTokenIds.map(id => tokenById.get(id) ?? '').join(''));
  if (!reference || canonical !== reference) {
    return { status: 'unassessed', reasonJa: 'この問題の語句と参考訳の対応を確認できません。点数・誤答履歴には保存していません。' };
  }
  const answer = normalizeJapaneseTranslationText(orderedTokenIds.map(id => tokenById.get(id)!).join(''));
  if ([referenceTranslation, ...acceptedTranslations].some(text => normalizeJapaneseTranslationText(text) === answer)) {
    return { status: 'correct', reasonJa: '英文の意味を保った確認済みの並びです。' };
  }
  const error = knownIncorrectTranslations.find(candidate => normalizeJapaneseTranslationText(candidate.text) === answer);
  if (error) return { status: 'incorrect', reasonJa: error.reasonJa };
  return {
    status: 'unassessed',
    reasonJa: '未登録の並びです。正しい別順の可能性があるため未採点です。点数・誤答履歴には保存していません。参考訳と比べて確認してください。',
  };
};
