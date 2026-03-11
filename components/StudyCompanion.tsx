import React from 'react';
import { UserProfile } from '../types';
import { Flame, Gift, Shield, Sparkles, Star, Target, Zap } from 'lucide-react';

interface StudyCompanionProps {
  user: UserProfile;
  dueCount: number;
  todayCount: number;
  weekTotal: number;
  dailyGoal: number;
  weeklyGoal: number;
  stabilizedWords: number;
  onStartQuest: () => void;
}

interface CompanionStage {
  title: string;
  subtitle: string;
  unlockScore: number;
  auraClass: string;
  sparkClass: string;
  reward: string;
}

interface MissionCard {
  id: string;
  title: string;
  detail: string;
  progress: number;
  target: number;
  reward: string;
  icon: React.ReactNode;
  toneClass: string;
}

const COMPANION_STAGES: CompanionStage[] = [
  {
    title: 'ねむりのルーモ',
    subtitle: 'まだ小さな灯り。最初の学習で目を覚まします。',
    unlockScore: 0,
    auraClass: 'bg-[#fff8f1]',
    sparkClass: 'bg-orange-200/70',
    reward: 'ルーモのはじめてバッジ',
  },
  {
    title: 'ひだまりルーモ',
    subtitle: '単語に触れるほど表情が明るくなる、学習スペースの相棒。',
    unlockScore: 120,
    auraClass: 'bg-[#fff4e8]',
    sparkClass: 'bg-medace-200/80',
    reward: 'ひだまりフレーム',
  },
  {
    title: 'ことばルーモ',
    subtitle: '復習を整えると、ノートの羽が大きく育ちます。',
    unlockScore: 320,
    auraClass: 'bg-[#ffeedb]',
    sparkClass: 'bg-medace-300/80',
    reward: 'ことばノートスキン',
  },
  {
    title: 'グロウルーモ',
    subtitle: '連続学習が続くと、教室を照らす案内役へ進化します。',
    unlockScore: 680,
    auraClass: 'bg-[#ffe5ca]',
    sparkClass: 'bg-orange-300/80',
    reward: 'グロウ演出エフェクト',
  },
  {
    title: 'スタールーモ',
    subtitle: '安定して学び続ける人だけが連れて歩ける完成形です。',
    unlockScore: 1200,
    auraClass: 'bg-[#ffd9b2]',
    sparkClass: 'bg-amber-300/85',
    reward: 'スタータイトル',
  },
];

const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const getNextMilestone = (value: number, milestones: number[]) => {
  const next = milestones.find((milestone) => milestone > value);
  return next ?? milestones[milestones.length - 1] + 7;
};

const getCompanionMood = (dueCount: number, streak: number, todayCount: number) => {
  if (streak >= 5 && dueCount <= 6 && todayCount > 0) {
    return {
      label: 'ごきげん',
      copy: '今日の学習が入っていて、ルーモがかなり楽しそうです。',
      face: 'happy' as const,
      accent: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    };
  }

  if (dueCount >= 18) {
    return {
      label: 'そわそわ',
      copy: '復習待ちが多めです。先に少し触るとすぐ落ち着きます。',
      face: 'alert' as const,
      accent: 'text-amber-800 bg-amber-50 border-amber-200',
    };
  }

  return {
    label: 'おちつき中',
    copy: 'ペースは安定しています。今日のクエストで育成を進められます。',
    face: 'calm' as const,
    accent: 'text-medace-800 bg-medace-50 border-medace-200',
  };
};

const CompanionIllustration: React.FC<{ stageIndex: number; mood: 'happy' | 'calm' | 'alert'; sparkClass: string }> = ({ stageIndex, mood, sparkClass }) => {
  const mouthPath = mood === 'happy'
    ? 'M112 150 C123 165 137 165 148 150'
    : mood === 'alert'
      ? 'M114 154 C124 145 136 145 146 154'
      : 'M115 152 C124 158 136 158 145 152';

  return (
    <div className="relative mx-auto w-full max-w-[280px]">
      <div className={`absolute left-7 top-8 h-5 w-5 rounded-full blur-sm ${sparkClass} animate-pulse`} />
      <div className={`absolute right-12 top-14 h-3 w-3 rounded-full blur-sm ${sparkClass} animate-pulse`} />
      <div className={`absolute right-6 top-28 h-4 w-4 rounded-full blur-sm ${sparkClass} animate-pulse`} />
      <svg viewBox="0 0 280 240" className="w-full drop-shadow-[0_22px_45px_rgba(255,130,22,0.22)]">
        <defs>
          <linearGradient id="lumoWing" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#FFDCA3" />
          </linearGradient>
        </defs>

        <ellipse cx="140" cy="211" rx="68" ry="18" fill="rgba(102,50,26,0.12)" />
        {stageIndex >= 1 && (
          <path d="M82 123 C55 114 48 155 79 160 C89 151 91 134 82 123 Z" fill="url(#lumoWing)" opacity="0.95" />
        )}
        {stageIndex >= 2 && (
          <path d="M198 123 C225 114 232 155 201 160 C191 151 189 134 198 123 Z" fill="url(#lumoWing)" opacity="0.95" />
        )}

        <path d="M140 46 C168 46 196 66 205 94 C217 132 203 183 140 192 C77 183 63 132 75 94 C84 66 112 46 140 46 Z" fill="#ffb874" />
        <path d="M140 55 C160 54 180 67 187 88 C173 78 157 72 140 72 C123 72 107 78 93 88 C100 67 120 54 140 55 Z" fill="rgba(255,255,255,0.55)" />
        {stageIndex >= 3 && (
          <path d="M95 176 C120 189 160 189 185 176" fill="none" stroke="#FFF4DA" strokeWidth="8" strokeLinecap="round" />
        )}
        {stageIndex >= 4 && (
          <>
            <path d="M119 36 L126 22 L140 33 L154 22 L161 36 Z" fill="#FFF1B3" />
            <circle cx="140" cy="30" r="6" fill="#FFE171" />
          </>
        )}

        <circle cx="114" cy="121" r="10" fill="#2F1609" />
        <circle cx="166" cy="121" r="10" fill="#2F1609" />
        <circle cx="111" cy="118" r="3" fill="#FFFFFF" />
        <circle cx="163" cy="118" r="3" fill="#FFFFFF" />
        <path d={mouthPath} fill="none" stroke="#2F1609" strokeWidth="6" strokeLinecap="round" />
        <circle cx="95" cy="142" r="6" fill="#F7A87A" opacity="0.55" />
        <circle cx="185" cy="142" r="6" fill="#F7A87A" opacity="0.55" />

        {stageIndex >= 1 && (
          <path d="M128 39 C128 25 138 18 140 11 C144 18 153 25 153 39" fill="#FFF4DA" />
        )}
        {stageIndex >= 2 && (
          <>
            <path d="M103 68 C90 62 88 49 96 41 C110 47 116 58 103 68 Z" fill="#FFE8C2" />
            <path d="M177 68 C190 62 192 49 184 41 C170 47 164 58 177 68 Z" fill="#FFE8C2" />
          </>
        )}
      </svg>
    </div>
  );
};

const StudyCompanion: React.FC<StudyCompanionProps> = ({
  user,
  dueCount,
  todayCount,
  weekTotal,
  dailyGoal,
  weeklyGoal,
  stabilizedWords,
  onStartQuest,
}) => {
  const currentStreak = user.stats?.currentStreak ?? 0;
  const level = user.stats?.level ?? 1;
  const xp = user.stats?.xp ?? 0;
  const weeklyProgressPercent = clampPercent((weekTotal / Math.max(weeklyGoal, 1)) * 100);
  const growthScore = weekTotal * 4 + level * 24 + currentStreak * 18 + stabilizedWords * 2 + Math.round(weeklyProgressPercent * 0.8);
  const currentStageIndex = Math.max(
    0,
    COMPANION_STAGES.reduce((best, stage, index) => (growthScore >= stage.unlockScore ? index : best), 0),
  );
  const currentStage = COMPANION_STAGES[currentStageIndex];
  const nextStage = COMPANION_STAGES[Math.min(currentStageIndex + 1, COMPANION_STAGES.length - 1)];
  const stageSpan = Math.max(nextStage.unlockScore - currentStage.unlockScore, 1);
  const stageProgress = currentStageIndex === COMPANION_STAGES.length - 1
    ? 100
    : clampPercent(((growthScore - currentStage.unlockScore) / stageSpan) * 100);
  const nextStageDelta = currentStageIndex === COMPANION_STAGES.length - 1
    ? 0
    : Math.max(nextStage.unlockScore - growthScore, 0);
  const mood = getCompanionMood(dueCount, currentStreak, todayCount);
  const streakMilestone = getNextMilestone(currentStreak, [3, 7, 14, 21, 30]);
  const reviewGoal = dueCount > 0 ? Math.min(Math.max(6, Math.ceil(dailyGoal * 0.7)), dueCount) : 1;
  const stampCount = 7;
  const bondPercent = clampPercent(currentStreak * 8 + Math.min(todayCount, dailyGoal) * 3 + Math.round(weeklyProgressPercent * 0.35));
  const weeklyRemaining = Math.max(weeklyGoal - weekTotal, 0);

  const missions: MissionCard[] = [
    {
      id: 'today-goal',
      title: '今日の単語クエスト',
      detail: `${dailyGoal}語に触れてルーモの灯りを強くする`,
      progress: Math.min(todayCount, dailyGoal),
      target: dailyGoal,
      reward: '+35 きらめき',
      icon: <Target className="h-4 w-4" />,
      toneClass: 'border-medace-100 bg-medace-50 text-medace-900',
    },
    {
      id: 'review-reset',
      title: dueCount > 0 ? '復習レスキュー' : '復習ゼロをキープ',
      detail: dueCount > 0 ? `${reviewGoal}語ぶん整理して落ち着かせる` : '今のペースを保って安定ボーナスを受け取る',
      progress: dueCount > 0 ? Math.min(todayCount, reviewGoal) : 1,
      target: reviewGoal,
      reward: dueCount > 0 ? '+1 シールド' : '安定ボーナス',
      icon: <Shield className="h-4 w-4" />,
      toneClass: 'border-amber-100 bg-amber-50 text-amber-900',
    },
    {
      id: 'streak',
      title: '連続ログインボーナス',
      detail: `${streakMilestone}日まで続けて進化速度を上げる`,
      progress: Math.min(currentStreak, streakMilestone),
      target: streakMilestone,
      reward: streakMilestone >= 7 ? '演出アンロック' : '+20 きらめき',
      icon: <Flame className="h-4 w-4" />,
      toneClass: 'border-orange-100 bg-orange-50 text-orange-900',
    },
    {
      id: 'weekly-pace',
      title: '今週のペースメイク',
      detail: `今週は${weeklyGoal}語まで進める`,
      progress: Math.min(weekTotal, weeklyGoal),
      target: weeklyGoal,
      reward: weeklyRemaining === 0 ? '今週クリア' : 'ペース維持ボーナス',
      icon: <Star className="h-4 w-4" />,
      toneClass: 'border-slate-200 bg-white text-slate-800',
    },
  ];

  return (
    <section className="overflow-hidden rounded-[32px] border border-medace-100 bg-white shadow-[0_24px_60px_rgba(228,94,4,0.12)]">
      <div className="grid gap-0 xl:grid-cols-[0.95fr_1.05fr]">
        <div className={`relative overflow-hidden ${currentStage.auraClass} px-6 py-7 md:px-7 md:py-8`}>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,255,255,0.72),_transparent_34%),radial-gradient(circle_at_bottom_right,_rgba(246,109,11,0.14),_transparent_30%)]" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/80 bg-white/70 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-medace-900">
                学習相棒
              </span>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${mood.accent}`}>
                気分: {mood.label}
              </span>
            </div>

            <div className="mt-5">
              <p className="text-sm font-bold uppercase tracking-[0.18em] text-medace-700/80">学習相棒 ルーモ</p>
              <h3 className="mt-2 text-3xl font-black tracking-tight text-medace-900">{currentStage.title}</h3>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-medace-900/70">{currentStage.subtitle}</p>
            </div>

            <div className="mt-6">
              <CompanionIllustration stageIndex={currentStageIndex} mood={mood.face} sparkClass={currentStage.sparkClass} />
            </div>

            <div className="mt-5 rounded-[28px] border border-white/70 bg-white/70 p-4 backdrop-blur-sm">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/65">きずなゲージ</div>
                  <div className="mt-1 text-2xl font-black text-medace-900">{bondPercent}%</div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/65">進化まで</div>
                  <div className="mt-1 text-sm font-bold text-medace-900">
                    {nextStageDelta === 0 ? '完成形' : `あと ${nextStageDelta}pt`}
                  </div>
                </div>
              </div>
              <div className="mt-4 h-3 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-medace-500 transition-all duration-700" style={{ width: `${stageProgress}%` }} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-medace-900/72">{mood.copy}</p>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">今日の育成の流れ</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">今日の育成ミッション</h3>
              </div>
            <button
              onClick={onStartQuest}
              className="inline-flex items-center gap-2 rounded-2xl bg-medace-600 px-4 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-medace-700"
            >
              <Zap className="h-4 w-4" /> クエストへ進む
            </button>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <div className="space-y-3">
              {missions.map((mission) => {
                const progressPercent = clampPercent((mission.progress / Math.max(mission.target, 1)) * 100);
                return (
                  <div key={mission.id} className={`rounded-[24px] border px-4 py-4 ${mission.toneClass}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 rounded-2xl bg-white/80 p-2 text-current shadow-sm">
                          {mission.icon}
                        </div>
                        <div>
                          <div className="text-sm font-black">{mission.title}</div>
                          <div className="mt-1 text-sm leading-relaxed opacity-80">{mission.detail}</div>
                        </div>
                      </div>
                      <div className="whitespace-nowrap text-xs font-bold opacity-80">{mission.reward}</div>
                    </div>
                    <div className="mt-4 flex items-center justify-between text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">
                      <span>進み具合</span>
                      <span>{mission.progress} / {mission.target}</span>
                    </div>
                    <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/80">
                      <div className="h-full rounded-full bg-medace-500 transition-all duration-700" style={{ width: `${progressPercent}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="space-y-4">
              <div className="rounded-[28px] border border-medace-100 bg-[#fff8ef] px-5 py-5">
                <div className="flex items-center gap-2 text-medace-700">
                  <Gift className="h-4 w-4" />
                  <span className="text-xs font-bold uppercase tracking-[0.18em]">次のごほうび</span>
                </div>
                <div className="mt-3 text-xl font-black text-slate-950">{currentStageIndex === COMPANION_STAGES.length - 1 ? currentStage.reward : nextStage.reward}</div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {currentStageIndex === COMPANION_STAGES.length - 1
                    ? 'ルーモは完成形です。学習を続けて高い状態を維持しましょう。'
                    : `${nextStage.title} になると受け取れます。学習スコアを ${nextStageDelta}pt 積むと解放されます。`}
                </p>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">7日スタンプ</div>
                    <div className="mt-1 text-lg font-black text-slate-950">{currentStreak}日連続</div>
                  </div>
                  <div className="rounded-full bg-medace-50 px-3 py-1 text-xs font-bold text-medace-800">
                    Lv.{level} / {xp} XP
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-7 gap-2">
                  {Array.from({ length: stampCount }).map((_, index) => {
                    const isActive = index < Math.min(currentStreak, stampCount);
                    return (
                      <div
                        key={index}
                        className={`flex aspect-square items-center justify-center rounded-2xl border text-xs font-black ${
                          isActive
                            ? 'border-medace-200 bg-medace-500 text-white shadow-sm'
                            : 'border-slate-200 bg-slate-50 text-slate-300'
                        }`}
                      >
                        {index + 1}
                      </div>
                    );
                  })}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">
                  7日そろうとルーモの演出が派手になります。まずは途切れないリズムを作るのが最優先です。
                </p>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-white px-5 py-5">
                <div className="flex items-center gap-2 text-slate-500">
                  <Sparkles className="h-4 w-4 text-medace-500" />
                  <span className="text-xs font-bold uppercase tracking-[0.18em]">成長メモ</span>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">今日の達成</div>
                    <div className="mt-2 text-xl font-black text-slate-950">{todayCount}</div>
                    <div className="mt-1 text-xs text-slate-500">/ {dailyGoal} 語</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">定着ゾーン</div>
                    <div className="mt-2 text-xl font-black text-slate-950">{stabilizedWords}</div>
                    <div className="mt-1 text-xs text-slate-500">復習期 + 定着済</div>
                  </div>
                  <div className="rounded-2xl bg-slate-50 px-4 py-4">
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">今週の学習</div>
                    <div className="mt-2 text-xl font-black text-slate-950">{weekTotal}</div>
                    <div className="mt-1 text-xs text-slate-500">/ {weeklyGoal} 語</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default StudyCompanion;
