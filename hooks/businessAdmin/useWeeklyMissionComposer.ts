import { useCallback, useEffect, useMemo, useState } from 'react';

import { storage } from '../../services/storage';
import { buildWeaknessMissionRationale, getWeaknessMissionDefaults } from '../../shared/weakness';
import {
  LearningTrack,
  type BookMetadata,
  type StudentSummary,
  type WeeklyMissionBoard,
  type WritingAssignment,
} from '../../types';

interface NoticeState {
  tone: 'success' | 'error';
  message: string;
}

interface UseWeeklyMissionComposerParams {
  books: BookMetadata[];
  missionBoard: WeeklyMissionBoard | null;
  refresh: () => Promise<void>;
  selectedAssignmentStudent: StudentSummary | null;
  setNotice: (notice: NoticeState | null) => void;
  writingAssignments: WritingAssignment[];
}

export const useWeeklyMissionComposer = ({
  books,
  missionBoard,
  refresh,
  selectedAssignmentStudent,
  setNotice,
  writingAssignments,
}: UseWeeklyMissionComposerParams) => {
  const [missionSavingUid, setMissionSavingUid] = useState<string | null>(null);
  const [missionTrack, setMissionTrack] = useState<LearningTrack>(LearningTrack.SCHOOL_TERM);
  const [missionBookId, setMissionBookId] = useState('');
  const [missionNewWordsTarget, setMissionNewWordsTarget] = useState('20');
  const [missionReviewWordsTarget, setMissionReviewWordsTarget] = useState('12');
  const [missionQuizTargetCount, setMissionQuizTargetCount] = useState('1');
  const [missionWritingAssignmentId, setMissionWritingAssignmentId] = useState('');
  const [missionDueDate, setMissionDueDate] = useState('');

  const selectedStudentMission = useMemo(() => (
    missionBoard?.assignments.find((assignment) => assignment.studentUid === selectedAssignmentStudent?.uid) || null
  ), [missionBoard?.assignments, selectedAssignmentStudent?.uid]);

  useEffect(() => {
    if (!selectedAssignmentStudent) return;
    const defaultTrack = selectedStudentMission?.mission.learningTrack
      || selectedAssignmentStudent.primaryMissionTrack
      || LearningTrack.SCHOOL_TERM;
    const adjustedDefaults = getWeaknessMissionDefaults({
      topWeakness: selectedAssignmentStudent.topWeaknesses?.[0],
      track: defaultTrack,
      current: {
        newWordsTarget: defaultTrack === LearningTrack.COMMON_TEST ? 30 : 20,
        reviewWordsTarget: defaultTrack === LearningTrack.COMMON_TEST ? 18 : 12,
        quizTargetCount: 1,
      },
    });
    setMissionTrack(defaultTrack);
    setMissionBookId(selectedStudentMission?.mission.bookId || '');
    setMissionNewWordsTarget(String(adjustedDefaults.newWordsTarget));
    setMissionReviewWordsTarget(String(adjustedDefaults.reviewWordsTarget));
    setMissionQuizTargetCount(String(adjustedDefaults.quizTargetCount));
    setMissionWritingAssignmentId(selectedStudentMission?.mission.writingAssignmentId || '');
    setMissionDueDate(
      selectedStudentMission?.mission.dueAt
        ? new Date(selectedStudentMission.mission.dueAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' })
        : new Date(Date.now() + 6 * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }),
    );
  }, [
    selectedAssignmentStudent,
    selectedStudentMission?.mission.bookId,
    selectedStudentMission?.mission.dueAt,
    selectedStudentMission?.mission.learningTrack,
    selectedStudentMission?.mission.writingAssignmentId,
    writingAssignments.length,
  ]);

  const handleIssueMission = useCallback(async () => {
    if (!selectedAssignmentStudent) return;

    setMissionSavingUid(selectedAssignmentStudent.uid);
    setNotice(null);

    try {
      const selectedBook = books.find((book) => book.id === missionBookId);
      const mission = await storage.createWeeklyMission({
        learningTrack: missionTrack,
        title: `${selectedAssignmentStudent.name}向け 今週ミッション`,
        rationale: buildWeaknessMissionRationale({
          studentName: selectedAssignmentStudent.name,
          topWeakness: selectedAssignmentStudent.topWeaknesses?.[0],
        }),
        bookId: selectedBook?.id,
        bookTitle: selectedBook?.title,
        newWordsTarget: Math.max(0, Number(missionNewWordsTarget || 0)),
        reviewWordsTarget: Math.max(0, Number(missionReviewWordsTarget || 0)),
        quizTargetCount: Math.max(0, Number(missionQuizTargetCount || 0)),
        writingAssignmentId: missionWritingAssignmentId || undefined,
        dueAt: missionDueDate ? Date.parse(`${missionDueDate}T23:59:59+09:00`) : undefined,
      });
      await storage.assignWeeklyMission(mission.id, selectedAssignmentStudent.uid);
      setNotice({
        tone: 'success',
        message: `${selectedAssignmentStudent.name}さんへ今週ミッションを配布しました。`,
      });
      await refresh();
    } catch (missionError) {
      console.error(missionError);
      setNotice({
        tone: 'error',
        message: (missionError as Error).message || '週次ミッションの配布に失敗しました。',
      });
    } finally {
      setMissionSavingUid(null);
    }
  }, [
    books,
    missionBookId,
    missionDueDate,
    missionNewWordsTarget,
    missionQuizTargetCount,
    missionReviewWordsTarget,
    missionTrack,
    missionWritingAssignmentId,
    refresh,
    selectedAssignmentStudent,
    setNotice,
  ]);

  return {
    missionBookId,
    missionDueDate,
    missionNewWordsTarget,
    missionQuizTargetCount,
    missionReviewWordsTarget,
    missionSavingUid,
    missionTrack,
    missionWritingAssignmentId,
    selectedStudentMission,
    setMissionBookId,
    setMissionDueDate,
    setMissionNewWordsTarget,
    setMissionQuizTargetCount,
    setMissionReviewWordsTarget,
    setMissionTrack,
    setMissionWritingAssignmentId,
    handleIssueMission,
  };
};
