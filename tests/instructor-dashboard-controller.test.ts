import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterventionKind, StudentRiskLevel, UserRole, type StudentSummary, type UserProfile } from '../types';

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

  it('builds and resets a template locally without requesting AI or saving a notification', async () => {
    render().openComposer(students[0]);
    expect(render().messageDraft).toContain('プランを作り');
    render().setInterventionKind(InterventionKind.REVIEW_RESTART);
    render().setCustomInstruction('次の模試までに復習を再開してみましょう。');
    await render().handleGenerateDraft();
    expect(render().messageDraft).toContain('10語だけ復習');
    expect(render().messageDraft).toContain('\n次の模試までに復習を再開してみましょう。');
    expect(render().usedAi).toBe(false);
    expect(render().drafting).toBe(false);
    expect(service.draft).not.toHaveBeenCalled();
    expect(service.send).not.toHaveBeenCalled();
  });

  it('retains manual edits and only uses the new intervention template after an explicit reset', async () => {
    render().openComposer(students[0]);
    const edited = '講師が手入力した通知文を、このまま保存します。';
    render().setMessageDraft(edited);
    render().setInterventionKind(InterventionKind.PRAISE);
    expect(render().messageDraft).toBe(edited);
    await render().handleSendNotification();
    expect(service.send).toHaveBeenCalledWith(
      students[0].uid, edited, expect.any(String), false,
      InterventionKind.PRAISE, expect.any(String),
    );
    expect(service.draft).not.toHaveBeenCalled();
  });

  it('uses the currently selected student and includes the supplemental sentence literally', async () => {
    render().openComposer(students[0]);
    render().closeComposer();
    render().openComposer(students[1]);
    render().setCustomInstruction('この文はそのまま追加してください。');
    await render().handleGenerateDraft();
    expect(render().messageDraft).toContain(students[1].name);
    expect(render().messageDraft).not.toContain(students[0].name);
    expect(render().messageDraft.endsWith('\nこの文はそのまま追加してください。')).toBe(true);
    expect(service.draft).not.toHaveBeenCalled();
    expect(service.send).not.toHaveBeenCalled();
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
