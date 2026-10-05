import React, { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  createWritingAiBudgetLoader,
  getWritingAiBudget,
  type WritingAiBudgetAuditRow,
  type WritingAiBudgetLoadState,
  type WritingAiBudgetResponse,
} from '../../services/writingAiBudget';

const currentUtcMonth = () => new Date().toISOString().slice(0, 7);
const formatUsd = (microUsd: number | null): string => {
  if (microUsd === null || !Number.isSafeInteger(microUsd) || microUsd < 0) return '数値を確認できません';
  const exact = BigInt(microUsd);
  const dollars = new Intl.NumberFormat('en-US').format(Number(exact / 1_000_000n));
  const cents = (exact % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '').padEnd(2, '0');
  return `$${dollars}.${cents}`;
};
const countLabel = (count: number | null) => count === null ? '未確認' : count.toLocaleString('ja-JP');
const outcomes: Record<WritingAiBudgetAuditRow['outcome'], string> = {
  RESERVED: '予約の記録', COMPLETED: '計測済み', REFUSAL: '応答拒否', INVALID_OUTPUT: '出力を確認できません',
  INCOMPLETE: '応答が未完了', TIMEOUT: '応答待ち期限超過', PROVIDER_FAILED: '接続先の処理失敗',
  UNKNOWN_USAGE: '費用未確認', INVALID_USAGE: 'usageを確認できません', COST_ONLY: '費用のみ記録',
};

const AmountCard = ({ label, amount, detail }: { label: string; amount: number | null; detail: string }) => (
  <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4">
    <dt className="text-sm font-bold text-slate-700">{label}</dt>
    <dd className="mt-2 break-words text-2xl font-black tabular-nums text-steady-ink">{formatUsd(amount)}</dd>
    <p className="mt-2 text-xs leading-relaxed text-slate-600">{detail}</p>
  </div>
);

export const AdminAiUsageSummary = ({ data }: { data: WritingAiBudgetResponse }) => {
  const { snapshot, audit } = data;
  const noMeasuredUsage = snapshot.settledRequests === 0;
  return <div className="space-y-5" data-testid="admin-ai-usage-ready">
    <section aria-label="AI設定と当月の状態" className="rounded-2xl border border-slate-200 bg-white p-4">
      <p data-testid="admin-ai-usage-configured" className="font-bold text-steady-ink">{data.configured ? 'AIの利用設定あり' : 'AIは未有効です'}</p>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{data.configured
        ? '設定があっても、承認条件と残り枠を満たさない処理は送信されません。'
        : '初期状態ではAIを実行しません。過去の利用記録がある場合は、その記録を表示します。'}</p>
      {noMeasuredUsage && <p data-testid="admin-ai-usage-no-measurement" className="mt-3 text-sm text-slate-700">この月の計測済み費用の記録はありません。費用未確認の予約は別に確認してください。</p>}
      {(snapshot.blocked || snapshot.precisionExceeded) && <p role="status" data-testid="admin-ai-usage-blocked" className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-800">新規dispatchを停止しています。{snapshot.precisionExceeded ? '合計額の数値精度を確認する必要があります。' : '予約上限を超えた費用などを確認する必要があります。'}</p>}
    </section>
    <section aria-label="当月のアプリ内予算" className="space-y-3">
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <AmountCard label="response usage由来の推定費用" amount={snapshot.measuredUsageMicroUsd} detail="計測済みの処理費用です。providerの請求確定額ではありません。" />
        <AmountCard label="費用未確認の予約保持額" amount={snapshot.reservedHoldMicroUsd} detail="応答待ち・失敗・usage未確認の処理は、予約上限の全額を保持します。" />
        <AmountCard label="推定費用と予約の合算" amount={snapshot.accountedMicroUsd} detail="このアプリの当月全体で新規送信の可否を判定する金額です。" />
        <AmountCard label="新規dispatchの残り枠" amount={snapshot.remainingDispatchMicroUsd} detail={snapshot.blocked || snapshot.precisionExceeded ? '表示額が残っていても、停止中は新規送信しません。' : 'この枠だけでは、provider全体の請求上限を保証できません。'} />
      </dl>
      <p className="text-sm leading-relaxed text-slate-600">未確認の予約 <strong>{countLabel(snapshot.unresolvedReservations)}件</strong> ／ 計測済み <strong>{countLabel(snapshot.settledRequests)}件</strong></p>
      <dl className="grid grid-cols-1 gap-3 rounded-2xl border border-medace-100 bg-medace-50 p-4 sm:grid-cols-3">
        {([
          ['月の計画上限候補', snapshot.planLimitMicroUsd],
          ['アプリのdispatch枠', snapshot.dispatchLimitMicroUsd],
          ['安全余白', snapshot.safetyMarginMicroUsd],
        ] as const).map(([label, amount]) => <div key={label} className="min-w-0"><dt className="text-xs font-bold text-slate-700">{label}</dt><dd className="mt-1 font-bold tabular-nums text-steady-ink">{formatUsd(amount)}</dd></div>)}
      </dl>
      {snapshot.precisionExceeded && <details className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><summary className="min-h-11 cursor-pointer py-2 font-bold">精度超過した合計の原値（micro USD）</summary><dl className="space-y-2 break-all">
        <div><dt>合算</dt><dd>{snapshot.accountedMicroUsdExact}</dd></div>
        <div><dt>推定費用</dt><dd>{snapshot.measuredUsageMicroUsdExact}</dd></div>
        <div><dt>予約保持</dt><dd>{snapshot.reservedHoldMicroUsdExact}</dd></div>
      </dl></details>}
    </section>
    <section aria-label="費用監査の記録" className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="font-bold text-steady-ink">費用監査の記録</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">本文・画像・氏名は表示しません。監査イベントの金額はその時点の記録で、上の当月合計とは別です。</p>
      {audit.rows.length === 0 ? <p data-testid="admin-ai-audit-empty" className="mt-4 text-sm text-slate-600">この月の監査記録はありません。</p> : <ul className="mt-4 space-y-3">
        {audit.rows.map(row => <li key={row.sequence} className="min-w-0 rounded-xl border border-slate-200 p-3" data-testid="admin-ai-audit-row">
          <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold text-slate-800">#{row.sequence} {outcomes[row.outcome] || '処理結果を確認中'}</p><time className="text-xs text-slate-600" dateTime={new Date(row.created_at).toISOString()}>{new Date(row.created_at).toLocaleString('ja-JP', { timeZone: 'UTC' })} UTC</time></div>
          <p className="mt-2 break-all text-xs text-slate-600">{[row.operation, row.provider, row.model].filter(Boolean).join(' ／ ') || '処理情報は未確認'}</p>
          <p className="mt-2 text-sm text-slate-700">推定費用: <strong>{row.charged_micro_usd === null ? '未確認' : formatUsd(row.charged_micro_usd)}</strong> ／ 予約時の上限: <strong>{formatUsd(row.upper_bound_micro_usd)}</strong></p>
          <details className="mt-2 text-xs text-slate-600"><summary className="min-h-11 cursor-pointer py-3 font-bold">token数・応答識別子を確認</summary><dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div><dt>入力token</dt><dd>{countLabel(row.input_tokens)}</dd></div><div><dt>うちcached token</dt><dd>{countLabel(row.cached_input_tokens)}</dd></div>
            <div><dt>出力token</dt><dd>{countLabel(row.output_tokens)}</dd></div><div><dt>合計token</dt><dd>{countLabel(row.total_tokens)}</dd></div>
            <div className="min-w-0 sm:col-span-2"><dt>provider response ID</dt><dd className="break-all">{row.provider_response_id || '未確認'}</dd></div>
          </dl></details>
        </li>)}
      </ul>}
      {audit.nextAfterSequence !== null && <p className="mt-4 text-xs leading-relaxed text-slate-600">監査記録は一部を表示しています。表示したイベントの金額を足しても、当月全体の費用にはなりません。</p>}
    </section>
  </div>;
};

interface Props {
  initialMonth?: string;
  readBudget?: (monthKey: string) => Promise<WritingAiBudgetResponse>;
}

const AdminAiUsageView: React.FC<Props> = ({ initialMonth, readBudget = getWritingAiBudget }) => {
  const [monthKey, setMonthKey] = useState<string>(() => initialMonth || currentUtcMonth());
  const [state, setState] = useState<WritingAiBudgetLoadState>({ status: 'loading', monthKey });
  const loader = useRef<ReturnType<typeof createWritingAiBudgetLoader> | null>(null);
  if (!loader.current) loader.current = createWritingAiBudgetLoader(setState, readBudget);
  useEffect(() => {
    const reader = loader.current!;
    void reader.load(monthKey);
    return () => reader.invalidate();
  }, [monthKey]);
  const current = state.monthKey === monthKey ? state : { status: 'loading' as const, monthKey };
  return <section data-testid="admin-ai-usage-view" className="min-w-0 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0"><h2 className="text-xl font-black text-steady-ink">AIの利用状況</h2><p className="mt-1 text-sm leading-relaxed text-slate-600">このアプリの月別の推定費用と、費用未確認の予約を確認できます。</p></div>
      <button type="button" data-testid="admin-ai-usage-refresh" disabled={current.status === 'loading'} onClick={() => void loader.current!.load(monthKey)} className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 disabled:opacity-50"><RefreshCw className="h-4 w-4" /> 更新</button>
    </div>
    <label className="block max-w-xs text-sm font-bold text-slate-700">対象月（UTC）<input type="month" data-testid="admin-ai-usage-month" value={monthKey} onChange={event => setMonthKey(event.target.value)} className="mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-slate-900" /></label>
    <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">providerの請求確定額ではありません。月$5は計画上限候補、アプリ内dispatchは$4.50までです。税・為替・他アプリの利用分は対象外です。</p>
    {current.status === 'loading' ? <div role="status" data-testid="admin-ai-usage-loading" className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-600">利用状況を読み込んでいます…</div>
      : current.status === 'error' ? <div role="alert" data-testid="admin-ai-usage-error" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{current.reason === 'INVALID_MONTH' ? '対象月を選択してください。' : current.reason === 'UNAUTHORIZED' ? '管理者としてログインしていることを確認してください。' : '利用状況を読み込めませんでした。通信を確認して、もう一度お試しください。'}</p><button type="button" disabled={current.reason === 'INVALID_MONTH'} onClick={() => void loader.current!.load(monthKey)} className="mt-3 min-h-11 rounded-xl border border-red-200 bg-white px-4 py-2 font-bold disabled:opacity-50">もう一度読み込む</button></div>
      : <AdminAiUsageSummary data={current.data} />}
  </section>;
};

export default AdminAiUsageView;
