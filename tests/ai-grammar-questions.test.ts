import { describe, expect, it } from 'vitest';

import { normalizeAiGrammarQuestionDrafts, type AiGrammarQuestionDraft } from '../utils/aiGrammarQuestions';

const sourceWords = [
  {
    id: 'w1',
    word: 'stabilize',
    definition: '安定させる',
    bookId: 'book-medical',
    bookTitle: 'Medical English',
  },
  {
    id: 'w2',
    word: 'triage',
    definition: '緊急度を判定する',
    bookId: 'book-medical',
    bookTitle: 'Medical English',
  },
];

describe('AI grammar question normalization', () => {
  it('accepts a grammar cloze draft and keeps the answer hidden in prompt text', () => {
    const drafts: AiGrammarQuestionDraft[] = [
      {
        wordId: 'w1',
        mode: 'GRAMMAR_CLOZE',
        promptText: 'Doctors ____ the patient before surgery.',
        sourceSentence: 'Doctors stabilize the patient before surgery.',
        answer: 'stabilize',
        options: ['stabilize', 'stabilized', 'stabilizes', 'stabilizing'],
        orderedTokens: [],
        grammarFocus: '時を表す副詞句',
        instruction: '空所に入る語形を選びます。',
      },
    ];

    const [question] = normalizeAiGrammarQuestionDrafts(drafts, sourceWords, 'GRAMMAR_CLOZE', 1);

    expect(question).toMatchObject({
      mode: 'GRAMMAR_CLOZE',
      interactionType: 'CHOICE',
      promptText: 'Doctors ____ the patient before surgery.',
      answer: 'stabilize',
      sourceSentence: 'Doctors stabilize the patient before surgery.',
      grammarFocus: '時を表す副詞句',
    });
    expect(question.options).toContain('stabilize');
    expect(question.options[0]).not.toBe('stabilize');
    expect(question.promptText).not.toContain('stabilize the patient');
  });

  it('builds shuffled English ordering tokens without capitalization or sentence-ending clues', () => {
    const drafts: AiGrammarQuestionDraft[] = [
      {
        wordId: 'w2',
        mode: 'EN_WORD_ORDER',
        promptText: '英単語を正しい英文の順番に並べ替えましょう。',
        sourceSentence: 'Nurses triage patients in an emergency room.',
        answer: 'Nurses triage patients in an emergency room.',
        options: [],
        orderedTokens: ['Nurses', 'triage', 'patients', 'in', 'an', 'emergency', 'room.'],
        grammarFocus: '主語 + 動詞 + 目的語',
        instruction: '英文の語順を確認します。',
      },
    ];

    const [question] = normalizeAiGrammarQuestionDrafts(drafts, sourceWords, 'EN_WORD_ORDER', 1);

    expect(question.mode).toBe('EN_WORD_ORDER');
    expect(question.answer).toBe('nurses triage patients in an emergency room');
    expect(question.tokens?.map((token) => token.text)).not.toEqual([
      'nurses',
      'triage',
      'patients',
      'in',
      'an',
      'emergency',
      'room',
    ]);
    expect(question.answerTokenIds?.map((id) => question.tokens?.find((token) => token.id === id)?.text)).toEqual([
      'nurses',
      'triage',
      'patients',
      'in',
      'an',
      'emergency',
      'room',
    ]);
    expect(question.tokens?.some((token) => /^[A-Z]/.test(token.text) || /[.!?。]$/.test(token.text))).toBe(false);
  });

  it('rejects ordering drafts with duplicate visible English chips', () => {
    const drafts: AiGrammarQuestionDraft[] = [
      {
        wordId: 'w2',
        mode: 'EN_WORD_ORDER',
        sourceSentence: 'Nurses triage the patients in the emergency room.',
        orderedTokens: ['Nurses', 'triage', 'the', 'patients', 'in', 'the', 'emergency', 'room.'],
      },
    ];

    expect(normalizeAiGrammarQuestionDrafts(drafts, sourceWords, 'EN_WORD_ORDER', 1)).toEqual([]);
  });

  it('filters malformed or wrong-mode AI drafts instead of trusting them', () => {
    const drafts: AiGrammarQuestionDraft[] = [
      {
        wordId: 'w1',
        mode: 'GRAMMAR_CLOZE',
        promptText: 'Doctors stabilize the patient before surgery.',
        sourceSentence: 'Doctors stabilize the patient before surgery.',
        answer: 'stabilize',
      },
      {
        wordId: 'w2',
        mode: 'EN_WORD_ORDER',
        promptText: '英単語を正しい英文の順番に並べ替えましょう。',
        sourceSentence: 'Nurses triage patients in an emergency room.',
        answer: 'Nurses triage patients in an emergency room.',
        orderedTokens: ['Nurses', 'triage', 'patients', 'in', 'an', 'emergency', 'room.'],
      },
    ];

    expect(normalizeAiGrammarQuestionDrafts(drafts, sourceWords, 'GRAMMAR_CLOZE', 2)).toEqual([]);
  });

  it('normalizes AI Japanese full-translation input questions', () => {
    const drafts: AiGrammarQuestionDraft[] = [
      {
        wordId: 'w1',
        mode: 'JA_TRANSLATION_INPUT',
        promptText: 'Doctors stabilize the patient before surgery.',
        sourceSentence: 'Doctors stabilize the patient before surgery.',
        sourceTranslation: '医師は手術前に患者を安定させる。',
        answer: '医師は手術前に患者を安定させる。',
        options: [],
        orderedTokens: [],
        grammarFocus: '時を表す副詞句',
        instruction: '英文を読み、日本語訳を全文で入力します。',
      },
    ];

    const [question] = normalizeAiGrammarQuestionDrafts(drafts, sourceWords, 'JA_TRANSLATION_INPUT', 1);

    expect(question).toMatchObject({
      mode: 'JA_TRANSLATION_INPUT',
      interactionType: 'TEXT_INPUT',
      promptText: 'Doctors stabilize the patient before surgery.',
      answer: '医師は手術前に患者を安定させる',
      sourceTranslation: '医師は手術前に患者を安定させる',
    });
  });

  it('marks explicit Japanese full-translation grammar scopes as reference metadata', () => {
    const drafts: AiGrammarQuestionDraft[] = [
      {
        wordId: 'w1',
        mode: 'JA_TRANSLATION_INPUT',
        promptText: 'The term stabilize is useful today.',
        sourceSentence: 'The term stabilize is useful today.',
        sourceTranslation: 'stabilizeという語は今日役に立つ。',
        answer: 'stabilizeという語は今日役に立つ。',
      },
    ];

    const [question] = normalizeAiGrammarQuestionDrafts(drafts, sourceWords, 'JA_TRANSLATION_INPUT', 1, 'be-verb');

    expect(question.grammarScope).toMatchObject({
      scopeId: 'be-verb',
      isExplicitScope: true,
      isScopeLocked: false,
      curriculumCategoryLabelJa: '動詞語法',
    });
    expect(question.grammarExplanation).toMatchObject({
      groupLabelJa: '動詞まわり',
      curriculumCategoryLabelJa: '動詞語法',
    });
  });
});
