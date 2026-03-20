import {
  WRITING_AI_PROVIDER_LABELS,
  WRITING_RUBRIC_LABELS,
  WritingEvaluation,
  WritingPromptSnapshot,
  WritingRubricKey,
  WritingRubricScore,
  WritingSentenceCorrection,
} from '../types';

const MARKER_PREFIX = 'medace-writing';

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export const createSubmissionCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';
  for (let index = 0; index < 8; index += 1) {
    value += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return value;
};

export const encodeSubmissionMarker = (
  assignmentId: string,
  submissionCode: string,
  attemptNo: number,
): string => `${MARKER_PREFIX}:${assignmentId}:${submissionCode}:${attemptNo}`;

export const decodeSubmissionMarker = (
  marker: string,
): { assignmentId: string; submissionCode: string; attemptNo: number } | null => {
  const [prefix, assignmentId, submissionCode, attemptText] = marker.split(':');
  if (prefix !== MARKER_PREFIX || !assignmentId || !submissionCode || !attemptText) return null;
  const attemptNo = Number.parseInt(attemptText, 10);
  if (!Number.isFinite(attemptNo) || attemptNo < 1) return null;
  return { assignmentId, submissionCode, attemptNo };
};

const hashValue = (value: string): number => {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

export const buildSubmissionQrSvg = (payload: string): string => {
  const size = 21;
  const cells: string[] = [];
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const finder = (
        (row < 7 && col < 7)
        || (row < 7 && col >= size - 7)
        || (row >= size - 7 && col < 7)
      );
      let filled = false;
      if (finder) {
        const localRow = row % 7;
        const localCol = col % 7;
        filled = localRow === 0 || localRow === 6 || localCol === 0 || localCol === 6
          || (localRow >= 2 && localRow <= 4 && localCol >= 2 && localCol <= 4);
      } else {
        filled = hashValue(`${payload}:${row}:${col}`) % 7 <= 2;
      }
      if (!filled) continue;
      cells.push(`<rect x="${col}" y="${row}" width="1" height="1" rx="0.05" />`);
    }
  }

  return `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" role="img" aria-label="submission marker">
      <rect width="${size}" height="${size}" fill="#ffffff" />
      <g fill="#111827">${cells.join('')}</g>
    </svg>
  `.trim();
};

const splitSentences = (text: string): string[] => text
  .replace(/\s+/g, ' ')
  .split(/(?<=[.!?])\s+/)
  .map((sentence) => sentence.trim())
  .filter(Boolean);

const scoreSentence = (sentence: string): { corrected: string; reason: string } => {
  let corrected = sentence.trim();
  const reasons: string[] = [];

  if (!/[.!?]$/.test(corrected)) {
    corrected = `${corrected}.`;
    reasons.push('文末記号を補いました');
  }
  if (/\bi\b/g.test(corrected)) {
    corrected = corrected.replace(/\bi\b/g, 'I');
    reasons.push('一人称の大文字化を補いました');
  }
  if (/\bteh\b/gi.test(corrected)) {
    corrected = corrected.replace(/\bteh\b/gi, 'the');
    reasons.push('基本スペルを補正しました');
  }
  if (corrected.length > 0) {
    corrected = corrected.charAt(0).toUpperCase() + corrected.slice(1);
  }

  return {
    corrected,
    reason: reasons.join(' / ') || '大きな問題は見当たりません',
  };
};

export const buildRubric = (transcript: string, examTitle: string): WritingRubricScore[] => {
  const words = transcript.trim().split(/\s+/).filter(Boolean);
  const sentences = splitSentences(transcript);
  const avgSentenceLength = sentences.length > 0 ? words.length / sentences.length : words.length;
  const hasTransition = /\b(first|second|finally|however|therefore|because|for example)\b/i.test(transcript);
  const grammarIssues = /\bi\b|\bteh\b|[a-z]{1,}\s+[.!?]/.test(transcript);
  const rubricBase: Record<WritingRubricKey, Omit<WritingRubricScore, 'key' | 'label'>> = {
    task: {
      score: clamp(words.length >= 40 ? 4 : 2 + Math.floor(words.length / 20), 1, 5),
      maxScore: 5,
      comment: `${examTitle} の設問に対して、立場や要点は概ね示せています。`,
    },
    organization: {
      score: clamp((sentences.length >= 3 ? 3 : 2) + (hasTransition ? 1 : 0), 1, 5),
      maxScore: 5,
      comment: hasTransition
        ? '接続表現があり、段落の流れを追いやすい構成です。'
        : '文と文のつながりを明示すると読みやすさが上がります。',
    },
    vocabulary: {
      score: clamp(avgSentenceLength >= 8 ? 4 : 3, 1, 5),
      maxScore: 5,
      comment: '使っている語は明確です。具体語を1つ足すと説得力が増します。',
    },
    grammar: {
      score: clamp(grammarIssues ? 3 : 4, 1, 5),
      maxScore: 5,
      comment: grammarIssues
        ? '大きな意味のズレはありませんが、表記や基本文法の見直し余地があります。'
        : '基本文法は比較的安定しています。',
    },
  };

  return (Object.keys(rubricBase) as WritingRubricKey[]).map((key) => ({
    key,
    label: WRITING_RUBRIC_LABELS[key],
    ...rubricBase[key],
  }));
};

export const normalizeSentenceCorrections = (transcript: string): WritingSentenceCorrection[] => (
  splitSentences(transcript)
    .slice(0, 4)
    .map((sentence) => {
      const scored = scoreSentence(sentence);
      return {
        before: sentence,
        after: scored.corrected,
        reason: scored.reason,
      };
    })
);

export const choosePreferredEvaluation = (evaluations: WritingEvaluation[]): WritingEvaluation | null => {
  if (evaluations.length === 0) return null;
  return [...evaluations].sort((left, right) => {
    if (right.selectionScore !== left.selectionScore) return right.selectionScore - left.selectionScore;
    if (right.confidence !== left.confidence) return right.confidence - left.confidence;
    return left.costMilliYen - right.costMilliYen;
  })[0];
};

export const buildPrintableFeedbackHtml = (
  snapshot: WritingPromptSnapshot,
  evaluation: WritingEvaluation,
  reviewComment: string,
  transcript: string,
  studentName: string,
): string => {
  const rubricMarkup = evaluation.rubric.map((item) => `
    <div class="rubric-card">
      <div class="rubric-label">${item.label}</div>
      <div class="rubric-score">${item.score} / ${item.maxScore}</div>
      <div class="rubric-comment">${item.comment}</div>
    </div>
  `).join('');
  const strengthsMarkup = evaluation.strengths.map((item) => `<li>${item}</li>`).join('');
  const improvementMarkup = evaluation.improvementPoints.map((item) => `<li>${item}</li>`).join('');
  const correctionMarkup = evaluation.sentenceCorrections.map((item) => `
    <tr>
      <td>${item.before}</td>
      <td>${item.after}</td>
      <td>${item.reason}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
  <html lang="ja">
    <head>
      <meta charset="UTF-8" />
      <title>${studentName} 添削結果</title>
      <style>
        :root { --ink: #0f172a; --muted: #475569; --line: #dbe4ef; --accent: #f66d0b; --soft: #fff7ed; }
        body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: var(--ink); background: white; }
        .page { width: 210mm; min-height: 297mm; padding: 10mm; box-sizing: border-box; }
        .hero { border: 1px solid var(--line); border-radius: 18px; padding: 16px; background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%); }
        .eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
        .title { margin: 6px 0 0; font-size: 24px; font-weight: 900; }
        .meta { margin-top: 12px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
        .meta-card, .panel, .rubric-card { border: 1px solid var(--line); border-radius: 14px; background: white; }
        .meta-card { padding: 12px; }
        .panel { padding: 14px; margin-top: 14px; }
        .section-title { font-size: 15px; font-weight: 800; margin: 0 0 10px; }
        .rubric-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; }
        .rubric-card { padding: 12px; background: #f8fafc; }
        .rubric-label { font-size: 12px; font-weight: 700; color: var(--muted); }
        .rubric-score { margin-top: 6px; font-size: 18px; font-weight: 900; }
        .rubric-comment { margin-top: 6px; font-size: 12px; line-height: 1.6; color: var(--muted); }
        ul { margin: 0; padding-left: 18px; }
        li { margin-top: 6px; line-height: 1.6; }
        table { width: 100%; border-collapse: collapse; font-size: 12px; }
        th, td { border: 1px solid var(--line); padding: 8px; text-align: left; vertical-align: top; }
        th { background: #f8fafc; }
        .provider-chip { display: inline-flex; border-radius: 999px; padding: 6px 10px; background: var(--soft); color: #9a3412; font-size: 12px; font-weight: 800; }
        .mono { white-space: pre-wrap; font-family: "SFMono-Regular", "Menlo", monospace; line-height: 1.55; }
      </style>
    </head>
    <body>
      <div class="page">
        <section class="hero">
          <div class="eyebrow">Writing Feedback</div>
          <h1 class="title">${studentName} さんの自由英作文返却</h1>
          <div class="meta">
            <div class="meta-card"><div class="eyebrow">課題</div><div>${snapshot.title}</div></div>
            <div class="meta-card"><div class="eyebrow">語数</div><div>${snapshot.wordCountMin} - ${snapshot.wordCountMax} words</div></div>
            <div class="meta-card"><div class="eyebrow">AI</div><div><span class="provider-chip">${WRITING_AI_PROVIDER_LABELS[evaluation.provider]}</span></div></div>
          </div>
        </section>
        <section class="panel">
          <h2 class="section-title">講師コメント</h2>
          <div>${reviewComment}</div>
        </section>
        <section class="panel">
          <h2 class="section-title">設問</h2>
          <div>${snapshot.promptText}</div>
          <div style="margin-top:8px;color:var(--muted);">${snapshot.guidance}</div>
        </section>
        <section class="panel">
          <h2 class="section-title">総合評価 ${evaluation.overallScore} / 20</h2>
          <div class="rubric-grid">${rubricMarkup}</div>
        </section>
        <section class="panel">
          <h2 class="section-title">良かった点</h2>
          <ul>${strengthsMarkup}</ul>
        </section>
        <section class="panel">
          <h2 class="section-title">改善すると伸びる点</h2>
          <ul>${improvementMarkup}</ul>
        </section>
        <section class="panel">
          <h2 class="section-title">文ごとの修正</h2>
          <table>
            <thead><tr><th>原文</th><th>修正版</th><th>理由</th></tr></thead>
            <tbody>${correctionMarkup}</tbody>
          </table>
        </section>
        <section class="panel">
          <h2 class="section-title">訂正文例</h2>
          <div class="mono">${evaluation.correctedDraft}</div>
        </section>
        <section class="panel">
          <h2 class="section-title">模範例</h2>
          <div class="mono">${evaluation.modelAnswer}</div>
        </section>
        <section class="panel">
          <h2 class="section-title">提出文</h2>
          <div class="mono">${transcript}</div>
        </section>
      </div>
    </body>
  </html>`;
};

export {
  appendWritingSideEffectWarning,
  getWritingSideEffectWarningMessage,
} from './writingSideEffects';
