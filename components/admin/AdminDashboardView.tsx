import React from 'react';
import {
  Activity,
  BarChart3,
  BellRing,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock3,
  Copy,
  Database,
  KeyRound,
  Link2,
  Loader2,
  MessageSquareText,
  RotateCcw,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { AdminPasswordResetLinkIssueResult } from '../../contracts/storage';
import {
  type AdminDashboardSnapshot,
  type AdminPasswordRecoveryStatus,
  StudentRiskLevel,
  SUBSCRIPTION_PLAN_LABELS,
  SubscriptionPlan,
} from '../../types';
import { getOperatorMaterialQualityMessage } from '../../shared/materialQuality';

const formatCost = (milliYen: number): string => {
  const yen = milliYen / 1000;
  return `${yen.toFixed(yen >= 10 ? 0 : 1)}円`;
};

const formatDateLabel = (date: string): string => {
  const [, month, day] = date.split('-');
  return `${month}/${day}`;
};

const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const riskTone = (riskLevel: StudentRiskLevel): string => {
  if (riskLevel === StudentRiskLevel.DANGER) return 'border-red-200 bg-red-50 text-red-700';
  if (riskLevel === StudentRiskLevel.WARNING) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

const planTone = (plan: SubscriptionPlan): string => {
  if (plan === SubscriptionPlan.TOB_PAID) return 'border-medace-900 bg-medace-900 text-white';
  if (plan === SubscriptionPlan.TOB_FREE) return 'border-medace-200 bg-medace-100 text-medace-900';
  if (plan === SubscriptionPlan.TOC_PAID) return 'border-medace-200 bg-medace-50 text-medace-800';
  return 'border-slate-200 bg-white text-slate-600';
};

const getAnalyticsStatus = (updatedAt: number) => {
  if (updatedAt > 0) {
    return {
      label: '集計済み',
      tone: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      detail: `最終更新 ${formatDateTime(updatedAt)}。0件は未計測ではなく、現時点の集計結果です。`,
    };
  }

  return {
    label: '未計測',
    tone: 'border-amber-200 bg-amber-50 text-amber-800',
    detail: 'analytics snapshot がまだ実行されていません。表示中の 0 件は未計測の可能性があります。',
  };
};

const funnelSeverityTone = (severity: 'ok' | 'watch' | 'blocked'): string => {
  if (severity === 'blocked') return 'border-red-200 bg-red-50 text-red-800';
  if (severity === 'watch') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-emerald-200 bg-emerald-50 text-emerald-800';
};

const pmfLevelTone = (level: AdminDashboardSnapshot['pmf']['signalLevel']): string => {
  if (level === 'strong') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (level === 'forming') return 'border-medace-200 bg-medace-50 text-medace-900';
  if (level === 'weak') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const pmfMetricTone = (tone: AdminDashboardSnapshot['pmf']['evidence'][number]['tone']): string => {
  if (tone === 'strong') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (tone === 'watch') return 'border-medace-200 bg-medace-50 text-medace-900';
  if (tone === 'weak') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
};

const clampPercent = (value: number): number => Math.max(0, Math.min(100, value));

const buildLinePoints = (
  points: AdminDashboardSnapshot['productKpiTrend'],
  field: keyof AdminDashboardSnapshot['productKpiTrend'][number],
  maxValue: number,
): string => {
  if (points.length === 0) return '';
  const width = 620;
  const height = 160;
  const left = 14;
  const top = 18;
  const step = points.length > 1 ? width / (points.length - 1) : 0;
  return points.map((point, index) => {
    const value = Number(point[field] || 0);
    const x = points.length > 1 ? left + (index * step) : left + (width / 2);
    const y = top + height - ((value / Math.max(1, maxValue)) * height);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
};

const RateBar: React.FC<{
  label: string;
  value: number;
  detail: string;
  colorClass?: string;
}> = ({ label, value, detail, colorClass = 'bg-medace-500' }) => (
  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
    <div className="flex items-center justify-between gap-3">
      <div className="text-sm font-bold text-slate-700">{label}</div>
      <div className="text-sm font-black text-slate-950">{clampPercent(value)}%</div>
    </div>
    <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
      <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${clampPercent(value)}%` }} />
    </div>
    <div className="mt-2 text-xs leading-relaxed text-slate-500">{detail}</div>
  </div>
);

const MetricCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}> = ({ label, value, detail, icon }) => (
  <div className="rounded-[28px] border border-medace-100 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-3 text-medace-700">
      <div className="rounded-2xl bg-medace-50 p-3">{icon}</div>
      <span className="text-sm font-bold">{label}</span>
    </div>
    <div className="mt-4 text-3xl font-black tracking-tight text-slate-950">{value}</div>
    <p className="mt-2 text-sm leading-relaxed text-slate-500">{detail}</p>
  </div>
);

interface AdminDashboardViewProps {
  snapshot: AdminDashboardSnapshot | null;
  loading: boolean;
  error: string | null;
  headline: string;
  subcopy: string;
  passwordRecoveryUpdatingId?: number | null;
  passwordResetIssuingId?: number | null;
  passwordResetLinkByRequestId?: Record<number, AdminPasswordResetLinkIssueResult>;
  onUpdatePasswordRecoveryRequest?: (
    requestId: number,
    status: AdminPasswordRecoveryStatus,
    resolutionNote?: string,
  ) => Promise<unknown>;
  onIssuePasswordResetLink?: (requestId: number) => Promise<AdminPasswordResetLinkIssueResult>;
}

const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  snapshot,
  loading,
  error,
  headline,
  subcopy,
  passwordRecoveryUpdatingId = null,
  passwordResetIssuingId = null,
  passwordResetLinkByRequestId = {},
  onUpdatePasswordRecoveryRequest,
  onIssuePasswordResetLink,
}) => {
  const [copiedPasswordResetRequestId, setCopiedPasswordResetRequestId] = React.useState<number | null>(null);
  const overview = snapshot?.overview;
  const passwordRecoveryRequests = snapshot?.passwordRecoveryRequests || [];
  const openPasswordRecoveryCount = passwordRecoveryRequests.filter((request) => request.status === 'OPEN').length;
  const matchingPasswordRecoveryCount = passwordRecoveryRequests.filter((request) => request.hasMatchingUser).length;
  const analyticsStatus = snapshot ? getAnalyticsStatus(snapshot.productKpis.updatedAt) : null;
  const pmfTrend = snapshot?.productKpiTrend || [];
  const maxPmfTrendValue = snapshot
    ? Math.max(
        ...pmfTrend.map((point) => Math.max(
          point.activeStudents30d,
          point.activeOrganizations30d,
          point.studySessionsStarted30d,
          point.dashboardStartTaskCount30d,
        )),
        1,
      )
    : 1;
  const activeStudentsLine = buildLinePoints(pmfTrend, 'activeStudents30d', maxPmfTrendValue);
  const activeOrganizationsLine = buildLinePoints(pmfTrend, 'activeOrganizations30d', maxPmfTrendValue);
  const dashboardStartTaskLine = buildLinePoints(pmfTrend, 'dashboardStartTaskCount30d', maxPmfTrendValue);
  const maxTrendValue = snapshot
    ? Math.max(
        ...snapshot.trend.map((point) => Math.max(point.activeStudents, point.studiedWords, point.notifications, point.newStudents)),
        1,
      )
    : 1;
  const planCoverageRate = overview && overview.totalStudents > 0
    ? Math.round((overview.studentsWithPlan / overview.totalStudents) * 100)
    : 0;
  const materialQualityIssueCount = snapshot
    ? snapshot.materialQuality.warningBookCount
      + snapshot.materialQuality.reviewRequiredBookCount
      + snapshot.materialQuality.qaBlockedBookCount
      + snapshot.materialQuality.missingLedgerBookCount
    : 0;
  const hasMaterialQualityQueue = Boolean(snapshot && (
    materialQualityIssueCount > 0 || snapshot.topBooks.some((book) => book.qualityGate && (
      !book.qualityGate.isApprovedForLearner || book.qualityGate.warnings.length > 0
    ))
  ));
  const copyPasswordResetLink = (requestId: number, resetUrl: string) => {
    if (typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(resetUrl).then(() => {
      setCopiedPasswordResetRequestId(requestId);
      window.setTimeout(() => {
        setCopiedPasswordResetRequestId((current) => (current === requestId ? null : current));
      }, 1800);
    });
  };

  return (
    <>
      <div className="relative overflow-hidden rounded-[32px] bg-medace-500 p-7 text-slate-950 shadow-[0_24px_70px_rgba(255,130,22,0.22)] md:p-8">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,255,255,0.24),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(255,255,255,0.14),_transparent_22%)]"></div>
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white/70">
              運営インサイト
            </span>
            {overview && (
              <>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/85">
                  生徒 {overview.totalStudents} 名
                </span>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/85">
                  教材 {overview.officialBookCount + overview.customBookCount} 冊
                </span>
              </>
            )}
          </div>
          <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">{headline}</h2>
          <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/78 md:text-base">{subcopy}</p>
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {loading && !snapshot ? (
        <div className="flex min-h-[40vh] items-center justify-center rounded-[32px] border border-medace-100 bg-white">
          <div className="flex items-center gap-3 text-medace-700">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="font-bold">ダッシュボードを集計中...</span>
          </div>
        </div>
      ) : snapshot ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <MetricCard
              label="登録生徒"
              value={`${overview?.totalStudents || 0}名`}
              detail={`7日以内に学習した生徒は ${overview?.active7d || 0} 名です。`}
              icon={<Users className="h-5 w-5" />}
            />
            <MetricCard
              label="今日のアクティブ"
              value={`${overview?.activeToday || 0}名`}
              detail="当日中に単語へ触れた生徒数です。"
              icon={<Activity className="h-5 w-5" />}
            />
            <MetricCard
              label="要フォロー"
              value={`${overview?.atRiskCount || 0}名`}
              detail="学習が空き始めた生徒を優先順で抽出しています。"
              icon={<ShieldAlert className="h-5 w-5" />}
            />
            <MetricCard
              label="学習プラン設定率"
              value={`${planCoverageRate}%`}
              detail={`${overview?.studentsWithPlan || 0} 名が個別プランを保持しています。`}
              icon={<Target className="h-5 w-5" />}
            />
            <MetricCard
              label="教材総語数"
              value={`${overview?.totalWordCount?.toLocaleString() || 0}語`}
              detail={`公式 ${overview?.officialBookCount || 0} 冊 / 独自 ${overview?.customBookCount || 0} 冊`}
              icon={<Database className="h-5 w-5" />}
            />
            <MetricCard
              label="今月のAI利用"
              value={formatCost(overview?.aiCostThisMonthMilliYen || 0)}
              detail={`${overview?.aiRequestsThisMonth || 0} リクエスト / 通知 ${overview?.notifications7d || 0} 件`}
              icon={<Bot className="h-5 w-5" />}
            />
          </div>

          <section data-testid="admin-password-recovery-queue" className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm md:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <KeyRound className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">ログイン救済</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">パスワード再設定リクエスト</h3>
                  <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">
                    ログイン画面で受け付けた再設定依頼です。生徒側には登録有無を出さず、管理者だけが一致状況と対応状態を確認します。
                  </p>
                </div>
              </div>
              <div className="grid min-w-[220px] grid-cols-2 gap-2 text-sm">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-amber-800">
                  <div className="text-xs font-bold">未対応</div>
                  <div className="mt-1 text-2xl font-black">{openPasswordRecoveryCount}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-slate-700">
                  <div className="text-xs font-bold">登録一致</div>
                  <div className="mt-1 text-2xl font-black">{matchingPasswordRecoveryCount}</div>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {passwordRecoveryRequests.length === 0 ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm font-medium text-emerald-700">
                  未対応の再設定リクエストはありません。
                </div>
              ) : (
                passwordRecoveryRequests.map((request) => {
                  const isUpdating = passwordRecoveryUpdatingId === request.id;
                  const isIssuing = passwordResetIssuingId === request.id;
                  const issuedLink = passwordResetLinkByRequestId[request.id];
                  const isOpen = request.status === 'OPEN';
                  return (
                    <div key={request.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${
                              isOpen
                                ? 'border-amber-200 bg-amber-50 text-amber-800'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-800'
                            }`}>
                              {isOpen ? '未対応' : '処理済み'}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${
                              request.hasMatchingUser
                                ? 'border-medace-200 bg-medace-50 text-medace-900'
                                : 'border-slate-200 bg-white text-slate-600'
                            }`}>
                              {request.hasMatchingUser ? '登録一致あり' : '登録一致なし'}
                            </span>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-500">
                              {request.source}
                            </span>
                          </div>
                          <div className="mt-3 truncate text-base font-black text-slate-950">{request.email}</div>
                          <div className="mt-1 text-xs leading-relaxed text-slate-500">
                            受付 {formatDateTime(request.createdAt)}
                            {request.resolvedAt ? ` / 対応 ${formatDateTime(request.resolvedAt)}` : ''}
                          </div>
                          {request.resolutionNote && (
                            <div className="mt-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs leading-relaxed text-slate-600">
                              {request.resolutionNote}
                            </div>
                          )}
                        </div>
                        <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col xl:flex-row">
                          {isOpen && request.hasMatchingUser && (
                            <button
                              type="button"
                              disabled={!onIssuePasswordResetLink || isIssuing || isUpdating}
                              onClick={() => {
                                void onIssuePasswordResetLink?.(request.id);
                              }}
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-medace-200 bg-white px-4 py-2.5 text-sm font-bold text-medace-900 transition-colors hover:bg-medace-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isIssuing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
                              再設定リンクを発行
                            </button>
                          )}
                          {isOpen && !request.hasMatchingUser && (
                            <div className="inline-flex min-h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500">
                              登録一致なし
                            </div>
                          )}
                          {isOpen ? (
                            <button
                              type="button"
                              disabled={!onUpdatePasswordRecoveryRequest || isUpdating || isIssuing}
                              onClick={() => {
                                void onUpdatePasswordRecoveryRequest?.(
                                  request.id,
                                  'RESOLVED',
                                  '運営が再設定手順を案内済み',
                                );
                              }}
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                            >
                              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                              処理済みにする
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={!onUpdatePasswordRecoveryRequest || isUpdating}
                              onClick={() => {
                                void onUpdatePasswordRecoveryRequest?.(request.id, 'OPEN');
                              }}
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {isUpdating ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                              未対応に戻す
                            </button>
                          )}
                        </div>
                      </div>
                      {issuedLink && (
                        <div
                          data-testid="password-reset-issued-link"
                          className="mt-4 rounded-2xl border border-medace-200 bg-white px-4 py-4"
                        >
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 text-sm font-black text-medace-900">
                                <Link2 className="h-4 w-4 shrink-0" />
                                <span>再設定リンクを発行しました</span>
                              </div>
                              <p className="mt-2 text-xs leading-relaxed text-slate-500">
                                有効期限 {formatDateTime(issuedLink.expiresAt)}。本人確認後、メール本文などに貼り付けて案内してください。
                              </p>
                              <div className="mt-3 break-all rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium leading-relaxed text-slate-700">
                                {issuedLink.resetUrl}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => copyPasswordResetLink(request.id, issuedLink.resetUrl)}
                              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-800"
                            >
                              <Copy className="h-4 w-4" />
                              {copiedPasswordResetRequestId === request.id ? 'コピー済み' : 'コピー'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          <section data-testid="admin-pmf-dashboard" className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm md:p-7">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex items-center gap-3">
                <TrendingUp className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold text-slate-400">PMF達成シグナル</p>
                  <h3 className="mt-1 text-2xl font-black text-slate-950">{snapshot.pmf.headline}</h3>
                </div>
              </div>
              <div className={`rounded-2xl border px-4 py-3 text-sm font-black ${pmfLevelTone(snapshot.pmf.signalLevel)}`}>
                {snapshot.pmf.signalLabel}
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {snapshot.pmf.evidence.map((metric) => (
                <div key={metric.id} className={`rounded-2xl border px-4 py-4 ${pmfMetricTone(metric.tone)}`}>
                  <div className="text-xs font-bold">{metric.label}</div>
                  <div className="mt-2 text-3xl font-black">{metric.value}</div>
                  <div className="mt-2 text-xs leading-relaxed opacity-90">{metric.detail}</div>
                </div>
              ))}
            </div>

            <div className="mt-6 grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-black text-slate-900">30日窓の利用シグナル推移</div>
                    <div className="mt-1 text-xs text-slate-500">analytics snapshot の時系列から、開始CTA、継続利用、組織利用の厚みを確認します。</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-500">
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-medace-600" />学習者</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-slate-500" />組織</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-sky-500" />開始CTA</span>
                  </div>
                </div>
                {pmfTrend.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    時系列スナップショットがまだありません。analytics snapshot 実行後に線グラフが表示されます。
                  </div>
                ) : (
                  <div className="mt-5 overflow-x-auto">
                    <div className="min-w-[680px]">
                      <svg viewBox="0 0 660 220" role="img" aria-label="PMF利用シグナル推移" className="h-[220px] w-full">
                        <line x1="14" y1="178" x2="636" y2="178" stroke="#e2e8f0" strokeWidth="2" />
                        <line x1="14" y1="98" x2="636" y2="98" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="5 5" />
                        <polyline points={activeStudentsLine} fill="none" stroke="#f97316" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points={activeOrganizationsLine} fill="none" stroke="#475569" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        <polyline points={dashboardStartTaskLine} fill="none" stroke="#0ea5e9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        {pmfTrend.map((point, index) => {
                          const x = pmfTrend.length > 1 ? 14 + (index * (620 / (pmfTrend.length - 1))) : 324;
                          return (
                            <g key={point.date}>
                              <text x={x} y="210" textAnchor="middle" className="fill-slate-500 text-[11px] font-bold">{formatDateLabel(point.date)}</text>
                            </g>
                          );
                        })}
                      </svg>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
                <div className="text-sm font-black text-slate-900">最新30日の率</div>
                <div className="mt-1 text-xs text-slate-500">PMF判断で毎週確認する主要率です。</div>
                <div className="mt-5 space-y-3">
                  <RateBar label="学習アクティブ率" value={snapshot.pmf.activeStudentRate30d} detail="登録ユーザーに対する30日学習者比率" />
                  <RateBar label="セッション完了率" value={snapshot.pmf.studyCompletionRate30d} detail="学習開始から完了まで進んだ比率" colorClass="bg-emerald-500" />
                  <RateBar label="B2B価値ループ到達率" value={snapshot.pmf.b2bActivationCompletionRate} detail="組織が作文返却まで到達した比率" colorClass="bg-slate-700" />
                  <RateBar label="受付キュー作成率" value={snapshot.pmf.commercialConversionRate30d} detail="公開ロール接点から受付作成への転換" colorClass="bg-sky-500" />
                </div>
              </div>
            </div>

            <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50 px-5 py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-black text-slate-900">所属別PMFシグナル</div>
                  <div className="mt-1 text-xs text-slate-500">7日内学習率、有料化率、平均学習語数を合成した比較です。</div>
                </div>
                <div className="text-xs font-bold text-slate-500">最大8件</div>
              </div>
              <div className="mt-5 grid gap-3 xl:grid-cols-2">
                {snapshot.pmfSegments.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-white px-4 py-8 text-center text-sm text-slate-500">
                    所属別に比較できるデータはまだありません。
                  </div>
                ) : (
                  snapshot.pmfSegments.map((segment) => (
                    <div key={segment.organizationName} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{segment.organizationName}</div>
                          <div className="mt-1 text-xs text-slate-500">{segment.studentCount} 名 / 有料 {segment.paidCount} 名 / 平均 {segment.averageLearnedWords} 語</div>
                        </div>
                        <div className="text-right">
                          <div className="text-xl font-black text-slate-950">{segment.signalScore}</div>
                          <div className="text-xs text-slate-500">score</div>
                        </div>
                      </div>
                      <div className="mt-3 grid gap-2">
                        <RateBar label="7日内学習率" value={segment.active7dRate} detail={`${segment.active7dCount} 名が7日内に学習`} />
                        <RateBar label="有料化率" value={segment.paidRate} detail={`${segment.paidCount} 名が有料プラン`} colorClass="bg-slate-700" />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Activity className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold text-slate-400">プロダクトKPI</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">日次ベースライン</h3>
                </div>
              </div>
              {analyticsStatus && (
                <div className={`mt-5 rounded-2xl border px-4 py-4 text-sm ${analyticsStatus.tone}`}>
                  <div className="text-xs font-bold">分析ステータス</div>
                  <div className="mt-1 text-base font-black">{analyticsStatus.label}</div>
                  <div className="mt-2 text-xs leading-relaxed opacity-90">{analyticsStatus.detail}</div>
                </div>
              )}
              <div className="mt-5 grid gap-3 text-sm">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">対象日</div>
                  <div className="mt-1 font-black text-slate-950">{snapshot.productKpis.dateKey}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">30日学習アクティブ</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{snapshot.productKpis.activeStudents30d}</div>
                  <div className="mt-1 text-xs text-slate-500">1日 {snapshot.productKpis.activeStudents1d} / 7日 {snapshot.productKpis.activeStudents7d}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">30日セッション</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{snapshot.productKpis.studySessionsStarted30d}</div>
                  <div className="mt-1 text-xs text-slate-500">完了 {snapshot.productKpis.studySessionsFinished30d} / テスト {snapshot.productKpis.quizSessionsStarted30d} / CTA開始 {snapshot.productKpis.dashboardStartTaskCount30d}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">30日英作文</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{snapshot.productKpis.writingAssignmentsCreated30d}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    提出 {snapshot.productKpis.writingSubmissionsReceived30d} / 返却 {snapshot.productKpis.writingReviewsCompleted30d}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold text-slate-400">B2B導入状況</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">導入ファネル</h3>
                </div>
              </div>
              {analyticsStatus && (
                <div className={`mt-5 rounded-2xl border px-4 py-4 text-sm ${analyticsStatus.tone}`}>
                  <div className="text-xs font-bold">数値の見方</div>
                  <div className="mt-2 text-xs leading-relaxed opacity-90">{analyticsStatus.detail}</div>
                </div>
              )}
              <div className="mt-5 space-y-3">
                <div className={`rounded-2xl border px-4 py-4 text-sm ${funnelSeverityTone(snapshot.activationFunnel.weakestGap?.severity || 'ok')}`}>
                  <div className="text-xs font-bold uppercase tracking-[0.16em]">最大の欠測</div>
                  <div className="mt-1 text-base font-black">
                    {snapshot.activationFunnel.weakestGap
                      ? `${snapshot.activationFunnel.weakestGap.label}で ${snapshot.activationFunnel.weakestGap.dropOffCount} 組織`
                      : '導入ファネルの欠測なし'}
                  </div>
                  <div className="mt-1 text-xs opacity-90">
                    初回作文の講師返却までの到達率 {snapshot.activationFunnel.completionRate}%。
                  </div>
                </div>
                {snapshot.activationFunnel.steps.map((step) => (
                  <div key={step.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-bold text-slate-700">{step.label}</span>
                      <span className="text-lg font-black text-slate-950">{step.count}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                      <div className="h-full rounded-full bg-medace-500" style={{ width: `${step.conversionRate}%` }}></div>
                    </div>
                    <div className="mt-2 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>前段階から {step.conversionRate}%</span>
                      <span>欠測 {step.dropOffCount}</span>
                    </div>
                  </div>
                ))}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  公開ロール接点 {snapshot.activationFunnel.commercialFormOpenCount30d} 件 / 受付作成 {snapshot.activationFunnel.commercialRequestCount30d} 件
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  30日内の進行: クラス {snapshot.activationFunnel.activationVelocity30d.organizationsCreatedCohort} / 担当 {snapshot.activationFunnel.activationVelocity30d.organizationsAssignedStudent} / ミッション {snapshot.activationFunnel.activationVelocity30d.organizationsCreatedFirstMission} / 通知 {snapshot.activationFunnel.activationVelocity30d.organizationsSentNotification} / 作文配布 {snapshot.activationFunnel.activationVelocity30d.organizationsWithWritingAssignment} / 提出 {snapshot.activationFunnel.activationVelocity30d.organizationsWithWritingSubmission} / 返却 {snapshot.activationFunnel.activationVelocity30d.organizationsWithWritingReview} 組織
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  累積到達: 作文配布済み {snapshot.activationFunnel.organizationsWithWritingAssignmentCount} 組織 / 提出あり {snapshot.activationFunnel.organizationsWithWritingSubmissionCount} 組織 / 返却済み {snapshot.activationFunnel.organizationsWithWritingReviewCount} 組織
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  30日内の作文件数: 作成 {snapshot.activationFunnel.writingAssignmentsCreated30d} / 提出 {snapshot.activationFunnel.writingSubmissionsReceived30d} / 返却 {snapshot.activationFunnel.writingReviewsCompleted30d} 件
                </div>
              </div>
            </section>

            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold text-slate-400">AI費用効率</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">生成と再利用</h3>
                </div>
              </div>
              <div className="mt-5 grid gap-3 text-sm">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">今月の生成</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{snapshot.aiEconomics.generationCount}</div>
                  <div className="mt-1 text-xs text-slate-500">cache hit {snapshot.aiEconomics.cacheHitCount} / 比率 {snapshot.aiEconomics.cacheHitRatio}%</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">推定コスト</div>
                  <div className="mt-1 text-2xl font-black text-slate-950">{formatCost(snapshot.aiEconomics.estimatedCostMilliYen)}</div>
                  <div className="mt-1 text-xs text-slate-500">provider {formatCost(snapshot.aiEconomics.estimatedProviderCostMilliYen)}</div>
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">回避できた推定費用</div>
                  <div className="mt-1 text-2xl font-black text-emerald-900">{formatCost(snapshot.aiEconomics.avoidedCostMilliYen)}</div>
                  <div className="mt-1 text-xs text-emerald-700/80">例文 hit {snapshot.aiEconomics.exampleCacheHitRatio}% / 画像 hit {snapshot.aiEconomics.imageCacheHitRatio}%</div>
                </div>
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm md:p-7">
              <div className="flex items-center gap-3">
                <BarChart3 className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">推移</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">直近14日間の推移</h3>
                </div>
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">学習アクティブ</div>
                  <div className="mt-2 text-2xl font-black text-medace-900">
                    {snapshot.trend.reduce((sum, point) => sum + point.activeStudents, 0)}
                  </div>
                  <div className="mt-1 text-sm text-medace-900/70">延べ人数</div>
                </div>
                <div className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">学習更新</div>
                  <div className="mt-2 text-2xl font-black text-medace-900">
                    {snapshot.trend.reduce((sum, point) => sum + point.studiedWords, 0)}
                  </div>
                  <div className="mt-1 text-sm text-medace-900/70">単語の更新件数</div>
                </div>
                <div className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">新規登録</div>
                  <div className="mt-2 text-2xl font-black text-medace-900">
                    {snapshot.trend.reduce((sum, point) => sum + point.newStudents, 0)}
                  </div>
                  <div className="mt-1 text-sm text-medace-900/70">直近14日</div>
                </div>
              </div>

              <div className="mt-6 overflow-x-auto">
                <div className="grid min-w-[720px] grid-cols-14 gap-3">
                  {snapshot.trend.map((point) => {
                    const activeHeight = point.activeStudents > 0 ? Math.max(10, (point.activeStudents / maxTrendValue) * 120) : 0;
                    const studiedHeight = point.studiedWords > 0 ? Math.max(10, (point.studiedWords / maxTrendValue) * 120) : 0;
                    const notificationHeight = point.notifications > 0 ? Math.max(6, (point.notifications / maxTrendValue) * 120) : 0;
                    return (
                      <div key={point.date} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4">
                        <div className="flex h-36 items-end justify-center gap-1.5">
                          <div className="w-3 rounded-full bg-medace-300" style={{ height: `${activeHeight}px` }} title={`アクティブ ${point.activeStudents}`} />
                          <div className="w-3 rounded-full bg-medace-600" style={{ height: `${studiedHeight}px` }} title={`学習 ${point.studiedWords}`} />
                          <div className="w-3 rounded-full bg-slate-300" style={{ height: `${notificationHeight}px` }} title={`通知 ${point.notifications}`} />
                        </div>
                        <div className="mt-4 text-center text-[11px] font-bold text-slate-500">{formatDateLabel(point.date)}</div>
                        <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                          <div>学習 {point.studiedWords}</div>
                          <div>人 {point.activeStudents}</div>
                          <div>通知 {point.notifications}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <div className="space-y-6">
              <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-medace-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">プラン構成</p>
                    <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">プラン構成</h3>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {snapshot.planBreakdown.map((item) => {
                    const width = overview && overview.totalStudents > 0 ? Math.max(8, Math.round((item.count / overview.totalStudents) * 100)) : 0;
                    return (
                      <div key={item.plan} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${planTone(item.plan)}`}>
                            {SUBSCRIPTION_PLAN_LABELS[item.plan]}
                          </span>
                          <span className="text-sm font-bold text-slate-700">{item.count} 名</span>
                        </div>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                          <div className="h-full rounded-full bg-medace-500" style={{ width: `${width}%` }}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-3">
                  <ShieldAlert className="h-5 w-5 text-medace-600" />
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">リスク構成</p>
                    <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">リスク構成</h3>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  {snapshot.riskBreakdown.map((item) => {
                    const width = overview && overview.totalStudents > 0 ? Math.max(8, Math.round((item.count / overview.totalStudents) * 100)) : 0;
                    return (
                      <div key={item.riskLevel} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex items-center justify-between gap-3">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(item.riskLevel)}`}>{item.riskLevel}</span>
                          <span className="text-sm font-bold text-slate-700">{item.count} 名</span>
                        </div>
                        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                          <div
                            className={`h-full rounded-full ${item.riskLevel === StudentRiskLevel.DANGER ? 'bg-red-500' : item.riskLevel === StudentRiskLevel.WARNING ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${width}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <BookOpen className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">教材</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">学習されている教材</h3>
                </div>
              </div>
              {hasMaterialQualityQueue && (
                <div className="mt-5 rounded-3xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-relaxed text-amber-900">
                  <div className="font-black">教材品質キュー</div>
                  <div className="mt-2 text-xs font-bold text-amber-800">
                    承認済み {snapshot.materialQuality.approvedBookCount} / {snapshot.materialQuality.officialBookCount} 冊。
                    運用警告 {snapshot.materialQuality.warningBookCount} 冊、確認中 {snapshot.materialQuality.reviewRequiredBookCount} 冊、QA停止 {snapshot.materialQuality.qaBlockedBookCount} 冊、台帳なし {snapshot.materialQuality.missingLedgerBookCount} 冊です。
                    学習対象から外している教材と運用警告のある教材は、source ledger と content QA を確認してください。
                  </div>
                </div>
              )}
              <div className="mt-5 space-y-3">
                {snapshot.topBooks.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">教材データがまだありません。</div>
                ) : (
                  snapshot.topBooks.map((book) => (
                    <div key={book.bookId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{book.title}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span>{book.isOfficial ? '公式教材' : '独自教材'} / {book.wordCount.toLocaleString()} 語</span>
                            {book.qualityGate ? (
                              <span className={`rounded-full border px-2 py-0.5 font-bold ${book.qualityGate.isApprovedForLearner ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                {book.qualityGate.label}
                              </span>
                            ) : null}
                          </div>
                          {book.qualityGate && (!book.qualityGate.isApprovedForLearner || book.qualityGate.warnings.length > 0) ? (
                            <div className="mt-2 text-xs font-bold leading-relaxed text-amber-800">
                              {getOperatorMaterialQualityMessage(book.qualityGate)}
                            </div>
                          ) : null}
                        </div>
                        <span className="rounded-full border border-medace-200 bg-white px-2.5 py-1 text-xs font-bold text-medace-800">
                          平均進行 {book.averageProgress.toFixed(0)}%
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習者</div>
                          <div className="mt-1 font-black text-slate-900">{book.learnerCount}</div>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">更新</div>
                          <div className="mt-1 font-black text-slate-900">{book.learnedEntries}</div>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">語数</div>
                          <div className="mt-1 font-black text-slate-900">{book.wordCount}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">AI利用</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">今月のAI利用内訳</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {snapshot.aiActions.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">まだAI利用はありません。</div>
                ) : (
                  snapshot.aiActions.map((action) => (
                    <div key={action.action} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{action.label}</div>
                          <div className="mt-1 text-xs text-slate-500">{action.requestCount} リクエスト</div>
                        </div>
                        <div className="text-right">
                          <div className="font-black text-slate-900">{formatCost(action.estimatedCostMilliYen)}</div>
                          <div className="mt-1 text-xs text-slate-500">{action.action}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Clock3 className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">フォロー対象</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">優先フォロー対象</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {snapshot.atRiskStudents.length === 0 ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm font-medium text-emerald-700">
                    いま強いフォローが必要な生徒は見当たりません。
                  </div>
                ) : (
                  snapshot.atRiskStudents.map((student) => {
                    const daysSinceActive = student.lastActive > 0 ? Math.floor((Date.now() - student.lastActive) / 86400000) : null;
                    return (
                      <div key={student.uid} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <div className="font-bold text-slate-900">{student.name}</div>
                            <div className="mt-1 text-xs text-slate-500">{student.email}</div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(student.riskLevel)}`}>{student.riskLevel}</span>
                            <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${planTone(student.subscriptionPlan || SubscriptionPlan.TOC_FREE)}`}>
                              {SUBSCRIPTION_PLAN_LABELS[student.subscriptionPlan || SubscriptionPlan.TOC_FREE]}
                            </span>
                          </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習語数</div>
                            <div className="mt-1 font-black text-slate-900">{student.totalLearned}</div>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">正答率</div>
                            <div className="mt-1 font-black text-slate-900">{Math.round((student.accuracy || 0) * 100)}%</div>
                          </div>
                          <div className="rounded-2xl bg-white px-3 py-3">
                            <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終学習</div>
                            <div className="mt-1 font-black text-slate-900">{daysSinceActive === null ? '未学習' : `${daysSinceActive}日`}</div>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <Users className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">所属別</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">所属別の概況</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {snapshot.organizations.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">所属データはまだありません。</div>
                ) : (
                  snapshot.organizations.map((organization) => (
                    <div key={organization.organizationName} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="font-bold text-slate-900">{organization.organizationName}</div>
                        <div className="text-sm font-bold text-slate-700">{organization.studentCount} 名</div>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">7日内学習</div>
                          <div className="mt-1 font-black text-slate-900">{organization.active7dCount}</div>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">有料</div>
                          <div className="mt-1 font-black text-slate-900">{organization.paidCount}</div>
                        </div>
                        <div className="rounded-2xl bg-white px-3 py-3">
                          <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">平均学習語数</div>
                          <div className="mt-1 font-black text-slate-900">{organization.averageLearnedWords}</div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <BellRing className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">通知履歴</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">直近のフォロー通知</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {snapshot.recentNotifications.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">通知送信履歴はまだありません。</div>
                ) : (
                  snapshot.recentNotifications.map((notification) => (
                    <div key={notification.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{notification.studentName}さんへ送信</div>
                          <div className="mt-1 text-xs text-slate-500">{notification.instructorName} / {notification.triggerReason}</div>
                        </div>
                        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                          {notification.usedAi ? '自動下書き' : '手動'}
                        </span>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-700">{notification.message}</p>
                      <div className="mt-3 text-xs text-slate-400">{formatDateTime(notification.createdAt)}</div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3">
                <MessageSquareText className="h-5 w-5 text-medace-600" />
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">報告履歴</p>
                  <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">直近の報告</h3>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {snapshot.recentReports.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">報告はまだありません。</div>
                ) : (
                  snapshot.recentReports.map((report) => (
                    <div key={report.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{report.word}</div>
                          <div className="mt-1 text-xs text-slate-500">{report.bookTitle} / {report.reporterName}</div>
                        </div>
                        <div className="text-xs text-slate-400">{formatDateTime(report.createdAt)}</div>
                      </div>
                      <p className="mt-3 text-sm leading-relaxed text-slate-700">{report.reason}</p>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </>
      ) : null}
    </>
  );
};

export default AdminDashboardView;
