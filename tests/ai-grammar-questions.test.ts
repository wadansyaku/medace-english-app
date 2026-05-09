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

  it('builds shuffled English ordering tokens while preserving repeated words', () => {
    const drafts: AiGrammarQuestionDraft[] = [
      {
        wordId: 'w2',
        mode: 'EN_WORD_ORDER',
        promptText: '英単語を正しい英文の順番に並べ替えましょう。',
        sourceSentence: 'Nurses triage patients in the emergency room.',
        answer: 'Nurses triage patients in the emergency room.',
        options: [],
        orderedTokens: ['Nurses', 'triage', 'patients', 'in', 'the', 'emergency', 'room.'],
        grammarFocus: '主語 + 動詞 + 目的語',
        instruction: '英文の語順を確認します。',
      },
    ];

    const [question] = normalizeAiGrammarQuestionDrafts(drafts, sourceWords, 'EN_WORD_ORDER', 1);

    expect(question.mode).toBe('EN_WORD_ORDER');
    expect(question.answer).toBe('Nurses triage patients in the emergency room.');
    expect(question.tokens?.map((token) => token.text)).not.toEqual([
      'Nurses',
      'triage',
      'patients',
      'in',
      'the',
      'emergency',
      'room.',
    ]);
    expect(question.answerTokenIds?.map((id) => question.tokens?.find((token) => token.id === id)?.text)).toEqual([
      'Nurses',
      'triage',
      'patients',
      'in',
      'the',
      'emergency',
      'room.',
    ]);
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
        sourceSentence: 'Nurses triage patients in the emergency room.',
        answer: 'Nurses triage patients in the emergency room.',
        orderedTokens: ['Nurses', 'triage', 'patients', 'in', 'the', 'emergency', 'room.'],
      },
    ];

    expect(normalizeAiGrammarQuestionDrafts(drafts, sourceWords, 'GRAMMAR_CLOZE', 2)).toEqual([]);
  });
});
