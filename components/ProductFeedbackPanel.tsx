import React, { useEffect, useRef, useState } from 'react';
import type { ProductFeedbackAction, ProductFeedbackInput, ProductFeedbackList, ProductFeedbackPriority, ProductFeedbackReport, ProductFeedbackRequest } from '../contracts/productFeedback';
import { PRODUCT_FEEDBACK_FAQ, PRODUCT_FEEDBACK_STATUS_LABELS, exportFeedback, findFeedbackFaq, validateFeedbackInput } from '../shared/productFeedback';
import { getProductFeedback, listProductFeedback, saveProductFeedback } from '../services/productFeedback';
import ModalOverlay from './ModalOverlay';

const labels: Record<keyof ProductFeedbackInput, string> = { title: '件名', version: '試した版', screen: '画面・操作の場所', steps: '再現する手順', expected: '期待する動作', actual: '実際の動作', impact: '困ったこと・影響' };
const emptyDraft = (): ProductFeedbackInput => ({ title: '', version: '', screen: '', steps: '', expected: '', actual: '', impact: '' });
const button = 'min-h-11 rounded-xl border border-orange-200 bg-white px-4 py-2 text-sm font-bold text-[#2F1609] disabled:opacity-50';
const field = 'mt-1 w-full min-w-0 rounded-xl border border-orange-200 bg-white p-3 text-base text-[#2F1609]';
const errorText = (error: unknown) => error instanceof Error ? error.message : '通信を確認してもう一度お試しください。';

const ProductFeedbackPanel: React.FC<{ open: boolean; onClose: () => void }> = ({ open, onClose }) => {
  const [data, setData] = useState<ProductFeedbackList | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [draft, setDraft] = useState(emptyDraft);
  const [privacy, setPrivacy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const focusDraftAfterOpen = useRef(false);
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const focusSaveNotice = useRef(false);
  const [saveError, setSaveError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const requests = useRef(new Set<AbortController>());
  const loadSequence = useRef(0);
  const listControllers = useRef(new Set<AbortController>());
  const pending = useRef(false);
  const retry = useRef<Extract<ProductFeedbackRequest, { action: 'create' | 'advance' }> | null>(null);
  const draftTitle = useRef<HTMLInputElement>(null);
  const versionEdited = useRef(false);
  const load = async (append = false) => {
    const sequence = ++loadSequence.current;
    const controller = new AbortController(); requests.current.add(controller); listControllers.current.add(controller);
    setLoading(true); setLoadError('');
    try {
      const result = await listProductFeedback(append ? data?.nextCursor || undefined : undefined, controller.signal);
      if (active.current && sequence === loadSequence.current) {
        setData(previous => {
          const reports = result.reports.map(incoming => {
            const cached = previous?.reports.find(item => item.id === incoming.id);
            return cached && (cached.revision > incoming.revision || (cached.revision === incoming.revision && cached.historyLoaded)) ? cached : incoming;
          });
          return { ...result, reports: append ? [...(previous?.reports || []), ...reports.filter(item => !previous?.reports.some(existing => existing.id === item.id))] : reports };
        });
        if (result.deploymentRevision && !retry.current && !versionEdited.current) setDraft(previous => previous.version.trim() ? previous : { ...previous, version: result.deploymentRevision! });
      }
    } catch (error) { if (active.current && sequence === loadSequence.current) setLoadError(errorText(error)); }
    finally { requests.current.delete(controller); listControllers.current.delete(controller); if (active.current && sequence === loadSequence.current) setLoading(false); }
  };
  useEffect(() => { active.current = true; return () => { active.current = false; requests.current.forEach(controller => controller.abort()); requests.current.clear(); }; }, []);
  useEffect(() => {
    if (open && !pending.current) void load();
    if (!open) {
      ++loadSequence.current;
      listControllers.current.forEach(controller => controller.abort()); listControllers.current.clear();
      setPrivacy(false);
    }
  }, [open]);
  const mutate = async (request: Extract<ProductFeedbackRequest, { action: 'create' | 'advance' }>) => {
    if (pending.current) return;
    const controller = new AbortController(); requests.current.add(controller);
    ++loadSequence.current; setLoading(false);
    pending.current = true; retry.current = request; setBusy(true); setSaveError(''); setNotice('');
    try {
      const report = await saveProductFeedback(request, controller.signal);
      if (!active.current) return;
      retry.current = null;
      if (!data) void load();
      setData(previous => {
        if (!previous) return previous;
        const existing = previous.reports.find(item => item.id === report.id);
        const latest = existing && existing.revision > report.revision ? existing : report;
        return { ...previous, reports: [latest, ...previous.reports.filter(item => item.id !== report.id)] };
      });
      focusSaveNotice.current = true;
      setNotice(request.action === 'create' ? 'サーバーへの報告保存を確認しました。下の一覧で対応状況を確認できます。' : 'この操作のサーバー保存を確認しました。一覧では取得済みの新しい状態を優先して表示します。');
      if (request.action === 'create') { setFormOpen(false); versionEdited.current = false; setDraft({ ...emptyDraft(), version: data?.deploymentRevision || '' }); setPrivacy(false); }
    } catch (error) {
      if (!active.current) return;
      if ((error as { status?: number }).status === 409) {
        retry.current = null; setSaveError('別の更新がありました。一覧を再取得しています。入力は保持しました。最新の状態を確認して、操作を再検討してください。'); void load();
      } else setSaveError(`${errorText(error)} 入力は保持しています。同じ内容で再試行できます。`);
    } finally { requests.current.delete(controller); pending.current = false; if (active.current) setBusy(false); }
  };
  const create = (event: React.FormEvent) => {
    event.preventDefault();
    if (!privacy || pending.current || retry.current) return;
    try { void mutate({ action: 'create', id: crypto.randomUUID(), input: validateFeedbackInput(draft), privacyConfirmed: true }); }
    catch (error) { setSaveError(errorText(error)); }
  };
  useEffect(() => {
    if (open && formOpen && focusDraftAfterOpen.current) { focusDraftAfterOpen.current = false; draftTitle.current?.focus(); }
  }, [open, formOpen]);
  useEffect(() => {
    if (open && notice && focusSaveNotice.current && noticeRef.current) {
      focusSaveNotice.current = false;
      noticeRef.current.focus({ preventScroll: true });
      noticeRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [notice, open]);
  const faq = asked === null ? undefined : findFeedbackFaq(asked);
  if (!open) return null;
  return <ModalOverlay onClose={onClose} ariaLabel="FAQ・製品の報告" mobileBehavior="fullscreen" panelClassName="overflow-y-auto bg-[#FDF3ED] p-4 sm:p-6 text-[#2F1609]" initialFocusSelector="[data-feedback-close]">
    <div className="sticky top-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-b border-orange-100 bg-[#FDF3ED] px-4 py-3 sm:-mx-6 sm:px-6"><h2 className="text-xl font-black">FAQ・製品の報告</h2><button className={button} data-feedback-close onClick={onClose}>戻る・閉じる</button></div>
    <p className="mt-3 text-sm leading-6">学習方法を確認し、困った操作を匿名で報告できます。報告は本人とサービス管理者が確認します。</p>
    <details className="mt-5 rounded-2xl bg-white p-4"><summary className="cursor-pointer font-bold">学習・報告のよくある質問</summary>
      <form data-testid="feedback-faq-search" className="mt-3 flex flex-wrap gap-2" onSubmit={event => { event.preventDefault(); setAsked(question); }}><label className="min-w-0 flex-1">質問を検索<input aria-label="質問を検索" className={field} required value={question} maxLength={200} onChange={event => setQuestion(event.target.value)} /></label><button className={button} type="submit">回答を確認</button></form>
      {asked !== null && <div role="status" className="mt-3 break-words text-sm leading-6">{faq ? faq.answer : <>この質問の答えは、確認できていません。推測で回答せず、報告の下書きに引き継げます。<button className={`${button} mt-2 block`} disabled={busy || !!retry.current} onClick={() => { setDraft(previous => ({ ...previous, title: asked.slice(0, 200) })); setPrivacy(false); if (formOpen) draftTitle.current?.focus(); else { focusDraftAfterOpen.current = true; setFormOpen(true); } }}>質問を報告の下書きへ</button></>}</div>}
      <div className="mt-4 space-y-2">{PRODUCT_FEEDBACK_FAQ.map(item => <details key={item.id} className="rounded-xl border border-orange-100 p-3"><summary className="cursor-pointer font-bold">{item.question}</summary><p className="mt-2 break-words text-sm leading-6">{item.answer}</p><p className="mt-2 text-xs">確認日: {item.checkedAt}</p></details>)}</div>
    </details>
    <section className="mt-5 rounded-2xl bg-white p-4"><button type="button" className={button} aria-expanded={formOpen} aria-controls="product-feedback-form-fields" onClick={() => setFormOpen(previous => !previous)}>{formOpen ? '報告の入力を閉じる' : '報告を入力する'}</button><div id="product-feedback-form-fields" hidden={!formOpen}><p className="mt-2 text-sm leading-6">生徒の氏名・連絡先・答案は含めないでください。添付はできません。「匿名の生徒でログインして○○を開く」のように操作だけを記録してください。試した版が不明なら「不明」と入力できます。</p>
      <form data-testid="product-feedback-create" className="mt-4 space-y-3" onSubmit={create}>{(Object.keys(labels) as (keyof ProductFeedbackInput)[]).map(key => <label className="block text-sm font-bold" key={key}>{labels[key]}{['title','version','screen'].includes(key) ? <input aria-label={labels[key]} ref={key === 'title' ? draftTitle : undefined} className={field} required maxLength={200} disabled={busy || !!retry.current} value={draft[key]} onChange={event => { if (key === 'version') versionEdited.current = true; setDraft(previous => ({ ...previous, [key]: event.target.value })); }} /> : <textarea aria-label={labels[key]} className={field} required rows={3} maxLength={2000} disabled={busy || !!retry.current} value={draft[key]} onChange={event => { if (key === 'version') versionEdited.current = true; setDraft(previous => ({ ...previous, [key]: event.target.value })); }} />}</label>)}
        <label className="flex items-start gap-3 text-sm leading-6"><input aria-label="生徒の氏名・連絡先・答案を含めず、匿名の手順にしたことを確認しました。" type="checkbox" className="mt-1 h-5 w-5 shrink-0" checked={privacy} disabled={busy || !!retry.current} onChange={event => setPrivacy(event.target.checked)} />生徒の氏名・連絡先・答案を含めず、匿名の手順にしたことを確認しました。</label>
        <button type="submit" className={`${button} bg-[#F66D0B]`} disabled={!privacy || busy || !!retry.current}>{busy ? '保存中…' : '報告をサーバーに保存'}</button>
      </form>
      </div>
    </section>
    {notice && <p ref={noticeRef} tabIndex={-1} role="status" className="mt-4 scroll-mt-24 rounded-xl bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
    {saveError && <div role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-900"><p>{saveError}</p>{retry.current && <div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={busy} onClick={() => retry.current && void mutate(retry.current)}>同じ内容で再試行</button></div>}</div>}
    <section className="mt-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{data?.canManage ? 'すべての製品報告' : '自分の製品報告'}</h3><button className={button} disabled={loading || busy} onClick={() => void load()}>一覧を更新</button></div>
      {loading && <p role="status" className="mt-3">報告を取得しています…{data && ' 一覧は前回取得した内容です。取得完了後に対応できます。'}</p>}{loadError && <p role="alert" className="mt-3 text-red-800">取得できませんでした: {loadError} {data ? '前回取得した一覧を表示しています。' : '件数はまだ確認できていません。'}</p>}
      {data && !loading && !data.reports.length && <p className="mt-3">保存された報告はありません。「報告を入力する」から報告できます。</p>}
      <div className="mt-3 space-y-3">{data?.reports.map(report => <FeedbackReport key={report.id} report={report} canManage={data.canManage} onDetail={updated => setData(previous => previous ? { ...previous, reports: previous.reports.map(existing => existing.id === updated.id && updated.revision >= existing.revision ? updated : existing) } : previous)} busy={busy || loading || !!retry.current} onChange={change => void mutate({ action: 'advance', id: report.id, expectedRevision: report.revision, mutationId: crypto.randomUUID(), change })} />)}</div>
      {data?.nextCursor && <button className={`${button} mt-4`} disabled={loading || busy} onClick={() => void load(true)}>次の報告を読み込む</button>}
    </section>
  </ModalOverlay>;
};

const FeedbackReport: React.FC<{ report: ProductFeedbackReport; canManage: boolean; busy: boolean; onDetail: (report: ProductFeedbackReport) => void; onChange: (action: ProductFeedbackAction) => void }> = ({ report, canManage, busy, onDetail, onChange }) => {
  const [priority, setPriority] = useState<ProductFeedbackPriority>(report.priority || 'P2');
  const [acceptance, setAcceptance] = useState(report.acceptance || '');
  const [revision, setRevision] = useState('');
  const [note, setNote] = useState('');
  const [copyNotice, setCopyNotice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [detailRetry, setDetailRetry] = useState(0);
  const onDetailRef = useRef(onDetail);
  onDetailRef.current = onDetail;
  useEffect(() => {
    if (!expanded || report.historyLoaded) { setDetailLoading(false); return; }
    const controller = new AbortController();
    let current = true;
    setDetailLoading(true); setDetailError('');
    void getProductFeedback(report.id, controller.signal).then(result => {
      if (current) onDetailRef.current(result);
    }).catch(error => { if (current) setDetailError(errorText(error)); })
      .finally(() => { if (current) setDetailLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [expanded, report.id, report.revision, report.historyLoaded, detailRetry]);
  const download = () => { if (!report.historyLoaded) return; const url = URL.createObjectURL(new Blob([exportFeedback(report)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = `product-feedback-${report.id}.json`; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); setCopyNotice('ダウンロード用ファイルを用意しました。保存先をブラウザで確認し、内容を確認して手動で渡してください。外部へ送信していません。'); };
  return <article data-testid="product-feedback-report" className="min-w-0 rounded-2xl border border-orange-200 bg-white p-4 [overflow-wrap:anywhere]">
    <h4 className="font-bold">{report.title}</h4><p className="mt-1 text-sm">{PRODUCT_FEEDBACK_STATUS_LABELS[report.status]} · 更新 {new Date(report.updatedAt).toLocaleString('ja-JP')} · 版 {report.version}</p>
    {report.priority && <p className="mt-2 text-sm">優先度: {report.priority}</p>}{report.fixRevision && <p className="mt-2 text-sm">再テスト対象版: {report.fixRevision}</p>}
    <p className="mt-2 text-sm leading-6">{report.status === 'NEW' ? 'サービス管理者が内容を確認します。' : report.status === 'TRIAGED' ? '次はサービス管理者が手動引継ぎを準備します。' : report.status === 'HANDOFF_PREPARED' ? '次は管理者が修正版を記録します。準備済みは送信・受領を示しません。' : report.status === 'FIXED' ? '次は対象版で再テストし、条件と結果を記録します。' : report.status === 'RETEST_FAIL' ? '次は管理者が修正を再記録し、もう一度再テストします。' : '再テスト成功が記録されています。'}</p>
    <details className="mt-3" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary className="cursor-pointer text-sm font-bold">内容と次の操作・履歴を確認</summary><div className="mt-3 text-sm">{report.acceptance && <p>受入条件: {report.acceptance}</p>}</div><dl className="mt-3 space-y-2 text-sm">{(Object.keys(labels) as (keyof ProductFeedbackInput)[]).map(key => <div key={key}><dt className="font-bold">{labels[key]}</dt><dd className="whitespace-pre-wrap">{report[key]}</dd></div>)}</dl><div className="mt-3 text-sm">{!report.historyLoaded && <p role="status">{detailLoading ? '対応履歴を取得しています…' : '対応履歴はまだ取得していません。'}</p>}{detailError && <div role="alert"><p>対応履歴を取得できませんでした: {detailError}</p><button className={`${button} mt-2`} disabled={detailLoading} onClick={() => setDetailRetry(value => value + 1)}>履歴をもう一度取得</button></div>}</div><ol className="mt-4 space-y-2 text-sm">{report.historyLoaded && report.history.map(item => <li key={item.revision} className="border-l-2 border-orange-200 pl-3"><p>{PRODUCT_FEEDBACK_STATUS_LABELS[item.status]} · {new Date(item.at).toLocaleString('ja-JP')}</p><p className="whitespace-pre-wrap">{item.note}</p></li>)}</ol>
    {canManage && ['NEW', 'TRIAGED'].includes(report.status) && <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); onChange({ type: 'triage', priority, acceptance }); }}><label className="block text-sm">優先度<select aria-label="優先度" className={field} disabled={busy} value={priority} onChange={event => setPriority(event.target.value as ProductFeedbackPriority)}>{['P0','P1','P2','P3'].map(value => <option key={value}>{value}</option>)}</select></label><label className="block text-sm">受入条件<textarea aria-label="受入条件" className={field} required maxLength={2000} rows={3} disabled={busy} value={acceptance} onChange={event => setAcceptance(event.target.value)} /></label><button className={button} disabled={busy}>優先度・受入条件を保存</button></form>}
    {canManage && report.status === 'TRIAGED' && <button className={`${button} mt-3`} disabled={busy} onClick={() => onChange({ type: 'prepare-handoff' })}>手動引継ぎを準備</button>}
    {canManage && ['HANDOFF_PREPARED','FIXED','RETEST_FAIL','RETEST_PASS'].includes(report.status) && <div className="mt-3"><p className="text-sm leading-6">内容を確認して手動で渡すためのJSONです。準備済みは送信・受領を示しません。</p>{!report.historyLoaded && <button className={`${button} mt-2`} disabled={detailLoading} onClick={() => { setExpanded(true); setDetailRetry(value => value + 1); }}>完全な履歴を取得して引継ぎを準備</button>}<div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={!report.historyLoaded} onClick={download}>引継ぎJSONを保存</button><button className={button} disabled={!report.historyLoaded} onClick={() => { if (!report.historyLoaded) return; void navigator.clipboard.writeText(exportFeedback(report)).then(() => setCopyNotice('JSONをコピーしました。外部へ送信していません。')).catch(() => setCopyNotice('コピーできませんでした。JSON保存をお使いください。')); }}>引継ぎJSONをコピー</button></div>{copyNotice && <p role="status" className="mt-2 text-sm">{copyNotice}</p>}</div>}
    {canManage && ['HANDOFF_PREPARED','RETEST_FAIL'].includes(report.status) && <form className="mt-4 space-y-3" onSubmit={event => { event.preventDefault(); onChange({ type: 'record-fix', revision, note }); }}><label className="block text-sm">修正版・コミット<input aria-label="修正版・コミット" className={field} required maxLength={200} disabled={busy} value={revision} onChange={event => setRevision(event.target.value)} /></label><label className="block text-sm">修正内容<textarea aria-label="修正内容" className={field} required maxLength={2000} disabled={busy} value={note} onChange={event => setNote(event.target.value)} /></label><button className={button} disabled={busy}>修正版を記録して再テストへ</button></form>}
    {report.status === 'FIXED' && (canManage || report.isOwnReport) && <div className="mt-4"><label className="block text-sm">再テストした条件と結果<textarea aria-label="再テストした条件と結果" className={field} maxLength={2000} rows={3} disabled={busy} value={note} onChange={event => setNote(event.target.value)} /></label><p className="mt-2 text-sm">対象版で手順を再現し、受入条件を満たすか確認してください。</p><div className="mt-2 flex flex-wrap gap-2"><button className={button} disabled={busy || !note.trim()} onClick={() => onChange({ type: 'retest', passed: true, note })}>再テスト成功を記録</button><button className={button} disabled={busy || !note.trim()} onClick={() => onChange({ type: 'retest', passed: false, note })}>再テスト失敗を記録</button></div></div>}
    </details>
  </article>;
};
export default ProductFeedbackPanel;
