import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('learner-facing copy contract', () => {
  it('does not expose internal cost rationale on study screens', () => {
    const studyModeSource = readFileSync(`${process.cwd()}/components/StudyMode.tsx`, 'utf8');

    expect(studyModeSource).not.toContain('コストが高い');
    expect(studyModeSource).toContain('保存済みの画像ヒント');
    expect(studyModeSource).toContain('例文・補足');
    expect(studyModeSource).not.toContain('例文は準備中です。意味で学習を続けられます。');
    expect(studyModeSource).not.toContain('例文を作る');
    expect(studyModeSource).not.toContain('画像を作る');
  });

  it('starts the quiz from setup without routing through the ready confirmation screen', () => {
    const quizModeSource = readFileSync(`${process.cwd()}/components/QuizMode.tsx`, 'utf8');

    expect(quizModeSource).toContain('onAdvanceToReady={() => controller.startQuiz(controller.setupConfig)}');
    expect(quizModeSource).not.toContain('onAdvanceToReady={controller.goToReady}');
  });
});
