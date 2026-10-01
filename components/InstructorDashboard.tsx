import React, { useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  FileStack,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  ScanText,
  Users,
} from 'lucide-react';

import { InstructorWorkspaceView, type UserProfile } from '../types';
import { useInstructorDashboardData } from '../hooks/useInstructorDashboardData';
import { useInstructorDashboardController } from '../hooks/useInstructorDashboardController';
import { resolveStorageMode } from '../shared/storageMode';
import B2BStorageModeBanner from './workspace/B2BStorageModeBanner';
import InstructorDashboardModals from './dashboard/InstructorDashboardModals';
import InstructorDashboardSections from './dashboard/InstructorDashboardSections';

interface InstructorDashboardProps {
  user: UserProfile;
  onSelectBook: (bookId: string, mode: 'study' | 'quiz') => void;
  activeView: InstructorWorkspaceView;
  onChangeView: (view: InstructorWorkspaceView) => void;
}

const VIEW_COPY: Record<InstructorWorkspaceView, { title: string; body: string }> = {
  [InstructorWorkspaceView.OVERVIEW]: {
    title: '生徒の次の一歩を、一緒に。',
    body: '担当生徒の様子を確かめ、今日の声かけから始めましょう。',
  },
  [InstructorWorkspaceView.STUDENTS]: {
    title: '担当生徒を確認する',
    body: '学習の状況と理由を確かめて、一人ずつフォローできます。',
  },
  [InstructorWorkspaceView.WRITING]: {
    title: '課題を配り、提出へ返す',
    body: '英作文の問題作成・配布・添削・返却を順に進めます。',
  },
  [InstructorWorkspaceView.WORKSHEETS]: {
    title: '今日の小テストを準備する',
    body: '単語帳と範囲を選び、授業で使えるプリントを作成します。',
  },
  [InstructorWorkspaceView.CATALOG]: {
    title: '教材と学習画面を確認する',
    body: '利用できる単語帳を開き、生徒が取り組む内容を確かめます。',
  },
};

const VIEWS = [
  { view: InstructorWorkspaceView.OVERVIEW, label: '今日のフォロー', icon: LayoutDashboard },
  { view: InstructorWorkspaceView.STUDENTS, label: '担当生徒', icon: Users },
  { view: InstructorWorkspaceView.WORKSHEETS, label: '小テスト・印刷', icon: FileStack },
  { view: InstructorWorkspaceView.WRITING, label: '課題・提出・返却', icon: ScanText },
  { view: InstructorWorkspaceView.CATALOG, label: '教材', icon: BookOpen },
];

const InstructorDashboard: React.FC<InstructorDashboardProps> = ({
  user,
  onSelectBook,
  activeView,
  onChangeView,
}) => {
  const data = useInstructorDashboardData(user.uid);
  const controller = useInstructorDashboardController({
    students: data.students,
    user,
    refresh: data.refreshAfterMutation,
  });
  const storageMode = useMemo(() => resolveStorageMode(import.meta.env.VITE_STORAGE_MODE), []);
  const viewCopy = VIEW_COPY[activeView];
  const hasAnySnapshot = data.hasStudentsData || data.hasAssignmentsData || data.hasQueueData;
  const composerContainer = useRef<HTMLDivElement>(null);
  const composerStudentUid = controller.selectedStudent?.uid;
  useEffect(() => {
    if (!composerStudentUid) return;
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    composerContainer.current
      ?.querySelector<HTMLElement>('[data-testid="notification-message-draft"]')
      ?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = previousOverflow;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    };
  }, [composerStudentUid]);

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      controller.closeComposer();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from<HTMLElement>(
      composerContainer.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex="0"]',
      ) || [],
    ).filter((element) => element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !composerContainer.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (
      !event.shiftKey &&
      (active === last || !composerContainer.current?.contains(active))
    ) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div data-testid="instructor-dashboard" className="space-y-6 pb-12">
      {storageMode.capabilities.organization.usesMockData && <B2BStorageModeBanner />}
      <header className="rounded-[28px] border border-medace-100 bg-white px-5 py-6 sm:px-8 sm:py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-medace-800">
            <span className="rounded-full bg-medace-50 px-3 py-1.5">講師ワークスペース</span>
            {user.organizationName && <span>{user.organizationName}</span>}
          </div>
          <button
            type="button"
            onClick={() => void data.refresh()}
            disabled={data.loading}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw
              aria-hidden="true"
              className={`h-4 w-4 ${data.loading ? 'animate-spin' : ''}`}
            />
            {data.loading ? '更新中' : '最新の状況へ更新'}
          </button>
        </div>
        <h2 className="mt-5 text-2xl font-black leading-snug tracking-tight text-medace-900 sm:text-3xl">
          {viewCopy.title}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">{viewCopy.body}</p>
        {data.updatedAt && (
          <p className="mt-3 text-xs text-slate-500">
            最終取得{' '}
            {new Date(data.updatedAt).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
        )}
      </header>

      <nav
        aria-label="講師の作業"
        className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5"
      >
        {VIEWS.map(({ view, label, icon: Icon }) => (
          <button
            key={view}
            type="button"
            onClick={() => onChangeView(view)}
            aria-current={view === activeView ? 'page' : undefined}
            className={`inline-flex min-h-11 flex-shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${view === activeView ? 'bg-medace-50 text-medace-900 ring-1 ring-inset ring-medace-200' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Icon aria-hidden="true" className="h-4 w-4" />
            {label}
          </button>
        ))}
      </nav>

      {controller.notice && (
        <div
          role={controller.noticeKind === 'error' ? 'alert' : 'status'}
          className={`${controller.selectedStudent && controller.noticeKind === 'error' ? 'fixed bottom-5 left-4 right-4 z-[60] mx-auto max-w-xl shadow-lg' : ''} rounded-2xl border px-5 py-4 text-sm leading-6 ${controller.noticeKind === 'error' ? 'border-red-200 bg-red-50 text-red-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}
        >
          {controller.notice}
        </div>
      )}
      {data.error && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-900"
        >
          <p className="font-bold">{data.error}</p>
          <p className="mt-1">
            {hasAnySnapshot
              ? '取得済みの項目は表示しています。更新できなかった項目は前回の内容です。'
              : 'まだ件数を確認できていません。'}{' '}
            ログイン状態と通信を確認し、再度更新してください。
          </p>
          <button
            type="button"
            disabled={data.loading}
            onClick={() => void data.refresh()}
            className="mt-3 min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 font-bold disabled:opacity-50"
          >
            再取得する
          </button>
        </div>
      )}
      {data.loading && !hasAnySnapshot && (
        <div
          role="status"
          className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-5 text-sm text-slate-600"
        >
          <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-medace-700" />
          生徒・課題・提出を読み込んでいます。件数は取得後に表示します。
        </div>
      )}
      {controller.selectedStudent && (
        <div
          ref={composerContainer}
          role="dialog"
          aria-modal="true"
          aria-label={`${controller.selectedStudent.name}さんへのアプリ内通知`}
          aria-busy={controller.sending || controller.drafting}
          onKeyDown={handleComposerKeyDown}
          className="[&_[data-testid=notification-composer]]:items-start [&_[data-testid=notification-composer]]:overflow-y-auto [&_[data-testid=notification-composer]>div]:my-auto"
        >
          <InstructorDashboardModals userDisplayName={user.displayName} controller={controller} />
        </div>
      )}
      <InstructorDashboardSections
        user={user}
        onSelectBook={onSelectBook}
        activeView={activeView}
        onChangeView={onChangeView}
        controller={controller}
        students={data.students}
        writingAssignments={data.writingAssignments}
        writingQueue={data.writingQueue}
        hasStudentsData={data.hasStudentsData}
        hasAssignmentsData={data.hasAssignmentsData}
        hasQueueData={data.hasQueueData}
        loading={data.loading}
      />
    </div>
  );
};

export default InstructorDashboard;
