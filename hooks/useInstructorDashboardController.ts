import { useCallback, useEffect, useMemo, useState } from 'react';

import { generateInstructorFollowUp } from '../services/gemini';
import { storage } from '../services/storage';
import {
  StudentRiskLevel,
  type StudentSummary,
  type UserProfile,
} from '../types';
import {
  filterStudentsForInstructorView,
  resolveFocusedStudentUid,
  selectFocusedStudent,
  sortStudentsByPriority,
  type InstructorStudentFilter,
} from '../utils/instructorDashboard';

const buildFallbackMessage = (student: StudentSummary, instructorName: string): string => {
  const days = student.lastActive > 0 ? Math.floor((Date.now() - student.lastActive) / (1000 * 60 * 60 * 24)) : 0;
  if (student.riskLevel === StudentRiskLevel.DANGER) {
    return `${instructorName}より: ${student.name}さん、${days}日ほど学習が空いているので、今日はまず10語だけ復習して流れを戻しましょう。短時間で大丈夫です。`;
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
  const [filter, setFilter] = useState<InstructorStudentFilter>('ALL');
  const [query, setQuery] = useState('');
  const [focusedStudentUid, setFocusedStudentUid] = useState<string | null>(null);
  const [composerStudentUid, setComposerStudentUid] = useState<string | null>(null);
  const [messageDraft, setMessageDraft] = useState('');
  const [customInstruction, setCustomInstruction] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [usedAi, setUsedAi] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const sortedStudents = useMemo(() => sortStudentsByPriority(students), [students]);
  const filteredStudents = useMemo(() => (
    filterStudentsForInstructorView(sortedStudents, filter, query)
  ), [filter, query, sortedStudents]);
  const focusedStudent = useMemo(() => (
    selectFocusedStudent(filteredStudents, focusedStudentUid)
  ), [filteredStudents, focusedStudentUid]);
  const selectedStudent = useMemo(() => (
    students.find((student) => student.uid === composerStudentUid) || null
  ), [composerStudentUid, students]);

  useEffect(() => {
    const nextUid = resolveFocusedStudentUid(filteredStudents, focusedStudentUid);
    if (nextUid !== focusedStudentUid) {
      setFocusedStudentUid(nextUid);
    }
  }, [filteredStudents, focusedStudentUid]);

  useEffect(() => {
    if (!composerStudentUid) return;
    if (!students.some((student) => student.uid === composerStudentUid)) {
      setComposerStudentUid(null);
      setMessageDraft('');
      setCustomInstruction('');
      setUsedAi(false);
    }
  }, [composerStudentUid, students]);

  const openComposer = useCallback((student: StudentSummary) => {
    setComposerStudentUid(student.uid);
    setMessageDraft(buildFallbackMessage(student, user.displayName));
    setCustomInstruction('');
    setUsedAi(false);
  }, [user.displayName]);

  const closeComposer = useCallback(() => {
    setComposerStudentUid(null);
    setMessageDraft('');
    setCustomInstruction('');
    setUsedAi(false);
  }, []);

  const handleGenerateDraft = useCallback(async () => {
    if (!selectedStudent) return;

    setDrafting(true);
    try {
      const daysSinceActive = selectedStudent.lastActive > 0
        ? Math.max(0, Math.floor((Date.now() - selectedStudent.lastActive) / (1000 * 60 * 60 * 24)))
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

      if (draft?.message) {
        setMessageDraft(draft.message);
        setUsedAi(true);
      } else {
        setMessageDraft(buildFallbackMessage(selectedStudent, user.displayName));
        setUsedAi(false);
      }
    } catch (draftError) {
      console.error(draftError);
      setNotice((draftError as Error).message || 'AI下書きの生成に失敗しました。');
    } finally {
      setDrafting(false);
    }
  }, [customInstruction, selectedStudent, user.displayName]);

  const handleSendNotification = useCallback(async () => {
    if (!selectedStudent || !messageDraft.trim()) return;

    setSending(true);
    try {
      await storage.sendInstructorNotification(
        selectedStudent.uid,
        messageDraft.trim(),
        getTriggerReason(selectedStudent),
        usedAi,
      );
      setNotice(`${selectedStudent.name}さんへ講師名入りのフォロー通知を保存しました。`);
      closeComposer();
      await refresh();
    } catch (sendError) {
      console.error(sendError);
      setNotice((sendError as Error).message || 'フォロー通知の保存に失敗しました。');
    } finally {
      setSending(false);
    }
  }, [closeComposer, messageDraft, refresh, selectedStudent, usedAi]);

  return {
    filter,
    query,
    focusedStudentUid,
    selectedStudent,
    messageDraft,
    customInstruction,
    drafting,
    sending,
    usedAi,
    notice,
    sortedStudents,
    filteredStudents,
    focusedStudent,
    setFilter,
    setQuery,
    setFocusedStudentUid,
    setMessageDraft,
    setCustomInstruction,
    openComposer,
    closeComposer,
    handleGenerateDraft,
    handleSendNotification,
  };
};

export default useInstructorDashboardController;
