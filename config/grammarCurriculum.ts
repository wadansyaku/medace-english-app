import {
  EnglishLevel,
  type GrammarCurriculumScope,
  type GrammarCurriculumScopeId,
  type WorksheetQuestionMode,
} from '../types';

export const GRAMMAR_WORKSHEET_MODES = [
  'GRAMMAR_CLOZE',
  'EN_WORD_ORDER',
  'JA_TRANSLATION_ORDER',
  'JA_TRANSLATION_INPUT',
] as const satisfies readonly WorksheetQuestionMode[];

export type GrammarWorksheetMode = typeof GRAMMAR_WORKSHEET_MODES[number];

export const GRAMMAR_CURRICULUM_SCOPES = [
  {
    id: 'basic-svo',
    category: 'sentence-pattern',
    cefrLevel: EnglishLevel.A1,
    labelJa: '主語 + 動詞 + 目的語',
    labelEn: 'Subject + verb + object',
    descriptionJa: '英単語を基本文型の中で使う範囲です。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'be-verb',
    category: 'verb-form',
    cefrLevel: EnglishLevel.A1,
    labelJa: 'be動詞を使った文',
    labelEn: 'Be-verb sentences',
    descriptionJa: '状態や性質を表す be 動詞の文を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'modal-base-verb',
    category: 'verb-form',
    cefrLevel: EnglishLevel.A1,
    labelJa: '助動詞 + 動詞の原形',
    labelEn: 'Modal + base verb',
    descriptionJa: 'can / should / must などの助動詞と動詞の原形を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'time-preposition-phrase',
    category: 'phrase',
    cefrLevel: EnglishLevel.A1,
    labelJa: '時を表す副詞句',
    labelEn: 'Time preposition phrases',
    descriptionJa: 'before / after / during など、時を表す句を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'to-infinitive',
    category: 'verb-form',
    cefrLevel: EnglishLevel.A2,
    labelJa: 'to不定詞',
    labelEn: 'To-infinitive',
    descriptionJa: '目的や予定を表す to + 動詞の原形を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'gerund',
    category: 'verb-form',
    cefrLevel: EnglishLevel.A2,
    labelJa: '動名詞',
    labelEn: 'Gerund',
    descriptionJa: '動詞を名詞のように使う -ing 形を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'comparative',
    category: 'comparison',
    cefrLevel: EnglishLevel.A2,
    labelJa: '比較表現',
    labelEn: 'Comparatives',
    descriptionJa: 'more / -er / than などの比較表現を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'when-while-clause',
    category: 'clause',
    cefrLevel: EnglishLevel.A2,
    labelJa: 'when / while 節',
    labelEn: 'When / while clauses',
    descriptionJa: '時や同時進行を表す副詞節を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'passive-voice',
    category: 'verb-form',
    cefrLevel: EnglishLevel.B1,
    labelJa: '受け身',
    labelEn: 'Passive voice',
    descriptionJa: 'be動詞 + 過去分詞で、される側を主語にする文を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'present-perfect',
    category: 'verb-form',
    cefrLevel: EnglishLevel.B1,
    labelJa: '現在完了',
    labelEn: 'Present perfect',
    descriptionJa: 'have / has + 過去分詞で経験・継続・完了を表す文を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'relative-clause',
    category: 'clause',
    cefrLevel: EnglishLevel.B1,
    labelJa: '関係詞節',
    labelEn: 'Relative clauses',
    descriptionJa: 'who / which / that などで名詞を説明する節を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'],
  },
  {
    id: 'first-conditional',
    category: 'clause',
    cefrLevel: EnglishLevel.B1,
    labelJa: '条件を表す文',
    labelEn: 'First conditional',
    descriptionJa: 'if 節と will などで、条件と結果を表す文を扱います。',
    targetQuestionModes: ['GRAMMAR_CLOZE', 'EN_WORD_ORDER', 'JA_TRANSLATION_ORDER', 'JA_TRANSLATION_INPUT'],
  },
] as const satisfies readonly GrammarCurriculumScope[];

export const DEFAULT_GRAMMAR_SCOPE_ID_BY_MODE: Record<GrammarWorksheetMode, GrammarCurriculumScopeId> = {
  GRAMMAR_CLOZE: 'basic-svo',
  EN_WORD_ORDER: 'basic-svo',
  JA_TRANSLATION_ORDER: 'basic-svo',
  JA_TRANSLATION_INPUT: 'basic-svo',
};

export const GRAMMAR_CURRICULUM_SCOPE_LABELS: Record<GrammarCurriculumScopeId, string> = (
  GRAMMAR_CURRICULUM_SCOPES.reduce((labels, scope) => ({
    ...labels,
    [scope.id]: scope.labelJa,
  }), {} as Record<GrammarCurriculumScopeId, string>)
);
