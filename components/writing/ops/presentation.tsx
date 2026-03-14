import React from 'react';
import {
  CheckCircle2,
  FileStack,
  History,
  MessageSquareMore,
  ScanText,
  Sparkles,
  ClipboardList,
} from 'lucide-react';

import type { WritingSubmissionDetailResponse } from '../../../contracts/writing';
import {
  WRITING_ASSIGNMENT_STATUS_LABELS,
  type WritingAssignmentStatus,
} from '../../../types';
import { type WritingOpsTab } from '../../../utils/writingOps';

export const TAB_COPY: Record<
  WritingOpsTab,
  {
    label: string;
    icon: React.ReactNode;
    eyebrow: string;
    title: string;
    body: string;
    nextAction: string;
  }
> = {
  CREATE: {
    label: '問題作成',
    icon: <Sparkles className="h-4 w-4" />,
    eyebrow: 'Create Prompt',
    title: 'テンプレートから配布前の課題を作る',
    body: '対象生徒とテンプレートを選び、テーマ補足を入れて紙配布用の課題を下書き化します。',
    nextAction: '生徒とテンプレートを選んで課題を生成する',
  },
  PRINT: {
    label: '印刷 / 配布',
    icon: <FileStack className="h-4 w-4" />,
    eyebrow: 'Issue Worksheet',
    title: '印刷、配布、校舎スキャナー提出を同じ場所で扱う',
    body: '生成済み課題の状態を見ながら、印刷、配布、校舎スキャナー提出までをまとめて進めます。',
    nextAction: '下書き課題を配布状態にして、紙学習に流す',
  },
  QUEUE: {
    label: '添削キュー',
    icon: <ScanText className="h-4 w-4" />,
    eyebrow: 'Review Queue',
    title: '答案、OCR、AI比較、返却操作を一画面で処理する',
    body: '講師確認待ちの提出を選び、右側で返却コメントと再提出判断を確定します。',
    nextAction: '提出を選んで返却または再提出依頼を決める',
  },
  HISTORY: {
    label: '返却履歴',
    icon: <History className="h-4 w-4" />,
    eyebrow: 'Return History',
    title: '返却済み答案の履歴をあとから確認する',
    body: 'どの講評で返却したか、どの AI 結果を採用したかを履歴として追えます。',
    nextAction: '返却済みの内容を確認し、必要なら完了へ進める',
  },
};

export const statusTone = (status: WritingAssignmentStatus): string => {
  switch (status) {
    case 'REVIEW_READY':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    case 'RETURNED':
    case 'COMPLETED':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'REVISION_REQUESTED':
      return 'border-sky-200 bg-sky-50 text-sky-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-600';
  }
};

export const formatDateTime = (timestamp?: number): string => {
  if (!timestamp) return '未設定';
  return new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const renderAsset = (asset: WritingSubmissionDetailResponse['submission']['assets'][number]) => {
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

export const REVIEW_DETAIL_SECTION_ICONS = {
  asset: FileStack,
  comparison: MessageSquareMore,
  transcript: ClipboardList,
  approve: CheckCircle2,
};

export { WRITING_ASSIGNMENT_STATUS_LABELS };
