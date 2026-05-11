import type { DiagnosticPhase, DiagnosticSkill } from '../../data/diagnostic';
import { EnglishLevel, GRADE_LABELS, UserGrade } from '../../types';

export const ONBOARDING_GRADES = [
  { id: UserGrade.JHS1, label: GRADE_LABELS[UserGrade.JHS1], desc: '英語を始めたばかり' },
  { id: UserGrade.JHS2, label: GRADE_LABELS[UserGrade.JHS2], desc: '基礎を固めたい' },
  { id: UserGrade.JHS3, label: GRADE_LABELS[UserGrade.JHS3], desc: '受験対策・長文挑戦' },
  { id: UserGrade.SHS1, label: GRADE_LABELS[UserGrade.SHS1], desc: '文法・語彙を強化' },
  { id: UserGrade.SHS2, label: GRADE_LABELS[UserGrade.SHS2], desc: '応用力をつけたい' },
  { id: UserGrade.SHS3, label: GRADE_LABELS[UserGrade.SHS3], desc: '大学受験レベル' },
  { id: UserGrade.UNIVERSITY, label: GRADE_LABELS[UserGrade.UNIVERSITY], desc: 'アカデミック / TOEIC' },
  { id: UserGrade.ADULT, label: GRADE_LABELS[UserGrade.ADULT], desc: 'ビジネス / 教養' },
];

export const LEVEL_BADGE_STYLE: Record<EnglishLevel, string> = {
  [EnglishLevel.A1]: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  [EnglishLevel.A2]: 'border-lime-200 bg-lime-50 text-lime-700',
  [EnglishLevel.B1]: 'border-sky-200 bg-sky-50 text-sky-700',
  [EnglishLevel.B2]: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  [EnglishLevel.C1]: 'border-rose-200 bg-rose-50 text-rose-700',
  [EnglishLevel.C2]: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
};

const DIAGNOSTIC_SKILL_LABELS: Record<DiagnosticSkill, string> = {
  grammar: '文法',
  vocabulary: '語彙',
  reading: '読解',
};

const DIAGNOSTIC_PHASE_EXPLANATIONS: Record<DiagnosticPhase, string> = {
  warmup: 'まずは基礎の安定度を見ています。',
  core: 'ここから標準的な読解・文脈判断を見ます。',
  stretch: '上位帯でどこまで届くかを確認しています。',
};

export const getDiagnosticSkillLabel = (skill: DiagnosticSkill) => DIAGNOSTIC_SKILL_LABELS[skill];

export const getDiagnosticPhaseExplanation = (phase: DiagnosticPhase) => DIAGNOSTIC_PHASE_EXPLANATIONS[phase];
