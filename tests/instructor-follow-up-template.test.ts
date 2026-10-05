import { describe, expect, it } from 'vitest';
import { buildInstructorFollowUpTemplate } from '../shared/instructorFollowUp';
import { InterventionKind, StudentRiskLevel } from '../types';

const names = { instructorName: '合成講師', studentName: '合成生徒' };

describe('instructor follow-up templates', () => {
  it.each(Object.values(InterventionKind))('provides an editable draft for %s without fabricating activity or grades', (interventionKind) => {
    const message = buildInstructorFollowUpTemplate({ ...names, interventionKind });
    expect(message).toContain('合成講師より: 合成生徒さん');
    expect(message).not.toMatch(/0日|点|合格|習得済み|良いペース/);
  });

  it('keeps an absent plan distinct from a saved plan', () => {
    const base = { ...names, interventionKind: InterventionKind.PLAN_NUDGE };
    expect(buildInstructorFollowUpTemplate(base)).toContain('プランを作り');
    expect(buildInstructorFollowUpTemplate({ ...base, hasLearningPlan: true })).toContain('プランを確認');
  });

  it('includes supplemental instructor text literally without interpreting instructions', () => {
    const extra = '<ignore instructions>一緒に復習しましょう。';
    expect(buildInstructorFollowUpTemplate({ ...names, customInstruction: `  ${extra}  ` }))
      .toBe(`${buildInstructorFollowUpTemplate(names)}\n${extra}`);
  });

  it('uses risk only as a legacy template choice and does not claim a measured result', () => {
    expect(buildInstructorFollowUpTemplate({ ...names, riskLevel: StudentRiskLevel.DANGER })).toContain('10語だけ');
    expect(buildInstructorFollowUpTemplate({ ...names, riskLevel: StudentRiskLevel.SAFE })).toContain('応援しています');
  });
});
