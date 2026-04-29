export const WRITING_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;
export const WRITING_UPLOAD_MAX_IMAGE_FILES = 4;

export const WRITING_UPLOAD_PDF_MIME_TYPE = 'application/pdf';
export const WRITING_UPLOAD_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

const WRITING_UPLOAD_IMAGE_MIME_TYPE_SET = new Set<string>(WRITING_UPLOAD_IMAGE_MIME_TYPES);
const GENERIC_BROWSER_MIME_TYPES = new Set([
  'application/octet-stream',
  'binary/octet-stream',
  'application/x-octet-stream',
]);

export type WritingUploadFileKind = 'pdf' | 'image' | 'unsupported';

export interface WritingUploadFileLike {
  name: string;
  type: string;
  size: number;
}

export interface ResolvedWritingUploadFile extends WritingUploadFileLike {
  resolvedMimeType: string;
  kind: WritingUploadFileKind;
}

export interface WritingUploadPolicyValidation {
  valid: boolean;
  message: string;
  kind?: 'pdf' | 'images';
  resolvedFiles?: ResolvedWritingUploadFile[];
}

export const resolveWritingUploadMimeType = (file: Pick<WritingUploadFileLike, 'name' | 'type'>): string => {
  const mimeType = file.type.trim().toLowerCase();
  const fileName = file.name.trim().toLowerCase();

  const canInferFromExtension = !mimeType || GENERIC_BROWSER_MIME_TYPES.has(mimeType);
  if (!canInferFromExtension) return mimeType;

  if (fileName.endsWith('.pdf')) return WRITING_UPLOAD_PDF_MIME_TYPE;
  if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) return 'image/jpeg';
  if (fileName.endsWith('.png')) return 'image/png';
  if (fileName.endsWith('.webp')) return 'image/webp';
  return mimeType;
};

export const resolveWritingUploadFileKind = (
  input: Pick<WritingUploadFileLike, 'name' | 'type'> | string,
): WritingUploadFileKind => {
  const mimeType = typeof input === 'string'
    ? input.trim().toLowerCase()
    : resolveWritingUploadMimeType(input);

  if (mimeType === WRITING_UPLOAD_PDF_MIME_TYPE) return 'pdf';
  if (WRITING_UPLOAD_IMAGE_MIME_TYPE_SET.has(mimeType)) return 'image';
  return 'unsupported';
};

export const resolveWritingUploadFile = (file: WritingUploadFileLike): ResolvedWritingUploadFile => {
  const resolvedMimeType = resolveWritingUploadMimeType(file);
  return {
    ...file,
    resolvedMimeType,
    kind: resolveWritingUploadFileKind(resolvedMimeType),
  };
};

export const formatWritingUploadBytes = (bytes: number): string => {
  if (bytes >= 1024 * 1024) {
    return `${Math.round((bytes / (1024 * 1024)) * 10) / 10}MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))}KB`;
};

export const validateWritingUploadPolicy = (
  files: WritingUploadFileLike[],
): WritingUploadPolicyValidation => {
  if (files.length === 0) {
    return { valid: false, message: '答案ファイルを選択してください。' };
  }

  const invalidSize = files.find((file) => file.size <= 0);
  if (invalidSize) {
    return { valid: false, message: `${invalidSize.name || '選択ファイル'} のサイズが空です。撮影または書き出しを確認してください。` };
  }

  const tooLarge = files.find((file) => file.size > WRITING_UPLOAD_MAX_BYTES);
  if (tooLarge) {
    return {
      valid: false,
      message: `${tooLarge.name || '選択ファイル'} が ${formatWritingUploadBytes(WRITING_UPLOAD_MAX_BYTES)} を超えています。`,
    };
  }

  const resolvedFiles = files.map(resolveWritingUploadFile);
  const kinds = resolvedFiles.map((file) => file.kind);
  if (kinds.includes('unsupported')) {
    return { valid: false, message: '提出できる形式は PDF、JPEG、PNG、WebP です。' };
  }

  const pdfCount = kinds.filter((kind) => kind === 'pdf').length;
  const imageCount = kinds.filter((kind) => kind === 'image').length;

  if (pdfCount > 0 && imageCount > 0) {
    return { valid: false, message: 'PDF と画像は混在できません。PDF 1件、または画像だけを選んでください。' };
  }

  if (pdfCount > 1) {
    return { valid: false, message: 'PDF は1ファイルのみ提出できます。' };
  }

  if (imageCount > WRITING_UPLOAD_MAX_IMAGE_FILES) {
    return { valid: false, message: `画像は最大${WRITING_UPLOAD_MAX_IMAGE_FILES}枚まで提出できます。` };
  }

  return {
    valid: true,
    kind: pdfCount === 1 ? 'pdf' : 'images',
    resolvedFiles,
    message: pdfCount === 1
      ? 'PDF 1件を提出できます。'
      : `画像 ${imageCount}枚を提出できます。`,
  };
};
