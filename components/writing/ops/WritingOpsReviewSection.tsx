import React from 'react';
import {
  CheckCircle2,
  ClipboardList,
  FileStack,
  Loader2,
  MessageSquareMore,
} from 'lucide-react';

import type { WritingSubmissionDetailResponse } from '../../../contracts/writing';
import {
  WRITING_AI_PROVIDER_LABELS,
  WRITING_SUBMISSION_SOURCE_LABELS,
  type WritingEvaluation,
  type WritingQueueItem,
} from '../../../types';
import {
  WRITING_ASSIGNMENT_STATUS_LABELS,
  formatDateTime,
  renderAsset,
  statusTone,
} from './presentation';
import { type WritingOpsTab } from '../../../utils/writingOps';

interface WritingOpsReviewSectionProps {
  tab: WritingOpsTab;
  reviewList: WritingQueueItem[];
  selectedSubmissionId: string;
  detail: WritingSubmissionDetailResponse | null;
  selectedEvaluationId: string;
  selectedEvaluation?: WritingEvaluation;
  reviewPublicComment: string;
  reviewPrivateMemo: string;
  reviewing: boolean;
  onSelectSubmission: (submissionId: string) => void;
  onSelectEvaluation: (evaluationId: string) => void;
  onReviewPublicCommentChange: (value: string) => void;
  onReviewPrivateMemoChange: (value: string) => void;
  onApprove: () => void;
  onRequestRevision: () => void;
  onComplete: () => void;
}

const WritingOpsReviewSection: React.FC<WritingOpsReviewSectionProps> = ({
  tab,
  reviewList,
  selectedSubmissionId,
  detail,
  selectedEvaluationId,
  selectedEvaluation,
  reviewPublicComment,
  reviewPrivateMemo,
  reviewing,
  onSelectSubmission,
  onSelectEvaluation,
  onReviewPublicCommentChange,
  onReviewPrivateMemoChange,
  onApprove,
  onRequestRevision,
  onComplete,
}) => (
  <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
    <div className="space-y-3" data-testid="writing-review-queue">
      {reviewList.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6">
          <div className="text-sm font-black text-slate-900">
            {tab === 'QUEUE' ? '講師確認待ちの提出はありません' : '返却済みの履歴はまだありません'}
          </div>
          <div className="mt-2 text-sm leading-relaxed text-slate-500">
            {tab === 'QUEUE'
              ? '生徒の提出または校舎スキャナー登録が完了すると、ここに返却判断待ちとして表示されます。'
              : '承認返却や再提出依頼を行うと、返却内容をここから確認できます。'}
          </div>
        </div>
      )}
      {reviewList.map((item) => (
        <button
          key={item.submissionId}
          type="button"
          data-testid={`writing-review-item-${item.submissionId}`}
          onClick={() => onSelectSubmission(item.submissionId)}
          className={`w-full rounded-3xl border px-5 py-4 text-left ${
            selectedSubmissionId === item.submissionId
              ? 'border-medace-300 bg-medace-50/80'
              : 'border-slate-200 bg-white hover:border-medace-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-bold text-slate-950">{item.studentName}</div>
              <div className="mt-1 text-xs text-slate-400">{item.promptTitle}</div>
            </div>
            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${statusTone(item.status)}`}>
              {WRITING_ASSIGNMENT_STATUS_LABELS[item.status]}
            </span>
          </div>
          <div className="mt-4 grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
            <div>提出: {formatDateTime(item.submittedAt)}</div>
            <div>Attempt {item.attemptNo}</div>
            <div>OCR {Math.round(item.transcriptConfidence * 100)}%</div>
            <div>{item.recommendedProvider ? WRITING_AI_PROVIDER_LABELS[item.recommendedProvider] : '未選択'}</div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-700">
            {tab === 'QUEUE' ? '次: 採用候補を選び、講師コメントを書いて返却判断' : '次: 返却内容を確認し、必要なら完了へ'}
          </div>
        </button>
      ))}
    </div>

    <div className="rounded-[28px] border border-slate-200 bg-slate-50 p-5">
      {!detail ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-5 py-6">
          <div className="text-sm font-black text-slate-900">答案を選択してください</div>
          <div className="mt-2 text-sm leading-relaxed text-slate-500">
            左の一覧から答案を選ぶと、原本、OCR、AI比較、講師コメント、返却操作をまとめて確認できます。
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="space-y-5">
              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-sm font-bold text-slate-950">{detail.assignment.studentName}</div>
                    <div className="mt-1 text-xs text-slate-400">{detail.assignment.promptTitle}</div>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <div>{formatDateTime(detail.submission.submittedAt)}</div>
                    <div className="mt-1">Attempt {detail.submission.attemptNo}</div>
                  </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">提出元</div>
                    <div className="mt-2 text-sm font-black text-slate-950">
                      {WRITING_SUBMISSION_SOURCE_LABELS[detail.submission.submissionSource]}
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">OCR信頼度</div>
                    <div className="mt-2 text-sm font-black text-slate-950">
                      {Math.round(detail.submission.transcriptConfidence * 100)}%
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">現在状態</div>
                    <div className="mt-2 text-sm font-black text-slate-950">
                      {WRITING_ASSIGNMENT_STATUS_LABELS[detail.assignment.status]}
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <FileStack className="h-4 w-4" />
                  答案
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {detail.submission.assets.map((asset) => (
                    <div key={asset.id} className="rounded-3xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{asset.fileName}</div>
                      {renderAsset(asset)}
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <ClipboardList className="h-4 w-4" />
                  OCR
                </div>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{detail.submission.transcript}</p>
              </section>

              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                  <MessageSquareMore className="h-4 w-4" />
                  AI比較
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  {detail.submission.evaluations.map((evaluation) => (
                    <button
                      key={evaluation.id}
                      type="button"
                      onClick={() => onSelectEvaluation(evaluation.id)}
                      className={`rounded-3xl border px-4 py-4 text-left ${
                        selectedEvaluationId === evaluation.id
                          ? 'border-medace-300 bg-medace-50/80'
                          : 'border-slate-200 bg-slate-50 hover:border-medace-200'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-bold text-slate-900">{WRITING_AI_PROVIDER_LABELS[evaluation.provider]}</div>
                        <div className="text-xs font-bold text-slate-400">{evaluation.latencyMs} ms</div>
                      </div>
                      <div className="mt-3 text-2xl font-black text-slate-950">{evaluation.overallScore} / 20</div>
                      <div className="mt-2 text-xs leading-relaxed text-slate-500">
                        structure {Math.round(evaluation.structureScore * 100)} / alignment {Math.round(evaluation.transcriptAlignment * 100)} / confidence {Math.round(evaluation.confidence * 100)}
                      </div>
                    </button>
                  ))}
                </div>

                {selectedEvaluation && (
                  <div className="mt-5 grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">観点別評価</div>
                        <div className="mt-3 grid gap-2">
                          {selectedEvaluation.rubric.map((item) => (
                            <div key={item.key} className="rounded-2xl border border-white bg-white px-4 py-3 text-sm text-slate-700">
                              <div className="flex items-center justify-between gap-3">
                                <span className="font-bold text-slate-900">{item.label}</span>
                                <span className="text-xs font-bold text-slate-400">{item.score} / {item.maxScore}</span>
                              </div>
                              <div className="mt-2 text-xs leading-relaxed text-slate-500">{item.comment}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">良い点</div>
                        <ul className="mt-3 space-y-2 text-sm text-slate-700">
                          {selectedEvaluation.strengths.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">改善点</div>
                        <ul className="mt-3 space-y-2 text-sm text-slate-700">
                          {selectedEvaluation.improvementPoints.map((item) => <li key={item}>{item}</li>)}
                        </ul>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">訂正文例</div>
                        <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                          {selectedEvaluation.correctedDraft}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">模範例</div>
                        <div className="mt-3 whitespace-pre-wrap rounded-2xl border border-white bg-white px-4 py-4 text-sm leading-relaxed text-slate-700">
                          {selectedEvaluation.modelAnswer}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <aside className="space-y-5 2xl:sticky 2xl:top-6 2xl:self-start">
              <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">採用候補</div>
                {selectedEvaluation ? (
                  <>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="text-sm font-bold text-slate-950">
                        {WRITING_AI_PROVIDER_LABELS[selectedEvaluation.provider]}
                      </div>
                      <div className="rounded-full border border-medace-200 bg-medace-50 px-2.5 py-1 text-xs font-bold text-medace-700">
                        {selectedEvaluation.overallScore} / 20
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        OCR整合: <span className="font-black text-slate-950">{Math.round(selectedEvaluation.transcriptAlignment * 100)}%</span>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        構造完全性: <span className="font-black text-slate-950">{Math.round(selectedEvaluation.structureScore * 100)}%</span>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                        コスト: <span className="font-black text-slate-950">{selectedEvaluation.costMilliYen} m¥</span>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-slate-500">比較結果がありません。</div>
                )}
              </section>

              {tab === 'QUEUE' ? (
                <section className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">返却判断</div>
                  <div className="mt-3 rounded-2xl border border-medace-100 bg-medace-50 px-4 py-3 text-sm leading-relaxed text-medace-900/80">
                    1. 採用候補を選ぶ  2. 生徒に見せるコメントを書く  3. 返却または再提出依頼を確定
                  </div>
                  <div className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">生徒に見せるコメント</div>
                  <textarea
                    data-testid="writing-review-public-comment"
                    value={reviewPublicComment}
                    onChange={(event) => onReviewPublicCommentChange(event.target.value)}
                    className="mt-3 min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    placeholder="良かった点と、次に直す点を生徒向けに短く書きます。"
                  />
                  <div className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">講師メモ</div>
                  <textarea
                    value={reviewPrivateMemo}
                    onChange={(event) => onReviewPrivateMemoChange(event.target.value)}
                    className="mt-3 min-h-24 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                    placeholder="面談や次回フォロー用の内部メモです。生徒には表示されません。"
                  />
                  {!reviewPublicComment.trim() && (
                    <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
                      返却または再提出依頼には、生徒向けコメントが必要です。
                    </div>
                  )}
                  <div className="mt-5 flex flex-col gap-3">
                    <button
                      type="button"
                      data-testid="writing-approve-return"
                      disabled={reviewing || !selectedEvaluationId || !reviewPublicComment.trim()}
                      onClick={onApprove}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {reviewing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      承認して返却
                    </button>
                    {detail.submission.attemptNo < detail.assignment.maxAttempts && (
                      <button
                        type="button"
                        onClick={onRequestRevision}
                        disabled={reviewing || !selectedEvaluationId || !reviewPublicComment.trim()}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-bold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                      >
                        再提出を依頼
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onComplete}
                      disabled={reviewing}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700 disabled:opacity-50"
                    >
                      完了にする
                    </button>
                  </div>
                </section>
              ) : (
                <section className="rounded-3xl border border-slate-200 bg-white p-5">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">返却済みコメント</div>
                  <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700">
                    {detail.submission.teacherReview?.publicComment || '講師コメントはまだありません。'}
                  </div>
                  {detail.submission.teacherReview?.privateMemo && (
                    <>
                      <div className="mt-4 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">内部メモ</div>
                      <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-700">
                        {detail.submission.teacherReview.privateMemo}
                      </div>
                    </>
                  )}
                  {detail.assignment.status !== 'COMPLETED' && (
                    <button
                      type="button"
                      onClick={onComplete}
                      disabled={reviewing}
                      className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700 disabled:opacity-50"
                    >
                      完了にする
                    </button>
                  )}
                </section>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  </div>
);

export default WritingOpsReviewSection;
