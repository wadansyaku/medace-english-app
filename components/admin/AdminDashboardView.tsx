import React from 'react';
import {
  Activity,
  BarChart3,
  BellRing,
  BookOpen,
  Bot,
  Clock3,
  Database,
  Loader2,
  MessageSquareText,
  ShieldAlert,
  Target,
  Users,
} from 'lucide-react';
import {
  type AdminDashboardSnapshot,
  StudentRiskLevel,
  SUBSCRIPTION_PLAN_LABELS,
  SubscriptionPlan,
} from '../../types';

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
}

const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  snapshot,
  loading,
  error,
  headline,
  subcopy,
}) => {
  const overview = snapshot?.overview;
  const analyticsStatus = snapshot ? getAnalyticsStatus(snapshot.productKpis.updatedAt) : null;
  const maxTrendValue = snapshot
    ? Math.max(
        ...snapshot.trend.map((point) => Math.max(point.activeStudents, point.studiedWords, point.notifications, point.newStudents)),
        1,
      )
    : 1;
  const planCoverageRate = overview && overview.totalStudents > 0
    ? Math.round((overview.studentsWithPlan / overview.totalStudents) * 100)
    : 0;

  return (
    <>
      <div className="relative overflow-hidden rounded-[32px] bg-medace-500 p-7 text-white shadow-[0_24px_70px_rgba(255,130,22,0.22)] md:p-8">
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
                  <div className="mt-1 text-xs text-slate-500">完了 {snapshot.productKpis.studySessionsFinished30d} / テスト {snapshot.productKpis.quizSessionsStarted30d}</div>
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
                {[
                  ['組織数', snapshot.activationFunnel.totalOrganizations],
                  ['クラス作成', snapshot.activationFunnel.organizationsWithCohortCount],
                  ['担当割当', snapshot.activationFunnel.organizationsWithAssignmentCount],
                  ['初回ミッション', snapshot.activationFunnel.organizationsWithMissionCount],
                  ['初回通知', snapshot.activationFunnel.organizationsWithNotificationCount],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <span className="text-sm font-bold text-slate-700">{label}</span>
                    <span className="text-lg font-black text-slate-950">{value}</span>
                  </div>
                ))}
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  フォーム open {snapshot.activationFunnel.commercialFormOpenCount30d} 件 / 相談送信 {snapshot.activationFunnel.commercialRequestCount30d} 件
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  作成 {snapshot.activationFunnel.writingAssignmentsCreated30d} 件 / 提出 {snapshot.activationFunnel.writingSubmissionsReceived30d} 件 / 返却 {snapshot.activationFunnel.writingReviewsCompleted30d} 件
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
              <div className="mt-5 space-y-3">
                {snapshot.topBooks.length === 0 ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">教材データがまだありません。</div>
                ) : (
                  snapshot.topBooks.map((book) => (
                    <div key={book.bookId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-bold text-slate-900">{book.title}</div>
                          <div className="mt-1 text-xs text-slate-500">{book.isOfficial ? '公式教材' : '独自教材'} / {book.wordCount.toLocaleString()} 語</div>
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
