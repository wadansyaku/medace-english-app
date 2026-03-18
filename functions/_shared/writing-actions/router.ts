import type {
  WritingExamCategory,
} from '../../../types';
import type { AiUsageLogContext } from '../ai-metering';
import { HttpError, json } from '../http';
import type { AppEnv, DbUserRow } from '../types';
import {
  handleGetWritingPrintableFeedback,
  handleGetWritingSubmissionDetail,
  handleListWritingAssignments,
  handleListWritingReviewQueue,
  handleListWritingTemplates,
} from './reads';
import {
  handleApproveWritingReturn,
  handleCompleteWritingAssignment,
  handleCreateWritingUploadUrl,
  handleFinalizeWritingSubmission,
  handleGenerateWritingAssignment,
  handleGetWritingAsset,
  handleIssueWritingAssignment,
  handleRequestWritingRevision,
  handleWritingAssetUpload,
} from './mutations';
import {
  parseApproveWritingReturnRequest,
  parseAssignmentMutationRequest,
  parseCreateWritingUploadUrlRequest,
  parseFinalizeWritingSubmissionRequest,
  parseGenerateWritingAssignmentRequest,
  parseRequestWritingRevisionRequest,
} from './validators';

interface WritingRouteContext {
  env: AppEnv;
  user: DbUserRow;
  request: Request;
  segments: string[];
  logContext?: AiUsageLogContext;
}

interface WritingRouteDefinition {
  method: string;
  match: (segments: string[]) => boolean;
  handle: (context: WritingRouteContext) => Promise<Response>;
}

const routes: WritingRouteDefinition[] = [
  {
    method: 'GET',
    match: (segments) => segments[0] === 'templates',
    handle: async ({ env, user, request }) => {
      const url = new URL(request.url);
      return json(await handleListWritingTemplates(env, user, url.searchParams.get('examCategory') as WritingExamCategory | undefined));
    },
  },
  {
    method: 'GET',
    match: (segments) => segments[0] === 'assignments',
    handle: async ({ env, user, request }) => {
      const url = new URL(request.url);
      const scope = (url.searchParams.get('scope') as 'mine' | 'organization' | null) || 'mine';
      return json(await handleListWritingAssignments(env, user, scope));
    },
  },
  {
    method: 'POST',
    match: (segments) => segments[0] === 'assignments' && segments[1] === 'generate',
    handle: async ({ env, user, request, logContext }) => json(
      await handleGenerateWritingAssignment(
        env,
        user,
        parseGenerateWritingAssignmentRequest(await request.json()),
        logContext,
      ),
    ),
  },
  {
    method: 'POST',
    match: (segments) => segments[0] === 'assignments' && segments[1] === 'issue',
    handle: async ({ env, user, request }) => {
      const body = parseAssignmentMutationRequest(await request.json());
      return json(await handleIssueWritingAssignment(env, user, body.assignmentId));
    },
  },
  {
    method: 'POST',
    match: (segments) => segments[0] === 'assignments' && segments[1] === 'complete',
    handle: async ({ env, user, request }) => {
      const body = parseAssignmentMutationRequest(await request.json());
      return json(await handleCompleteWritingAssignment(env, user, body.assignmentId));
    },
  },
  {
    method: 'POST',
    match: (segments) => segments[0] === 'upload-url',
    handle: async ({ env, user, request }) => json(await handleCreateWritingUploadUrl(env, user, parseCreateWritingUploadUrlRequest(await request.json()))),
  },
  {
    method: 'PUT',
    match: (segments) => segments[0] === 'upload' && Boolean(segments[1]),
    handle: async ({ env, request, segments }) => handleWritingAssetUpload(env, segments[1], request),
  },
  {
    method: 'GET',
    match: (segments) => segments[0] === 'review-queue',
    handle: async ({ env, user, request }) => {
      const url = new URL(request.url);
      const scope = (url.searchParams.get('scope') as 'QUEUE' | 'HISTORY' | null) || 'QUEUE';
      return json(await handleListWritingReviewQueue(env, user, scope));
    },
  },
  {
    method: 'POST',
    match: (segments) => segments[0] === 'submissions' && segments[1] === 'finalize',
    handle: async ({ env, user, request, logContext }) => json(
      await handleFinalizeWritingSubmission(
        env,
        user,
        parseFinalizeWritingSubmissionRequest(await request.json()),
        logContext,
      ),
    ),
  },
  {
    method: 'GET',
    match: (segments) => segments[0] === 'submissions' && Boolean(segments[1]) && !segments[2],
    handle: async ({ env, user, segments }) => json(await handleGetWritingSubmissionDetail(env, user, segments[1])),
  },
  {
    method: 'POST',
    match: (segments) => segments[0] === 'submissions' && Boolean(segments[1]) && segments[2] === 'approve-return',
    handle: async ({ env, user, request, segments }) => json(await handleApproveWritingReturn(env, user, segments[1], parseApproveWritingReturnRequest(await request.json()))),
  },
  {
    method: 'POST',
    match: (segments) => segments[0] === 'submissions' && Boolean(segments[1]) && segments[2] === 'request-revision',
    handle: async ({ env, user, request, segments }) => json(await handleRequestWritingRevision(env, user, segments[1], parseRequestWritingRevisionRequest(await request.json()))),
  },
  {
    method: 'GET',
    match: (segments) => segments[0] === 'submissions' && Boolean(segments[1]) && segments[2] === 'printable-feedback',
    handle: async ({ env, user, segments }) => json(await handleGetWritingPrintableFeedback(env, user, segments[1])),
  },
  {
    method: 'GET',
    match: (segments) => segments[0] === 'assets' && Boolean(segments[1]),
    handle: async ({ env, user, segments }) => handleGetWritingAsset(env, user, segments[1]),
  },
];

export const handleWritingRequest = async (
  env: AppEnv,
  user: DbUserRow,
  request: Request,
  writingPath: string,
  logContext?: AiUsageLogContext,
): Promise<Response> => {
  const pathname = writingPath.replace(/^\/+/, '');
  const segments = pathname.split('/').filter(Boolean);
  const route = routes.find((candidate) => candidate.method === request.method && candidate.match(segments));
  if (route) {
    return route.handle({
      env,
      user,
      request,
      segments,
      logContext,
    });
  }

  throw new HttpError(404, 'Writing API エンドポイントが見つかりません。');
};
