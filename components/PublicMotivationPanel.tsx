import React, { useEffect, useState } from 'react';
import { Activity, Clock3, Radio, Sparkles, TimerReset, Users } from 'lucide-react';

import type { PublicMotivationSnapshot } from '../types';

interface PublicMotivationPanelProps {
  snapshot: PublicMotivationSnapshot | null;
  loading: boolean;
  error: string | null;
  title?: string;
  description?: string;
}

const formatCount = (value: number): string => value.toLocaleString('ja-JP');

const formatDuration = (value: number): string => {
  if (value <= 0) return '0分';
  const totalMinutes = Math.max(1, Math.round(value / 60000));
  if (totalMinutes < 60) return `${totalMinutes}分`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}時間` : `${hours}時間${minutes}分`;
};

const formatAverageTime = (value: number | null): string => {
  if (!value || value <= 0) return '計測中';
  return `${Math.round(value / 100) / 10}秒`;
};

const formatUpdatedAgo = (updatedAt: number, now: number): string => {
  const seconds = Math.max(0, Math.floor((now - updatedAt) / 1000));
  if (seconds < 10) return 'たった今更新';
  if (seconds < 60) return `${seconds}秒前に更新`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分前に更新`;
  return new Date(updatedAt).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const PublicMotivationPanel: React.FC<PublicMotivationPanelProps> = ({
  snapshot,
  loading,
  error,
  title = 'リアルタイム Motivation Board',
  description = 'ログイン前でも、アプリ全体の積み上がりと直近の動きを公開ホームで確認できます。',
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timerId);
  }, []);

  if (loading && !snapshot) {
    return (
      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:p-7">
        <div className="animate-pulse space-y-4">
          <div className="h-4 w-40 rounded bg-slate-100"></div>
          <div className="h-10 w-72 rounded bg-slate-100"></div>
          <div className="grid gap-3 md:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-24 rounded-3xl bg-slate-100"></div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (error && !snapshot) {
    return (
      <section className="rounded-[32px] border border-amber-200 bg-amber-50 p-6 text-sm text-amber-800 shadow-sm md:p-7">
        公開ホーム向けの live 情報を取得できませんでした。{error}
      </section>
    );
  }

  const globalScope = snapshot?.snapshot.scopes[0];
  if (!snapshot || !globalScope) return null;

  return (
    <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#fffaf3_0%,#ffffff_58%,#f5fbff_100%)] p-6 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-medace-500">Live Board</p>
            <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-950 md:text-[2rem]">{title}</h2>
            <p className="mt-3 text-base leading-relaxed text-slate-600">{description}</p>
          </div>
          <div className="rounded-full border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-700">
            {formatUpdatedAgo(snapshot.updatedAt, now)}
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <div className="rounded-3xl border border-emerald-100 bg-[linear-gradient(135deg,#effcf5_0%,#ffffff_100%)] px-5 py-5">
            <div className="flex items-center gap-2 text-sm font-bold text-emerald-700">
              <Radio className="h-4 w-4" />
              直近15分の動き
            </div>
            <div className="mt-3 text-3xl font-black text-slate-950">{formatCount(snapshot.activeLearners15m)}人</div>
            <div className="mt-2 text-sm leading-relaxed text-slate-500">いま学習が動いている人数です。</div>
          </div>
          <div className="rounded-3xl border border-sky-100 bg-[linear-gradient(135deg,#eff8ff_0%,#ffffff_100%)] px-5 py-5">
            <div className="flex items-center gap-2 text-sm font-bold text-sky-700">
              <Users className="h-4 w-4" />
              過去24時間
            </div>
            <div className="mt-3 text-3xl font-black text-slate-950">{formatCount(snapshot.activeLearners24h)}人</div>
            <div className="mt-2 text-sm leading-relaxed text-slate-500">1日の中で学習した人数です。</div>
          </div>
          <div className="rounded-3xl border border-amber-100 bg-[linear-gradient(135deg,#fff7ed_0%,#ffffff_100%)] px-5 py-5">
            <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
              <Activity className="h-4 w-4" />
              過去24時間の更新語数
            </div>
            <div className="mt-3 text-3xl font-black text-slate-950">{formatCount(snapshot.wordsTouched24h)}語</div>
            <div className="mt-2 text-sm leading-relaxed text-slate-500">最後に触れられた単語ログの件数です。</div>
          </div>
        </div>
      </div>

      <div className="grid gap-6 p-6 md:grid-cols-[1.1fr_0.9fr] md:p-8">
        <div className="rounded-[28px] bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_58%,#FFBF52_100%)] px-5 py-5 text-white">
          <div className="flex items-start gap-3">
            <div className="rounded-2xl bg-white/15 p-3 text-white">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-white/80">公開ホームから見える積み上がり</div>
              <div className="mt-1 text-2xl font-black tracking-tight">{snapshot.snapshot.insight.title}</div>
              <div className="mt-3 text-sm leading-relaxed text-white/85">{snapshot.snapshot.insight.body}</div>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <Activity className="h-3.5 w-3.5" />
              総回答数
            </div>
            <div className="mt-2 text-2xl font-black text-slate-950">{formatCount(globalScope.totalAnswers)}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <Users className="h-3.5 w-3.5" />
              登録学習者
            </div>
            <div className="mt-2 text-2xl font-black text-slate-950">{formatCount(globalScope.registeredUsers)}人</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <Clock3 className="h-3.5 w-3.5" />
              累計学習時間
            </div>
            <div className="mt-2 text-2xl font-black text-slate-950">{formatDuration(globalScope.totalStudyTimeMs)}</div>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-slate-50 px-4 py-4">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
              <TimerReset className="h-3.5 w-3.5" />
              平均解答時間
            </div>
            <div className="mt-2 text-2xl font-black text-slate-950">{formatAverageTime(globalScope.averageResponseTimeMs)}</div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PublicMotivationPanel;
