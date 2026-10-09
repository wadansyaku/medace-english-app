import React from 'react';
import { BookOpen, Loader2, X } from 'lucide-react';
import type { CatalogImportRequest, CatalogImportResult } from '../../contracts/storage';
import { ApiError } from '../../services/apiClient';
import { PersonalCatalogImportError } from '../../shared/personalCatalogImport';
import { usePersonalWordbookDraft } from '../../hooks/usePersonalWordbookDraft';
import { buildPreparedPersonalCatalogImport, readPreparedCatalogCsvFile } from '../../shared/preparedPersonalCatalog';
import { createPersonalDraftRow, emptyPersonalWordbookDraft, hasPersonalDraftContent, preparePersonalDraftRequest, previewPersonalDraftRequest } from '../../shared/personalWordbookDraft';
import MobileSheetDialog from '../mobile/MobileSheetDialog';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import PersonalWordbookEditor from './PersonalWordbookEditor';

interface PhrasebookCreateModalProps {
  open: boolean;
  ownerUid: string;
  creating: boolean;
  canUseSelectedCreateMode: boolean;
  currentPlanLabel: string;
  onClose: () => void;
  onCreate: (request: CatalogImportRequest) => Promise<CatalogImportResult | undefined>;
  onStartStudy: (bookId: string) => void;
}
const inputClass = 'mt-1 min-h-11 w-full min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-base text-steady-ink outline-none focus:ring-2 focus:ring-medace-500';
const secondaryClass = 'min-h-11 rounded-lg border border-slate-200 px-3 py-2 text-sm font-bold text-slate-700 disabled:opacity-50';

const PhrasebookCreateModal: React.FC<PhrasebookCreateModalProps> = ({ open, ownerUid, creating, canUseSelectedCreateMode, currentPlanLabel, onClose, onCreate, onStartStudy }) => {
  const { draft, updateDraft, persisted, changedElsewhere, syncCurrentRequest } = usePersonalWordbookDraft(ownerUid);
  const [preview, setPreview] = React.useState<CatalogImportRequest | null>(null);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');
  const csvText = draft.csvText ?? '';
  const setCsvText = (value: string) => updateDraft(previous => ({ ...previous, csvText: value }));
  const [busy, setBusy] = React.useState(false);
  const [previewPage, setPreviewPage] = React.useState(0);
  const busyRef = React.useRef(false);
  const readingCsv = React.useRef(false);
  const errorRef = React.useRef<HTMLDivElement>(null);
  const resultRef = React.useRef<HTMLHeadingElement>(null);
  const confirmationRef = React.useRef<HTMLHeadingElement>(null);
  const pending = busy || creating;
  const immutableRequest = draft.pendingRequest ?? preview;
  const frozen = Boolean(draft.pendingRequest);
  const saved = draft.saved;
  const isPending = () => creating || busyRef.current;
  // An external save/new draft supersedes this tab's unsent confirmation.
  React.useEffect(() => { if (!draft.pendingRequest) setPreview(null); }, [draft]);
  React.useEffect(() => {
    if (open && error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: 'nearest' }); }
  }, [open, error]);
  React.useEffect(() => { if (open && saved) resultRef.current?.focus(); }, [open, saved]);
  React.useEffect(() => { if (open && immutableRequest && !frozen && !saved && !error) confirmationRef.current?.focus(); }, [open, immutableRequest, frozen, saved, error]);
  if (!open) return null;
  const close = () => { if (!isPending()) onClose(); };
  const check = () => {
    if (isPending() || !canUseSelectedCreateMode) return;
    setError(''); setMessage('');
    try { setPreviewPage(0); setPreview(preparePersonalDraftRequest(draft)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '入力内容を確認してください。'); }
  };
  const importCsv = async (text: string) => {
    const request = buildPreparedPersonalCatalogImport(draft.title.trim() || '自分の単語帳', text, ownerUid);
    if (request.source.kind !== 'rows') return;
    const existing = draft.rows.filter(hasPersonalDraftContent);
    if (existing.length + request.source.rows.length > 500) throw new Error('入力済みの単語とCSVの合計は500語以内にしてください。');
    updateDraft({ ...draft, csvText: '', rows: [...existing, ...request.source.rows.map(createPersonalDraftRow)] });
    setMessage(`${request.source.rows.length}語を取り込みました。単語を選ぶと編集できます。`);
  };
  const readCsv = async (file: File | undefined) => {
    if (!file || isPending() || frozen) return;
    busyRef.current = true; readingCsv.current = true; setBusy(true); setError('');
    try { await importCsv(await readPreparedCatalogCsvFile(file)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'CSVを読み込めませんでした。入力を保持しています。'); }
    finally { busyRef.current = false; readingCsv.current = false; setBusy(false); }
  };
  const save = async () => {
    if (isPending() || !immutableRequest || !canUseSelectedCreateMode) return;
    busyRef.current = true; setBusy(true); setError('');
    // Persist before sending. Lost replies and reloads retry the same ID/content.
    const request = draft.pendingRequest ?? immutableRequest;
    const acceptedDraft = updateDraft({ ...draft, pendingRequest: request });
    if (JSON.stringify(acceptedDraft.pendingRequest) !== JSON.stringify(request)) {
      setPreview(null); setError('別のタブで保存を確認しています。表示された同じ内容で保存を再確認してください。');
      busyRef.current = false; setBusy(false); return;
    }
    try {
      const result = await onCreate(request);
      if (!result || result.importedBookIds.length !== 1 || result.importedBookCount !== 1 || result.importedWordCount < 1) throw new Error('保存結果を確認できません。同じ内容で保存を再確認してください。');
      updateDraft({ ...emptyPersonalWordbookDraft(ownerUid), saved: { title: request.defaultBookName!, result } }, request.clientImportId);
      setPreview(null);
    } catch (cause) {
      if (!syncCurrentRequest(request.clientImportId)) { setPreview(null); setError(''); return; }
      // A definite server rejection permits correction. An ambiguous failure
      // keeps the immutable request until its receipt can be recovered.
      if ((cause instanceof ApiError || cause instanceof PersonalCatalogImportError) && [400, 401, 403, 409].includes(cause.status)) {
        updateDraft(previous => ({ ...previous, pendingRequest: undefined }), request.clientImportId); setPreview(null);
      }
      setError(cause instanceof Error ? cause.message : '保存を確認できませんでした。入力を保持しています。');
    } finally { busyRef.current = false; setBusy(false); }
  };
  const content = immutableRequest ? previewPersonalDraftRequest(immutableRequest) : null;
  const count = draft.rows.filter(hasPersonalDraftContent).length;
  return <MobileSheetDialog onClose={close} closeOnOverlayClick={!pending} mode="fullscreen" ariaLabelledBy="phrasebook-create-title"
    initialFocusSelector={saved ? '[data-testid="personal-wordbook-start-study"]' : frozen ? '[data-testid="phrasebook-create-submit"]' : '#personal-wordbook-word'}
    panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:max-w-xl sm:rounded-[24px] sm:border sm:border-slate-200 sm:shadow-2xl">
    <div data-testid="phrasebook-create-modal" className="safe-pad-top shrink-0 border-b border-slate-100 px-4 py-3 sm:px-6">
      <div className="flex items-start justify-between gap-3"><div className="min-w-0">
        <h3 id="phrasebook-create-title" className="text-lg font-bold text-steady-ink">My単語帳 作成</h3>
        <p className="mt-1 text-sm text-slate-600">単語と意味を入力して、その単語帳で学べます。</p>
      </div><button type="button" onClick={close} disabled={pending} aria-label="閉じる" className="min-h-11 min-w-11 shrink-0 rounded-lg p-2 text-slate-600 disabled:opacity-50"><X className="h-5 w-5" /></button></div>
    </div>
    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6" data-testid="personal-wordbook-scroll-area">
      {!persisted && <p role="status" className="mb-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">下書きをこのブラウザーに保存できません。入力は画面を開いている間だけ保持します。保存の確認中は再読み込みせず、この画面で再試行してください。</p>}
      {changedElsewhere && <p role="status" className="mb-3 rounded-lg bg-medace-50 p-3 text-sm text-medace-900">別のタブで更新された下書きを表示しています。保存前に内容を確認してください。</p>}
      {error && <div ref={errorRef} tabIndex={-1} role="alert" className="mb-3 break-words rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
      {saved ? <div className="space-y-4" data-testid="personal-wordbook-saved">
        <h4 ref={resultRef} tabIndex={-1} className="text-xl font-bold text-steady-ink outline-none">単語帳を保存しました</h4>
        <p className="break-words font-bold text-slate-800">{saved.title}</p>
        <p className="text-sm text-slate-600">My単語帳に {saved.result.importedWordCount}語を保存しました。</p>
        {saved.result.skippedRowCount > 0 && <p role="status" className="text-sm text-amber-900">重複した {saved.result.skippedRowCount}行を除きました。同じ単語でも意味が違う行は保存しています。</p>}
        {saved.result.warnings.length > 0 && <details><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-700">保存時の確認事項（{saved.result.warnings.length}件）</summary><ul className="list-inside list-disc space-y-2 text-sm text-slate-600">{saved.result.warnings.map((warning, index) => <li key={index}>{warning.rowNumber ? `${warning.rowNumber}行目: ` : ''}{warning.message}</li>)}</ul></details>}
        <button type="button" onClick={() => { updateDraft(emptyPersonalWordbookDraft(ownerUid)); setPreview(null); setError(''); }} className={secondaryClass}>もう1冊作る</button>
      </div> : content ? <div className="space-y-3" data-testid="personal-wordbook-confirmation">
        <h4 ref={confirmationRef} tabIndex={-1} className="text-lg font-bold text-steady-ink outline-none">保存する内容を確認</h4>
        <p className="break-words font-bold text-slate-800">{immutableRequest!.defaultBookName}</p>
        <p className="text-sm text-slate-600">{content.rows.length}語をMy単語帳に保存します。</p>
        {content.duplicateRowNumbers.length > 0 && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{content.duplicateRowNumbers.slice(0, 10).join('、')}行目{content.duplicateRowNumbers.length > 10 ? `ほか${content.duplicateRowNumbers.length - 10}行` : ''}は同じ内容の重複です。{content.duplicateRowNumbers.length}行を除いて保存します。同じ単語でも意味が違う行は残します。</p>}
        <ol className="space-y-2" start={previewPage * 10 + 1}>{content.rows.slice(previewPage * 10, previewPage * 10 + 10).map((row, index) => <li key={previewPage * 10 + index} className="min-w-0 whitespace-pre-wrap break-words rounded-lg border border-slate-200 p-3 text-sm"><strong lang="en">{row.word}</strong><p className="mt-1">{row.definition}</p>{row.exampleSentence && <p lang="en" className="mt-2 text-slate-600">{row.exampleSentence}</p>}{row.exampleMeaning && <p className="mt-1 text-slate-600">{row.exampleMeaning}</p>}{row.sourceNote && <p className="mt-1 text-slate-600">出典: {row.sourceNote}</p>}</li>)}</ol>
        {content.rows.length > 10 && <div className="flex items-center justify-between gap-2 text-sm"><button type="button" disabled={pending || previewPage === 0} onClick={() => setPreviewPage(previous => previous - 1)} className={secondaryClass}>前の10語</button><span>{previewPage + 1} / {Math.ceil(content.rows.length / 10)}</span><button type="button" disabled={pending || (previewPage + 1) * 10 >= content.rows.length} onClick={() => setPreviewPage(previous => previous + 1)} className={secondaryClass}>次の10語</button></div>}
        {frozen ? <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">保存をまだ確認できていません。「保存を再確認」で同じ内容を再送します。重複作成を避けるため、確認が終わるまで編集を保持しています。</p>
          : <button type="button" disabled={pending} onClick={() => { setPreview(null); requestAnimationFrame(() => document.getElementById('personal-wordbook-word')?.focus()); }} className={secondaryClass}>入力へ戻る</button>}
      </div> : <div className="min-w-0 space-y-4">
        <label className="block text-sm font-bold text-slate-700">単語帳名（変更は任意）<input id="phrasebook-create-book-title" value={draft.title} maxLength={120} readOnly={pending} onChange={event => { if (!isPending()) updateDraft({ ...draft, title: event.target.value }); }} className={inputClass} /></label>
        <PersonalWordbookEditor rows={draft.rows} disabled={pending} onChange={rows => { if (!isPending()) updateDraft({ ...draft, rows }); }} />
        <details className="rounded-lg border border-slate-200 p-3"><summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-slate-700">CSVから取り込む</summary>
          <p className="mb-3 text-xs leading-relaxed text-slate-600">UTF-8・1MB以内・合計500語まで。先頭行はWord,Meaning。任意の例文と訳はExampleSentence,ExampleMeaning。取り込んでから編集できます。</p>
          <label className="block text-sm font-bold text-slate-700">CSVファイル<input type="file" id="phrasebook-create-file-upload" accept=".csv,text/csv" disabled={pending} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void readCsv(file); }} className="mt-2 block min-h-11 w-full min-w-0 text-sm" /></label>
          <label className="mt-3 block text-sm font-bold text-slate-700">CSVを貼り付ける<textarea id="phrasebook-create-source-text" rows={3} value={csvText} readOnly={pending} onChange={event => { if (!isPending()) setCsvText(event.target.value); }} placeholder={'Word,Meaning\napple,りんご'} className={inputClass} /></label>
          <button type="button" disabled={pending || !csvText.trim()} onClick={() => { if (isPending()) return; setError(''); void importCsv(csvText).catch(cause => setError(cause instanceof Error ? cause.message : 'CSVを確認してください。')); }} className={`${secondaryClass} mt-2`}>CSVを入力欄へ取り込む</button>
        </details>
        {message && <p role="status" className="text-sm text-medace-900">{message}</p>}
        <p className="text-xs leading-relaxed text-slate-600">{persisted ? '下書きはこのブラウザーに、このアカウント用として最大7日間保存します。' : 'このブラウザーに下書きを保存できません。画面を開いている間は入力を保持します。再読み込みすると失われます。'} 作成した単語帳はログイン後のMy単語帳で使えます。</p>
      </div>}
      {!canUseSelectedCreateMode && <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{currentPlanLabel}ではMy単語帳の作成を使えません。</p>}
      {pending && <p role="status" className="mt-3 text-sm text-slate-600">{readingCsv.current ? 'CSVを読み込んでいます…' : '保存を確認しています…'}</p>}
    </div>
    <MobileStickyActionBar className="safe-pad-bottom shrink-0 border-t border-slate-100 bg-white px-4 py-3 sm:px-6">
      <div className="flex items-center gap-2">
        <button type="button" disabled={pending} onClick={close} className={`${secondaryClass} shrink-0`}>{saved ? '一覧へ' : '閉じる'}</button>
        {saved ? <button type="button" data-testid="personal-wordbook-start-study" onClick={() => { close(); onStartStudy(saved.result.importedBookIds[0]); }} className="min-h-11 min-w-0 flex-1 rounded-lg bg-steady-action px-3 py-3 text-sm font-bold text-steady-on-action">この単語帳で学ぶ</button>
          : <button type="button" data-testid="phrasebook-create-submit" onClick={() => { if (immutableRequest) void save(); else check(); }} disabled={pending || !canUseSelectedCreateMode || (!immutableRequest && count === 0)} className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-steady-action px-3 py-3 text-sm font-bold text-steady-on-action disabled:bg-slate-300">
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <BookOpen className="h-4 w-4" />}{pending ? '確認中…' : frozen ? '保存を再確認' : immutableRequest ? 'この内容で保存' : '内容を確認'}
          </button>}
      </div>
    </MobileStickyActionBar>
  </MobileSheetDialog>;
};
export default PhrasebookCreateModal;
