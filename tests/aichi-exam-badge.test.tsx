import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import QuizRunningView from '../components/quiz/QuizRunningView';
import type { WordData } from '../types';
import GuestPractice from '../components/guest/GuestPractice';
import WordExamBadge from '../components/WordExamBadge';
import QuizResultView from '../components/quiz/QuizResultView';
import StudyFinishedView from '../components/study/StudyFinishedView';
import type { GeneratedWorksheetQuestion } from '../utils/worksheet';

const noop = () => {};

const baseQuestion: GeneratedWorksheetQuestion = {
  id: 'question-1',
  mode: 'GRAMMAR_CLOZE',
  interactionType: 'CHOICE',
  wordId: 'word-1',
  bookId: 'book-1',
  promptLabel: '時を表す副詞句',
  promptText: 'Doctors ____ the patient before surgery.',
  answer: 'stabilize',
  options: ['stabilize', 'monitor', 'triage'],
  sourceSentence: 'Doctors stabilize the patient before surgery.',
  grammarFocus: '時を表す副詞句',
};

const renderQuiz = (overrides: Partial<React.ComponentProps<typeof QuizRunningView>> = {}) => renderToStaticMarkup(
  <QuizRunningView
    currentQuestion={baseQuestion}
    currentModeLabel="文法穴埋め"
    activeSummary="復習"
    currentQIndex={0}
    questionsLength={3}
    score={0}
    isHintMode={false}
    showSpellingHint={false}
    showOptions={false}
    selectedOption={null}
    orderedTokenIds={[]}
    orderFeedback={null}
    answerInput=""
    inputResult={null}
    spellingFeedbackTone={null}
    spellingFeedbackMessage={null}
    translationFeedback={null}
    checkingTranslationFeedback={false}
    translationAwaitingAdvance={false}
    persistingAttempt={false}
    saveError={null}
    hasPendingAttempt={false}
    onShowOptions={noop}
    onChangeAnswerInput={noop}
    onHintSubmit={(event) => event.preventDefault()}
    onRevealSpellingHint={noop}
    onOptionClick={noop}
    onOrderTokenSelect={noop}
    onOrderTokenRemove={noop}
    onOrderTokenMove={noop}
    onOrderTokensClear={noop}
    onOrderSubmit={noop}
    onRetrySave={noop}
    onAdvanceAfterTranslationFeedback={noop}
    {...overrides}
  />,
);

const word: WordData = { id: 'word-1', bookId: 'book-1', number: 1, word: 'care', definition: '注意', aichiExamAppeared: true };
const badgeText = '愛知県高校入試 出題済み';

describe('verified Aichi exam word badge', () => {
  it('renders a readable noninteractive Japanese label with wrapping for narrow screens', () => {
    const html = renderToStaticMarkup(<WordExamBadge word={word} />);
    expect(html).toContain(badgeText);
    expect(html).toContain('lang="ja"');
    expect(html).toContain('max-w-full');
    expect(html).toContain('whitespace-normal');
    expect(html).toContain('text-xs');
    expect(html).toContain('bg-medace-50');
    expect(html).toContain('text-medace-900');
    expect(html).not.toMatch(/button|tabindex|role="button"/);
  });

  it.each([false, undefined])('renders nothing when the verified mark is %s', mark => {
    expect(renderToStaticMarkup(<WordExamBadge word={{ aichiExamAppeared: mark }} />)).toBe('');
  });

  it.each([true, false])('renders verified words in the finished review on mobile=%s', isMobileViewport => {
    const html = renderToStaticMarkup(<StudyFinishedView isMobileViewport={isMobileViewport} leveledUp={false} sessionWordCount={2} earnedXP={10} streakBonusXP={0} nextReviewMessage="復習" weaknessSummary="意味" reviewPreview={[word, { ...word, id: 'unmarked', word: 'book', aichiExamAppeared: false }]} onStartSpellingCheck={noop} onExit={noop} />);
    expect(html.match(/data-testid="aichi-exam-badge"/g)).toHaveLength(1);
    expect(html).toContain('data-testid="study-review-word" class="min-w-0 flex-1 basis-full sm:basis-0"><div class="break-words font-bold text-slate-900">care</div><span data-testid="aichi-exam-badge"');
    expect(html).toContain('</span></div><span class="shrink-0 rounded-full bg-amber-50');
    expect(html).toContain('book</div>');
  });

  it.each(['EN_TO_JA', 'JA_TO_EN', 'SPELLING_HINT'] as const)('shows verified source word metadata in %s questions without leaking the headword answer', mode => {
    const html = renderQuiz({ currentWord: word, currentQuestion: { ...baseQuestion, mode, promptText: mode === 'EN_TO_JA' ? 'care' : '注意', answer: mode === 'EN_TO_JA' ? '注意' : 'care', options: undefined } });
    expect(html).toContain(badgeText);
    if (mode !== 'EN_TO_JA') expect(html).not.toContain('>care<');
    expect(renderQuiz({ currentWord: { ...word, aichiExamAppeared: false }, currentQuestion: { ...baseQuestion, mode } })).not.toContain(badgeText);
  });

  it('shows the verified mark alongside the actual guest meaning question and omits missing marks', () => {
    const words = [word, { ...word, id: 'word-2', word: 'book', definition: '本', aichiExamAppeared: undefined }];
    expect(renderToStaticMarkup(<GuestPractice words={words} onBack={noop} />)).toContain(badgeText);
    expect(renderToStaticMarkup(<GuestPractice words={words.map(w => ({ ...w, aichiExamAppeared: undefined }))} onBack={noop} />)).not.toContain(badgeText);
  });

  it('keeps a result badge below its prompt in the same full-width mobile container, apart from the timing pill', () => {
    const question = { ...baseQuestion, mode: 'EN_TO_JA' as const, promptText: 'care', answer: '注意' };
    const html = renderToStaticMarkup(<QuizResultView words={[word]} percentage={0} currentModeLabel="意味" activeSummary="1問" score={0} questionsLength={1} reviewTargets={[question]} translationFeedbackSummaries={[]} nextReviewCopy="復習" onRetry={noop} onReset={noop} onBack={noop} />);
    expect(html).toContain('data-testid="quiz-review-word" class="min-w-0 flex-1 basis-full sm:basis-0"><div class="break-words font-bold text-slate-900">care</div><span data-testid="aichi-exam-badge"');
    expect(html).toContain('</span></div><span class="shrink-0 rounded-full bg-amber-50');
  });

  it('does not call an entire grammar sentence an exam word', () => {
    expect(renderQuiz({ currentWord: word })).not.toContain(badgeText);
  });
});
