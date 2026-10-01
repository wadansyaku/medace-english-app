import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StudentRiskLevel, UserRole, type StudentSummary, type UserProfile } from '../types';

const harness = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0 }));
vi.mock('react', () => ({
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = initial;
    return [
      harness.slots[index],
      (next: unknown) => {
        harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.slots)) harness.slots[index] = { current: initial };
    return harness.slots[index];
  },
  useMemo: (factory: () => unknown) => factory(),
  useCallback: (callback: unknown) => callback,
  useEffect: () => {},
}));
const service = vi.hoisted(() => ({ send: vi.fn(), draft: vi.fn() }));
vi.mock('../services/workspace', () => ({
  workspaceService: { sendInstructorNotification: service.send },
}));
vi.mock('../services/gemini', () => ({ generateInstructorFollowUp: service.draft }));
import { useInstructorDashboardController } from '../hooks/useInstructorDashboardController';

const user: UserProfile = {
  uid: 'synthetic-instructor',
  displayName: 'デモ講師',
  email: 'instructor@example.invalid',
  role: UserRole.INSTRUCTOR,
};
const students: StudentSummary[] = [
  {
    uid: 'demo-assigned',
    name: 'デモ生徒A',
    email: 'a@example.invalid',
    totalLearned: 0,
    totalAttempts: 0,
    lastActive: 0,
    riskLevel: StudentRiskLevel.DANGER,
    assignedInstructorUid: user.uid,
  },
  {
    uid: 'demo-other',
    name: 'デモ生徒B',
    email: 'b@example.invalid',
    totalLearned: 1,
    totalAttempts: 1,
    lastActive: 0,
    riskLevel: StudentRiskLevel.WARNING,
    assignedInstructorUid: 'another-instructor',
  },
];
const refresh = vi.fn<() => Promise<void>>().mockResolvedValue();
const render = () => {
  harness.cursor = 0;
  return useInstructorDashboardController({ students, user, refresh });
};
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  vi.clearAllMocks();
  refresh.mockResolvedValue();
  service.send.mockResolvedValue(undefined);
});

describe('instructor workspace operations', () => {
  it('starts with assigned students, and can explicitly include other server-visible students', () => {
    const controller = render();
    expect(controller.filter).toBe('ALL');
    expect(controller.filteredStudents.map((student) => student.uid)).toEqual(['demo-assigned']);
    controller.setStudentScope('VISIBLE');
    expect(render().filteredStudents).toHaveLength(2);
  });

  it('prevents repeated clicks and keeps the composer open while saving', async () => {
    const save = deferred<void>();
    service.send.mockReturnValue(save.promise);
    render().openComposer(students[0]);
    const controller = render();
    const first = controller.handleSendNotification();
    const duplicate = controller.handleSendNotification();
    controller.closeComposer();
    expect(render().selectedStudent?.uid).toBe('demo-assigned');
    expect(service.send).toHaveBeenCalledTimes(1);
    save.resolve();
    await Promise.all([first, duplicate]);
    expect(render().selectedStudent).toBeNull();
    expect(render().noticeKind).toBe('success');
    expect(render().notice).toContain('アプリ内通知を保存');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('ignores an AI draft returned after another student was opened', async () => {
    const pending = deferred<{ message: string }>();
    service.draft.mockReturnValue(pending.promise);
    render().openComposer(students[0]);
    const controller = render();
    const draftRequest = controller.handleGenerateDraft();
    controller.closeComposer();
    render().openComposer(students[1]);
    const currentDraft = render().messageDraft;
    pending.resolve({ message: '旧生徒の遅延下書き' });
    await draftRequest;
    expect(render().selectedStudent?.uid).toBe('demo-other');
    expect(render().messageDraft).toBe(currentDraft);
    expect(render().usedAi).toBe(false);
  });

  it('preserves manual edits made while AI is pending and can save them immediately', async () => {
    const pending = deferred<{ message: string }>();
    service.draft.mockReturnValue(pending.promise);
    render().openComposer(students[0]);
    const draftRequest = render().handleGenerateDraft();
    expect(render().drafting).toBe(true);

    const edited = '講師が手入力した通知文を、このまま保存します。';
    render().setMessageDraft(edited);
    expect(render().messageDraft).toBe(edited);
    expect(render().drafting).toBe(false);

    pending.resolve({ message: '遅れて到着したAIの通知文' });
    await draftRequest;
    expect(render().messageDraft).toBe(edited);
    expect(render().usedAi).toBe(false);

    await render().handleSendNotification();
    expect(service.send).toHaveBeenCalledWith(
      students[0].uid,
      edited,
      expect.any(String),
      false,
      expect.any(String),
      expect.any(String),
    );
  });

  it('does not let an invalidated AI result clear a newer generation state', async () => {
    const old = deferred<{ message: string }>();
    const current = deferred<{ message: string }>();
    service.draft.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise);
    render().openComposer(students[0]);
    const oldRequest = render().handleGenerateDraft();
    render().setMessageDraft('手編集');
    const currentRequest = render().handleGenerateDraft();
    old.resolve({ message: '古いAI結果' });
    await oldRequest;
    expect(render().messageDraft).toBe('手編集');
    expect(render().drafting).toBe(true);
    current.resolve({ message: '明示的に再生成した新しいAI結果' });
    await currentRequest;
    expect(render().messageDraft).toBe('明示的に再生成した新しいAI結果');
    expect(render().drafting).toBe(false);
  });

  it('preserves an unsaved draft and reports failure with an error tone', async () => {
    service.send.mockRejectedValue(new Error('offline'));
    render().openComposer(students[0]);
    const draft = render().messageDraft;
    await render().handleSendNotification();
    expect(render().selectedStudent?.uid).toBe('demo-assigned');
    expect(render().messageDraft).toBe(draft);
    expect(render().noticeKind).toBe('error');
    expect(render().notice).toContain('保存を確認できません');
    expect(refresh).not.toHaveBeenCalled();
  });

  it('does not claim an unlearned student stopped learning for zero days', () => {
    render().openComposer(students[0]);
    expect(render().messageDraft).not.toContain('0日');
  });

  it('keeps a confirmed save distinct from a subsequent dashboard refresh failure', async () => {
    refresh.mockRejectedValueOnce(new Error('dashboard offline'));
    render().openComposer(students[0]);
    await render().handleSendNotification();
    expect(render().selectedStudent).toBeNull();
    expect(render().noticeKind).toBe('success');
    expect(render().notice).toContain('通知は保存済み');
    expect(render().notice).not.toContain('保存を確認できません');
  });
});
