import React from 'react';
import { createPersonalDraftRow, hasPersonalDraftContent, type PersonalDraftRow } from '../../shared/personalWordbookDraft';

interface Props {
  rows: PersonalDraftRow[];
  onChange: (rows: PersonalDraftRow[]) => void;
  disabled: boolean;
  maxRows?: number;
  fieldLimits?: Partial<Record<'word' | 'definition' | 'exampleSentence' | 'exampleMeaning' | 'sourceNote', number>>;
}
const inputClass = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-base text-steady-ink focus:outline-none focus:ring-2 focus:ring-medace-500';
const PersonalWordbookEditor: React.FC<Props> = ({ rows, onChange, disabled, maxRows = 500, fieldLimits = {} }: Props) => {
  const [activeId, setActiveId] = React.useState(rows[0]?.draftId);
  const [undo, setUndo] = React.useState<{ row: PersonalDraftRow; index: number } | null>(null);
  const [page, setPage] = React.useState(0);
  const focusInput = React.useRef<HTMLInputElement>(null);
  const pendingFocus = React.useRef<string | null>(null);
  const activeIndex = Math.max(0, rows.findIndex(row => row.draftId === activeId));
  const row = rows[activeIndex];
  React.useLayoutEffect(() => {
    if (pendingFocus.current === row?.draftId) {
      pendingFocus.current = null;
      focusInput.current?.focus();
    }
  }, [row?.draftId]);
  const count = rows.filter(hasPersonalDraftContent).length;
  const change = (field: keyof PersonalDraftRow, value: string) => {
    if (!disabled) onChange(rows.map(candidate => candidate.draftId === row.draftId ? { ...candidate, [field]: value } : candidate));
  };
  const select = (id: string, selectedRows = rows) => {
    if (id === row?.draftId) focusInput.current?.focus();
    else pendingFocus.current = id;
    setActiveId(id);
    const index = selectedRows.findIndex(candidate => candidate.draftId === id);
    setPage(Math.floor(Math.max(0, index) / 10));
  };
  const add = () => {
    if (disabled || rows.length >= maxRows) return;
    const blank = rows.find(candidate => !hasPersonalDraftContent(candidate));
    const next = blank ?? createPersonalDraftRow();
    if (!blank) onChange([...rows, next]);
    select(next.draftId, blank ? rows : [...rows, next]);
  };
  const remove = (id: string) => {
    if (disabled) return;
    const index = rows.findIndex(candidate => candidate.draftId === id);
    setUndo({ row: rows[index], index });
    const next = rows.filter(candidate => candidate.draftId !== id);
    if (!next.length) next.push(createPersonalDraftRow());
    onChange(next); select(next[Math.min(index, next.length - 1)].draftId, next);
  };
  const restore = () => {
    if (disabled || !undo || rows.length >= maxRows) return;
    const next = rows.filter(hasPersonalDraftContent);
    next.splice(Math.min(undo.index, next.length), 0, undo.row);
    onChange(next); select(undo.row.draftId, next); setUndo(null);
  };
  const stopEnter = (event: React.KeyboardEvent<HTMLInputElement>) => {
    // Native IME confirmation must never add a row or submit the book.
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) event.preventDefault();
  };
  const visiblePage = Math.min(page, Math.max(0, Math.ceil(rows.length / 10) - 1));
  return <div className="min-w-0 space-y-3" data-testid="personal-wordbook-editor">
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="mb-2 text-sm font-bold text-steady-ink">{activeIndex + 1}語目を入力</legend>
      <label className="block text-sm font-bold text-slate-700">単語<input ref={focusInput} id="personal-wordbook-word" lang="en" maxLength={fieldLimits.word} value={row.word} onChange={e => change('word', e.target.value)} onKeyDown={stopEnter} className={inputClass} autoComplete="off" /></label>
      <label className="block text-sm font-bold text-slate-700">意味<textarea id="personal-wordbook-definition" rows={2} maxLength={fieldLimits.definition} value={row.definition} onChange={e => change('definition', e.target.value)} className={inputClass} /></label>
      <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-medace-800">例文・訳・出典（任意）</summary>
        <label className="mt-2 block text-sm font-bold text-slate-700">例文<textarea rows={2} maxLength={fieldLimits.exampleSentence} value={row.exampleSentence ?? ''} onChange={e => change('exampleSentence', e.target.value)} className={inputClass} /></label>
        <label className="mt-2 block text-sm font-bold text-slate-700">例文訳<textarea rows={2} maxLength={fieldLimits.exampleMeaning} value={row.exampleMeaning ?? ''} onChange={e => change('exampleMeaning', e.target.value)} className={inputClass} /></label>
        <label className="mt-2 block text-sm font-bold text-slate-700">出典<input maxLength={fieldLimits.sourceNote} value={row.sourceNote ?? ''} onChange={e => change('sourceNote', e.target.value)} onKeyDown={stopEnter} className={inputClass} /></label>
        {row.partOfSpeech && <p className="mt-2 text-sm text-slate-600">取込済みの品詞: {row.partOfSpeech}</p>}
      </details>
    </fieldset>
    <button type="button" disabled={disabled || rows.length >= maxRows} onClick={add} className="min-h-11 rounded-lg border border-medace-200 px-3 py-2 text-sm font-bold text-medace-800 disabled:opacity-50">次の単語を追加</button>
    <p className="text-sm text-slate-600">入力中も含めて {count} / {maxRows}語</p>
    {rows.length > 1 && <ul className="space-y-2" aria-label="入力した単語">
      {rows.slice(visiblePage * 10, visiblePage * 10 + 10).map((candidate, offset) => <li key={candidate.draftId} className={`flex min-w-0 items-start gap-2 rounded-lg border p-2 ${candidate.draftId === row.draftId ? 'border-medace-300 bg-medace-50' : 'border-slate-200'}`}>
        <button type="button" disabled={disabled} onClick={() => select(candidate.draftId)} aria-label={`${visiblePage * 10 + offset + 1}語目を編集`} className="min-h-11 min-w-0 flex-1 break-words text-left text-sm"><span className="font-bold" lang="en">{candidate.word || '単語未入力'}</span><span className="block whitespace-pre-wrap text-slate-600">{candidate.definition || '意味未入力'}</span></button>
        <button type="button" disabled={disabled} onClick={() => remove(candidate.draftId)} aria-label={`${visiblePage * 10 + offset + 1}語目を削除`} className="min-h-11 shrink-0 rounded-lg px-2 text-sm text-slate-600">削除</button>
      </li>)}
    </ul>}
    {rows.length > 10 && <div className="flex items-center justify-between gap-2 text-sm">
      <button type="button" disabled={disabled || visiblePage === 0} onClick={() => setPage(visiblePage - 1)} className="min-h-11 px-2">前の10語</button>
      <span>{visiblePage + 1} / {Math.ceil(rows.length / 10)}</span>
      <button type="button" disabled={disabled || (visiblePage + 1) * 10 >= rows.length} onClick={() => setPage(visiblePage + 1)} className="min-h-11 px-2">次の10語</button>
    </div>}
    {undo && <button type="button" disabled={disabled || rows.length >= maxRows} onClick={restore} className="min-h-11 text-sm font-bold text-medace-800">削除を取り消す</button>}
  </div>;
};
export default PersonalWordbookEditor;
