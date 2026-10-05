import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EnglishLevel, type GrammarCurriculumScopeId } from '../../types';
import { ORIGINAL_GRAMMAR_QUESTIONS } from '../../config/grammarQuestionBank';
import { GRAMMAR_CURRICULUM_SCOPES } from '../../config/grammarCurriculum';
import { buildReadingPracticePassages, READING_LEVEL_LABELS, scoreReadingAnswer } from '../../utils/readingPractice';
import { countEssayWords, getEikenWritingTasks, getEikenWritingLevelLabel, getEikenWritingTaskTypeLabel } from '../../utils/eikenWritingPractice';

export type GuestLanguagePracticeMode = 'translation' | 'reading' | 'writing';
const controlClass = 'min-h-11 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700';
const actionClass = 'min-h-12 w-full rounded-xl bg-steady-action px-4 py-3 text-sm font-bold text-steady-on-action hover:bg-steady-action-hover disabled:opacity-50';
const textareaClass = 'mt-2 block w-full min-w-0 rounded-xl border border-slate-300 px-3 py-2 text-base';

const TranslationPractice: React.FC = () => {
  const [scope, setScope] = useState<GrammarCurriculumScopeId | ''>('');
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const title = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const questions = useMemo(() => ORIGINAL_GRAMMAR_QUESTIONS.filter(question => !scope || question.scopeId === scope).slice(0, 10), [scope]);
  const question = questions[index];
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [index, scope]);
  useEffect(() => { if (revealed) feedback.current?.focus({ preventScroll: true }); }, [revealed]);
  const reset = () => { setIndex(0); setDraft(''); setRevealed(false); setChecked([]); };
  return <div className="mt-5" data-testid="guest-translation-practice">
    <p className="text-sm leading-relaxed text-slate-600">独自の例文を訳して参考訳と比べます。表現には複数の正解があるため、自動採点は行いません。回答は今回の画面内だけに残ります。</p>
    <label className="mt-4 block text-sm font-bold text-slate-700">和訳の分野<select value={scope} onChange={event => { setScope(event.target.value as GrammarCurriculumScopeId | ''); reset(); }} className={`${controlClass} mt-1 block w-full max-w-full`}>
      <option value="">全分野から最大10文</option>{GRAMMAR_CURRICULUM_SCOPES.map(item => <option key={item.id} value={item.id}>{item.labelJa}</option>)}
    </select></label>
    {question ? <form className="mt-5" onSubmit={event => { event.preventDefault(); if (!draft.trim() || revealed) return; setRevealed(true); setChecked(previous => [...new Set([...previous, question.id])]); }}>
      <p className="text-xs font-bold text-slate-500">{index + 1} / {questions.length}文</p>
      <h2 ref={title} tabIndex={-1} className="mt-3 break-words text-xl font-black leading-relaxed text-steady-ink outline-none" lang="en">{question.sourceSentence}</h2>
      <label className="mt-4 block text-sm font-bold text-slate-700">自分の日本語訳<textarea value={draft} onChange={event => setDraft(event.target.value)} disabled={revealed} maxLength={2000} rows={3} className={textareaClass} /></label>
      {revealed ? <>
        <div ref={feedback} tabIndex={-1} role="status" className="mt-4 break-words rounded-xl border border-medace-200 bg-medace-50 p-4 text-sm leading-relaxed text-medace-950 outline-none">
          <p className="font-black">参考訳と自分の訳を比べてみましょう</p><p className="mt-2">{question.translationJa}</p><p className="mt-3">{question.explanationJa}</p>
          <p className="mt-3 text-xs">語句の違いだけで正解・不正解は決まりません。主語・動詞と意味のつながりを確認してください。</p>
        </div>
        <button type="button" onClick={() => { setIndex(index + 1); setDraft(''); setRevealed(false); }} className={`${actionClass} mt-4`}>{index + 1 === questions.length ? '今回の確認を終える' : '次の英文へ'}</button>
        <button type="button" onClick={() => setRevealed(false)} className={`${controlClass} mt-3`}>この英文を訳し直す</button>
      </> : <button type="submit" disabled={!draft.trim()} className={`${actionClass} mt-4`}>参考訳を確認する</button>}
    </form> : <div className="mt-5" role="status"><h2 ref={title} tabIndex={-1} className="text-xl font-black text-steady-ink outline-none">今回の和訳を確認しました</h2><p className="mt-2 text-sm text-slate-600">{checked.length}文の参考訳を確認しました。結果は画面内のみです。</p><button type="button" onClick={reset} className={`${actionClass} mt-4`}>もう一度取り組む</button></div>}
  </div>;
};

const ReadingPractice: React.FC = () => {
  const [level, setLevel] = useState(EnglishLevel.A2);
  const [round, setRound] = useState(0);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState('');
  const [answers, setAnswers] = useState<{ id: string; response: string; correct: boolean }[]>([]);
  const title = useRef<HTMLHeadingElement>(null);
  const feedback = useRef<HTMLDivElement>(null);
  const answerLock = useRef(false);
  const passages = useMemo(() => buildReadingPracticePassages({ level, maxPassages: 1, seed: `guest:${round}` }), [level, round]);
  const passage = passages[0];
  const question = passage?.questions[index];
  const result = answers.find(answer => answer.id === question?.id);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, [index, level, round]);
  useEffect(() => { if (result) feedback.current?.focus({ preventScroll: true }); }, [result]);
  const reset = () => { answerLock.current = false; setIndex(0); setSelected(''); setAnswers([]); };
  return <div className="mt-5" data-testid="guest-reading-practice">
    <p className="text-sm leading-relaxed text-slate-600">固定の英文と問題を使って、本文の根拠を確認します。回答と結果は今回の画面内のみです。</p>
    <label className="mt-4 block text-sm font-bold text-slate-700">読解のレベル<select value={level} onChange={event => { setLevel(event.target.value as EnglishLevel); reset(); }} className={`${controlClass} mt-1 block w-full max-w-full`}>{Object.values(EnglishLevel).map(value => <option key={value} value={value}>{READING_LEVEL_LABELS[value]}</option>)}</select></label>
    {question && passage ? <form className="mt-5" onSubmit={event => {
      event.preventDefault(); if (!selected || result || answerLock.current) return;
      answerLock.current = true;
      const scored = scoreReadingAnswer(question, selected);
      setAnswers(previous => [...previous, { id: question.id, response: selected, correct: scored.correct }]);
    }}>
      <p className="text-xs font-bold text-slate-500">{index + 1} / {passage.questions.length}問 · {passage.titleJa}</p>
      <details open className="mt-3 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold text-medace-800">英文を読む</summary><h3 className="mt-3 break-words font-bold" lang="en">{passage.titleEn}</h3><p className="mt-3 whitespace-pre-line break-words text-base leading-relaxed text-slate-800" lang="en">{passage.passageEn}</p></details>
      <h2 ref={title} tabIndex={-1} className="mt-5 break-words text-lg font-black leading-relaxed text-steady-ink outline-none">{question.promptJa}</h2>
      <div className="mt-3 grid gap-2">{question.options.map(option => <button key={option.id} type="button" disabled={Boolean(result)} aria-pressed={selected === option.id} onClick={() => setSelected(option.id)} className={`min-h-12 break-words rounded-xl border px-3 py-3 text-left text-sm font-bold disabled:opacity-100 ${selected === option.id ? 'border-medace-500 bg-medace-50 text-medace-950' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}>{option.textJa}</button>)}</div>
      {result ? <>
        <div ref={feedback} tabIndex={-1} role="status" className="mt-4 break-words rounded-xl border border-medace-200 bg-medace-50 p-4 text-sm leading-relaxed text-medace-950 outline-none"><p className="font-black">{result.correct ? '正解です' : `正解は「${question.options.find(option => option.id === question.correctOptionId)?.textJa}」です`}</p><p className="mt-3 font-bold">根拠の英文</p><p className="mt-1" lang="en">{question.evidenceSentence}</p><p className="mt-3">{question.explanationJa}</p></div>
        <button type="button" onClick={() => { answerLock.current = false; setIndex(index + 1); setSelected(''); }} className={`${actionClass} mt-4`}>{index + 1 === passage.questions.length ? '今回の結果を見る' : '次の設問へ'}</button>
      </> : <button type="submit" disabled={!selected} className={`${actionClass} mt-4`}>答えを確認する</button>}
    </form> : <div className="mt-5" role="status"><h2 ref={title} tabIndex={-1} className="text-xl font-black text-steady-ink outline-none">{passage ? '今回の読解結果' : 'このレベルの問題はありません'}</h2>{passage && <p className="mt-3 font-bold text-medace-900">{answers.filter(answer => answer.correct).length} / {answers.length}問 正解</p>}<button type="button" onClick={() => { reset(); setRound(value => value + 1); }} className={`${actionClass} mt-4`}>もう一度取り組む</button></div>}
  </div>;
};

const WritingPractice: React.FC = () => {
  const tasks = useMemo(() => getEikenWritingTasks(), []);
  const [taskId, setTaskId] = useState(tasks[0]?.id ?? '');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<Record<string, boolean[]>>({});
  const task = tasks.find(item => item.id === taskId);
  const draft = drafts[taskId] ?? '';
  const words = countEssayWords(draft);
  if (!task) return <p role="status">英作文の課題がありません。</p>;
  return <div className="mt-5" data-testid="guest-writing-practice">
    <p className="text-sm leading-relaxed text-slate-600">独自の課題で英作文の下書きを書けます。語数と確認項目は自己チェック用です。採点・添削・提出は行いません。下書きはこの練習を開いている間だけ残り、練習の種類を変えると消えます。</p>
    <label className="mt-4 block text-sm font-bold text-slate-700">英作文の課題<select value={taskId} onChange={event => setTaskId(event.target.value)} className={`${controlClass} mt-1 block w-full max-w-full`}>{tasks.map(item => <option key={item.id} value={item.id}>{getEikenWritingLevelLabel(item.level)} · {getEikenWritingTaskTypeLabel(item.taskType)} · {item.titleJa}</option>)}</select></label>
    <h2 className="mt-5 break-words text-lg font-black text-steady-ink">{task.titleJa}</h2><p className="mt-3 break-words text-sm leading-relaxed text-slate-700">{task.promptJa}</p><p className="mt-3 break-words text-base leading-relaxed text-slate-800" lang="en">{task.promptEn}</p>
    {task.sourcePassageEn && <div className="mt-4 rounded-xl border border-slate-200 p-3"><h3 className="text-sm font-bold text-slate-700">要約する英文</h3><p className="mt-2 whitespace-pre-line break-words text-base leading-relaxed text-slate-800" lang="en">{task.sourcePassageEn}</p></div>}
    <label className="mt-5 block text-sm font-bold text-slate-700">自分の英文<textarea value={draft} onChange={event => setDrafts(previous => ({ ...previous, [taskId]: event.target.value }))} maxLength={10000} rows={8} spellCheck autoCapitalize="sentences" lang="en" className={textareaClass} /></label>
    <p className="mt-2 text-sm font-bold text-medace-900" aria-live="polite">現在{words}語 · 目安{task.wordRange.min}〜{task.wordRange.max}語</p><p className="mt-2 text-xs leading-relaxed text-slate-500">語数は目安です。公式試験の採点や合否を示しません。</p>
    <fieldset className="mt-5"><legend className="text-sm font-bold text-slate-700">自分で確認する</legend>{task.checklist.map((text, index) => <label key={text} className="mt-2 flex min-h-11 items-start gap-3 rounded-xl border border-slate-200 p-3 text-sm leading-relaxed text-slate-700"><input type="checkbox" checked={checks[taskId]?.[index] ?? false} onChange={event => setChecks(previous => { const next = [...(previous[taskId] ?? [])]; next[index] = event.target.checked; return { ...previous, [taskId]: next }; })} className="mt-1 h-4 w-4 shrink-0" /><span>{text}</span></label>)}</fieldset>
  </div>;
};

const GuestLanguagePractice: React.FC<{ mode: GuestLanguagePracticeMode }> = ({ mode }) => mode === 'translation' ? <TranslationPractice /> : mode === 'reading' ? <ReadingPractice /> : <WritingPractice />;
export default GuestLanguagePractice;
