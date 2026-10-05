import { InterventionKind, StudentRiskLevel } from '../types';

export interface InstructorFollowUpTemplateInput {
  instructorName: string;
  studentName: string;
  interventionKind?: InterventionKind;
  riskLevel?: StudentRiskLevel;
  hasLearningPlan?: boolean;
  /** This is literal instructor text, never an instruction to a model. */
  customInstruction?: string;
}

/** A draft only: no provider call, delivery, achievement claim, or grade. */
export const buildInstructorFollowUpTemplate = (input: InstructorFollowUpTemplateInput): string => {
  const kind = input.interventionKind ?? (
    input.riskLevel === StudentRiskLevel.SAFE
      ? InterventionKind.PRAISE
      : InterventionKind.REVIEW_RESTART
  );
  const instructor = input.instructorName.trim() || '講師';
  const student = input.studentName.trim() || '生徒';
  const templates: Record<InterventionKind, string> = {
    [InterventionKind.REVIEW_RESTART]: '今日はまず10語だけ復習してみましょう。短時間でも大丈夫です。',
    [InterventionKind.PLAN_NUDGE]: input.hasLearningPlan
      ? '学習プランを確認して、今日取り組む教材と量を決めましょう。'
      : '学習時間に合わせてプランを作り、今日取り組む教材と量を決めましょう。',
    [InterventionKind.PRAISE]: '学習への取り組みを応援しています。次回も無理のない量で続けていきましょう。',
    [InterventionKind.MANUAL_OTHER]: '今日の学習で困っていることがあれば、相談してください。',
  };
  const extra = input.customInstruction?.trim();
  return `${instructor}より: ${student}さん、${templates[kind]}${extra ? `\n${extra}` : ''}`;
};
