import type { GuestTrialImportRequest, GuestTrialImportResponse, GuestTrialSummary } from '../../../contracts/guestTrial';
import { GUEST_TRIAL_QUESTIONS, GUEST_TRIAL_TTL_MS, GUEST_TRIAL_VERSION, getGuestTrialQuestion, isGuestTrialAnswerCorrect, type GuestTrialAnswer } from '../../../shared/guestTrial';
import { UserRole } from '../../../types';
import { isDemoEmail } from '../../../utils/demo';
import { requireRole, requireUser } from '../auth';
import { HttpError, readJson } from '../http';
import { assertSameOriginMutation } from '../request-guards';
import type { AppEnv, DbUserRow } from '../types';
import { createJsonResponse, type ApiRouteDefinition } from './runtime';

const CONFLICT_MESSAGE = 'この体験記録は保存できません。同じアカウントと回答で再試行してください。';
const isObject = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
);
const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]): boolean => (
  Object.keys(value).every((key) => keys.includes(key))
);
const isId = (value: unknown): value is string => (
  typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value)
);

export const validateGuestTrialImport = (body: unknown, now = Date.now()): GuestTrialImportRequest => {
  if (!isObject(body) || !hasOnlyKeys(body, ['expectedUserId', 'trialId', 'version', 'answers'])
    || !isId(body.expectedUserId) || !isId(body.trialId) || body.version !== GUEST_TRIAL_VERSION
    || !Array.isArray(body.answers) || body.answers.length < 1 || body.answers.length > GUEST_TRIAL_QUESTIONS.length) {
    throw new HttpError(400, '体験記録の形式が正しくありません。');
  }
  const attemptIds = new Set<string>();
  const questionIds = new Set<string>();
  for (const answer of body.answers) {
    if (!isObject(answer) || !hasOnlyKeys(answer, ['attemptId', 'questionId', 'choiceIndex', 'answeredAt'])
      || !isId(answer.attemptId) || typeof answer.questionId !== 'string') {
      throw new HttpError(400, '体験回答の形式が正しくありません。');
    }
    const question = getGuestTrialQuestion(answer.questionId);
    if (!question || !Number.isInteger(answer.choiceIndex) || typeof answer.choiceIndex !== 'number'
      || answer.choiceIndex < 0 || answer.choiceIndex >= question.choices.length
      || typeof answer.answeredAt !== 'number' || !Number.isSafeInteger(answer.answeredAt)
      || answer.answeredAt <= 0 || answer.answeredAt < now - GUEST_TRIAL_TTL_MS || answer.answeredAt > now + 60_000
      || attemptIds.has(answer.attemptId) || questionIds.has(answer.questionId)) {
      throw new HttpError(400, '体験回答が重複しているか、有効期限・内容が正しくありません。');
    }
    attemptIds.add(answer.attemptId);
    questionIds.add(answer.questionId);
  }
  return body as unknown as GuestTrialImportRequest;
};

const assertTrialOwner = (user: DbUserRow): void => {
  requireRole(user, [UserRole.STUDENT]);
  if (isDemoEmail(user.email)) {
    throw new HttpError(403, '体験記録はご本人の生徒アカウントに保存してください。');
  }
};

export const readGuestTrialSummary = async (env: AppEnv, user: DbUserRow, trialId?: string): Promise<GuestTrialSummary | null> => {
  assertTrialOwner(user);
  if (trialId !== undefined && !isId(trialId)) throw new HttpError(400, '体験記録の識別子が正しくありません。');
  const claim = await env.DB.prepare(`
    SELECT c.trial_id AS trialId, c.version, c.imported_at AS importedAt
    FROM guest_trial_claims c
    WHERE c.user_id = ? ${trialId !== undefined ? 'AND c.trial_id = ?' : ''}
    ORDER BY c.imported_at DESC, c.trial_id DESC
    LIMIT 1
  `).bind(...(trialId !== undefined ? [user.id, trialId] : [user.id]))
    .first<Pick<GuestTrialSummary, 'trialId' | 'version' | 'importedAt'>>();
  if (!claim) return null;
  const result = await env.DB.prepare(`
    SELECT a.attempt_id AS attemptId, a.question_id AS questionId,
           a.choice_index AS choiceIndex, a.answered_at AS answeredAt
    FROM guest_trial_answers a
    JOIN guest_trial_claims c ON c.trial_id = a.trial_id
    WHERE c.user_id = ? AND c.trial_id = ?
    ORDER BY a.answered_at, a.attempt_id
  `).bind(user.id, claim.trialId).all<GuestTrialAnswer>();
  if (result.success === false || !result.results) throw new HttpError(500, '保存済み体験回答の取得に失敗しました。');
  const answers = result.results;
  // Derive counts from the same answer snapshot and original question set.
  // Device expiration never removes an authenticated account's saved answers.
  return { ...claim, answers, answerCount: answers.length,
    correctCount: answers.filter(isGuestTrialAnswerCorrect).length };
};

export const commitGuestTrialImport = async (env: AppEnv, user: DbUserRow, candidate: unknown): Promise<GuestTrialImportResponse> => {
  assertTrialOwner(user);
  const now = Date.now();
  const input = validateGuestTrialImport(candidate, now);
  if (input.expectedUserId !== user.id) throw new HttpError(409, CONFLICT_MESSAGE);
  // A mismatch deliberately violates NOT NULL. D1.batch rolls back the claim
  // and every answer, even when a concurrent request won a unique key first.
  const statements = [env.DB.prepare(`
    INSERT INTO guest_trial_claims (trial_id, user_id, version, imported_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(trial_id) DO UPDATE SET trial_id = CASE
      WHEN guest_trial_claims.user_id = excluded.user_id AND guest_trial_claims.version = excluded.version
      THEN guest_trial_claims.trial_id ELSE NULL END
  `).bind(input.trialId, user.id, input.version, now)];
  for (const answer of input.answers) {
    statements.push(env.DB.prepare(`
      INSERT INTO guest_trial_answers (attempt_id, trial_id, question_id, choice_index, answered_at, correct)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(attempt_id) DO UPDATE SET attempt_id = CASE
        WHEN guest_trial_answers.trial_id = excluded.trial_id
          AND guest_trial_answers.question_id = excluded.question_id
          AND guest_trial_answers.choice_index = excluded.choice_index
          AND guest_trial_answers.answered_at = excluded.answered_at
          AND guest_trial_answers.correct = excluded.correct
        THEN guest_trial_answers.attempt_id ELSE NULL END
    `).bind(answer.attemptId, input.trialId, answer.questionId, answer.choiceIndex, answer.answeredAt,
      isGuestTrialAnswerCorrect(answer) ? 1 : 0));
  }
  try {
    const results = await env.DB.batch(statements);
    if (results.some((result) => result.success === false)) throw new Error('Guest trial transaction failed');
  } catch (error) {
    if (error instanceof Error && /constraint|unique|not null/i.test(error.message)) {
      throw new HttpError(409, CONFLICT_MESSAGE);
    }
    throw error;
  }
  const summary = await readGuestTrialSummary(env, user, input.trialId);
  if (!summary) throw new HttpError(500, '体験記録の保存確認に失敗しました。同じ回答で再試行してください。');
  return { summary };
};

export const guestTrialRoutes: ApiRouteDefinition[] = [
  {
    matches: ({ pathname, request }) => pathname === 'guest-trial/import' && request.method === 'POST',
    handle: async ({ env, request }) => {
      assertSameOriginMutation(request);
      const user = await requireUser(env, request);
      const body = await readJson<unknown>(request, { maxBytes: 4096 });
      return { logUser: user, response: createJsonResponse(await commitGuestTrialImport(env, user, body)) };
    },
  },
  {
    matches: ({ pathname, request }) => pathname === 'guest-trial/summary' && request.method === 'GET',
    handle: async ({ env, request }) => {
      const user = await requireUser(env, request);
      const query = new URL(request.url).searchParams;
      if ([...query.keys()].some((key) => key !== 'trialId') || query.getAll('trialId').length > 1) {
        throw new HttpError(400, '体験記録の取得条件が正しくありません。');
      }
      return { logUser: user, response: createJsonResponse(await readGuestTrialSummary(env, user,
        query.has('trialId') ? query.get('trialId') || '' : undefined)) };
    },
  },
];
