import React from 'react';
import { Award } from 'lucide-react';

import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import type { WordData } from '../../types';

interface StudyFinishedViewProps {
  isMobileViewport: boolean;
  leveledUp: boolean;
  sessionWordCount: number;
  earnedXP: number;
  streakBonusXP: number;
  nextReviewMessage: string;
  weaknessSummary: string;
  reviewPreview: WordData[];
  onStartSpellingCheck: () => void;
  onExit: () => void;
}

export const StudyFinishedView: React.FC<StudyFinishedViewProps> = ({
  isMobileViewport,
  leveledUp,
  sessionWordCount,
  earnedXP,
  streakBonusXP,
  nextReviewMessage,
  weaknessSummary,
  reviewPreview,
  onStartSpellingCheck,
  onExit,
}) => {
  if (isMobileViewport) {
    return (
      <div className="bg-[#fff8f1] px-1 pb-28 pt-1">
        <div className="mx-auto max-w-xl space-y-4">
          <section className="rounded-[28px] bg-white px-5 py-5 shadow-xl">
            <div className="flex flex-col items-center text-center">
              {leveledUp && (
                <div className="mb-3 inline-flex rounded-full bg-medace-500 px-4 py-2 text-xs font-black text-white shadow-lg">
                  LEVEL UP!
                </div>
              )}
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-600">
                <Award className={`h-8 w-8 ${leveledUp ? 'text-yellow-500' : 'text-green-600'}`} />
              </div>
              <h2 className="text-[1.7rem] font-black tracking-tight text-slate-950">クエスト完了！</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {sessionWordCount}語を進めました。次に直すところだけ見れば十分です。
              </p>
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-medace-50 px-4 py-2 text-sm font-bold text-medace-700">
                +{earnedXP + streakBonusXP} XP
                {streakBonusXP > 0 && <span className="text-medace-500">連続学習ボーナス込み</span>}
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Next Action</div>
            <div className="mt-3 grid gap-3">
              <div className="rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4">
                <div className="text-sm font-bold text-slate-900">次の復習タイミング</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-600">{nextReviewMessage}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-bold text-slate-900">明日の入り方</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-600">
                  最初の3分だけでいいので、今日の苦手カードから触ると続けやすいです。
                </div>
              </div>
              <div className="rounded-2xl border border-medace-100 bg-[#fff8ef] px-4 py-4">
                <div className="text-sm font-bold text-slate-900">今日の弱点フォーカス</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-600">{weaknessSummary}</div>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Review Preview</div>
            {reviewPreview.length > 0 ? (
              <div className="mt-3 space-y-3">
                {reviewPreview.map((word) => (
                  <div key={word.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-bold text-slate-900">{word.word}</div>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">今夜もう一度</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{word.definition}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                もう一度に回す単語はありません。このまま次の学習に進めます。
              </div>
            )}
          </section>
        </div>

        <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur">
          <div className="grid gap-2">
            <button
              type="button"
              onClick={onStartSpellingCheck}
              className="w-full rounded-2xl bg-medace-600 px-6 py-3 font-bold text-white shadow-lg transition-all hover:bg-medace-700"
            >
              スペルチェックを5問
            </button>
            <button
              data-testid="study-finish-exit"
              onClick={onExit}
              className="w-full rounded-2xl border border-slate-200 bg-white px-6 py-3 font-bold text-slate-700 transition-all hover:border-medace-300 hover:text-medace-700"
            >
              ダッシュボードに戻る
            </button>
          </div>
        </MobileStickyActionBar>
      </div>
    );
  }

  return (
    <div className="relative mx-auto max-w-2xl overflow-hidden rounded-[32px] bg-white p-6 shadow-2xl animate-in zoom-in duration-500 sm:p-8">
      <div className="absolute inset-0 bg-gradient-to-b from-yellow-50 via-white to-white"></div>
      <div className="relative z-10">
        <div className="flex flex-col items-center text-center">
          {leveledUp && <div className="mb-4 animate-bounce"><span className="inline-block rounded-full bg-medace-500 px-4 py-2 text-sm font-black text-white shadow-lg">LEVEL UP!</span></div>}
          <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 shadow-inner">
            <Award className={`h-10 w-10 ${leveledUp ? 'text-yellow-500' : 'text-green-600'}`} />
          </div>
          <h2 className="text-3xl font-black text-slate-900">クエスト完了！</h2>
          <p className="mt-2 text-sm text-slate-500">{sessionWordCount}語を進めました。次に直すところだけ見れば十分です。</p>
          <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-medace-50 px-4 py-2 text-sm font-bold text-medace-700">
            +{earnedXP + streakBonusXP} XP {streakBonusXP > 0 && <span className="text-medace-500">連続学習ボーナス込み</span>}
          </div>
        </div>

        <div className="mt-8 grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">次に見直す単語</div>
            {reviewPreview.length > 0 ? (
              <div className="mt-4 space-y-3">
                {reviewPreview.map((word) => (
                  <div key={word.id} className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-bold text-slate-900">{word.word}</div>
                      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">今夜もう一度</span>
                    </div>
                    <div className="mt-1 text-sm text-slate-500">{word.definition}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50 px-4 py-4 text-sm font-medium text-emerald-700">
                もう一度に回す単語はありません。このまま次の学習に進めます。
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-medace-100 bg-[#fff8ef] p-5">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">次の一手</div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <div className="rounded-2xl bg-white px-4 py-4">
                <div className="font-bold text-slate-900">次の復習タイミング</div>
                <div className="mt-1 leading-relaxed">{nextReviewMessage}</div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4">
                <div className="font-bold text-slate-900">明日の入り方</div>
                <div className="mt-1 leading-relaxed">最初の3分だけでいいので、今日の苦手カードから触ると続けやすいです。</div>
              </div>
              <div className="rounded-2xl bg-white px-4 py-4">
                <div className="font-bold text-slate-900">今日の弱点フォーカス</div>
                <div className="mt-1 leading-relaxed">{weaknessSummary}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onStartSpellingCheck}
            className="rounded-2xl bg-medace-600 px-6 py-3 font-bold text-white shadow-lg transition-all hover:bg-medace-700"
          >
            スペルチェックを5問
          </button>
          <button
            type="button"
            onClick={onExit}
            className="rounded-2xl border border-slate-200 bg-white px-6 py-3 font-bold text-slate-700 transition-all hover:border-medace-300 hover:text-medace-700"
          >
            ダッシュボードに戻る
          </button>
        </div>
      </div>
    </div>
  );
};

export default StudyFinishedView;
