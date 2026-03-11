import React from 'react';
import { MotivationSnapshot, MotivationScopeStats } from '../types';
import { Clock3, Sparkles, Target, TimerReset, Users } from 'lucide-react';

interface MotivationBoardProps {
  snapshot: MotivationSnapshot;
}

const SCOPE_STYLES: Record<MotivationScopeStats['scope'], {
  badgeClassName: string;
  cardClassName: string;
  accentClassName: string;
}> = {
  PERSONAL: {
    badgeClassName: 'border-medace-200 bg-medace-50 text-medace-700',
    cardClassName: 'border-medace-100 bg-[#fff8f1]',
    accentClassName: 'text-medace-700',
  },
  GROUP: {
    badgeClassName: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    cardClassName: 'border-emerald-100 bg-[linear-gradient(180deg,#f3fff9_0%,#ffffff_100%)]',
    accentClassName: 'text-emerald-700',
  },
  GLOBAL: {
    badgeClassName: 'border-slate-200 bg-slate-100 text-slate-700',
    cardClassName: 'border-slate-200 bg-[linear-gradient(180deg,#f8fafc_0%,#ffffff_100%)]',
    accentClassName: 'text-slate-700',
  },
};

const formatCount = (value: number): string => value.toLocaleString('ja-JP');

const formatDuration = (value: number): string => {
  if (value <= 0) return '0分';
  const totalMinutes = Math.max(1, Math.round(value / 60000));
  if (totalMinutes < 60) return `${totalMinutes}分`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (minutes === 0) return `${hours}時間`;
  return `${hours}時間${minutes}分`;
};

const formatAverageTime = (value: number | null): string => {
  if (!value || value <= 0) return '計測中';
  return `${Math.round(value / 100) / 10}秒`;
};

const MotivationBoard: React.FC<MotivationBoardProps> = ({ snapshot }) => {
  const hasPendingTimingData = snapshot.scopes.some((scope) => scope.averageResponseTimeMs === null);

  return (
    <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Motivation Board</p>
          <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">みんなの積み上げ</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
            あなた自身の累計に加えて、所属グループとアプリ全体の積み上がりを同じ画面で確認できます。
          </p>
        </div>
        <div className="rounded-full border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-bold text-amber-700">
          累計ベースで自動更新
        </div>
      </div>

      <div className="mt-5 rounded-[28px] bg-medace-500 px-5 py-5 text-white">
        <div className="flex items-start gap-3">
          <div className="rounded-2xl bg-white/15 p-3 text-white">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-bold text-white/80">今日のモチベーション</div>
            <div className="mt-1 text-xl font-black tracking-tight">{snapshot.insight.title}</div>
            <div className="mt-2 text-sm leading-relaxed text-white/85">{snapshot.insight.body}</div>
          </div>
        </div>
      </div>

      <div className={`mt-5 grid gap-4 ${snapshot.scopes.length === 2 ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        {snapshot.scopes.map((scope) => {
          const scopeStyle = SCOPE_STYLES[scope.scope];

          return (
            <article
              key={scope.scope}
              className={`rounded-[28px] border p-5 shadow-sm ${scopeStyle.cardClassName}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-black tracking-tight text-slate-950">{scope.label}</div>
                  <div className="mt-1 text-sm leading-relaxed text-slate-500">{scope.description}</div>
                </div>
                <div className={`rounded-full border px-3 py-1 text-[11px] font-bold ${scopeStyle.badgeClassName}`}>
                  {scope.scope === 'PERSONAL' ? 'あなたの累計' : `登録者 ${formatCount(scope.registeredUsers)} 人`}
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Target className="h-3.5 w-3.5" />
                    総回答数
                  </div>
                  <div className={`mt-2 text-2xl font-black ${scopeStyle.accentClassName}`}>{formatCount(scope.totalAnswers)}</div>
                </div>

                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Users className="h-3.5 w-3.5" />
                    総正解数
                  </div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{formatCount(scope.totalCorrect)}</div>
                </div>

                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <Clock3 className="h-3.5 w-3.5" />
                    累計学習時間
                  </div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{formatDuration(scope.totalStudyTimeMs)}</div>
                </div>

                <div className="rounded-2xl border border-white/70 bg-white/80 px-4 py-4">
                  <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                    <TimerReset className="h-3.5 w-3.5" />
                    平均解答時間
                  </div>
                  <div className="mt-2 text-2xl font-black text-slate-950">{formatAverageTime(scope.averageResponseTimeMs)}</div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/85 px-4 py-3">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">正答率</div>
                  <div className="mt-1 text-lg font-black text-slate-950">{scope.accuracyRate}%</div>
                </div>
                {scope.scope !== 'PERSONAL' && (
                  <div className="text-right">
                    <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">参加人数</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{formatCount(scope.registeredUsers)}人</div>
                  </div>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {hasPendingTimingData && (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          平均解答時間は、このアップデート以降の回答から順次集計します。
        </div>
      )}
    </section>
  );
};

export default MotivationBoard;
