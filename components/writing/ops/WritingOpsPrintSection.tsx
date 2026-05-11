import React from 'react';
import { CheckCircle2, ClipboardCheck, Clock3, Loader2, ScanText } from 'lucide-react';

import type { WritingAssignment } from '../../../types';
import WritingPrintLauncher from '../../WritingPrintLauncher';
import {
  WRITING_ASSIGNMENT_STATUS_LABELS,
  formatDateTime,
  statusTone,
} from './presentation';

interface WritingOpsPrintSectionProps {
  assignments: WritingAssignment[];
  selectedAssignment: WritingAssignment | null;
  selectedAssignmentId: string;
  issuing: boolean;
  onSelectAssignment: (assignmentId: string) => void;
  onIssue: () => void;
  onOpenScanner: (assignment: WritingAssignment) => void;
}

const getPrintActionCopy = (assignment: WritingAssignment) => {
  switch (assignment.status) {
    case 'DRAFT':
      return {
        title: '印刷内容を確認して配布',
        body: '問題文と提出コードを確認し、必要なら印刷してから配布状態にします。',
        tone: 'border-medace-200 bg-medace-50 text-medace-800',
        icon: <ClipboardCheck className="h-4 w-4" />,
      };
    case 'ISSUED':
      return {
        title: '生徒の提出待ち',
        body: '生徒がスマホで提出できます。校舎で回収した場合はスキャナー提出を登録します。',
        tone: 'border-sky-200 bg-sky-50 text-sky-800',
        icon: <Clock3 className="h-4 w-4" />,
      };
    case 'REVISION_REQUESTED':
      return {
        title: '再提出待ち',
        body: '返却コメントを受けて書き直し待ちです。校舎回収の場合はここで再提出を登録します。',
        tone: 'border-amber-200 bg-amber-50 text-amber-800',
        icon: <Clock3 className="h-4 w-4" />,
      };
    case 'REVIEW_READY':
      return {
        title: '添削キューで返却判断',
        body: 'AI 比較が済んでいます。添削キューで講師コメントと返却判断を確定します。',
        tone: 'border-amber-200 bg-amber-50 text-amber-800',
        icon: <ScanText className="h-4 w-4" />,
      };
    default:
      return {
        title: '履歴で確認',
        body: '返却済みまたは完了済みの課題です。返却履歴でコメントと採用結果を確認できます。',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        icon: <CheckCircle2 className="h-4 w-4" />,
      };
  }
};

const WritingOpsPrintSection: React.FC<WritingOpsPrintSectionProps> = ({
  assignments,
  selectedAssignment,
  selectedAssignmentId,
  issuing,
  onSelectAssignment,
  onIssue,
  onOpenScanner,
}) => (
  <div className="grid gap-6 xl:grid-cols-[0.94fr_1.06fr]">
    <div className="space-y-3">
      {assignments.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6">
          <div className="text-sm font-black text-slate-900">配布待ちの課題はありません</div>
          <div className="mt-2 text-sm leading-relaxed text-slate-500">
            先に問題作成で生徒とテンプレートを選び、配布前の課題を生成してください。
          </div>
        </div>
      )}
      {assignments.map((assignment) => (
        <button
          key={assignment.id}
          type="button"
          onClick={() => onSelectAssignment(assignment.id)}
          className={`w-full rounded-3xl border px-5 py-4 text-left ${
            selectedAssignmentId === assignment.id
              ? 'border-medace-300 bg-medace-50/80'
              : 'border-slate-200 bg-white hover:border-medace-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-950">{assignment.studentName}</div>
              <div className="mt-1 text-xs text-slate-400">{assignment.promptTitle}</div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(assignment.status)}`}>
              {WRITING_ASSIGNMENT_STATUS_LABELS[assignment.status]}
            </span>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-bold text-slate-500">次の判断</div>
            <div className="mt-1 text-sm font-bold text-slate-900">{getPrintActionCopy(assignment).title}</div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              語数
              <div className="mt-1 text-sm font-black text-slate-900">{assignment.wordCountMin}-{assignment.wordCountMax}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              提出コード
              <div className="mt-1 text-sm font-black text-slate-900">{assignment.submissionCode}</div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-500">
              更新
              <div className="mt-1 text-sm font-black text-slate-900">{formatDateTime(assignment.updatedAt)}</div>
            </div>
          </div>
        </button>
      ))}
    </div>

    <div className="space-y-5">
      <section className="rounded-[28px] border border-slate-200 bg-white p-5">
        {selectedAssignment ? (
          (() => {
            const actionCopy = getPrintActionCopy(selectedAssignment);
            return (
          <>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-sm font-bold text-slate-950">{selectedAssignment.studentName}</div>
                <div className="mt-1 text-xs text-slate-400">{selectedAssignment.promptTitle}</div>
              </div>
              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(selectedAssignment.status)}`}>
                {WRITING_ASSIGNMENT_STATUS_LABELS[selectedAssignment.status]}
              </span>
            </div>

            <div className={`mt-5 rounded-3xl border px-5 py-5 ${actionCopy.tone}`}>
              <div className="flex items-center gap-2 text-sm font-black">
                {actionCopy.icon}
                {actionCopy.title}
              </div>
              <div className="mt-2 text-sm leading-relaxed opacity-85">{actionCopy.body}</div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs font-bold text-slate-400">提出回数</div>
                <div className="mt-2 text-xl font-black text-slate-950">{selectedAssignment.attemptCount} / {selectedAssignment.maxAttempts}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">配布時刻</div>
                <div className="mt-2 text-sm font-black text-slate-950">{formatDateTime(selectedAssignment.issuedAt)}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終提出</div>
                <div className="mt-2 text-sm font-black text-slate-950">{formatDateTime(selectedAssignment.lastSubmittedAt)}</div>
              </div>
            </div>

            <div className="mt-5 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="text-xs font-bold text-slate-400">課題文</div>
              <div className="mt-3 text-sm leading-relaxed text-slate-700">{selectedAssignment.promptText}</div>
              <div className="mt-4 rounded-2xl border border-white bg-white px-4 py-3 text-xs leading-relaxed text-slate-500">
                {selectedAssignment.guidance}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              {selectedAssignment.status === 'DRAFT' && (
                <button
                  type="button"
                  data-testid="writing-issue-assignment"
                  disabled={issuing}
                  onClick={onIssue}
                  className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
                >
                  {issuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  配布状態にする
                </button>
              )}
              {(selectedAssignment.status === 'ISSUED' || selectedAssignment.status === 'REVISION_REQUESTED') && (
                <button
                  type="button"
                  onClick={() => onOpenScanner(selectedAssignment)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
                >
                  <ScanText className="h-4 w-4" />
                  校舎スキャナー提出
                </button>
              )}
              <WritingPrintLauncher assignment={selectedAssignment} />
            </div>
          </>
            );
          })()
        ) : (
          <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-sm text-slate-500">
            印刷したい課題を左から選択してください。
          </div>
        )}
      </section>

      <section className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
        <div className="text-xs font-bold text-slate-400">運用メモ</div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            '問題作成後に印刷し、提出コード付きで紙配布する',
            '校舎提出は PDF 1枚または画像 4 枚までにそろえる',
            '返却後の再提出は 1 回だけ許可される',
          ].map((item) => (
            <div key={item} className="rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-600">
              {item}
            </div>
          ))}
        </div>
      </section>
    </div>
  </div>
);

export default WritingOpsPrintSection;
