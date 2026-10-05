import { readFileSync, readdirSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import WritingStudentAssignmentList from '../components/writing/WritingStudentAssignmentList';
import {
  canOpenWritingFeedback,
  getWritingFeedbackSubmissionId,
  isWritingSubmissionPending,
} from '../components/writing/studentSectionUtils';
import {
  handleGetWritingSubmissionDetail,
  handleListWritingAssignments,
  handleListWritingReviewQueue,
} from '../functions/_shared/writing-actions/reads';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { WritingAssignmentStatus } from '../types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const fixtures: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => fixtures.splice(0).forEach(({ sqlite }) => sqlite.close()));

const setup = () => {
  const fixture = createSqliteD1();
  fixtures.push(fixture);
  const migrations = new URL('../migrations/', import.meta.url);
  for (const filename of readdirSync(migrations).filter((name) => name.endsWith('.sql')).sort()) {
    fixture.sqlite.exec(readFileSync(new URL(filename, migrations), 'utf8'));
  }
  fixture.sqlite.exec(`
    INSERT INTO organizations (id, display_name, name_key, subscription_plan, created_at, updated_at)
    VALUES ('org-1', 'School', 'school', 'TOB_PAID', 1, 1), ('org-2', 'Other', 'other', 'TOB_PAID', 1, 1);
    INSERT INTO users (id, email, display_name, role, subscription_plan, organization_id, created_at, updated_at)
    VALUES ('student-1', 'student-1@example.test', 'Student', 'STUDENT', 'TOB_PAID', 'org-1', 1, 1),
      ('student-2', 'student-2@example.test', 'Other student', 'STUDENT', 'TOB_PAID', 'org-1', 1, 1),
      ('instructor-1', 'teacher@example.test', 'Teacher', 'INSTRUCTOR', 'TOB_PAID', 'org-1', 1, 1);
    INSERT INTO organization_memberships (user_id, organization_id, role, status, created_at, updated_at)
    VALUES ('student-1', 'org-1', 'STUDENT', 'ACTIVE', 1, 1),
      ('student-2', 'org-1', 'STUDENT', 'ACTIVE', 1, 1),
      ('instructor-1', 'org-1', 'GROUP_ADMIN', 'ACTIVE', 1, 1);
  `);
  for (const [id, student, organization] of [
    ['assignment-1', 'student-1', 'org-1'],
    ['assignment-other-student', 'student-2', 'org-1'],
    ['assignment-other-org', 'student-1', 'org-2'],
  ]) {
    fixture.sqlite.prepare(`
      INSERT INTO writing_assignments (
        id, organization_id, organization_name, instructor_user_id, student_user_id,
        exam_category, template_type, prompt_title, prompt_text, guidance, word_count_min,
        word_count_max, submission_code, prompt_snapshot, status, attempt_count, max_attempts, created_at, updated_at
      ) VALUES (?, ?, 'School', 'instructor-1', ?, 'EIKEN', 'OPINION', 'Practice', 'Question',
        'Guidance', 40, 60, ?, '{}', 'REVIEW_READY', 2, 3, 1, 2)
    `).run(id, organization, student, id);
    for (const attempt of [1, 2]) {
      const submissionId = `${id}-attempt-${attempt}`;
      const evaluationId = `${submissionId}-evaluation`;
      fixture.sqlite.prepare(`
        INSERT INTO writing_submissions (
          id, assignment_id, attempt_no, submission_source, submitted_by_user_id, transcript,
          processing_state, selected_evaluation_id, created_at, submitted_at, updated_at, ocr_meta
        ) VALUES (?, ?, ?, 'ONLINE', ?, 'Fixture response', 'EVALUATED', ?, ?, ?, ?, '{"provenance":{"mode":"live","provider":"GEMINI","model":"gemini-2.5-flash"}}')
      `).run(submissionId, id, attempt, student, evaluationId, attempt, attempt, attempt);
      fixture.sqlite.prepare(`
        INSERT INTO writing_ai_evaluations (
          id, submission_id, provider, overall_score, rubric_json, strengths_json, improvement_points_json,
          sentence_corrections_json, corrected_draft, model_answer, prompt_snapshot, is_default, created_at, raw_payload
        ) VALUES (?, ?, 'GEMINI', 14, '{}', '[]', '[]', '[]', ?, 'Example', '{}', 1, ?, '{"provenance":{"mode":"live","provider":"GEMINI","model":"gemini-2.5-flash"}}')
      `).run(evaluationId, submissionId, attempt === 1 ? 'Released feedback' : 'Unreleased draft', attempt);
      if (attempt === 1) {
        fixture.sqlite.prepare(`
          INSERT INTO writing_teacher_reviews (
            id, submission_id, reviewer_user_id, selected_evaluation_id, public_comment, private_memo,
            review_decision, created_at, updated_at, released_at
          ) VALUES (?, ?, 'instructor-1', ?, 'Please revise.', 'Private teacher memo', 'REVISION_REQUESTED', 10, 10, 10)
        `).run(`${id}-review`, submissionId, evaluationId);
      }
    }
  }
  return {
    ...fixture,
    env: { DB: fixture.DB } as AppEnv,
    user: (id = 'student-1') => fixture.sqlite.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as DbUserRow,
  };
};

describe('released writing feedback navigation', () => {
  it('labels a saved sample in the instructor queue using the selected evaluation and OCR metadata', async () => {
    const fixture = setup();
    fixture.sqlite.prepare('UPDATE writing_ai_evaluations SET raw_payload = ? WHERE id = ?').run(
      JSON.stringify({ provenance: { mode: 'live', provider: 'GEMINI', model: 'fixture-writing-evaluation' } }),
      'assignment-1-attempt-2-evaluation',
    );
    const { items } = await handleListWritingReviewQueue(fixture.env, fixture.user('instructor-1'), 'QUEUE');
    expect(items.find((item) => item.assignmentId === 'assignment-1')).toMatchObject({ assessmentStatus: 'sample' });
  });

  it('requires manual verification in the queue when the OCR origin is missing despite a live evaluation', async () => {
    const fixture = setup();
    fixture.sqlite.exec("UPDATE writing_submissions SET ocr_meta = NULL WHERE id = 'assignment-1-attempt-2'");
    const { items } = await handleListWritingReviewQueue(fixture.env, fixture.user('instructor-1'), 'QUEUE');
    expect(items.find((item) => item.assignmentId === 'assignment-1')).toMatchObject({ assessmentStatus: 'unverified' });
  });

  it.each([WritingAssignmentStatus.SUBMITTED, WritingAssignmentStatus.REVIEW_READY])(
    'lists only the learner’s released attempt while the new attempt is %s', async (status) => {
      const fixture = setup();
      fixture.sqlite.prepare('UPDATE writing_assignments SET status = ? WHERE id = ?').run(status, 'assignment-1');
      const { assignments } = await handleListWritingAssignments(fixture.env, fixture.user(), 'mine');
      expect(assignments).toHaveLength(1);
      const assignment = assignments[0];
      expect(assignment.latestSubmissionId).toBeUndefined();
      expect(assignment.latestReleasedSubmissionId).toBe('assignment-1-attempt-1');
      expect(getWritingFeedbackSubmissionId(assignment)).toBe('assignment-1-attempt-1');
      expect(isWritingSubmissionPending(assignment)).toBe(true);
      const detail = await handleGetWritingSubmissionDetail(fixture.env, fixture.user(), assignment.latestReleasedSubmissionId!);
      expect(detail.submission.evaluations).toHaveLength(1);
      expect(detail.submission.evaluations[0].correctedDraft).toBe('Released feedback');
      expect(JSON.stringify({ assignments, detail })).not.toContain('Unreleased draft');
      expect(JSON.stringify(detail)).not.toContain('Private teacher memo');
      await expect(handleGetWritingSubmissionDetail(fixture.env, fixture.user(), 'assignment-1-attempt-2'))
        .rejects.toMatchObject({ status: 403 });

      for (const isMobileViewport of [false, true]) {
        const html = renderToStaticMarkup(<WritingStudentAssignmentList
          assignments={assignments}
          isMobileViewport={isMobileViewport}
          openingFeedbackId={null}
          onOpenSubmit={() => {}}
          onOpenFeedback={() => {}}
        />);
        expect(html).toContain('writing-open-feedback-assignment-1');
        expect(html).toContain('前の添削結果を見る');
        expect(html).toContain('新しい答案は確認待ちです');
        expect(html).not.toContain('writing-open-submit-assignment-1');
      }
    },
  );

  it.each(['unreleased', 'wrong submission evaluation', 'missing review'])(
    'does not advertise a feedback ID with %s', async (condition) => {
      const fixture = setup();
      if (condition === 'unreleased') {
        fixture.sqlite.exec("UPDATE writing_teacher_reviews SET released_at = NULL WHERE id = 'assignment-1-review'");
      } else if (condition === 'wrong submission evaluation') {
        fixture.sqlite.exec("UPDATE writing_teacher_reviews SET selected_evaluation_id = 'assignment-1-attempt-2-evaluation' WHERE id = 'assignment-1-review'");
      } else {
        fixture.sqlite.exec("DELETE FROM writing_teacher_reviews WHERE id = 'assignment-1-review'");
      }
      const { assignments } = await handleListWritingAssignments(fixture.env, fixture.user(), 'mine');
      expect(assignments[0].latestReleasedSubmissionId).toBeUndefined();
      expect(assignments[0].latestSubmissionId).toBeUndefined();
      expect(canOpenWritingFeedback(assignments[0])).toBe(false);
      // Even a legacy payload's raw latest ID cannot open an unreleased state.
      expect(getWritingFeedbackSubmissionId({ ...assignments[0], latestSubmissionId: 'assignment-1-attempt-2' })).toBeUndefined();
    },
  );

  it('moves the feedback destination to the newer attempt only when that review is released', async () => {
    const fixture = setup();
    fixture.sqlite.exec(`
      INSERT INTO writing_teacher_reviews (
        id, submission_id, reviewer_user_id, selected_evaluation_id, public_comment,
        review_decision, created_at, updated_at, released_at
      ) VALUES ('review-2', 'assignment-1-attempt-2', 'instructor-1', 'assignment-1-attempt-2-evaluation',
        'Approved.', 'APPROVED_RETURN', 20, 20, 20);
      UPDATE writing_assignments SET status = 'RETURNED' WHERE id = 'assignment-1';
    `);
    const { assignments } = await handleListWritingAssignments(fixture.env, fixture.user(), 'mine');
    expect(assignments[0].latestSubmissionId).toBe('assignment-1-attempt-2');
    expect(assignments[0].latestReleasedSubmissionId).toBe('assignment-1-attempt-2');
    expect(getWritingFeedbackSubmissionId(assignments[0])).toBe('assignment-1-attempt-2');
  });

  it('preserves organization and student scope while staff retain the latest unreleased submission', async () => {
    const fixture = setup();
    const studentList = await handleListWritingAssignments(fixture.env, fixture.user('student-2'), 'mine');
    expect(studentList.assignments.map(({ id }) => id)).toEqual(['assignment-other-student']);
    await expect(handleGetWritingSubmissionDetail(fixture.env, fixture.user('student-2'), 'assignment-1-attempt-1'))
      .rejects.toMatchObject({ status: 403 });
    const teacherList = await handleListWritingAssignments(fixture.env, fixture.user('instructor-1'), 'organization');
    expect(teacherList.assignments.map(({ id }) => id).sort()).toEqual(['assignment-1', 'assignment-other-student']);
    expect(teacherList.assignments.find(({ id }) => id === 'assignment-1')?.latestSubmissionId).toBe('assignment-1-attempt-2');
  });
});
