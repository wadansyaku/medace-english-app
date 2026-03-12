import type {
  ApproveWritingReturnRequest,
  CreateWritingUploadUrlRequest,
  FinalizeWritingSubmissionRequest,
  GenerateWritingAssignmentRequest,
  RequestWritingRevisionRequest,
} from '../../../contracts/writing';
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

export const handleWritingRequest = async (
  env: AppEnv,
  user: DbUserRow,
  request: Request,
  writingPath: string,
): Promise<Response> => {
  const pathname = writingPath.replace(/^\/+/, '');
  const segments = pathname.split('/').filter(Boolean);

  if (request.method === 'GET' && segments[0] === 'templates') {
    const url = new URL(request.url);
    return json(await handleListWritingTemplates(env, user, url.searchParams.get('examCategory') || undefined));
  }

  if (request.method === 'GET' && segments[0] === 'assignments') {
    const url = new URL(request.url);
    const scope = (url.searchParams.get('scope') as 'mine' | 'organization' | null) || 'mine';
    return json(await handleListWritingAssignments(env, user, scope));
  }

  if (request.method === 'POST' && segments[0] === 'assignments' && segments[1] === 'generate') {
    const body = await request.json() as GenerateWritingAssignmentRequest;
    return json(await handleGenerateWritingAssignment(env, user, body));
  }

  if (request.method === 'POST' && segments[0] === 'assignments' && segments[1] === 'issue') {
    const body = await request.json() as { assignmentId?: string };
    return json(await handleIssueWritingAssignment(env, user, String(body.assignmentId || '')));
  }

  if (request.method === 'POST' && segments[0] === 'assignments' && segments[1] === 'complete') {
    const body = await request.json() as { assignmentId?: string };
    return json(await handleCompleteWritingAssignment(env, user, String(body.assignmentId || '')));
  }

  if (request.method === 'POST' && segments[0] === 'upload-url') {
    const body = await request.json() as CreateWritingUploadUrlRequest;
    return json(await handleCreateWritingUploadUrl(env, user, body));
  }

  if (request.method === 'PUT' && segments[0] === 'upload' && segments[1]) {
    return handleWritingAssetUpload(env, segments[1], request);
  }

  if (request.method === 'GET' && segments[0] === 'review-queue') {
    const url = new URL(request.url);
    const scope = (url.searchParams.get('scope') as 'QUEUE' | 'HISTORY' | null) || 'QUEUE';
    return json(await handleListWritingReviewQueue(env, user, scope));
  }

  if (request.method === 'POST' && segments[0] === 'submissions' && segments[1] === 'finalize') {
    const body = await request.json() as FinalizeWritingSubmissionRequest & { manualTranscript?: string };
    return json(await handleFinalizeWritingSubmission(env, user, body));
  }

  if (request.method === 'GET' && segments[0] === 'submissions' && segments[1] && !segments[2]) {
    return json(await handleGetWritingSubmissionDetail(env, user, segments[1]));
  }

  if (request.method === 'POST' && segments[0] === 'submissions' && segments[1] && segments[2] === 'approve-return') {
    const body = await request.json() as ApproveWritingReturnRequest;
    return json(await handleApproveWritingReturn(env, user, segments[1], body));
  }

  if (request.method === 'POST' && segments[0] === 'submissions' && segments[1] && segments[2] === 'request-revision') {
    const body = await request.json() as RequestWritingRevisionRequest;
    return json(await handleRequestWritingRevision(env, user, segments[1], body));
  }

  if (request.method === 'GET' && segments[0] === 'submissions' && segments[1] && segments[2] === 'printable-feedback') {
    return json(await handleGetWritingPrintableFeedback(env, user, segments[1]));
  }

  if (request.method === 'GET' && segments[0] === 'assets' && segments[1]) {
    return handleGetWritingAsset(env, user, segments[1]);
  }

  throw new HttpError(404, 'Writing API エンドポイントが見つかりません。');
};
