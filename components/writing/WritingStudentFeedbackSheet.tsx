import React from 'react';
import { CheckCircle2, FileDown, MessageSquareText, X } from 'lucide-react';

import type { WritingStudentSubmissionDetailResponse } from '../../contracts/writing';
import { WRITING_ASSIGNMENT_STATUS_LABELS, WRITING_SUBMISSION_SOURCE_LABELS } from '../../types';
import MobileSheetDialog from '../mobile/MobileSheetDialog';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import {
  formatWritingDateTime,
  renderWritingAsset,
} from './studentSectionUtils';

interface WritingStudentFeedbackSheetProps {
  feedbackDetail: WritingStudentSubmissionDetailResponse;
  isMobileViewport: boolean;
  selectedEvaluation?: WritingStudentSubmissionDetailResponse['submission']['evaluations'][number];
  feedbackCommentExpanded: boolean;
  onToggleFeedbackCommentExpanded: () => void;
  onClose: () => void;
  onPrintFeedback: () => void;
}

const WritingStudentFeedbackSheet: React.FC<WritingStudentFeedbackSheetProps> = ({
  feedbackDetail,
  isMobileViewport,
  selectedEvaluation,
  feedbackCommentExpanded,
  onToggleFeedbackCommentExpanded,
  onClose,
  onPrintFeedback,
}) => {
  return (
    <MobileSheetDialog
      onClose={onClose}
      mode={isMobileViewport ? 'fullscreen' : 'sheet'}
      ariaLabel={`添削フィードバック: ${feedbackDetail.assignment.promptTitle}`}
      panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-5xl sm:rounded-[28px] sm:border sm:border-slate-200 sm:shadow-2xl"
    >
      <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[28px] sm:px-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="添削フィードバックを閉じる"
          className="absolute right-4 top-4 rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="pr-12">
          <p className="text-xs font-bold text-slate-400">添削フィードバック</p>
          <h3 className={`mt-2 font-black tracking-tight text-slate-950 ${isMobileViewport ? 'text-xl leading-tight' : 'text-2xl'}`}>
            {feedbackDetail.assignment.promptTitle}
          </h3>
          <p className="mt-2 text-sm text-slate-500">
            {isMobileViewport
              ? '返却済みの添削です。まず講師コメントと改善点だけ確認できる並びにしています。'
              : '講師確認後に返却された内容です。面談前後の見直し用にそのまま印刷もできます。'}
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 pb-[calc(8.5rem+env(safe-area-inset-bottom))] sm:px-6 sm:pb-6">
        <div className="space-y-5">
          <div className="grid gap-2 grid-cols-2 md:gap-3 md:grid-cols-4">
            <div className={`rounded-2xl border border-slate-200 bg-slate-50 ${isMobileViewport ? 'px-3.5 py-3.5' : 'px-4 py-4'}`}>
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">状態</div>
              <div className="mt-2 text-sm font-black text-slate-950">{WRITING_ASSIGNMENT_STATUS_LABELS[feedbackDetail.assignment.status]}</div>
            </div>
            <div className={`rounded-2xl border border-slate-200 bg-slate-50 ${isMobileViewport ? 'px-3.5 py-3.5' : 'px-4 py-4'}`}>
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">提出元</div>
              <div className="mt-2 text-sm font-black text-slate-950">
                {WRITING_SUBMISSION_SOURCE_LABELS[feedbackDetail.submission.submissionSource]}
              </div>
            </div>
            <div className={`rounded-2xl border border-slate-200 bg-slate-50 ${isMobileViewport ? 'px-3.5 py-3.5' : 'px-4 py-4'}`}>
              <div className="text-xs font-bold text-slate-400">提出回数</div>
              <div className="mt-2 text-sm font-black text-slate-950">{feedbackDetail.submission.attemptNo}</div>
            </div>
            <div className={`rounded-2xl border border-slate-200 bg-slate-50 ${isMobileViewport ? 'px-3.5 py-3.5' : 'px-4 py-4'}`}>
              <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">返却時刻</div>
              <div className="mt-2 text-sm font-black leading-snug text-slate-950">{formatWritingDateTime(feedbackDetail.submission.teacherReview?.releasedAt)}</div>
            </div>
          </div>

          {selectedEvaluation && (
            <div className="rounded-3xl border border-medace-200 bg-medace-50 px-5 py-5">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-medace-700" />
                <div>
                  <div className="text-sm font-black text-medace-950">見直し順</div>
                  <div className="mt-2 grid gap-2 text-sm leading-relaxed text-medace-900/80 md:grid-cols-3">
                    <div className="rounded-2xl border border-medace-100 bg-white/80 px-4 py-3">1. 講師コメントで方針を確認</div>
                    <div className="rounded-2xl border border-medace-100 bg-white/80 px-4 py-3">2. 改善点 {selectedEvaluation.improvementPoints.length}件を直す</div>
                    <div className="rounded-2xl border border-medace-100 bg-white/80 px-4 py-3">3. 訂正文例と模範例を比較</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          <div data-testid="writing-feedback-comment" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">講師コメント</div>
              {isMobileViewport && (
                <span className="rounded-full border border-medace-200 bg-medace-50 px-2.5 py-1 text-[11px] font-bold text-medace-700">
                  まずここを見る
                </span>
              )}
            </div>
            <div
              id="writing-feedback-public-comment"
              className="mt-3 text-sm leading-relaxed text-slate-700"
              style={isMobileViewport && !feedbackCommentExpanded
                ? {
                  display: '-webkit-box',
                  WebkitBoxOrient: 'vertical',
                  WebkitLineClamp: 3,
                  overflow: 'hidden',
                }
                : undefined}
            >
              {feedbackDetail.submission.teacherReview?.publicComment || '講師コメントはまだありません。'}
            </div>
            {isMobileViewport && (feedbackDetail.submission.teacherReview?.publicComment?.length ?? 0) > 80 && (
              <button
                type="button"
                aria-expanded={feedbackCommentExpanded}
                aria-controls="writing-feedback-public-comment"
                onClick={onToggleFeedbackCommentExpanded}
                className="mt-3 text-sm font-bold text-medace-700"
              >
                {feedbackCommentExpanded ? '短くたたむ' : '全文を見る'}
              </button>
            )}
          </div>

          {selectedEvaluation && (
            <div
              data-testid="writing-feedback-approved-evaluation"
              className="flex items-center justify-between gap-4 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4"
            >
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">講師が確認した添削</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-600">
                  講師が返却用に選んだ内容だけを表示しています。
                </div>
              </div>
              <div className="shrink-0 rounded-2xl border border-medace-200 bg-medace-50 px-3 py-2 text-right">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-medace-700">確定スコア</div>
                <div className="mt-1 text-sm font-black text-medace-950">{selectedEvaluation.overallScore} / 20</div>
              </div>
            </div>
          )}

          {selectedEvaluation && (
            isMobileViewport ? (
              <div className="space-y-4" data-testid="writing-feedback-mobile-view">
                <div data-testid="writing-feedback-improvements" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">改善点</div>
                    <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
                      次に直す
                    </span>
                  </div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {selectedEvaluation.improvementPoints.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div data-testid="writing-feedback-corrected" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">訂正文例</div>
                  <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                    {selectedEvaluation.correctedDraft}
                  </div>
                </div>
                <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">模範例</div>
                  <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                    {selectedEvaluation.modelAnswer}
                  </div>
                </div>
                <div data-testid="writing-feedback-strengths" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">良かった点</div>
                  <ul className="mt-3 space-y-2 text-sm text-slate-700">
                    {selectedEvaluation.strengths.map((item) => <li key={item}>{item}</li>)}
                  </ul>
                </div>
                <div data-testid="writing-feedback-transcript" className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">提出文</div>
                  <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                    {feedbackDetail.submission.transcript}
                  </div>
                </div>
                <div data-testid="writing-feedback-assets" className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                    <MessageSquareText className="h-4 w-4" />
                    提出答案
                  </div>
                  <div className="grid gap-3">
                    {feedbackDetail.submission.assets.map((asset) => (
                      <div key={asset.id}>{renderWritingAsset(asset)}</div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 xl:grid-cols-[0.92fr_1.08fr]">
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">良かった点</div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {selectedEvaluation.strengths.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">改善点</div>
                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {selectedEvaluation.improvementPoints.map((item) => <li key={item}>{item}</li>)}
                    </ul>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">提出文</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                      {feedbackDetail.submission.transcript}
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">訂正文例</div>
                    <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                      {selectedEvaluation.correctedDraft}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">模範例</div>
                    <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                      {selectedEvaluation.modelAnswer}
                    </div>
                  </div>
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                      <MessageSquareText className="h-4 w-4" />
                      提出答案
                    </div>
                    <div className="grid gap-3">
                      {feedbackDetail.submission.assets.map((asset) => (
                        <div key={asset.id}>{renderWritingAsset(asset)}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-6 sm:rounded-b-[28px]">
        <div className={isMobileViewport ? 'grid grid-cols-2 gap-3' : 'flex flex-col-reverse gap-3 sm:flex-row sm:justify-end'}>
          <button
            type="button"
            onClick={onClose}
            className={`min-h-11 rounded-2xl px-4 py-3 text-sm font-bold ${
              isMobileViewport
                ? 'bg-medace-600 text-slate-950'
                : 'border border-slate-200 text-slate-600'
            }`}
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={onPrintFeedback}
            className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold ${
              isMobileViewport
                ? 'border border-slate-200 bg-white text-slate-700'
                : 'bg-steady-action text-steady-on-action hover:bg-steady-action-hover'
            }`}
          >
            <FileDown className="h-4 w-4" />
            添削結果を印刷
          </button>
        </div>
      </MobileStickyActionBar>
    </MobileSheetDialog>
  );
};

export default WritingStudentFeedbackSheet;
