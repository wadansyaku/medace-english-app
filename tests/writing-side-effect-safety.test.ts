import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const effects = vi.hoisted(() => ({ mission: vi.fn(), kpi: vi.fn() }));
vi.mock('../functions/_shared/storage-mission-actions', () => ({ touchWeeklyMissionProgressFromWriting: effects.mission }));
vi.mock('../functions/_shared/organization-kpi', () => ({ rebuildOrganizationKpiSnapshots: effects.kpi }));
import { syncWritingActivitySideEffects } from '../functions/_shared/writing-actions/mutation-side-effects';

const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach(({ sqlite }) => sqlite.close()));
beforeEach(() => {
  effects.mission.mockReset().mockResolvedValue(undefined);
  effects.kpi.mockReset().mockResolvedValue(undefined);
});
const setup = () => {
  const fixture = createSqliteD1();
  fixtures.push(fixture);
  const migrations = new URL('../migrations/', import.meta.url);
  for (const name of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    fixture.sqlite.exec(readFileSync(new URL(name, migrations), 'utf8'));
  }
  fixture.sqlite.exec(`
    INSERT INTO users (id, email, display_name, role, subscription_plan, created_at, updated_at)
    VALUES ('student', 'student@example.test', 'Student', 'STUDENT', 'TOB_PAID', 1, 1),
      ('teacher', 'teacher@example.test', 'Teacher', 'INSTRUCTOR', 'TOB_PAID', 1, 1);
    INSERT INTO writing_assignments (
      id, organization_name, instructor_user_id, student_user_id, exam_category, template_type,
      prompt_title, prompt_text, guidance, word_count_min, word_count_max, submission_code,
      prompt_snapshot, status, attempt_count, max_attempts, created_at, updated_at
    ) VALUES ('assignment', 'School', 'teacher', 'student', 'EIKEN', 'OPINION',
      'Prompt', 'Question', 'Guidance', 40, 60, 'TEST-01', '{}', 'REVIEW_READY', 1, 2, 1, 1);
    INSERT INTO writing_submissions (
      id, assignment_id, attempt_no, submission_source, submitted_by_user_id, transcript,
      processing_state, selected_evaluation_id, created_at, submitted_at, updated_at, ocr_meta
    ) VALUES ('submission', 'assignment', 1, 'STUDENT_MOBILE', 'student', 'Original essay.',
      'EVALUATED', 'live-evaluation', 1, 1, 1, '{"provenance":{"mode":"live","provider":"GEMINI","model":"gemini-2.5-flash"}}');
    INSERT INTO writing_ai_evaluations (
      id, submission_id, provider, overall_score, rubric_json, strengths_json, improvement_points_json,
      sentence_corrections_json, corrected_draft, model_answer, prompt_snapshot, is_default, created_at, raw_payload
    ) VALUES ('live-evaluation', 'submission', 'GEMINI', 14, '{}', '[]', '[]', '[]', 'Original essay.', 'Example', '{}', 1, 1,
      '{"provenance":{"mode":"live","provider":"GEMINI","model":"gemini-2.5-flash"}}');
  `);
  return { ...fixture, env: { DB: fixture.DB } as AppEnv };
};
const params = { studentUid: 'student', writingAssignmentId: 'assignment', organizationId: 'organization', activityAt: 1000 };

describe('persisted writing activity replay safety', () => {
  it.each(['sample OCR', 'sample evaluation', 'missing provenance', 'missing submission'])('blocks %s before mission or KPI side effects', async (state) => {
    const fixture = setup();
    if (state === 'sample OCR') {
      fixture.sqlite.prepare('UPDATE writing_submissions SET ocr_meta = ?').run(JSON.stringify({ provenance: { mode: 'hybrid-fallback', provider: 'OPENAI', model: 'fixture-writing-ocr' } }));
    } else if (state === 'sample evaluation') {
      fixture.sqlite.prepare('UPDATE writing_ai_evaluations SET raw_payload = ?').run(JSON.stringify({ provenance: { mode: 'live', provider: 'GEMINI', model: 'fixture-writing-evaluation' } }));
    } else if (state === 'missing provenance') {
      fixture.sqlite.exec('UPDATE writing_submissions SET ocr_meta = NULL');
    } else {
      fixture.sqlite.exec('DELETE FROM writing_submissions');
    }
    await expect(syncWritingActivitySideEffects(fixture.env, params)).rejects.toMatchObject({ status: 409 });
    expect(effects.mission).not.toHaveBeenCalled();
    expect(effects.kpi).not.toHaveBeenCalled();
  });

  it('uses the committed human review selection when an older job points at a real default evaluation', async () => {
    const fixture = setup();
    fixture.sqlite.exec(`
      INSERT INTO writing_ai_evaluations (
        id, submission_id, provider, overall_score, rubric_json, strengths_json, improvement_points_json,
        sentence_corrections_json, corrected_draft, model_answer, prompt_snapshot, is_default, created_at, raw_payload
      ) VALUES ('sample-evaluation', 'submission', 'OPENAI', 15, '{}', '[]', '[]', '[]', 'Sample.', 'Sample.', '{}', 0, 1,
        '{"provenance":{"mode":"hybrid-fallback","provider":"OPENAI","model":"fixture-writing-evaluation"}}');
      INSERT INTO writing_teacher_reviews (
        id, submission_id, reviewer_user_id, selected_evaluation_id, public_comment,
        review_decision, created_at, updated_at, released_at
      ) VALUES ('review', 'submission', 'teacher', 'sample-evaluation', 'Human comment', 'APPROVED_RETURN', 1, 1, 1);
    `);
    await expect(syncWritingActivitySideEffects(fixture.env, params)).rejects.toMatchObject({ status: 409 });
    expect(effects.mission).not.toHaveBeenCalled();
    expect(effects.kpi).not.toHaveBeenCalled();
  });

  it('continues normal learning activity for a verified real response', async () => {
    const fixture = setup();
    await syncWritingActivitySideEffects(fixture.env, params);
    expect(effects.mission).toHaveBeenCalledWith(fixture.env, { studentUid: params.studentUid, writingAssignmentId: params.writingAssignmentId, activityAt: params.activityAt });
    expect(effects.kpi).toHaveBeenCalledWith(fixture.env, params.organizationId, { dateKeys: ['1970-01-01'] });
  });
});
