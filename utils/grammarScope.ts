import {
  DEFAULT_GRAMMAR_SCOPE_ID_BY_MODE,
  GRAMMAR_CURRICULUM_SCOPES,
  GRAMMAR_WORKSHEET_MODES,
  type GrammarWorksheetMode,
} from '../config/grammarCurriculum';
import type {
  GrammarCurriculumScope,
  GrammarCurriculumScopeId,
  GrammarScopeExplanation,
  GrammarScopeSelection,
  WorksheetQuestionMode,
} from '../types';

export interface ResolveGrammarScopeOptions {
  mode: WorksheetQuestionMode;
  requestedScopeId?: GrammarCurriculumScopeId | null;
  sentence?: string | null;
}

const scopeById = new Map<GrammarCurriculumScopeId, GrammarCurriculumScope>(
  GRAMMAR_CURRICULUM_SCOPES.map((scope) => [scope.id, scope]),
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

  if (/\b(if)\s+[^.?!,]+\b(will|can|may|might)\b/.test(normalized)) return 'first-conditional';
  if (/\b(who|which|that|where)\s+(is|are|was|were|can|will|has|have|had|[a-z]+s?)\b/.test(normalized)) return 'relative-clause';
  if (/\b(has|have|had)\s+[a-z]+(?:ed|en)\b/.test(normalized)) return 'present-perfect';
  if (/\b(is|am|are|was|were|be|been|being)\s+[a-z]+(?:ed|en)\b/.test(normalized)) return 'passive-voice';
  if (/\b(when|while)\b/.test(normalized)) return 'when-while-clause';
  if (/\b(more|less)\s+[a-z]+\s+than\b|\b[a-z]+er\s+than\b/.test(normalized)) return 'comparative';
  if (/\b(enjoy|finish|avoid|keep|practice|practise)\s+[a-z]+ing\b/.test(normalized)) return 'gerund';
  if (/\b(to)\s+[a-z]+\b/.test(normalized)) return 'to-infinitive';
  if (/\b(can|could|will|would|should|must|may|might)\s+[a-z]+\b/.test(normalized)) return 'modal-base-verb';
  if (/\b(after|before|during|at|on|in)\s+(class|school|work|night|morning|afternoon|evening|surgery|lunch|break)\b/.test(normalized)) {
    return 'time-preposition-phrase';
  }
  if (/\b(is|am|are|was|were|be|been)\b/.test(normalized)) return 'be-verb';
  return 'basic-svo';
};

const toSelection = (
  scope: GrammarCurriculumScope,
  isExplicitScope: boolean,
  source: GrammarScopeSelection['source'],
): GrammarScopeSelection => ({
  scopeId: scope.id,
  cefrLevel: scope.cefrLevel,
  labelJa: scope.labelJa,
  isExplicitScope,
  source,
});

export const resolveGrammarScopeSelection = ({
  mode,
  requestedScopeId,
  sentence,
}: ResolveGrammarScopeOptions): GrammarScopeSelection => {
  if (requestedScopeId && isGrammarScopeCompatibleWithMode(requestedScopeId, mode)) {
    return toSelection(getGrammarCurriculumScope(requestedScopeId), true, 'EXPLICIT');
  }

  const inferredScopeId = inferGrammarScopeIdFromSentence(sentence);
  if (inferredScopeId && isGrammarScopeCompatibleWithMode(inferredScopeId, mode)) {
    return toSelection(getGrammarCurriculumScope(inferredScopeId), false, 'INFERRED');
  }

  const defaultScopeId = isGrammarWorksheetModeValue(mode)
    ? DEFAULT_GRAMMAR_SCOPE_ID_BY_MODE[mode]
    : 'basic-svo';
  return toSelection(getGrammarCurriculumScope(defaultScopeId), false, 'FALLBACK');
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
    patternJa: scope.patternJa,
    examFocusJa: scope.examFocusJa,
    commonMistakeJa: scope.commonMistakeJa,
    automationDrillJa: scope.automationDrillJa,
    threeSlotFrameJa: scope.threeSlotFrameJa,
  };
};
