import React, { type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WritingAssignment } from '../types';

const state = vi.hoisted(() => ({ draft: null as any }));
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(), useEffect: () => {}, useRef: () => ({ current: null }),
}));
vi.mock('../hooks/useWritingDraftEditor', () => ({ useWritingDraftEditor: () => state.draft }));
vi.mock('../components/ModalOverlay', () => ({ default: ({ children }: { children: React.ReactNode }) => <section>{children}</section> }));
import WritingTeacherDraftModal from '../components/writing/ops/WritingTeacherDraftModal';

const assignment = { id: 'synthetic-assignment', promptTitle: '合成課題', studentName: '合成生徒', attemptCount: 0 } as WritingAssignment;
const props = { assignment, onClose: vi.fn(), legacyScanner: <div>legacy</div> };
const elements = (tree: unknown): ReactElement<any>[] => Array.isArray(tree) ? tree.flatMap(elements)
  : React.isValidElement(tree) ? [tree, ...elements((tree as ReactElement<any>).props.children)] : [];
const recoveryButton = () => elements(WritingTeacherDraftModal(props)).find(element => element.props['data-testid'] === 'writing-gpt-recheck');
const html = () => renderToStaticMarkup(<WritingTeacherDraftModal {...props} />);
beforeEach(() => {
  state.draft = { capabilities: { state: 'ENABLED', gradingEnabled: false }, loading: false, loaded: true, busy: false,
    error: null, notice: null, saved: { assets: [] }, files: [], manual: 'My saved original.', aiDraft: null,
    canOcr: true, canFeedback: true, hasPendingRequest: true, canResumePendingRequest: false,
    pendingRecoveryAction: 'CHECK_RESULT', pendingOperation: 'WRITING_FEEDBACK', generate: vi.fn().mockResolvedValue(undefined),
    reload: vi.fn(), save: vi.fn(), setFiles: vi.fn(), setManual: vi.fn(), removeAsset: vi.fn() };
});

describe('teacher GPT draft recovery controls', () => {
  it('shows result-only checking while pending and blocks new-generation buttons', () => {
    state.draft.aiDraft = { status: 'PENDING', reason: 'DISPATCHING_INTERNAL_CODE' };
    const rendered = html(); expect(rendered).toContain('結果を再確認'); expect(rendered).toContain('再確認では答案を送信しません');
    expect(rendered).not.toContain('DISPATCHING_INTERNAL_CODE');
    expect(rendered).toMatch(/data-testid="writing-gpt-ocr"[^>]*disabled=""/);
    expect(rendered).toMatch(/data-testid="writing-gpt-feedback"[^>]*disabled=""/);
    recoveryButton()!.props.onClick(); expect(state.draft.generate).toHaveBeenCalledWith('WRITING_FEEDBACK', true);
  });
  it('labels verified same-request resumption as an explicit operation', () => {
    state.draft.pendingRecoveryAction = 'RESEND_SAME_REQUEST'; state.draft.canResumePendingRequest = true;
    const button = recoveryButton()!; expect(button.props.children).toBe('同じリクエストを再開'); expect(button.props.disabled).toBe(false);
    expect(html()).toContain('保存した答案の処理を再開'); button.props.onClick();
    expect(state.draft.generate).toHaveBeenCalledWith('WRITING_FEEDBACK', true);
  });
  it.each(['busy', 'loading'])('disables recovery while %s and keeps saved input visible', field => {
    state.draft[field] = true; expect(recoveryButton()!.props.disabled).toBe(true); expect(html()).toContain('My saved original.');
  });
  it('does not allow a resume when edited input or capability prevents generation', () => {
    state.draft.pendingRecoveryAction = 'RESEND_SAME_REQUEST'; state.draft.canResumePendingRequest = false;
    expect(recoveryButton()!.props.disabled).toBe(true); expect(html()).toContain('現在の入力と利用設定の確認が必要');
  });
  it.each([
    ['RESULT_UNAVAILABLE', '同じ答案を再送しません'],
    ['LEGACY_RESULT_UNAVAILABLE', '同じ答案を再送しません'],
    ['RESERVATION_MONTH_EXPIRED', '月が変わっても自動で再送しません'],
    ['INPUT_CHANGED', '下書きを再取得して確認'],
    ['DATA_APPROVAL_REQUIRED', '現在利用できません'],
    ['BUDGET_DENIED', '利用枠を確認できない'],
    ['UNKNOWN_INTERNAL_CODE', '同じ答案を再送しません'],
  ])('maps terminal reason %s to a safe instruction while preserving the saved answer', (reason, instruction) => {
    state.draft.hasPendingRequest = false; state.draft.aiDraft = { status: 'UNASSESSED', reason };
    const rendered = html(); expect(rendered).not.toContain(reason); expect(rendered).toContain(instruction);
    expect(rendered).toContain('保存した答案'); expect(rendered).toContain('My saved original.'); expect(recoveryButton()).toBeUndefined();
    expect(state.draft.generate).not.toHaveBeenCalled(); expect(state.draft.save).not.toHaveBeenCalled();
  });
  it('shows a READY result as a review draft without silently changing saved input', () => {
    state.draft.hasPendingRequest = false;
    state.draft.aiDraft = { status: 'READY', result: { operation: 'WRITING_FEEDBACK', strengths: ['A strength.'],
      improvementPoints: [], correctedDraft: 'A suggested edit.', sentenceCorrections: [] } };
    const rendered = html(); expect(rendered).toContain('未評価・人手確認が必要'); expect(rendered).toContain('A suggested edit.');
    expect(rendered).toContain('My saved original.'); expect(recoveryButton()).toBeUndefined();
    expect(state.draft.setManual).not.toHaveBeenCalled(); expect(state.draft.save).not.toHaveBeenCalled();
  });
});
