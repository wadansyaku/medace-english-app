import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const effects = vi.hoisted(() => ({ mission: vi.fn(), kpi: vi.fn() }));
vi.mock('../functions/_shared/storage-mission-actions', () => ({ touchWeeklyMissionProgressFromWriting: effects.mission }));
vi.mock('../functions/_shared/organization-kpi', () => ({ rebuildOrganizationKpiSnapshots: effects.kpi }));
import { syncWritingActivitySideEffects } from '../functions/_shared/writing-actions/mutation-side-effects';
import { enqueueWritingActivitySideEffect, runSideEffectJobById } from '../functions/_shared/side-effect-jobs';

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
    INSERT INTO organizations(id,display_name,name_key,created_at,updated_at) VALUES('organization','School','school',1,1);
    INSERT INTO writing_assignments (
      id, organization_id, organization_name, instructor_user_id, student_user_id, exam_category, template_type,
      prompt_title, prompt_text, guidance, word_count_min, word_count_max, submission_code,
      prompt_snapshot, status, attempt_count, max_attempts, created_at, updated_at
    ) VALUES ('assignment', 'organization', 'School', 'teacher', 'student', 'EIKEN', 'OPINION',
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
const params = { studentUid: 'student', writingAssignmentId: 'assignment', writingSubmissionId: 'submission', organizationId: 'organization', activityAt: 1000 };
const addLaterAttempt = (fixture: ReturnType<typeof setup>, mode: 'live' | 'fixture' = 'live') => {
  const provenance = JSON.stringify({ provenance: { mode, provider: 'GEMINI', model: mode === 'live' ? 'gemini-2.5-flash' : 'fixture-writing' } });
  fixture.sqlite.prepare(`INSERT INTO writing_submissions (
    id,assignment_id,attempt_no,submission_source,submitted_by_user_id,transcript,processing_state,
    selected_evaluation_id,created_at,submitted_at,updated_at,ocr_meta
  ) VALUES ('later-submission','assignment',2,'STUDENT_MOBILE','student','Later essay.','EVALUATED',
    'later-evaluation',?,?,?,?)`).run(Date.parse('2026-10-06T15:00:00Z'), Date.parse('2026-10-06T15:00:00Z'), Date.parse('2026-10-06T15:00:00Z'), provenance);
  fixture.sqlite.prepare(`INSERT INTO writing_ai_evaluations (
    id,submission_id,provider,overall_score,rubric_json,strengths_json,improvement_points_json,
    sentence_corrections_json,corrected_draft,model_answer,prompt_snapshot,is_default,created_at,raw_payload
  ) VALUES ('later-evaluation','later-submission','GEMINI',14,'{}','[]','[]','[]','Later.','Example','{}',1,1,?)`).run(provenance);
  fixture.sqlite.exec("UPDATE writing_assignments SET attempt_count=2,status='REVIEW_READY'");
};

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

  it('replays a failed real attempt A on its original Tokyo activity date after an unsafe attempt B exists', async () => {
    const fixture = setup();
    const original = { ...params, activityAt: Date.parse('2026-10-04T14:59:00Z') };
    const originalSubmission = fixture.sqlite.prepare("SELECT * FROM writing_submissions WHERE id='submission'").get();
    const job = await enqueueWritingActivitySideEffect(fixture.env, original);
    effects.mission.mockRejectedValueOnce(new Error('mission temporarily unavailable'));
    expect(await runSideEffectJobById(fixture.env, job.id)).toMatchObject({ status: 'FAILED', attemptCount: 1 });
    expect(effects.kpi).not.toHaveBeenCalled();
    addLaterAttempt(fixture, 'fixture');
    expect(await runSideEffectJobById(fixture.env, job.id)).toMatchObject({ status: 'COMPLETED', attemptCount: 2 });
    expect(effects.mission).toHaveBeenLastCalledWith(fixture.env, { studentUid: 'student', writingAssignmentId: 'assignment', activityAt: original.activityAt });
    expect(effects.kpi).toHaveBeenCalledOnce();
    expect(effects.kpi).toHaveBeenCalledWith(fixture.env, 'organization', { dateKeys: ['2026-10-04'] });
    expect(fixture.sqlite.prepare("SELECT * FROM writing_submissions WHERE id='submission'").get()).toEqual(originalSubmission);
    const persisted = fixture.sqlite.prepare('SELECT payload_json FROM side_effect_jobs WHERE id=?').get(job.id)!;
    expect(JSON.parse(String(persisted.payload_json))).toEqual(original);
    await runSideEffectJobById(fixture.env, job.id);
    expect(effects.mission).toHaveBeenCalledTimes(2); expect(effects.kpi).toHaveBeenCalledOnce();
  });

  it.each(['sample OCR', 'sample evaluation', 'missing provenance'])('never authorizes unsafe attempt A from later real B: %s', async state => {
    const fixture = setup();
    if (state === 'sample OCR') fixture.sqlite.exec(`UPDATE writing_submissions SET ocr_meta='{"provenance":{"mode":"fixture","model":"fixture-ocr"}}'`);
    if (state === 'sample evaluation') fixture.sqlite.exec(`UPDATE writing_ai_evaluations SET raw_payload='{"provenance":{"mode":"fixture","model":"fixture-evaluation"}}'`);
    if (state === 'missing provenance') fixture.sqlite.exec('UPDATE writing_submissions SET ocr_meta=NULL');
    const job = await enqueueWritingActivitySideEffect(fixture.env, params);
    expect((await runSideEffectJobById(fixture.env, job.id)).status).toBe('FAILED');
    addLaterAttempt(fixture);
    expect(await runSideEffectJobById(fixture.env, job.id)).toMatchObject({ status: 'FAILED', attemptCount: 2 });
    expect(effects.mission).not.toHaveBeenCalled(); expect(effects.kpi).not.toHaveBeenCalled();
  });

  it('keeps legacy jobs without a submission ID failed and intact even when one real submission exists', async () => {
    const fixture = setup();
    const { writingSubmissionId: _submission, ...legacy } = params;
    const raw = JSON.stringify(legacy);
    fixture.sqlite.prepare(`INSERT INTO side_effect_jobs(id,job_type,dedupe_key,status,payload_json,created_at,updated_at)
      VALUES ('legacy-job','SYNC_WRITING_ACTIVITY','legacy-key','PENDING',?,1,1)`).run(raw);
    expect(await runSideEffectJobById(fixture.env, 'legacy-job')).toMatchObject({ status: 'FAILED', lastError: expect.stringContaining('元の提出識別子') });
    addLaterAttempt(fixture);
    expect((await runSideEffectJobById(fixture.env, 'legacy-job')).status).toBe('FAILED');
    expect(fixture.sqlite.prepare("SELECT payload_json,last_error FROM side_effect_jobs WHERE id='legacy-job'").get())
      .toMatchObject({ payload_json: raw, last_error: expect.stringContaining('手動確認') });
    expect(effects.mission).not.toHaveBeenCalled(); expect(effects.kpi).not.toHaveBeenCalled();
  });

  it.each([{ writingAssignmentId: 'different-assignment' }, { studentUid: 'different-student' }, { organizationId: 'different-organization' }, { activityAt: 0 }])('rejects mismatched job scope before learning activity: %j', async change => {
    const fixture = setup();
    await expect(syncWritingActivitySideEffects(fixture.env, { ...params, ...change })).rejects.toMatchObject({ status: 409 });
    expect(effects.mission).not.toHaveBeenCalled(); expect(effects.kpi).not.toHaveBeenCalled();
  });

  it('keeps jobs for two submissions distinct even when assignment, student and activity time match', async () => {
    const fixture = setup(); addLaterAttempt(fixture);
    const first = await enqueueWritingActivitySideEffect(fixture.env, params);
    const later = { ...params, writingSubmissionId: 'later-submission' };
    const second = await enqueueWritingActivitySideEffect(fixture.env, later);
    expect(second.id).not.toBe(first.id);
    expect(JSON.parse(String(fixture.sqlite.prepare('SELECT payload_json FROM side_effect_jobs WHERE id=?').get(first.id)!.payload_json))).toEqual(params);
    expect((await enqueueWritingActivitySideEffect(fixture.env, params)).id).toBe(first.id);
    expect(fixture.sqlite.prepare('SELECT COUNT(*) AS n FROM side_effect_jobs').get()!.n).toBe(2);
  });
});
