import {
  DEFAULT_GRAMMAR_SCOPE_ID_BY_MODE,
  GRAMMAR_CURRICULUM_SCOPES,
  GRAMMAR_WORKSHEET_MODES,
  type GrammarWorksheetMode,
} from '../config/grammarCurriculum';
import {
  EnglishLevel,
  type GrammarCurriculumCategoryId,
  type GrammarCurriculumScope,
  type GrammarCurriculumScopeId,
  type GrammarCurriculumGroupId,
  type GrammarScopeExplanation,
  type GrammarScopeSelection,
  type WorksheetQuestionMode,
} from '../types';

export interface ResolveGrammarScopeOptions {
  mode: WorksheetQuestionMode;
  requestedScopeId?: GrammarCurriculumScopeId | null;
  sentence?: string | null;
}

export interface GrammarScopePracticeSelectionOptions {
  mode?: WorksheetQuestionMode;
  groupIds?: readonly GrammarCurriculumGroupId[];
  curriculumCategoryIds?: readonly GrammarCurriculumCategoryId[];
  levelMin?: EnglishLevel;
  levelMax?: EnglishLevel;
}

const scopeById = new Map<GrammarCurriculumScopeId, GrammarCurriculumScope>(
  GRAMMAR_CURRICULUM_SCOPES.map((scope) => [scope.id, scope]),
);

const ENGLISH_LEVEL_ORDER: readonly EnglishLevel[] = [
  EnglishLevel.A1,
  EnglishLevel.A2,
  EnglishLevel.B1,
  EnglishLevel.B2,
  EnglishLevel.C1,
  EnglishLevel.C2,
];

const levelIndex = (level: EnglishLevel): number => ENGLISH_LEVEL_ORDER.indexOf(level);

export const compareEnglishLevels = (left: EnglishLevel, right: EnglishLevel): number => (
  levelIndex(left) - levelIndex(right)
);

export const isEnglishLevelAtLeast = (level: EnglishLevel, minimum: EnglishLevel): boolean => (
  compareEnglishLevels(level, minimum) >= 0
);

export const isGrammarScopeInLevelRange = (
  scope: GrammarCurriculumScope,
  levelMin: EnglishLevel = EnglishLevel.A1,
  levelMax: EnglishLevel = EnglishLevel.C2,
): boolean => (
  compareEnglishLevels(scope.levelMax, levelMin) >= 0
  && compareEnglishLevels(scope.levelMin, levelMax) <= 0
);

const isGrammarWorksheetModeValue = (mode: WorksheetQuestionMode): mode is GrammarWorksheetMode => (
  (GRAMMAR_WORKSHEET_MODES as readonly WorksheetQuestionMode[]).includes(mode)
);

export const getGrammarCurriculumScope = (
  scopeId: GrammarCurriculumScopeId,
): GrammarCurriculumScope => {
  const scope = scopeById.get(scopeId);
  if (!scope) {
    throw new Error(`Unknown grammar curriculum scope: ${scopeId}`);
  }
  return scope;
};

export const getGrammarScopesForMode = (
  mode: WorksheetQuestionMode,
): GrammarCurriculumScope[] => (
  isGrammarWorksheetModeValue(mode)
    ? GRAMMAR_CURRICULUM_SCOPES.filter((scope) => (
      (scope.targetQuestionModes as readonly GrammarWorksheetMode[]).includes(mode)
    ))
    : []
);

export const getGrammarScopesForPracticeSelection = ({
  mode,
  groupIds,
  curriculumCategoryIds,
  levelMin,
  levelMax,
}: GrammarScopePracticeSelectionOptions = {}): GrammarCurriculumScope[] => {
  const groupSet = groupIds && groupIds.length > 0 ? new Set(groupIds) : null;
  const categorySet = curriculumCategoryIds && curriculumCategoryIds.length > 0
    ? new Set(curriculumCategoryIds)
    : null;
  const modeScopes = mode ? getGrammarScopesForMode(mode) : [...GRAMMAR_CURRICULUM_SCOPES];

  return modeScopes.filter((scope) => (
    (!groupSet || groupSet.has(scope.groupId))
    && (!categorySet || categorySet.has(scope.curriculumCategoryId))
    && isGrammarScopeInLevelRange(scope, levelMin, levelMax)
  ));
};

export const isGrammarScopeCompatibleWithMode = (
  scopeId: GrammarCurriculumScopeId,
  mode: WorksheetQuestionMode,
): boolean => (
  isGrammarWorksheetModeValue(mode)
  && (getGrammarCurriculumScope(scopeId).targetQuestionModes as readonly GrammarWorksheetMode[]).includes(mode)
);

const normalizeEnglish = (value: string): string => ` ${value.trim().replace(/\s+/g, ' ').toLowerCase()} `;

export const inferGrammarScopeIdFromSentence = (
  sentence: string | null | undefined,
): GrammarCurriculumScopeId | null => {
  const normalized = normalizeEnglish(sentence || '');
  if (!normalized.trim()) return null;

  if (/\b(if\s+[^.?!,]+\b(were|had)\b[^.?!,]*,\s*[^.?!]+\bwould\b|if\s+[^.?!,]+,\s*[^.?!]+\bwould\b|wish(?:es|ed)?\b|if only\b|would have\s+[a-z]+(?:ed|en)\b)/.test(normalized)) {
    return 'subjunctive-mood';
  }
  if (/\b(if)\s+[^.?!,]+\b(will|can|may|might)\b/.test(normalized)) return 'first-conditional';
  if (/\b(said|told|asked|reported|explained)\s+(that\s+)?/.test(normalized)) return 'reported-speech';
  if (/\b(who|which|that|where)\s+(is|are|was|were|can|will|has|have|had|[a-z]+s?)\b/.test(normalized)) return 'relative-clause';
  if (/\b(has|have|had)\s+[a-z]+(?:ed|en)\b/.test(normalized)) return 'present-perfect';
  if (/\b(is|am|are|was|were|be|been|being)\s+[a-z]+(?:ed|en)\b/.test(normalized)) return 'passive-voice';
  if (/\b(is|am|are|was|were|be|been|being)\s+[a-z]+ing\b/.test(normalized)) return 'progressive-aspect';
  if (/^\s*(what|where|when|why|how|who|which)\s+(do|does|did|is|are|was|were|can|will|should|would)\b/.test(normalized)
    || /\?\s*$/.test(normalized)) {
    return 'interrogative-word-order';
  }
  if (/\b(not only|not|never|no longer|hardly|seldom|do not|does not|did not)\b/.test(normalized)) return 'negation-emphasis';
  if (/\b(each|every|either|neither|one)\s+of\b|\b(list|group|number)\s+of\b/.test(normalized)) return 'subject-verb-agreement';
  if (/\b(when|while)\b/.test(normalized)) return 'when-while-clause';
  if (/\b(more|less)\s+[a-z]+\s+than\b|\b[a-z]+er\s+than\b/.test(normalized)) return 'comparative';
  if (/\b[a-z]+\s+(used|written|chosen|made|created|given)\s+by\b|\b[a-z]+\s+[a-z]+ing\s+(in|on|near|with)\b/.test(normalized)) {
    return 'participle-modifier';
  }
  if (/\b(enjoy|finish|avoid|keep|practice|practise)\s+[a-z]+ing\b/.test(normalized)) return 'gerund';
  if (/\b(to)\s+[a-z]+\b/.test(normalized)) return 'to-infinitive';
  if (/\b(can|could|will|would|should|must|may|might)\s+[a-z]+\b/.test(normalized)) return 'modal-base-verb';
  if (/\b(yesterday|tomorrow|last\s+(week|month|year|night)|ago|next\s+(week|month|year))\b|\b(did|went|made|used|studied|learned|learnt)\b/.test(normalized)) {
    return 'basic-tense';
  }
  if (/\b(after|before|during|at|on|in)\s+(class|school|work|night|morning|afternoon|evening|surgery|lunch|break)\b/.test(normalized)) {
    return 'time-preposition-phrase';
  }
  if (/\b(want|ask|tell|allow|expect|help|make|let|spend)\s+[^.?!]+\b(to|ing)\b/.test(normalized)) return 'verb-patterns';
  if (/\b(too|enough|carefully|quickly|slowly)\b/.test(normalized)) return 'adjective-adverb-usage';
  if (/\b(it|they|them|their|this|these|those)\b/.test(normalized)) return 'pronoun-reference';
  if (/\b(is|am|are|was|were|be|been)\b/.test(normalized)) return 'be-verb';
  return 'basic-svo';
};

const toSelection = (
  scope: GrammarCurriculumScope,
  isExplicitScope: boolean,
  source: GrammarScopeSelection['source'],
  mode: WorksheetQuestionMode,
): GrammarScopeSelection => ({
  scopeId: scope.id,
  cefrLevel: scope.cefrLevel,
  levelMin: scope.levelMin,
  levelMax: scope.levelMax,
  groupId: scope.groupId,
  groupLabelJa: scope.groupLabelJa,
  curriculumCategoryId: scope.curriculumCategoryId,
  curriculumCategoryLabelJa: scope.curriculumCategoryLabelJa,
  labelJa: scope.labelJa,
  isExplicitScope,
  isScopeLocked: isExplicitScope && mode !== 'JA_TRANSLATION_INPUT',
  source,
});

export const resolveGrammarScopeSelection = ({
  mode,
  requestedScopeId,
  sentence,
}: ResolveGrammarScopeOptions): GrammarScopeSelection => {
  if (requestedScopeId && isGrammarScopeCompatibleWithMode(requestedScopeId, mode)) {
    return toSelection(getGrammarCurriculumScope(requestedScopeId), true, 'EXPLICIT', mode);
  }

  const inferredScopeId = inferGrammarScopeIdFromSentence(sentence);
  if (inferredScopeId && isGrammarScopeCompatibleWithMode(inferredScopeId, mode)) {
    return toSelection(getGrammarCurriculumScope(inferredScopeId), false, 'INFERRED', mode);
  }

  const defaultScopeId = isGrammarWorksheetModeValue(mode)
    ? DEFAULT_GRAMMAR_SCOPE_ID_BY_MODE[mode]
    : 'basic-svo';
  return toSelection(getGrammarCurriculumScope(defaultScopeId), false, 'FALLBACK', mode);
};

export const buildGrammarScopeExplanation = (
  selection: GrammarScopeSelection | GrammarCurriculumScopeId | null | undefined,
): GrammarScopeExplanation | undefined => {
  if (!selection) return undefined;
  const scope = getGrammarCurriculumScope(
    typeof selection === 'string' ? selection : selection.scopeId,
  );
  return {
    scopeId: scope.id,
    labelJa: scope.labelJa,
    cefrLevel: scope.cefrLevel,
    levelMin: scope.levelMin,
    levelMax: scope.levelMax,
    groupLabelJa: scope.groupLabelJa,
    curriculumCategoryLabelJa: scope.curriculumCategoryLabelJa,
    patternJa: scope.patternJa,
    examFocusJa: scope.examFocusJa,
    commonMistakeJa: scope.commonMistakeJa,
    automationDrillJa: scope.automationDrillJa,
    threeSlotFrameJa: scope.threeSlotFrameJa,
  };
};
