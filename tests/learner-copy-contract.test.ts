import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('learner-facing copy contract', () => {
  it('does not expose internal cost rationale on study screens', () => {
    const studyModeSource = readFileSync(`${process.cwd()}/components/StudyMode.tsx`, 'utf8');

    expect(studyModeSource).not.toContain('コストが高い');
    expect(studyModeSource).toContain('イメージで覚えたい単語だけ');
  });

  it('starts the quiz from setup without routing through the ready confirmation screen', () => {
    const quizModeSource = readFileSync(`${process.cwd()}/components/QuizMode.tsx`, 'utf8');

    expect(quizModeSource).toContain('onAdvanceToReady={() => controller.startQuiz(controller.setupConfig)}');
    expect(quizModeSource).not.toContain('onAdvanceToReady={controller.goToReady}');
  });
});
