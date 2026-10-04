import {
  GeneratedAssetAuditStatus,
  WordHintAssetType,
  type WordData,
} from '../types';

export const WORD_HINT_AUDIT_STALE_MS = 14 * 24 * 60 * 60 * 1000;

export const hasExampleHint = (input: {
  exampleSentence?: string | null;
  exampleMeaning?: string | null;
}): boolean => (
  Boolean(input.exampleSentence?.trim())
);

export const resolveExampleTranslation = (input: {
  definition: string;
  exampleMeaning?: string | null;
}): string => (
  input.exampleMeaning?.trim() || `語義: ${input.definition}`
);

export const hasImageHint = (input: {
  exampleImageUrl?: string | null;
  exampleImageKey?: string | null;
}): boolean => (
  Boolean(input.exampleImageUrl?.trim())
  || Boolean(input.exampleImageKey?.trim())
);

export const shouldAuditGeneratedAsset = (
  generatedAt?: number | null,
  auditedAt?: number | null,
  now = Date.now(),
  staleMs = WORD_HINT_AUDIT_STALE_MS,
): boolean => {
  if (!generatedAt) return false;
  if (!auditedAt) return true;
  if (auditedAt < generatedAt) return true;
  return now - auditedAt >= staleMs;
};

export const isGeneratedAssetVisibleToLearner = (input: {
  generatedAt?: number | null;
  auditedAt?: number | null;
  auditStatus?: GeneratedAssetAuditStatus | null;
  now?: number;
  staleMs?: number;
}): boolean => {
  if (!input.generatedAt) return true;
  if (input.auditStatus !== GeneratedAssetAuditStatus.APPROVED) return false;
  if (!input.auditedAt || input.auditedAt < input.generatedAt) return false;

  // A fixed, approved asset stays approved until its content/provenance or review changes.
  // Automatic paid re-audits are retired; elapsed time alone does not revoke approval.
  return true;
};

export const getLearnerGeneratedAssetAuditStatus = (input: {
  generatedAt?: number | null;
  auditedAt?: number | null;
  auditStatus?: GeneratedAssetAuditStatus | null;
  now?: number;
  staleMs?: number;
}): GeneratedAssetAuditStatus | null => {
  if (!input.generatedAt) return input.auditStatus ?? null;
  if (isGeneratedAssetVisibleToLearner(input)) return GeneratedAssetAuditStatus.APPROVED;
  if (
    input.auditStatus === GeneratedAssetAuditStatus.REVIEW_REQUIRED
    || input.auditStatus === GeneratedAssetAuditStatus.FAILED
  ) {
    return input.auditStatus;
  }
  return GeneratedAssetAuditStatus.PENDING;
};

export const projectWordHintAssetsForLearner = (
  word: WordData,
  auditMetadata: {
    exampleAuditedAt?: number | null;
    exampleImageAuditedAt?: number | null;
    now?: number;
    staleMs?: number;
  } = {},
): WordData => {
  const exampleAuditInput = {
    generatedAt: word.exampleGeneratedAt,
    auditedAt: auditMetadata.exampleAuditedAt,
    auditStatus: word.exampleAuditStatus,
    now: auditMetadata.now,
    staleMs: auditMetadata.staleMs,
  };
  const imageAuditInput = {
    generatedAt: word.exampleImageGeneratedAt,
    auditedAt: auditMetadata.exampleImageAuditedAt,
    auditStatus: word.exampleImageAuditStatus,
    now: auditMetadata.now,
    staleMs: auditMetadata.staleMs,
  };
  // A source-authored example has neither generation provenance nor an audit state.
  // If an audit state exists without a generation timestamp, fail closed because the
  // record may be a legacy generated asset whose provenance was lost.
  const exampleMissingGenerationProvenance = Boolean(word.exampleAuditStatus)
    && !word.exampleGeneratedAt;
  const exampleVisible = !exampleMissingGenerationProvenance
    && isGeneratedAssetVisibleToLearner(exampleAuditInput);
  const imageMissingGenerationProvenance = Boolean(word.exampleImageUrl?.trim())
    && !word.exampleImageGeneratedAt;
  const imageVisible = !imageMissingGenerationProvenance
    && isGeneratedAssetVisibleToLearner(imageAuditInput);

  return {
    ...word,
    exampleSentence: exampleVisible ? word.exampleSentence : null,
    exampleMeaning: exampleVisible ? word.exampleMeaning : null,
    exampleImageUrl: imageVisible ? word.exampleImageUrl : null,
    exampleAuditStatus: exampleMissingGenerationProvenance
      ? GeneratedAssetAuditStatus.REVIEW_REQUIRED
      : getLearnerGeneratedAssetAuditStatus(exampleAuditInput),
    exampleImageAuditStatus: imageMissingGenerationProvenance
      ? GeneratedAssetAuditStatus.REVIEW_REQUIRED
      : getLearnerGeneratedAssetAuditStatus(imageAuditInput),
  };
};

export const getHintAuditTone = (
  status?: GeneratedAssetAuditStatus | null,
): {
  label: string;
  className: string;
} | null => {
  switch (status) {
    case GeneratedAssetAuditStatus.APPROVED:
      return {
        label: '確認済み',
        className: 'border-emerald-200 bg-emerald-50/80 text-emerald-700',
      };
    case GeneratedAssetAuditStatus.PENDING:
      return {
        label: '確認中',
        className: 'border-sky-200 bg-sky-50/80 text-sky-700',
      };
    case GeneratedAssetAuditStatus.REVIEW_REQUIRED:
      return {
        label: '見直し中',
        className: 'border-amber-200 bg-amber-50/80 text-amber-800',
      };
    case GeneratedAssetAuditStatus.FAILED:
      return {
        label: '確認エラー',
        className: 'border-rose-200 bg-rose-50/80 text-rose-700',
      };
    default:
      return null;
  }
};

export const isHintGenerationAction = (assetType: WordHintAssetType): boolean => (
  assetType === WordHintAssetType.EXAMPLE || assetType === WordHintAssetType.IMAGE
);
