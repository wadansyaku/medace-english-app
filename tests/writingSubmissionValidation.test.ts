import { describe, expect, it } from 'vitest';

import {
  WRITING_UPLOAD_MAX_BYTES,
  resolveWritingUploadMimeType,
  validateWritingSubmissionFiles,
} from '../utils/writingSubmissionValidation';

const makeFile = (overrides: Partial<{ name: string; type: string; size: number }> = {}) => ({
  name: overrides.name || 'answer.png',
  type: overrides.type ?? 'image/png',
  size: overrides.size ?? 1024,
});

describe('writing submission file validation', () => {
  it('accepts one pdf or up to four supported images', () => {
    expect(validateWritingSubmissionFiles([
      makeFile({ name: 'answer.pdf', type: 'application/pdf' }),
    ])).toMatchObject({ valid: true });

    expect(validateWritingSubmissionFiles([
      makeFile({ name: 'a.png', type: 'image/png' }),
      makeFile({ name: 'b.jpg', type: 'image/jpeg' }),
      makeFile({ name: 'c.webp', type: 'image/webp' }),
      makeFile({ name: 'd.png', type: 'image/png' }),
    ])).toMatchObject({ valid: true });
  });

  it('infers a server-compatible mime type when the browser leaves it blank', () => {
    expect(resolveWritingUploadMimeType(makeFile({ name: 'answer.jpeg', type: '' }))).toBe('image/jpeg');
    expect(resolveWritingUploadMimeType(makeFile({ name: 'answer.pdf', type: '' }))).toBe('application/pdf');
    expect(validateWritingSubmissionFiles([
      makeFile({ name: 'answer.webp', type: '' }),
    ])).toMatchObject({ valid: true });
  });

  it('falls back from generic browser mime types by extension only', () => {
    expect(resolveWritingUploadMimeType(makeFile({ name: 'answer.pdf', type: 'application/octet-stream' }))).toBe('application/pdf');
    expect(resolveWritingUploadMimeType(makeFile({ name: 'answer.jpg', type: 'binary/octet-stream' }))).toBe('image/jpeg');
    expect(resolveWritingUploadMimeType(makeFile({ name: 'answer.pdf', type: 'application/msword' }))).toBe('application/msword');

    expect(validateWritingSubmissionFiles([
      makeFile({ name: 'answer.png', type: 'application/x-octet-stream' }),
    ])).toMatchObject({ valid: true });
  });

  it('rejects empty, mixed, unsupported, oversized, and too-many-image submissions before upload', () => {
    expect(validateWritingSubmissionFiles([])).toMatchObject({
      valid: false,
      message: '答案ファイルを選択してください。',
    });

    expect(validateWritingSubmissionFiles([
      makeFile({ name: 'answer.pdf', type: 'application/pdf' }),
      makeFile({ name: 'answer.png', type: 'image/png' }),
    ])).toMatchObject({
      valid: false,
      message: 'PDF と画像は混在できません。PDF 1件、または画像だけを選んでください。',
    });

    expect(validateWritingSubmissionFiles([
      makeFile({ name: 'answer.png', type: 'image/png' }),
      makeFile({ name: 'answer.pdf', type: 'application/pdf' }),
    ])).toMatchObject({
      valid: false,
      message: 'PDF と画像は混在できません。PDF 1件、または画像だけを選んでください。',
    });

    expect(validateWritingSubmissionFiles([
      makeFile({ name: 'answer-1.pdf', type: 'application/pdf' }),
      makeFile({ name: 'answer-2.pdf', type: 'application/pdf' }),
    ])).toMatchObject({
      valid: false,
      message: 'PDF は1ファイルのみ提出できます。',
    });

    expect(validateWritingSubmissionFiles([
      makeFile({ name: 'answer.heic', type: 'image/heic' }),
    ])).toMatchObject({
      valid: false,
      message: '提出できる形式は PDF、JPEG、PNG、WebP です。',
    });

    expect(validateWritingSubmissionFiles([
      makeFile({ size: WRITING_UPLOAD_MAX_BYTES + 1 }),
    ])).toMatchObject({
      valid: false,
    });

    expect(validateWritingSubmissionFiles([
      makeFile({ name: '1.png' }),
      makeFile({ name: '2.png' }),
      makeFile({ name: '3.png' }),
      makeFile({ name: '4.png' }),
      makeFile({ name: '5.png' }),
    ])).toMatchObject({
      valid: false,
      message: '画像は最大4枚まで提出できます。',
    });
  });
});
