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

  const now = input.now ?? Date.now();
  const staleMs = input.staleMs ?? WORD_HINT_AUDIT_STALE_MS;
  return now - input.auditedAt < staleMs;
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

const escapeSvgText = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

export const createWordImagePlaceholderDataUrl = (word: string, definition: string): string => {
  const safeWord = escapeSvgText((word || '?').slice(0, 18));
  const safeDefinition = escapeSvgText((definition || '').slice(0, 28));
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#fff7ed" />
          <stop offset="100%" stop-color="#fde68a" />
        </linearGradient>
      </defs>
      <rect width="640" height="640" rx="56" fill="url(#bg)" />
      <rect x="38" y="38" width="564" height="564" rx="42" fill="#ffffff" stroke="#fdba74" stroke-width="8" />
      <text x="320" y="282" text-anchor="middle" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-size="72" font-weight="700" fill="#9a3412">${safeWord}</text>
      <text x="320" y="360" text-anchor="middle" font-family="Hiragino Sans, Noto Sans JP, sans-serif" font-size="26" fill="#7c2d12">${safeDefinition}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
};

export const createLocalExampleHint = (
  word: string,
  definition: string,
  generation: number,
): { sentence: string; translation: string } => {
  const sentenceVariants = [
    `We use "${word}" when talking about ${definition}.`,
    `The teacher explained "${word}" during today's lesson.`,
    `I remembered "${word}" by linking it to ${definition}.`,
  ];
  const translationVariants = [
    `「${word}」は ${definition} の話をするときに使います。`,
    `先生は今日の授業で「${word}」を説明しました。`,
    `「${word}」を ${definition} と結びつけて覚えました。`,
  ];
  const index = generation % sentenceVariants.length;
  return {
    sentence: sentenceVariants[index],
    translation: translationVariants[index],
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
