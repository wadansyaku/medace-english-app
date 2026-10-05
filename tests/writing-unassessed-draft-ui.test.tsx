import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import WritingStudentSubmitSheet from '../components/writing/WritingStudentSubmitSheet';
import type { WritingAssignment } from '../types';
vi.mock('../components/mobile/MobileSheetDialog', () => ({ default: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

const assignment = { id: 'synthetic', promptTitle: 'Synthetic prompt', attemptCount: 0, maxAttempts: 2 } as WritingAssignment;
const props = { submitTarget: assignment, files: [], manualTranscript: 'My manual input.', mobileSubmitStep: 2, submitting: false, draftLoaded: true,
  onClose: vi.fn(), onChangeFiles: vi.fn(), onChangeManualTranscript: vi.fn(), onChangeStep: vi.fn(), onSubmit: vi.fn() };
const action = (html: string) => html.match(/<button[^>]*data-testid="writing-submit-upload"[^>]*>/)?.[0];
describe('student unassessed input form', () => {
  it.each([false, true])('lets a manual-only draft save at mobile=%s while capabilities are unknown', isMobileViewport => {
    const html = renderToStaticMarkup(<WritingStudentSubmitSheet {...props} isMobileViewport={isMobileViewport} />);
    expect(html).toContain('下書きを保存（未評価）'); expect(html).toContain('AIの利用可否は未確認');
    expect(html).not.toContain('答案を提出する'); expect(action(html)).not.toContain('disabled=""');
  });
  it('blocks saving an unknown or restoring draft without discarding typed input', () => {
    const html = renderToStaticMarkup(<WritingStudentSubmitSheet {...props} draftLoaded={false} draftLoadError="復元を確認できません" isMobileViewport={false} />);
    expect(html).toContain('My manual input.'); expect(html).toContain('下書きを再取得する'); expect(action(html)).toContain('disabled=""');
  });
  it('shows saved attachment metadata without fabricating file objects', () => {
    const savedInputDraft = { assignmentId: assignment.id, attemptNo: 1, revision: 1, manualTranscript: '', assetIds: ['image-id'],
      assets: [{ id: 'image-id', fileName: 'original.png', mimeType: 'image/png', byteSize: 20 }], updatedAt: 1, assessmentStatus: 'UNASSESSED' as const };
    const html = renderToStaticMarkup(<WritingStudentSubmitSheet {...props} manualTranscript="" savedInputDraft={savedInputDraft} isMobileViewport={false} />);
    expect(html).toContain('保存済みの添付（再選択不要）'); expect(html).toContain('original.png'); expect(action(html)).not.toContain('disabled=""');
    expect(html).toContain('PDFは保存できますが、GPTによるPDF読取は未有効');
  });
});
