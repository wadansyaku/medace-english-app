import React from 'react';
import { Activity, BarChart, ChevronDown, ChevronUp, Crown, Medal, Target } from 'lucide-react';
import type { ActivityLog, LeaderboardEntry, MasteryDistribution } from '../../types';
import { STATUS_LABELS } from '../../types';
import { getDateKeyWeekdayLabel, getRelativeDateKey, getTodayDateKey } from '../../utils/date';

const ActivityBarChart: React.FC<{ logs: ActivityLog[]; dailyGoal?: number }> = ({ logs, dailyGoal = 20 }) => {
  const daysToShow = 7;
  const chartData = [];
  const todayKey = getTodayDateKey();
  let maxCount = 0;

  for (let index = daysToShow - 1; index >= 0; index -= 1) {
    const dateKey = getRelativeDateKey(-index);
    const log = logs.find((entry) => entry.date === dateKey);
    const count = log ? log.count : 0;
    maxCount = Math.max(maxCount, count);

    chartData.push({
      date: dateKey,
      dayLabel: getDateKeyWeekdayLabel(dateKey),
      count,
      isToday: dateKey === todayKey,
      isGoalMet: count >= dailyGoal,
    });
  }

  maxCount = Math.max(maxCount, dailyGoal * 1.2, 10);
  const goalPercent = Math.min(100, Math.round((dailyGoal / maxCount) * 100));

  return (
    <div className="relative rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="mb-6 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-lg font-bold text-slate-800">
          <BarChart className="h-5 w-5 text-medace-500" /> 週間学習記録
        </h3>
        <div className="flex items-center gap-3">
          {dailyGoal > 0 && (
            <div className="flex items-center gap-1 text-xs font-bold text-slate-400">
              <div className="w-3 border-t-2 border-dashed border-slate-300"></div>
              目標: {dailyGoal}語
            </div>
          )}
          <div className="rounded-md bg-slate-50 px-2 py-1 text-xs font-bold text-slate-400">
            7日間合計: {logs.reduce((sum, entry) => sum + entry.count, 0)} 語
          </div>
        </div>
      </div>

      <div className="relative h-40 w-full">
        {dailyGoal > 0 && (
          <div
            className="absolute z-0 w-full border-t-2 border-dashed border-slate-300 opacity-50 transition-all duration-500"
            style={{ bottom: `${goalPercent}%` }}
          ></div>
        )}

        <div className="absolute inset-0 z-10 flex items-end justify-between gap-2 md:gap-4">
          {chartData.map((entry) => {
            const heightPercent = Math.round((entry.count / maxCount) * 100);
            return (
              <div key={entry.date} className="group relative flex h-full flex-1 cursor-pointer flex-col items-center justify-end">
                <div className="pointer-events-none absolute -top-8 z-20 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs font-bold text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
                  {entry.count} 単語
                </div>
                <div className="relative flex h-full w-full items-end overflow-hidden rounded-t-md bg-slate-50 transition-all duration-300 hover:bg-slate-100">
                  <div
                    className={`absolute bottom-0 w-full rounded-t-md transition-all duration-1000 ease-out ${
                      entry.count === 0
                        ? 'bg-transparent'
                        : entry.isGoalMet
                          ? 'bg-gradient-to-t from-medace-500 to-medace-400'
                          : entry.isToday
                            ? 'bg-slate-400'
                            : 'bg-slate-300 group-hover:bg-slate-400'
                    }`}
                    style={{ height: `${heightPercent}%` }}
                  >
                    {entry.isGoalMet && <div className="h-full w-full animate-pulse bg-white opacity-20"></div>}
                  </div>
                </div>
                <div className={`mt-2 text-xs font-bold ${entry.isToday ? 'text-medace-600' : 'text-slate-400'}`}>
                  {entry.dayLabel}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

const getLeague = (level: number) => {
  if (level >= 20) {
    return {
      name: 'ゴールド',
      icon: <Crown className="h-3 w-3 fill-yellow-400 text-yellow-600" />,
      color: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    };
  }
  if (level >= 10) {
    return {
      name: 'シルバー',
      icon: <Medal className="h-3 w-3 fill-slate-300 text-slate-500" />,
      color: 'bg-slate-100 text-slate-700 border-slate-200',
    };
  }
  return {
    name: 'ブロンズ',
    icon: <Medal className="h-3 w-3 fill-orange-300 text-orange-600" />,
    color: 'bg-orange-50 text-orange-800 border-orange-200',
  };
};

interface DashboardProgressSectionProps {
  open: boolean;
  activityLogs: ActivityLog[];
  dailyGoal?: number;
  masteryDist: MasteryDistribution | null;
  isGameMode: boolean;
  leaderboard: LeaderboardEntry[];
  todayCount: number;
  todayWordGoal: number;
  todayProgressPercent: number;
  weekTotal: number;
  weeklyGoal: number;
  weeklyRemaining: number;
  currentStreak: number;
  onToggle: () => void;
}

const DashboardProgressSection: React.FC<DashboardProgressSectionProps> = ({
  open,
  activityLogs,
  dailyGoal,
  masteryDist,
  isGameMode,
  leaderboard,
  todayCount,
  todayWordGoal,
  todayProgressPercent,
  weekTotal,
  weeklyGoal,
  weeklyRemaining,
  currentStreak,
  onToggle,
}) => (
  <div className="space-y-4">
    <button
      onClick={onToggle}
      className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition-colors hover:bg-slate-50"
    >
      <div>
        <div className="text-sm font-bold text-slate-900">くわしい学習記録</div>
        <div className="mt-1 text-sm text-slate-500">週間記録やランキングは必要なときだけ確認できます。</div>
      </div>
      {open ? <ChevronUp className="h-5 w-5 text-slate-400" /> : <ChevronDown className="h-5 w-5 text-slate-400" />}
    </button>

    {open && (
      <div className="space-y-6 animate-in fade-in slide-in-from-top-2">
        <ActivityBarChart logs={activityLogs} dailyGoal={dailyGoal} />

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
          <div className="col-span-1 rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
            <h3 className="mb-6 flex items-center gap-2 text-lg font-bold text-slate-800">
              <Activity className="h-5 w-5 text-medace-500" /> 学習ステータス
            </h3>
            {masteryDist ? (
              <div className="flex flex-col items-center justify-around gap-6 sm:flex-row">
                <div className="relative h-40 w-40 flex-shrink-0">
                  <div
                    className="h-full w-full rounded-full"
                    style={{
                      background: `conic-gradient(
                        #22c55e 0% ${Math.round((masteryDist.graduated / (masteryDist.total || 1)) * 100)}%,
                        #3b82f6 0% ${Math.round(((masteryDist.graduated + masteryDist.review) / (masteryDist.total || 1)) * 100)}%,
                        #f97316 0% ${Math.round(((masteryDist.graduated + masteryDist.review + masteryDist.learning) / (masteryDist.total || 1)) * 100)}%,
                        #f1f5f9 0% 100%
                      )`,
                    }}
                  ></div>
                  <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-white">
                    <span className="text-3xl font-bold text-slate-800">{masteryDist.total}</span>
                    <span className="text-xs font-bold uppercase text-slate-400">合計単語</span>
                  </div>
                </div>
                <div className="grid w-full grid-cols-2 gap-4">
                  <div className="rounded-lg border border-green-100 bg-green-50 p-3">
                    <div className="text-xs font-bold uppercase text-green-600">{STATUS_LABELS.graduated}</div>
                    <div className="text-xl font-bold text-slate-800">{masteryDist.graduated}</div>
                  </div>
                  <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
                    <div className="text-xs font-bold uppercase text-blue-600">{STATUS_LABELS.review}</div>
                    <div className="text-xl font-bold text-slate-800">{masteryDist.review}</div>
                  </div>
                  <div className="rounded-lg border border-orange-100 bg-orange-50 p-3">
                    <div className="text-xs font-bold uppercase text-orange-600">{STATUS_LABELS.learning}</div>
                    <div className="text-xl font-bold text-slate-800">{masteryDist.learning}</div>
                  </div>
                  <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-bold uppercase text-slate-500">{STATUS_LABELS.new}</div>
                    <div className="text-xl font-bold text-slate-800">
                      {masteryDist.total - (masteryDist.graduated + masteryDist.review + masteryDist.learning)}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-40 items-center justify-center text-slate-400">データなし</div>
            )}
          </div>

          {isGameMode ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
                <BarChart className="h-5 w-5 text-medace-500" /> XPランキング
              </h3>
              <div className="space-y-3">
                {leaderboard.map((entry, index) => {
                  const league = getLeague(entry.level);
                  return (
                    <div
                      key={entry.uid}
                      className={`flex items-center justify-between rounded-lg border p-3 transition-all hover:scale-[1.02] ${
                        entry.isCurrentUser ? 'border-medace-200 bg-medace-50 shadow-sm' : 'border-slate-100 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                            index === 0
                              ? 'bg-yellow-100 text-yellow-700'
                              : index === 1
                                ? 'bg-slate-100 text-slate-700'
                                : index === 2
                                  ? 'bg-orange-50 text-orange-700'
                                  : 'text-slate-400'
                          }`}
                        >
                          {entry.rank}
                        </div>
                        <div>
                          <div className={`flex items-center gap-2 text-sm font-bold ${entry.isCurrentUser ? 'text-medace-700' : 'text-slate-700'}`}>
                            {entry.displayName}
                            {entry.isCurrentUser && <span className="rounded bg-medace-200 px-1.5 text-[10px] text-medace-800">あなた</span>}
                          </div>
                          <div className="mt-0.5 flex items-center gap-1.5">
                            <div className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${league.color}`}>
                              {league.icon} {league.name}
                            </div>
                            <div className="text-[10px] text-slate-400">Lv.{entry.level}</div>
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-bold text-slate-600">
                        {entry.xp} <span className="text-xs text-slate-400">XP</span>
                      </div>
                    </div>
                  );
                })}
                {leaderboard.length === 0 && <p className="text-center text-xs text-slate-400">ランキングデータなし</p>}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-bold text-slate-800">
                <Target className="h-5 w-5 text-medace-500" /> 今週のペース
              </h3>
              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">今日</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">
                    {todayCount}
                    <span className="ml-1 text-sm text-slate-400">/ {todayWordGoal} 語</span>
                  </div>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-medace-400 to-medace-600"
                      style={{ width: `${todayProgressPercent}%` }}
                    ></div>
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">今週</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">
                    {weekTotal}
                    <span className="ml-1 text-sm text-slate-400">/ {weeklyGoal} 語</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-500">
                    {weeklyRemaining === 0 ? '今週の目標ペースに到達しています。' : `あと ${weeklyRemaining} 語で今週の目標です。`}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">連続記録</div>
                  <div className="mt-2 text-2xl font-black text-slate-950">
                    {currentStreak}
                    <span className="ml-1 text-sm text-slate-400">日</span>
                  </div>
                  <div className="mt-2 text-sm text-slate-500">他人比較ではなく、自分のペースで積み上げる表示です。</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>
);

export default DashboardProgressSection;
