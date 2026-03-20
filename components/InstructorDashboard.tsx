import React, { useMemo } from 'react';
import { Bell, FileStack, ScanText } from 'lucide-react';

import {
  InstructorWorkspaceView,
  type UserProfile,
} from '../types';
import { useInstructorDashboardData } from '../hooks/useInstructorDashboardData';
import { useInstructorDashboardController } from '../hooks/useInstructorDashboardController';
import { resolveStorageMode } from '../shared/storageMode';
import B2BStorageModeBanner from './workspace/B2BStorageModeBanner';
import InstructorDashboardModals from './dashboard/InstructorDashboardModals';
import InstructorDashboardSections from './dashboard/InstructorDashboardSections';
import WorkspaceDashboardShell from './dashboard/WorkspaceDashboardShell';

interface InstructorDashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  activeView: InstructorWorkspaceView;
  onChangeView: (view: InstructorWorkspaceView) => void;
}

const VIEW_COPY: Record<InstructorWorkspaceView, { eyebrow: string; title: string; body: string }> = {
  [InstructorWorkspaceView.OVERVIEW]: {
    eyebrow: 'Coach Overview',
    title: '今日の介入対象と運用状況を先に掴む',
    body: '最優先の生徒、今日送る通知、自由英作文の滞留を最初に確認してから各作業へ入ります。',
  },
  [InstructorWorkspaceView.STUDENTS]: {
    eyebrow: 'Student Queue',
    title: '生徒一覧と通知作成を同じ画面で進める',
    body: '優先度の高い生徒から一覧で確認し、右側の詳細で理由と次アクションを見ながら通知文を整えます。',
  },
  [InstructorWorkspaceView.WRITING]: {
    eyebrow: 'Writing Workflow',
    title: '自由英作文の紙提出運用を段階ごとに進める',
    body: '問題作成、印刷、添削キュー、返却履歴を一つのワークスペースで処理します。',
  },
  [InstructorWorkspaceView.WORKSHEETS]: {
    eyebrow: 'Worksheet Ops',
    title: '紙配布の問題作成だけを素早く進める',
    body: '日々の単語配布に必要な PDF 問題作成を独立させ、他の運用情報と分離して扱います。',
  },
  [InstructorWorkspaceView.CATALOG]: {
    eyebrow: 'Catalog Access',
    title: '教材確認は必要なときだけ開く',
    body: '生徒フォローを邪魔しないように、教材閲覧は独立ビューに寄せて必要時だけ使います。',
  },
};

const InstructorDashboard: React.FC<InstructorDashboardProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
}) => {
  const {
    students,
    writingAssignments,
    writingQueue,
    loading,
    error,
    refresh,
  } = useInstructorDashboardData();
  const controller = useInstructorDashboardController({
    students,
    user,
    refresh,
  });
  const storageMode = useMemo(() => resolveStorageMode(import.meta.env.VITE_STORAGE_MODE), []);
  const viewCopy = VIEW_COPY[activeView];
  const isLocalMockData = storageMode.capabilities.organization.usesMockData;

  if (loading) {
    return <div className="p-10 text-center text-slate-500">生徒データを分析中...</div>;
  }

  if (error) {
    return (
      <div className="rounded-[28px] border border-red-200 bg-red-50 px-6 py-5 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <WorkspaceDashboardShell
      testId="instructor-dashboard"
      className="animate-in fade-in"
      notice={controller.notice && (
        <div className="rounded-[24px] border border-emerald-200 bg-emerald-50 px-5 py-4 text-sm font-medium text-emerald-700">
          {controller.notice}
        </div>
      )}
      banner={isLocalMockData ? <B2BStorageModeBanner /> : undefined}
      context={(
        <>
          <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
            グループ講師
          </span>
          {user.organizationName && (
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
              {user.organizationName}
            </span>
          )}
        </>
      )}
      userBadge={(
        <div className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/90">
          {user.displayName}
        </div>
      )}
      eyebrow={viewCopy.eyebrow}
      title={viewCopy.title}
      body={viewCopy.body}
      actions={[
        {
          label: '優先生徒を見る',
          icon: Bell,
          onClick: () => onChangeView(InstructorWorkspaceView.STUDENTS),
          variant: 'primary',
        },
        {
          label: '作文を進める',
          icon: ScanText,
          onClick: () => onChangeView(InstructorWorkspaceView.WRITING),
          variant: 'secondary',
        },
        {
          label: '問題を印刷する',
          icon: FileStack,
          onClick: () => onChangeView(InstructorWorkspaceView.WORKSHEETS),
          variant: 'secondary',
        },
      ]}
    >
      <InstructorDashboardModals userDisplayName={user.displayName} controller={controller} />

      <InstructorDashboardSections
        user={user}
        onSelectBook={onSelectBook}
        activeView={activeView}
        onChangeView={onChangeView}
        controller={controller}
        students={students}
        writingAssignments={writingAssignments}
        writingQueue={writingQueue}
      />
    </WorkspaceDashboardShell>
  );
};

export default InstructorDashboard;
