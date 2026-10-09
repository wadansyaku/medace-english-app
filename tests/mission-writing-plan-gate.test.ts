import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { handleAssignWeeklyMission, handleCreateWeeklyMission } from '../functions/_shared/storage-mission-actions';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { LearningTrack } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach(fixture => fixture.sqlite.close()));
const setup = (plan: 'TOB_FREE' | 'TOB_PAID') => {
  const fixture = createSqliteD1();
  fixtures.push(fixture);
  const directory = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    fixture.sqlite.exec(readFileSync(new URL(file, directory), 'utf8'));
  }
  fixture.sqlite.exec(`
    INSERT INTO organizations (id, name_key, display_name, subscription_plan, created_at, updated_at)
      VALUES ('synthetic-plan-org', 'synthetic-plan-org', 'Synthetic organization', '${plan}', 1, 1);
    INSERT INTO users (id, email, display_name, role, subscription_plan, organization_id, created_at, updated_at)
      VALUES ('synthetic-plan-manager', 'plan-manager@example.invalid', 'Synthetic manager', 'INSTRUCTOR', 'TOB_PAID', 'synthetic-plan-org', 1, 1),
        ('synthetic-plan-student', 'plan-student@example.invalid', 'Synthetic student', 'STUDENT', '${plan}', 'synthetic-plan-org', 1, 1);
    INSERT INTO organization_memberships (user_id, organization_id, role, status, created_at, updated_at)
      VALUES ('synthetic-plan-manager', 'synthetic-plan-org', 'GROUP_ADMIN', 'ACTIVE', 1, 1),
        ('synthetic-plan-student', 'synthetic-plan-org', 'STUDENT', 'ACTIVE', 1, 1);
    INSERT INTO writing_assignments (id, organization_id, organization_name, instructor_user_id, student_user_id,
      exam_category, template_type, prompt_title, prompt_text, guidance, word_count_min, word_count_max,
      submission_code, prompt_snapshot, status, attempt_count, max_attempts, created_at, updated_at)
      VALUES ('synthetic-old-writing', 'synthetic-plan-org', 'Synthetic organization', 'synthetic-plan-manager',
        'synthetic-plan-student', 'EIKEN', 'OPINION', 'Synthetic writing', 'Synthetic prompt', '', 40, 60,
        'SYNTHETIC-PLAN', '{}', 'ASSIGNED', 0, 2, 1, 1);
    INSERT INTO weekly_missions (id, organization_id, created_by_user_id, learning_track, title, rationale,
      new_words_target, review_words_target, quiz_target_count, writing_assignment_id, due_at, status, created_at, updated_at)
      VALUES ('synthetic-old-mission', 'synthetic-plan-org', 'synthetic-plan-manager', 'EIKEN_2', 'Old mission', '',
        3, 1, 1, 'synthetic-old-writing', 200000, 'ASSIGNED', 1, 1);
    INSERT INTO weekly_mission_assignments (id, mission_id, student_user_id, assigned_by_user_id, assigned_at,
      status, new_word_ids_json, review_word_ids_json, quiz_day_keys_json, updated_at)
      VALUES ('synthetic-existing-assignment', 'synthetic-old-mission', 'synthetic-plan-student',
        'synthetic-plan-manager', 1, 'ASSIGNED', '[]', '[]', '[]', 1);
  `);
  return { ...fixture, env: { DB: fixture.DB } as AppEnv,
    manager: fixture.sqlite.prepare("SELECT * FROM users WHERE id = 'synthetic-plan-manager'").get() as unknown as DbUserRow,
    oldAssignment: () => fixture.sqlite.prepare("SELECT * FROM weekly_mission_assignments WHERE id = 'synthetic-existing-assignment'").get(),
    missionCount: () => fixture.sqlite.prepare('SELECT COUNT(*) AS count FROM weekly_missions').get()!.count };
};
const payload = { learningTrack: LearningTrack.EIKEN_2, newWordsTarget: 3, reviewWordsTarget: 1, quizTargetCount: 1 };

describe('weekly mission writing plan boundary', () => {
  it('rejects linking old writing after an organization downgrade despite a stale paid user shadow', async () => {
    const f = setup('TOB_FREE');
    const original = f.oldAssignment();
    await expect(handleCreateWeeklyMission(f.env, f.manager, { ...payload, writingAssignmentId: 'synthetic-old-writing' }))
      .rejects.toMatchObject({ status: 403 });
    expect(f.missionCount()).toBe(1);
    expect(f.oldAssignment()).toEqual(original);
  });
  it('rejects direct reassignment of a previously saved writing mission before archiving existing work', async () => {
    const f = setup('TOB_FREE');
    const original = f.oldAssignment();
    await expect(handleAssignWeeklyMission(f.env, f.manager, 'synthetic-old-mission', 'synthetic-plan-student'))
      .rejects.toMatchObject({ status: 403 });
    expect(f.oldAssignment()).toEqual(original);
    expect(f.sqlite.prepare('SELECT COUNT(*) AS count FROM weekly_mission_assignments').get()!.count).toBe(1);
  });
  it('continues to create and assign vocabulary missions without writing on a free plan', async () => {
    const f = setup('TOB_FREE');
    const mission = await handleCreateWeeklyMission(f.env, f.manager, payload);
    const assignment = await handleAssignWeeklyMission(f.env, f.manager, mission.id, 'synthetic-plan-student');
    expect(mission.writingAssignmentId).toBeUndefined();
    expect(assignment.studentUid).toBe('synthetic-plan-student');
  });
  it('retains valid writing links and normal assignment on a paid plan', async () => {
    const f = setup('TOB_PAID');
    const mission = await handleCreateWeeklyMission(f.env, f.manager, { ...payload, writingAssignmentId: 'synthetic-old-writing' });
    const assignment = await handleAssignWeeklyMission(f.env, f.manager, mission.id, 'synthetic-plan-student');
    expect(mission.writingAssignmentId).toBe('synthetic-old-writing');
    expect(assignment.studentUid).toBe('synthetic-plan-student');
  });
});
