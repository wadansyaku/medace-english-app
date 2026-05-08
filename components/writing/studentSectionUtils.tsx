import React from 'react';

import type { WritingSubmissionDetailResponse } from '../../contracts/writing';
import {
  type WritingAssignment,
  type WritingAssignmentStatus,
} from '../../types';

export const WORKFLOW_STEPS = ['課題', '提出', '処理中', '返却済み'] as const;

export const SUBMIT_FLOW_STEPS = [
  { id: 'requirements', label: '提出条件', description: '提出コードと形式を確認' },
  { id: 'files', label: 'ファイル選択', description: 'PDF 1枚 / 画像最大4枚' },
  { id: 'submit', label: '最終送信', description: '補助テキストを添えて提出' },
] as const;

export interface WritingAssignmentPhase {
  label: string;
  description: string;
  tone: string;
  activeStep: number;
}

export const getWritingStudentAssignmentPriority = (assignment: WritingAssignment): number => {
  switch (assignment.status) {
    case 'REVISION_REQUESTED':
      return 0;
    case 'RETURNED':
      return 1;
    case 'ISSUED':
      return 2;
    case 'REVIEW_READY':
      return 3;
    case 'SUBMITTED':
      return 4;
    case 'COMPLETED':
      return 5;
    default:
      return 6;
  }
};

export const formatWritingDateTime = (timestamp?: number): string => {
  if (!timestamp) return '未提出';
  return new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const canSubmitWritingAssignment = (assignment: WritingAssignment): boolean => (
  assignment.status === 'ISSUED' || assignment.status === 'REVISION_REQUESTED'
);

export const canOpenWritingFeedback = (assignment: WritingAssignment): boolean => (
  Boolean(assignment.latestSubmissionId)
  && (assignment.status === 'RETURNED'
    || assignment.status === 'REVISION_REQUESTED'
    || assignment.status === 'COMPLETED')
);

export const getWritingAssignmentPhase = (
  status: WritingAssignmentStatus,
): WritingAssignmentPhase => {
  switch (status) {
    case 'ISSUED':
      return {
        label: '課題',
        description: '紙で答案を書いたら、スマホで撮影して提出します。',
        tone: 'border-medace-200 bg-medace-50 text-medace-700',
        activeStep: 1,
      };
    case 'SUBMITTED':
      return {
        label: '提出済み',
        description: '答案は届いています。OCR と評価処理が進んでいます。',
        tone: 'border-sky-200 bg-sky-50 text-sky-700',
        activeStep: 2,
      };
    case 'REVIEW_READY':
      return {
        label: '処理中',
        description: 'AI 比較の下書きができました。講師の最終確認を待っています。',
        tone: 'border-sky-200 bg-sky-50 text-sky-700',
        activeStep: 3,
      };
    case 'REVISION_REQUESTED':
      return {
        label: '再提出',
        description: '返却コメントを確認してから、書き直した答案を提出します。',
        tone: 'border-amber-200 bg-amber-50 text-amber-700',
        activeStep: 4,
      };
    case 'RETURNED':
      return {
        label: '返却済み',
        description: '講師確認後の添削結果を確認できます。',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        activeStep: 4,
      };
    case 'COMPLETED':
      return {
        label: '完了',
        description: '返却内容の確認まで完了しています。',
        tone: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        activeStep: 4,
      };
    default:
      return {
        label: '準備中',
        description: '講師が課題を準備しています。',
        tone: 'border-slate-200 bg-slate-50 text-slate-600',
        activeStep: 1,
      };
  }
};

export const renderWritingAsset = (
  asset: WritingSubmissionDetailResponse['submission']['assets'][number],
) => {
  if (asset.mimeType.startsWith('image/')) {
    return <img src={asset.assetUrl} alt={asset.fileName} className="max-h-72 w-full rounded-2xl object-cover" />;
  }

  return (
    <object
      data={asset.assetUrl}
      type={asset.mimeType}
      className="h-72 w-full rounded-2xl border border-slate-200 bg-slate-50"
    >
      <a href={asset.assetUrl} target="_blank" rel="noreferrer" className="text-sm font-bold text-medace-700">
        {asset.fileName} を開く
      </a>
    </object>
  );
};
