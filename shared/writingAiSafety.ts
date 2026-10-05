import type { WritingAiExecutionProvenance, WritingEvaluation } from '../types';

export type WritingAssessmentStatus = 'real' | 'sample' | 'unverified';

export const isSampleWritingProvenance = (meta?: WritingAiExecutionProvenance): boolean => (
  meta?.mode === 'fixture'
  || meta?.mode === 'hybrid-fallback'
  || Boolean(meta?.model?.startsWith('fixture-'))
);

export const classifyWritingTranscript = (meta?: WritingAiExecutionProvenance): WritingAssessmentStatus => {
  if (meta?.notes === 'manual-transcript' || meta?.model === 'manual-transcript') return 'real';
  if (isSampleWritingProvenance(meta)) return 'sample';
  return meta?.mode === 'live' ? 'real' : 'unverified';
};

export const classifyWritingEvaluation = (
  evaluation: Pick<WritingEvaluation, 'provenance'>,
  ocrMeta?: WritingAiExecutionProvenance,
): WritingAssessmentStatus => {
  const transcript = classifyWritingTranscript(ocrMeta);
  if (transcript === 'sample' || isSampleWritingProvenance(evaluation.provenance)) return 'sample';
  if (transcript !== 'real' || evaluation.provenance?.mode !== 'live') return 'unverified';
  return 'real';
};

export const WRITING_SAMPLE_NOTICE = 'サンプル／実際の答案を評価していません。成績の確定や学習記録には使えません。原本を講師と確認してください。';
export const WRITING_UNVERIFIED_NOTICE = '答案の処理方法を確認できません。成績の確定や学習記録には使えません。原本を講師と確認してください。';

export const writingAssessmentNotice = (status: WritingAssessmentStatus): string | null => (
  status === 'sample' ? WRITING_SAMPLE_NOTICE : status === 'unverified' ? WRITING_UNVERIFIED_NOTICE : null
);
