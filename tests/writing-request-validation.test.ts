import { describe, expect, it } from 'vitest';

import {
  parseCreateWritingUploadUrlRequest,
  parseFinalizeWritingSubmissionRequest,
} from '../functions/_shared/writing-actions/validators';

describe('writing request validation', () => {
  it('accepts bounded upload metadata with an optional checksum', () => {
    expect(parseCreateWritingUploadUrlRequest({
      assignmentId: 'assignment-1',
      fileName: 'draft-1.jpg',
      mimeType: 'image/jpeg',
      byteSize: 1024,
      sha256Base64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      assetOrder: 1,
      attemptNo: 2,
    })).toMatchObject({
      assignmentId: 'assignment-1',
      fileName: 'draft-1.jpg',
      mimeType: 'image/jpeg',
      byteSize: 1024,
      sha256Base64: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
      assetOrder: 1,
      attemptNo: 2,
    });
  });

  it('normalizes generic browser mime types from the requested file name', () => {
    expect(parseCreateWritingUploadUrlRequest({
      assignmentId: 'assignment-1',
      fileName: 'draft-1.pdf',
      mimeType: 'application/octet-stream',
      byteSize: 1024,
      assetOrder: 1,
    })).toMatchObject({
      fileName: 'draft-1.pdf',
      mimeType: 'application/pdf',
    });

    expect(parseCreateWritingUploadUrlRequest({
      assignmentId: 'assignment-1',
      fileName: 'draft-1.webp',
      mimeType: 'binary/octet-stream',
      byteSize: 1024,
      assetOrder: 1,
    })).toMatchObject({
      fileName: 'draft-1.webp',
      mimeType: 'image/webp',
    });
  });

  it('rejects zero-byte upload reservations', () => {
    expect(() => parseCreateWritingUploadUrlRequest({
      assignmentId: 'assignment-1',
      fileName: 'draft-1.jpg',
      mimeType: 'image/jpeg',
      byteSize: 0,
      assetOrder: 1,
    })).toThrowError('byteSize は 1 以上である必要があります。');
  });

  it('rejects malformed upload checksums', () => {
    expect(() => parseCreateWritingUploadUrlRequest({
      assignmentId: 'assignment-1',
      fileName: 'draft-1.jpg',
      mimeType: 'image/jpeg',
      byteSize: 1024,
      sha256Base64: 'not-base64',
      assetOrder: 1,
    })).toThrowError('sha256Base64 は SHA-256 の base64 文字列である必要があります。');
  });

  it('rejects finalize requests with an out-of-range attempt number', () => {
    expect(() => parseFinalizeWritingSubmissionRequest({
      assignmentId: 'assignment-1',
      source: 'STUDENT_MOBILE',
      assetIds: ['asset-1'],
      attemptNo: 0,
    })).toThrowError('attemptNo は 1 以上である必要があります。');
  });
});
