import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import ReadingPracticeView from '../components/practice/ReadingPracticeView';
import { EnglishLevel } from '../types';
import {
  buildReadingPracticePassages,
  getReadingQuestionKindLabel,
  scoreReadingAnswer,
  summarizeReadingPracticeSession,
} from '../utils/readingPractice';

describe('reading practice helpers', () => {
  it('builds level-specific deterministic seed passages with all required question kinds', () => {
    const passages = buildReadingPracticePassages({ level: EnglishLevel.B2, seed: 'unit' });

    expect(passages).toHaveLength(1);
    expect(passages[0]).toMatchObject({
      id: 'seed-b2-evidence-reading',
      level: EnglishLevel.B2,
      source: 'DETERMINISTIC_SEED',
      titleJa: '根拠を結ぶ読解',
    });
    expect(passages[0].generator).toMatchObject({
      source: 'DETERMINISTIC_SEED',
      version: 'reading-seed-2026-05-11-v1',
      seed: 'unit',
    });
    expect(passages[0].estimatedWords).toBeGreaterThan(30);
    expect(passages[0].questions.map((question) => question.kind)).toEqual([
      'CONTENT_MATCH',
      'REFERENCE_OR_MAIN_IDEA',
      'VOCAB_INFERENCE',
      'GRAMMAR_STRUCTURE',
    ]);
    expect(passages[0].questions.every((question) => question.evidenceSentence && question.explanationJa)).toBe(true);
  });

  it('keeps generated passages stable for the same seed and shuffles option order by seed', () => {
    const first = buildReadingPracticePassages({ level: EnglishLevel.A2, seed: 'same' });
    const second = buildReadingPracticePassages({ level: EnglishLevel.A2, seed: 'same' });
    const third = buildReadingPracticePassages({ level: EnglishLevel.A2, seed: 'different' });

    expect(first).toEqual(second);
    expect(first[0].questions[0].options).not.toEqual(third[0].questions[0].options);
    expect(new Set(first[0].questions[0].options.map((option) => option.id))).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(first[0].questions[0].options.map((option) => option.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(first[0].questions[0].options.find((option) => option.id === first[0].questions[0].correctOptionId)?.textJa)
      .toBe('番号を渡し、窓の近くに座るよう頼む');
  });

  it('scores answers with evidence and Japanese explanation for reveal-after-answer UI', () => {
    const [passage] = buildReadingPracticePassages({ level: EnglishLevel.A1, seed: 'score' });
    const question = passage.questions[0];

    const correct = scoreReadingAnswer(question, question.correctOptionId);
    const incorrect = scoreReadingAnswer(question, 'd');

    expect(correct).toMatchObject({
      questionId: question.id,
      kind: 'CONTENT_MATCH',
      selectedOptionId: question.correctOptionId,
      correct: true,
      evidenceSentence: 'After English club, she writes three new words and one short example.',
    });
    expect(correct.explanationJa).toContain('three new words');
    expect(incorrect.correct).toBe(false);
    expect(incorrect.correctOptionId).toBe(question.correctOptionId);
  });

  it('summarizes accuracy and weak question kinds across a reading session', () => {
    const passages = buildReadingPracticePassages({ level: EnglishLevel.B1, seed: 'summary' });
    const [passage] = passages;
    const wrongMainIdeaOptionId = passage.questions[1].options.find(
      (option) => option.id !== passage.questions[1].correctOptionId,
    )?.id;
    const results = [
      scoreReadingAnswer(passage.questions[0], passage.questions[0].correctOptionId),
      scoreReadingAnswer(passage.questions[1], wrongMainIdeaOptionId),
    ];

    expect(summarizeReadingPracticeSession(passages, results)).toMatchObject({
      passageCount: 1,
      total: 4,
      answered: 2,
      correct: 1,
      accuracy: 25,
      weakQuestionKinds: ['REFERENCE_OR_MAIN_IDEA'],
    });
  });

  it('provides Japanese labels for question kinds', () => {
    expect(getReadingQuestionKindLabel('CONTENT_MATCH')).toBe('内容一致');
    expect(getReadingQuestionKindLabel('GRAMMAR_STRUCTURE')).toBe('文法構造');
  });
});

describe('ReadingPracticeView', () => {
  it('renders the empty state without requiring existing app routes', () => {
    const rendered = renderToStaticMarkup(<ReadingPracticeView passages={[]} />);

    expect(rendered).toContain('長文読解の問題がありません');
    expect(rendered).toContain('Reading Practice');
  });

  it('renders a Japanese orange-toned reading practice surface and keeps explanations hidden before scoring', () => {
    const passages = buildReadingPracticePassages({ level: EnglishLevel.A2, seed: 'view' });
    const rendered = renderToStaticMarkup(<ReadingPracticeView passages={passages} />);

    expect(rendered).toContain('短い英文を読んで根拠まで確認');
    expect(rendered).toContain('A2 基礎読解');
    expect(rendered).toContain('土曜のクリニック');
    expect(rendered).toContain('内容一致');
    expect(rendered).toContain('判定する');
    expect(rendered).toContain('bg-medace-50');
    expect(rendered).not.toContain('正解:');
    expect(rendered).not.toContain('patients arrive の後に');
  });
});
