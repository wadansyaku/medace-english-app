import React, { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, RefreshCw } from 'lucide-react';
import type { BookStudyOverview, LearningTaskIntent, UserProfile } from '../../types';
import { learningService } from '../../services/learning';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS, type NaruRangePreset } from '../../shared/naruBook';
import { createNaruChapterTask, type NaruStudyKind } from '../../shared/naruStudy';

interface Props {
  user: UserProfile;
  chapter: NaruRangePreset;
  kind: NaruStudyKind;
  invalidSelection?: boolean;
  onSelect: (task: LearningTaskIntent) => void;
  onBack: () => void;
}
type OverviewState =
  | { key: string; status: 'loading' | 'error' }
  | { key: string; status: 'ready'; data: BookStudyOverview };

const NaruStudySetup: React.FC<Props> = ({ user, chapter, kind, invalidSelection, onSelect, onBack }) => {
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${user.uid}:${chapter.start}:${chapter.end}`;
  const [overview, setOverview] = useState<OverviewState>({ key: requestKey, status: 'loading' });
  useEffect(() => {
    if (invalidSelection) return;
    let cancelled = false;
    setOverview({ key: requestKey, status: 'loading' });
    void learningService.getBookStudyOverview(user.uid, NARU_BOOK_ID, {
      start: chapter.start, end: chapter.end,
    }).then(data => {
      if (!cancelled) setOverview({ key: requestKey, status: 'ready', data });
    }).catch(() => {
      if (!cancelled) setOverview({ key: requestKey, status: 'error' });
    });
    return () => { cancelled = true; };
  }, [user.uid, chapter.start, chapter.end, requestKey, attempt, invalidSelection]);
  const current = overview.key === requestKey ? overview : { key: requestKey, status: 'loading' as const };
  const data = !invalidSelection && current.status === 'ready' ? current.data : null;
  const count = data ? (kind === 'due' ? data.dueCount : data.newCount) : null;
  const canStart = count !== null && count > 0 && !invalidSelection;

  return (
    <section data-testid="naru-study-setup" className="mx-auto max-w-2xl space-y-5 pb-6">
      <button type="button" onClick={onBack} className="flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-slate-600 hover:text-steady-ink">
        <ArrowLeft className="h-4 w-4" /> ダッシュボードに戻る
      </button>
      <div>
        <p className="text-sm font-bold text-medace-800">単語帳の学習</p>
        <h1 className="mt-1 text-2xl font-black text-steady-ink sm:text-3xl">Naruシスト</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">章を選んで、10語ずつ進めましょう。学習した記録はこの一冊にまとまります。</p>
      </div>
      {invalidSelection && <p role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">章の選択を確認できませんでした。下から章を選び直してください。</p>}
      <fieldset>
        <legend className="mb-3 text-base font-bold text-steady-ink">学習する章</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {NARU_RANGE_PRESETS.map(item => (
            <button key={item.id} type="button" data-testid={`naru-study-chapter-${item.id}`}
              aria-pressed={!invalidSelection && chapter.id === item.id}
              onClick={() => onSelect(createNaruChapterTask(item, kind))}
              className={`min-h-14 rounded-2xl border px-3 py-3 text-left transition-colors ${!invalidSelection && chapter.id === item.id ? 'border-medace-500 bg-medace-50 text-steady-ink ring-1 ring-medace-500' : 'border-slate-200 bg-white text-slate-700 hover:border-medace-300'}`}>
              <span className="block text-sm font-bold">{item.label}</span>
              <span className="mt-1 block text-xs text-slate-600">{item.start}–{item.end}</span>
            </button>
          ))}
        </div>
      </fieldset>
      {!invalidSelection && <section aria-label={`${chapter.label}の学習記録`} className="rounded-3xl border border-medace-100 bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-steady-ink">{chapter.label}の学習記録</h2>
          <button type="button" onClick={() => setAttempt(value => value + 1)} disabled={current.status === 'loading'} aria-label="章の学習記録を更新" className="flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-xs font-bold text-slate-600 disabled:opacity-50"><RefreshCw className="h-4 w-4" /> 更新</button>
        </div>
        {data ? (
          <dl data-testid="naru-study-overview" className="mt-3 grid grid-cols-3 gap-2 text-center">
            {[
              ['学習記録あり', data.studiedCount, 'studied'],
              ['新しい単語', data.newCount, 'new'],
              ['期限が来た復習', data.dueCount, 'due'],
            ].map(([label, value, id]) => <div key={id} className="rounded-2xl bg-slate-50 px-2 py-3"><dt className="text-xs leading-relaxed text-slate-600">{label}</dt><dd data-testid={`naru-study-count-${id}`} className="mt-1 text-xl font-black text-steady-ink">{value}<span className="ml-1 text-xs font-medium">語</span></dd></div>)}
          </dl>
        ) : current.status === 'error' ? (
          <div role="alert" data-testid="naru-study-overview-error" className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p>この章の学習記録を読み込めませんでした。通信を確認して、もう一度お試しください。</p>
            <button type="button" onClick={() => setAttempt(value => value + 1)} className="mt-3 min-h-11 rounded-xl border border-amber-300 bg-white px-4 py-2 font-bold">記録をもう一度読み込む</button>
          </div>
        ) : <p role="status" className="mt-3 py-5 text-center text-sm text-slate-600">学習記録を確認しています…</p>}
        {data && <p className="mt-3 text-xs leading-relaxed text-slate-500">この章は全{data.totalCount}語。小テストだけの記録は、カード学習の記録に含めません。</p>}
      </section>}
      <fieldset>
        <legend className="mb-3 text-base font-bold text-steady-ink">進め方</legend>
        <div className="grid grid-cols-2 gap-2">
          {([['new', '新しい単語'], ['due', '期限が来た復習']] as const).map(([value, label]) => (
            <button key={value} type="button" data-testid={`naru-study-kind-${value}`} disabled={Boolean(invalidSelection)} aria-pressed={kind === value}
              onClick={() => { if (!invalidSelection) onSelect(createNaruChapterTask(chapter, value)); }}
              className={`min-h-12 rounded-2xl border px-3 py-3 text-sm font-bold ${kind === value ? 'border-medace-500 bg-medace-50 text-steady-ink' : 'border-slate-200 bg-white text-slate-600'}`}>{label}</button>
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">{kind === 'due' ? '保存した評価から復習時期が決まります。期限前の単語は混ぜません。' : 'まだカードで学習していない単語を、番号順に進めます。'}</p>
      </fieldset>
      {count === 0 && <p role="status" data-testid="naru-study-empty" className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">{kind === 'due' ? 'この章で期限が来た復習はありません。新しい単語を進めるか、あとで戻ってきましょう。' : 'この章には新しい単語がありません。期限が来た復習や、別の章を選べます。'}</p>}
      <button type="button" data-testid="naru-study-start" disabled={!canStart}
        onClick={() => { if (canStart) onSelect(createNaruChapterTask(chapter, kind, true)); }}
        className="flex min-h-13 w-full items-center justify-center gap-2 rounded-2xl bg-steady-action px-5 py-4 font-bold text-steady-on-action hover:bg-steady-action-hover disabled:bg-slate-200 disabled:text-slate-500">
        <BookOpen className="h-5 w-5" /> {kind === 'due' ? '復習' : '新しい単語'}を{count === null ? '最大10' : Math.min(10, count)}語{kind === 'due' ? '確認する' : '学習する'}
      </button>
    </section>
  );
};

export default NaruStudySetup;
