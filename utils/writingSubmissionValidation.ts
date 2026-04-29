import {
  WRITING_UPLOAD_MAX_BYTES,
  WRITING_UPLOAD_MAX_IMAGE_FILES,
  WRITING_UPLOAD_PDF_MIME_TYPE,
  formatWritingUploadBytes,
  resolveWritingUploadFileKind,
  resolveWritingUploadMimeType,
  validateWritingUploadPolicy,
  type WritingUploadFileKind,
  type WritingUploadFileLike,
} from '../shared/writingUploadPolicy';

export {
  WRITING_UPLOAD_MAX_BYTES,
  WRITING_UPLOAD_MAX_IMAGE_FILES,
  WRITING_UPLOAD_PDF_MIME_TYPE,
  formatWritingUploadBytes,
  resolveWritingUploadFileKind,
  resolveWritingUploadMimeType,
  type WritingUploadFileKind,
  type WritingUploadFileLike,
};

export interface WritingSubmissionFileValidation {
  valid: boolean;
  message: string;
  kind?: 'pdf' | 'images';
  resolvedFiles?: Array<WritingUploadFileLike & { resolvedMimeType: string; kind: WritingUploadFileKind }>;
}

export const validateWritingSubmissionFiles = (
  files: WritingUploadFileLike[],
): WritingSubmissionFileValidation => {
  return validateWritingUploadPolicy(files);
};
