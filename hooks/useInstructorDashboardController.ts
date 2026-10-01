import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { generateInstructorFollowUp } from '../services/gemini';
import { workspaceService } from '../services/workspace';
import {
  InterventionKind,
  InterventionOutcome,
  RecommendedActionType,
  StudentRiskLevel,
  type StudentSummary,
  type UserProfile,
} from '../types';
import { resolveRecommendedActionType } from '../shared/retention';
import { getDefaultInterventionKindFromWeakness } from '../shared/weakness';
import {
  filterStudentsForInstructorView,
  resolveFocusedStudentUid,
  selectFocusedStudent,
  sortStudentsByPriority,
  type InstructorStudentFilter,
} from '../utils/instructorDashboard';

const buildFallbackMessage = (student: StudentSummary, instructorName: string): string => {
  const days =
    student.lastActive > 0
      ? Math.floor((Date.now() - student.lastActive) / (1000 * 60 * 60 * 24))
      : 0;
  if (student.riskLevel === StudentRiskLevel.DANGER) {
    const opening = student.lastActive > 0 ? `${days}日ほど学習が空いているので、` : '';
    return `${instructorName}より: ${student.name}さん、${opening}今日はまず10語だけ復習して流れを戻しましょう。短時間で大丈夫です。`;
  }
  if (student.riskLevel === StudentRiskLevel.WARNING) {
    return `${instructorName}より: ${student.name}さん、このまま少しずつ続ければ安定します。今日は前回の復習を15分だけ進めてみましょう。`;
  }
  return `${instructorName}より: ${student.name}さん、良いペースです。次回も同じリズムで続けて、定着を一段上げていきましょう。`;
};

const getTriggerReason = (student: StudentSummary): string => {
  if (student.riskLevel === StudentRiskLevel.DANGER) return '離脱リスクフォロー';
  if (student.riskLevel === StudentRiskLevel.WARNING) return '学習再開フォロー';
  return '継続称賛フォロー';
};

const getDefaultInterventionKind = (student: StudentSummary): InterventionKind => {
  const weaknessDriven = getDefaultInterventionKindFromWeakness(student.topWeaknesses?.[0]);
  if (weaknessDriven) return weaknessDriven;
  if (
    student.latestInterventionOutcome === InterventionOutcome.REACTIVATED ||
    student.riskLevel === StudentRiskLevel.SAFE
  ) {
    return InterventionKind.PRAISE;
  }
  if (
    !student.hasLearningPlan ||
    student.latestRecommendedActionType === RecommendedActionType.OPEN_PLAN
  ) {
    return InterventionKind.PLAN_NUDGE;
  }
  return InterventionKind.REVIEW_RESTART;
};

interface UseInstructorDashboardControllerParams {
  students: StudentSummary[];
  user: UserProfile;
  refresh: () => Promise<void>;
}

export const useInstructorDashboardController = ({
  students,
  user,
  refresh,
}: UseInstructorDashboardControllerParams) => {
  const [filter, setFilter] = useState<InstructorStudentFilter | 'ALL'>('ALL');
  const [studentScope, setStudentScope] = useState<'ASSIGNED' | 'VISIBLE'>('ASSIGNED');
  const [query, setQuery] = useState('');
  const [focusedStudentUid, setFocusedStudentUid] = useState<string | null>(null);
  const [composerStudentUid, setComposerStudentUid] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [interventionKind, setInterventionKind] = useState<InterventionKind>(
    InterventionKind.REVIEW_RESTART,
  );
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [usedAi, setUsedAi] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [noticeKind, setNoticeKind] = useState<'success' | 'error'>('success');
  const sendingLock = useRef(false);
  const draftingLock = useRef(false);
  const draftVersion = useRef(0);
  const sendVersion = useRef(0);
  const previousAccount = useRef(user.uid);
  const activeAccount = useRef(user.uid);
  activeAccount.current = user.uid;

  useEffect(() => {
    activeAccount.current = user.uid;
    return () => {
      activeAccount.current = '';
      draftVersion.current += 1;
      sendVersion.current += 1;
      draftingLock.current = false;
      sendingLock.current = false;
    };
  }, [user.uid]);

  const assignedStudents = useMemo(
    () => students.filter((student) => student.assignedInstructorUid === user.uid),
    [students, user.uid],
  );
  const sortedStudents = useMemo(
    () => sortStudentsByPriority(studentScope === 'ASSIGNED' ? assignedStudents : students),
    [assignedStudents, studentScope, students],
  );
  const filteredStudents = useMemo(
    () =>
      filter === 'ALL'
        ? sortedStudents.filter((student) =>
            `${student.name} ${student.email} ${student.cohortName || ''}`
              .toLocaleLowerCase()
              .includes(query.trim().toLocaleLowerCase()),
          )
        : filterStudentsForInstructorView(sortedStudents, filter, query),
    [filter, query, sortedStudents],
  );
  const focusedStudent = useMemo(
    () => selectFocusedStudent(filteredStudents, focusedStudentUid),
    [filteredStudents, focusedStudentUid],
  );
  const selectedStudent = useMemo(
    () => students.find((student) => student.uid === composerStudentUid) || null,
    [composerStudentUid, students],
  );

  useEffect(() => {
    if (previousAccount.current === user.uid) return;
    previousAccount.current = user.uid;
    draftVersion.current += 1;
    sendVersion.current += 1;
    draftingLock.current = false;
    sendingLock.current = false;
    setDrafting(false);
    setSending(false);
    setComposerStudentUid(null);
    setFocusedStudentUid(null);
    setMessageDraft('');
    setCustomInstruction('');
    setUsedAi(false);
    setNotice(null);
    setQuery('');
    setFilter('ALL');
    setStudentScope('ASSIGNED');
  }, [user.uid]);

  useEffect(() => {
    const nextUid = resolveFocusedStudentUid(filteredStudents, focusedStudentUid);
    if (nextUid !== focusedStudentUid) {
      setFocusedStudentUid(nextUid);
    }
  }, [filteredStudents, focusedStudentUid]);

  useEffect(() => {
    if (!composerStudentUid) return;
    if (!students.some((student) => student.uid === composerStudentUid)) {
      draftVersion.current += 1;
      draftingLock.current = false;
      setDrafting(false);
      setComposerStudentUid(null);
      setMessageDraft('');
      setCustomInstruction('');
      setUsedAi(false);
    }
  }, [composerStudentUid, students]);

  const openComposer = useCallback(
    (student: StudentSummary) => {
      if (sendingLock.current) return;
      draftVersion.current += 1;
      draftingLock.current = false;
      setDrafting(false);
      setNotice(null);
      setComposerStudentUid(student.uid);
      setMessageDraft(buildFallbackMessage(student, user.displayName));
      setCustomInstruction('');
      setInterventionKind(getDefaultInterventionKind(student));
      setUsedAi(false);
    },
    [user.displayName],
  );

  const closeComposer = useCallback(() => {
    if (sendingLock.current) return;
    draftVersion.current += 1;
    draftingLock.current = false;
    setDrafting(false);
    setComposerStudentUid(null);
    setMessageDraft('');
    setCustomInstruction('');
    setInterventionKind(InterventionKind.REVIEW_RESTART);
    setUsedAi(false);
  }, []);

  const editMessageDraft = useCallback((value: string) => {
    // Manual input is newer than any pending AI result. Unlock immediately so
    // the instructor can save the edited message without waiting for that result.
    draftVersion.current += 1;
    draftingLock.current = false;
    setDrafting(false);
    setMessageDraft(value);
  }, []);

  const handleGenerateDraft = useCallback(async () => {
    if (!selectedStudent || draftingLock.current || sendingLock.current) return;

    draftingLock.current = true;
    const version = ++draftVersion.current;
    const account = user.uid;
    setNotice(null);
    setDrafting(true);
    try {
      const daysSinceActive =
        selectedStudent.lastActive > 0
          ? Math.max(
              0,
              Math.floor((Date.now() - selectedStudent.lastActive) / (1000 * 60 * 60 * 24)),
            )
          : 0;

      const draft = await generateInstructorFollowUp({
        instructorName: user.displayName,
        studentName: selectedStudent.name,
        riskLevel: selectedStudent.riskLevel,
        daysSinceActive,
        totalLearned: selectedStudent.totalLearned,
        currentLevel: undefined,
        customInstruction,
      });

      if (version !== draftVersion.current || account !== activeAccount.current) return;

      if (draft?.message) {
        setMessageDraft(draft.message);
        setUsedAi(true);
      } else {
        setMessageDraft(buildFallbackMessage(selectedStudent, user.displayName));
        setUsedAi(false);
      }
    } catch (draftError) {
      if (version !== draftVersion.current || account !== activeAccount.current) return;
      setNoticeKind('error');
      setNotice('下書きを作成できませんでした。現在の通知文を確認して、そのまま編集できます。');
    } finally {
      if (version === draftVersion.current) {
        draftingLock.current = false;
        setDrafting(false);
      }
    }
  }, [customInstruction, selectedStudent, user.displayName, user.uid]);

  const handleSendNotification = useCallback(async () => {
    if (!selectedStudent || !messageDraft.trim() || sendingLock.current || draftingLock.current)
      return;

    sendingLock.current = true;
    const version = ++sendVersion.current;
    const account = user.uid;
    setNotice(null);
    setSending(true);
    try {
      await workspaceService.sendInstructorNotification(
        selectedStudent.uid,
        messageDraft.trim(),
        getTriggerReason(selectedStudent),
        usedAi,
        interventionKind,
        resolveRecommendedActionType({
          interventionKind,
          hasLearningPlan: selectedStudent.hasLearningPlan,
        }),
      );
      if (account !== activeAccount.current || version !== sendVersion.current) return;
      setNoticeKind('success');
      setNotice(
        `${selectedStudent.name}さんへのアプリ内通知を保存しました。生徒の閲覧状況はまだ確認できません。`,
      );
      sendingLock.current = false;
      closeComposer();
      try {
        await refresh();
      } catch {
        if (account === activeAccount.current && version === sendVersion.current) {
          setNotice(
            'アプリ内通知は保存済みです。生徒一覧を更新できなかったため、画面上部から再取得してください。',
          );
        }
      }
    } catch (sendError) {
      if (account !== activeAccount.current || version !== sendVersion.current) return;
      setNoticeKind('error');
      setNotice(
        '通知の保存を確認できませんでした。通信状態を確認し、通知履歴を更新してから再度操作してください。',
      );
    } finally {
      if (version === sendVersion.current) {
        sendingLock.current = false;
        setSending(false);
      }
    }
  }, [closeComposer, interventionKind, messageDraft, refresh, selectedStudent, usedAi, user.uid]);

  return {
    filter,
    studentScope,
    assignedStudents,
    query,
    focusedStudentUid,
    selectedStudent,
    messageDraft,
    customInstruction,
    interventionKind,
    drafting,
    sending,
    usedAi,
    notice,
    noticeKind,
    sortedStudents,
    filteredStudents,
    focusedStudent,
    setFilter,
    setStudentScope,
    setQuery,
    setFocusedStudentUid,
    setMessageDraft: editMessageDraft,
    setCustomInstruction,
    setInterventionKind,
    openComposer,
    closeComposer,
    handleGenerateDraft,
    handleSendNotification,
  };
};

export default useInstructorDashboardController;
