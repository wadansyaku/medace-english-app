import WordExamBadge from '../WordExamBadge';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { EnglishLevel, type GrammarCurriculumScopeId, type WordData } from '../../types';
import { GRAMMAR_CURRICULUM_SCOPES } from '../../config/grammarCurriculum';
import { buildCuratedGrammarPracticeItems } from '../../utils/grammarQuestionBank';
import { buildGrammarScopeExplanation } from '../../utils/grammarScope';
import type { GrammarClozePracticeItem } from '../../utils/grammarPractice';
import { buildGuestMeaningQuestions, isGuestSpellingCorrect } from '../../shared/guestPractice';
import { useWordPronunciation } from '../../hooks/useWordPronunciation';
import WordPronunciationControls from '../study/WordPronunciationControls';
import GuestLanguagePractice, { type GuestLanguagePracticeMode } from './GuestLanguagePractice';

export interface GuestPracticeProps { words: WordData[]; onBack: () => void }
type Mode = 'meaning' | 'spelling' | 'grammar' | GuestLanguagePracticeMode;
interface Answer { id: string; response: string; correct: boolean }
const actionClass = 'min-h-12 w-full rounded-xl bg-steady-action px-4 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50';
const controlClass = 'min-h-11 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700';

const GuestPractice: React.FC<GuestPracticeProps> = ({ words, onBack }) => {
  const [mode, setMode] = useState<Mode>('meaning');
  const [scopeId, setScopeId] = useState<GrammarCurriculumScopeId | ''>('');
  const [count, setCount] = useState(10);
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState('');
  const [answers, setAnswers] = useState<Answer[]>([]);
  const heading = useRef<HTMLHeadingElement>(null);
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const answerWord = useRef<HTMLElement | null>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const answerLock = useRef(false);
  const nextLock = useRef(false);
  const meaningQuestions = useMemo(() => buildGuestMeaningQuestions(words), [words]);
  const wordQuestions = meaningQuestions.slice(0, count);
  const grammarQuestions = useMemo(() => buildCuratedGrammarPracticeItems({
    mode: 'GRAMMAR_CLOZE', userLevel: EnglishLevel.C1, questionCount: count,
    scopeIds: scopeId ? [scopeId] : undefined, seed: `guest-practice:${round}`,
  }).filter((item): item is GrammarClozePracticeItem => item.kind === 'GRAMMAR_CLOZE'), [scopeId, count, round]);
  const total = mode === 'grammar' ? grammarQuestions.length : wordQuestions.length;
  const grammar = mode === 'grammar' ? grammarQuestions[index] : undefined;
  const wordQuestion = mode !== 'grammar' ? wordQuestions[index] : undefined;
  const questionId = grammar?.id ?? wordQuestion?.id;
  const currentAnswer = answers.find(answer => answer.id === questionId);
  const correctResponse = grammar?.answer ?? (mode === 'spelling' ? wordQuestion?.word.word : wordQuestion?.answer) ?? '';
  const choices = grammar?.options ?? wordQuestion?.choices ?? [];
  const explanation = grammar ? buildGrammarScopeExplanation(grammar.grammarScope) : undefined;
  const complete = total > 0 && index >= total;
  const isWordPractice = mode === 'meaning' || mode === 'spelling';
  const pronunciation = useWordPronunciation({
    presentationKey: isWordPractice && wordQuestion ? `guest-practice:${round}:${mode}:${index}:${wordQuestion.word.bookId}:${wordQuestion.id}` : null,
    text: isWordPractice && (mode === 'meaning' || currentAnswer) ? wordQuestion?.word.word : undefined,
    visible: isWordPractice && Boolean(wordQuestion) && !complete && (mode === 'meaning' || Boolean(currentAnswer)),
    rate: 1,
    targetRef: mode === 'meaning' ? questionHeading : answerWord,
  });

  useEffect(() => { (questionHeading.current ?? heading.current)?.focus({ preventScroll: true }); }, [index, mode, scopeId, count, round]);
  useEffect(() => { if (currentAnswer) feedback.current?.focus({ preventScroll: true }); }, [currentAnswer]);
  useEffect(() => { nextLock.current = false; }, [index]);

  const restart = () => {
    answerLock.current = false;
    setIndex(0); setResponse(''); setAnswers([]); setRound(value => value + 1);
  };
  const confirm = (event: React.FormEvent) => {
    event.preventDefault();
    if (!questionId || currentAnswer || answerLock.current || !response.trim()) return;
    answerLock.current = true;
    const correct = mode === 'spelling'
      ? meaningQuestions.some(question => question.answer === wordQuestion?.answer && isGuestSpellingCorrect(response, question.word.word))
      : response === correctResponse;
    setAnswers(previous => [...previous, { id: questionId, response, correct }]);
  };
  const next = () => {
    if (!currentAnswer || nextLock.current) return;
    nextLock.current = true; answerLock.current = false; setResponse(''); setIndex(value => value + 1);
  };

  return <section className="mx-auto w-full min-w-0 max-w-2xl py-3 sm:py-6" data-testid="guest-practice-screen">
    <button type="button" onClick={onBack} className="mb-3 inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-bold text-medace-800 hover:bg-medace-50">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> ゲストホームへ戻る
    </button>
    <div className="rounded-panel border border-medace-200 bg-white p-4 sm:p-7">
      <h1 ref={heading} tabIndex={-1} className="text-2xl font-black text-steady-ink outline-none">クイズ・英語練習</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">回答と結果は今回の画面内だけに残ります。クラウドの学習記録や復習予定には保存されません。</p>
      <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="練習の種類">
        {([['meaning', '意味クイズ'], ['spelling', 'スペル'], ['grammar', '文法'], ['translation', '和訳'], ['reading', '読解'], ['writing', '英作文']] as const).map(([key, label]) => <button
          key={key} type="button" aria-pressed={mode === key} onClick={() => { setMode(key); restart(); }}
          className={`${controlClass} px-2 ${mode === key ? 'border-medace-500 bg-medace-50 text-medace-950' : 'hover:bg-slate-50'}`}>{label}</button>)}
      </div>
      {mode === 'translation' || mode === 'reading' || mode === 'writing' ? <GuestLanguagePractice key={mode} mode={mode} /> : <>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {mode === 'grammar' && <label className="min-w-0 flex-1 text-sm font-bold text-slate-700">文法の分野
          <select value={scopeId} onChange={event => { setScopeId(event.target.value as GrammarCurriculumScopeId | ''); restart(); }} className={`${controlClass} mt-1 block w-full max-w-full`}>
            <option value="">全分野から</option>
            {GRAMMAR_CURRICULUM_SCOPES.map(scope => <option key={scope.id} value={scope.id}>{scope.labelJa} ({scope.levelMin}〜{scope.levelMax})</option>)}
          </select>
        </label>}
        <label className="text-sm font-bold text-slate-700">問題数
          <select value={count} onChange={event => { setCount(Number(event.target.value)); restart(); }} className={`${controlClass} mt-1 block`}>
            {[5, 10, 20].map(value => <option key={value} value={value}>最大{value}問</option>)}
          </select>
        </label>
      </div>
      {mode === 'grammar' && <p className="mt-3 text-xs leading-relaxed text-slate-500">独自64問の問題集から出題します。分野によって実際の問題数は少なくなります。レベル診断ではありません。</p>}
      {!total ? <p role="status" className="mt-6 text-sm leading-relaxed text-slate-700">この練習に使える単語がありません。単語帳を選ぶか、文法練習に切り替えてください。</p>
        : complete ? <div className="mt-6" data-testid="guest-practice-result">
          <h2 ref={questionHeading} tabIndex={-1} className="text-xl font-black text-steady-ink outline-none">今回の練習結果</h2>
          <p className="mt-3 text-2xl font-black text-medace-900">{answers.filter(answer => answer.correct).length} / {answers.length}問 正解</p>
          <p className="mt-2 text-sm text-slate-600">この画面を閉じると結果は消えます。</p>
          <button type="button" onClick={restart} className={`${actionClass} mt-5`}>もう一度練習する</button>
        </div> : <form onSubmit={confirm} className="mt-6" data-testid="guest-practice-question">
          <p className="text-xs font-bold text-slate-500">{index + 1} / {total}問{grammar ? ` · ${grammar.grammarScope.labelJa}` : ''}</p>
          {grammar ? <>
            <p className="mt-3 text-sm leading-relaxed text-slate-700">{grammar.prompt}</p>
            <h2 ref={questionHeading} tabIndex={-1} aria-label={`${index + 1}問目。${grammar.clozeSentence}`} className="mt-3 break-words text-xl font-black leading-relaxed text-steady-ink outline-none" lang="en">{grammar.clozeSentence}</h2>
          </> : <>
            <h2 ref={questionHeading} tabIndex={-1} aria-label={`${index + 1}問目。${mode === 'spelling' ? wordQuestion?.answer : wordQuestion?.word.word}`} className="mt-3 break-words text-3xl font-black leading-relaxed text-steady-ink outline-none" lang={mode === 'meaning' ? 'en' : 'ja'}>{mode === 'spelling' ? wordQuestion?.answer : wordQuestion?.word.word}</h2>
            {mode === 'meaning' && <div className="mt-2"><WordExamBadge word={wordQuestion?.word} /></div>}
            <p className="mt-3 text-sm font-bold text-slate-700">{mode === 'spelling' ? 'この意味の英単語を入力してください' : '意味を選んでください'}</p>
            {mode === 'meaning' && <WordPronunciationControls pronunciation={pronunciation} className="mt-3" />}
          </>}
          {mode === 'spelling' ? <label className="mt-4 block text-sm font-bold text-slate-700">英単語
            <input value={response} onChange={event => setResponse(event.target.value)} disabled={Boolean(currentAnswer)} maxLength={120} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
              className="mt-2 min-h-12 w-full rounded-xl border border-slate-300 px-3 py-2 text-base font-medium" />
            <span className="mt-2 block text-xs font-normal text-slate-500">大文字・小文字と前後の空白は区別しません。</span>
          </label> : <>
            {choices.length < 4 && <p className="mt-3 text-xs text-slate-500">この単語帳にある異なる意味から、{choices.length}択で出題します。</p>}
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {choices.map(choice => <button key={choice} type="button" data-testid="guest-practice-choice" disabled={Boolean(currentAnswer)} aria-pressed={response === choice}
                onClick={() => setResponse(choice)} className={`min-h-12 break-words rounded-xl border px-4 py-3 text-left text-sm font-bold disabled:opacity-100 ${response === choice ? 'border-medace-500 bg-medace-50 text-medace-950' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>
                {choice}
              </button>)}
            </div>
          </>}
          {currentAnswer ? <>
            <div ref={feedback} tabIndex={-1} role="status" className="mt-4 break-words rounded-xl border border-medace-200 bg-medace-50 p-4 text-sm leading-relaxed text-medace-950 outline-none" data-testid="guest-practice-feedback">
              <p className="font-black">{currentAnswer.correct ? '正解です' : `正解は「${correctResponse}」です`}</p>
              {grammar ? <>
                <p className="mt-2" lang="en">{grammar.sourceSentence}</p>
                <p className="mt-2">{grammar.feedback?.translationJa}</p>
                <p className="mt-2">{grammar.feedback?.explanationJa}</p>
                {!currentAnswer.correct && <p className="mt-2">{grammar.feedback?.distractorReasons[currentAnswer.response]}</p>}
              </> : <>
                <p className="mt-2"><strong ref={answerWord} lang="en">{wordQuestion?.word.word}</strong> — {wordQuestion?.answer}</p>
                {mode === 'spelling' && <WordPronunciationControls pronunciation={pronunciation} className="mt-3" />}
                <div className="mt-2"><WordExamBadge word={wordQuestion?.word} /></div>
                {wordQuestion?.word.exampleSentence && <p className="mt-2" lang="en">{wordQuestion.word.exampleSentence}</p>}
                {wordQuestion?.word.exampleMeaning && <p className="mt-2">{wordQuestion.word.exampleMeaning}</p>}
              </>}
            </div>
            <button type="button" onClick={next} className={`${actionClass} mt-4 inline-flex items-center justify-center gap-2`}>
              {index + 1 === total ? '今回の結果を見る' : '次の問題へ'} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </> : <button type="submit" disabled={!response.trim()} className={`${actionClass} mt-4`}>答えを確認する</button>}
          {explanation && <details className="mt-5 rounded-xl border border-slate-200 p-3">
            <summary className="min-h-8 cursor-pointer text-sm font-bold text-medace-800">{explanation.labelJa}の基本を読む</summary>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
              <p><strong>文の形</strong><br />{explanation.patternJa}</p>
              <p><strong>確認すること</strong><br />{explanation.examFocusJa}</p>
              <p><strong>よくある間違い</strong><br />{explanation.commonMistakeJa}</p>
              <p><strong>練習方法</strong><br />{explanation.automationDrillJa}</p>
              {explanation.threeSlotFrameJa && <p>{explanation.threeSlotFrameJa}</p>}
            </div>
          </details>}
        </form>}
      </>}
    </div>
  </section>;
};

export default GuestPractice;
