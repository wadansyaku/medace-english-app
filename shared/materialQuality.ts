import {
  BookCatalogSource,
  type BookMetadata,
  type MaterialQualityGate,
  type MaterialReviewStatus,
  type MaterialRightsStatus,
} from '../types';

export interface MaterialSourceLedgerSnapshot {
  sourceId: string;
  rightsStatus: MaterialRightsStatus;
  reviewStatus: MaterialReviewStatus;
  contentQaReport: string;
  qaWordCount: number;
  qaRequiredBlankRows: number;
  qaRowsWithSentinel: number;
  qaSentinelValueCount: number;
  qaDuplicateHeadwordCount: number;
  qaSourceCoverageRate: number;
  qaExamplePairCoverageRate: number;
}

const toNumber = (value: unknown): number => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

export const evaluateMaterialQualityGate = (
  book: Pick<BookMetadata, 'id' | 'title' | 'wordCount' | 'catalogSource'>,
  ledger: MaterialSourceLedgerSnapshot | null | undefined,
): MaterialQualityGate => {
  if (book.catalogSource === BookCatalogSource.USER_GENERATED) {
    return {
      status: 'user_generated',
      label: 'My単語帳',
      summary: '個人作成教材です。公式配信のsource ledger対象外です。',
      isApprovedForLearner: true,
      isSelectableForToday: true,
      blockingReasons: [],
      warnings: [],
    };
  }

  if (!ledger) {
    return {
      status: 'missing_ledger',
      label: '台帳なし',
      summary: 'source ledgerが未登録のため、今日の自動学習候補から外します。',
      isApprovedForLearner: false,
      isSelectableForToday: false,
      blockingReasons: ['source ledgerが未登録です。'],
      warnings: [],
    };
  }

  const blockingReasons: string[] = [];
  const warnings: string[] = [];
  if (ledger.rightsStatus !== 'approved') {
    blockingReasons.push(`権利確認が ${ledger.rightsStatus} です。`);
  }
  if (ledger.reviewStatus !== 'approved') {
    blockingReasons.push(`教材レビューが ${ledger.reviewStatus} です。`);
  }
  if (ledger.qaWordCount <= 0 || book.wordCount <= 0) {
    blockingReasons.push('QA済み語数が0です。');
  }
  if (ledger.qaRequiredBlankRows > 0) {
    blockingReasons.push(`必須空欄が ${ledger.qaRequiredBlankRows} 行あります。`);
  }
  if (ledger.qaRowsWithSentinel > 0 || ledger.qaSentinelValueCount > 0) {
    blockingReasons.push(`未抽出などのsentinelが ${ledger.qaRowsWithSentinel} 行あります。`);
  }
  if (ledger.qaDuplicateHeadwordCount > 0) {
    warnings.push(`重複headwordが ${ledger.qaDuplicateHeadwordCount} 件あります。`);
  }
  if (ledger.qaSourceCoverageRate < 1) {
    warnings.push('単語行のsource_sheet/source_entry_id coverageが未完了です。');
  }
  if (ledger.qaExamplePairCoverageRate < 1) {
    warnings.push('例文ペアcoverageが未完了です。');
  }

  const hasQaBlocker = blockingReasons.some((reason) => (
    reason.includes('QA') || reason.includes('必須空欄') || reason.includes('sentinel')
  ));
  const status = blockingReasons.length === 0
    ? 'approved'
    : hasQaBlocker
      ? 'qa_blocked'
      : 'source_review_required';

  return {
    status,
    label: status === 'approved'
      ? '承認済み'
      : status === 'qa_blocked'
        ? 'QA停止'
        : '出典確認',
    summary: status === 'approved'
      ? 'source ledgerとcontent QAの両方を通過しています。'
      : 'source ledgerまたはcontent QAの確認が残っているため、今日の自動学習候補から外します。',
    isApprovedForLearner: status === 'approved',
    isSelectableForToday: status === 'approved',
    sourceId: ledger.sourceId,
    rightsStatus: ledger.rightsStatus,
    reviewStatus: ledger.reviewStatus,
    contentQaReport: ledger.contentQaReport,
    blockingReasons,
    warnings,
  };
};

export const getLearnerMaterialQualityMessage = (gate: MaterialQualityGate | undefined): string => {
  if (!gate || gate.isApprovedForLearner || gate.status === 'user_generated') {
    return '学習に使える教材です。';
  }
  return 'この教材は確認中です。承認後に学習やテストで使えます。';
};

export const getOperatorMaterialQualityMessage = (gate: MaterialQualityGate | undefined): string => {
  if (!gate || gate.isApprovedForLearner || gate.status === 'user_generated') {
    return '配信可能な教材です。';
  }
  const firstReason = gate.blockingReasons[0] || gate.summary;
  return `${firstReason} 承認済みにするまで生徒の学習・テストには出しません。`;
};

export const isBookSelectableForToday = (book: BookMetadata): boolean => (
  book.qualityGate ? book.qualityGate.isSelectableForToday : true
);

export const isBookApprovedForLearner = (book: BookMetadata): boolean => (
  book.qualityGate ? book.qualityGate.isApprovedForLearner : true
);

export const toMaterialLedgerSnapshot = (row: {
  ledger_source_id?: string | null;
  ledger_rights_status?: string | null;
  ledger_review_status?: string | null;
  ledger_content_qa_report?: string | null;
  ledger_qa_word_count?: number | null;
  ledger_qa_required_blank_rows?: number | null;
  ledger_qa_rows_with_sentinel?: number | null;
  ledger_qa_sentinel_value_count?: number | null;
  ledger_qa_duplicate_headword_count?: number | null;
  ledger_qa_source_coverage_rate?: number | null;
  ledger_qa_example_pair_coverage_rate?: number | null;
}): MaterialSourceLedgerSnapshot | null => {
  if (!row.ledger_source_id) return null;
  return {
    sourceId: row.ledger_source_id,
    rightsStatus: (row.ledger_rights_status || 'unknown') as MaterialRightsStatus,
    reviewStatus: (row.ledger_review_status || 'needs_review') as MaterialReviewStatus,
    contentQaReport: row.ledger_content_qa_report || '',
    qaWordCount: toNumber(row.ledger_qa_word_count),
    qaRequiredBlankRows: toNumber(row.ledger_qa_required_blank_rows),
    qaRowsWithSentinel: toNumber(row.ledger_qa_rows_with_sentinel),
    qaSentinelValueCount: toNumber(row.ledger_qa_sentinel_value_count),
    qaDuplicateHeadwordCount: toNumber(row.ledger_qa_duplicate_headword_count),
    qaSourceCoverageRate: toNumber(row.ledger_qa_source_coverage_rate),
    qaExamplePairCoverageRate: toNumber(row.ledger_qa_example_pair_coverage_rate),
  };
};
