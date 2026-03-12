import React from 'react';
import { RefreshCw, Settings, Sparkles, Target, User, X } from 'lucide-react';
import {
  GRADE_LABELS,
  LEARNING_PREFERENCE_INTENSITY_LABELS,
  SUBSCRIPTION_PLAN_LABELS,
  LearningPreferenceIntensity,
  type AccountOverview,
  UserGrade,
  type UserStudyMode,
  UserStudyMode as UserStudyModeEnum,
  USER_STUDY_MODE_LABELS,
} from '../../types';
import type { DisplayDensity, DisplayFontSize } from '../../utils/displayPreferences';
import useIsMobileViewport from '../../hooks/useIsMobileViewport';
import MobileSheetDialog from '../mobile/MobileSheetDialog';
import MobileStickyActionBar from '../mobile/MobileStickyActionBar';
import QuickChoiceButton from './QuickChoiceButton';

const TARGET_EXAM_PRESETS = ['定期テスト', '英検5級', '英検4級', '英検3級', '英検準2級', '英検2級', '共通テスト'];
const TARGET_SCORE_PRESETS = ['合格', '60点', '70点', '80点', '90点', '100点'];
const WEEKLY_STUDY_DAY_OPTIONS = [2, 3, 4, 5, 6, 7];
const DAILY_STUDY_MINUTE_OPTIONS = [10, 15, 20, 30, 45, 60];
const WEAK_SKILL_PRESETS = ['単語の意味', 'スペリング', '熟語', '長文読解', 'リスニング', '英作文'];
const DISPLAY_FONT_SIZE_OPTIONS: Array<{ value: DisplayFontSize; label: string; description: string; }> = [
  { value: 'standard', label: '標準', description: '情報量を保ちながら、読みやすさを整えます。' },
  { value: 'large', label: '大きめ', description: '本文と入力欄を一段大きく表示します。' },
];
const DISPLAY_DENSITY_OPTIONS: Array<{ value: DisplayDensity; label: string; description: string; }> = [
  { value: 'standard', label: '標準', description: '画面内の情報量を保ちつつ、見渡しやすく表示します。' },
  { value: 'comfortable', label: 'ゆったり', description: '行間とボタンの余白を広めにして表示します。' },
];

interface DashboardSettingsModalProps {
  open: boolean;
  accountOverview: AccountOverview | null;
  currentEnglishLevel?: string;
  editName: string;
  editGrade: UserGrade;
  editStudyMode: UserStudyMode;
  editTargetExam: string;
  editTargetScore: string;
  editExamDate: string;
  editWeeklyStudyDays: number;
  editDailyStudyMinutes: number;
  editWeakSkillFocus: string;
  editMotivationNote: string;
  editIntensity: LearningPreferenceIntensity;
  editDisplayFontSize: DisplayFontSize;
  editDisplayDensity: DisplayDensity;
  isSavingProfile: boolean;
  onClose: () => void;
  onRetakeLevel: () => void;
  onSave: () => void;
  onEditName: (value: string) => void;
  onEditGrade: (value: UserGrade) => void;
  onEditStudyMode: (value: UserStudyMode) => void;
  onEditTargetExam: (value: string) => void;
  onEditTargetScore: (value: string) => void;
  onEditExamDate: (value: string) => void;
  onEditWeeklyStudyDays: (value: number) => void;
  onEditDailyStudyMinutes: (value: number) => void;
  onEditWeakSkillFocus: (value: string) => void;
  onEditMotivationNote: (value: string) => void;
  onEditIntensity: (value: LearningPreferenceIntensity) => void;
  onEditDisplayFontSize: (value: DisplayFontSize) => void;
  onEditDisplayDensity: (value: DisplayDensity) => void;
}

interface MobileSettingsSectionProps {
  title: string;
  description: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

const MobileSettingsSection: React.FC<MobileSettingsSectionProps> = ({
  title,
  description,
  defaultOpen = false,
  badge,
  children,
}) => (
  <details open={defaultOpen} className="rounded-[28px] border border-slate-200 bg-white px-4 py-4 shadow-sm">
    <summary className="list-none cursor-pointer">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-base font-black text-slate-950">{title}</div>
          <div className="mt-1 text-sm leading-relaxed text-slate-500">{description}</div>
        </div>
        {badge}
      </div>
    </summary>
    <div className="mt-4 space-y-5">{children}</div>
  </details>
);

const DashboardSettingsModal: React.FC<DashboardSettingsModalProps> = ({
  open,
  accountOverview,
  currentEnglishLevel,
  editName,
  editGrade,
  editStudyMode,
  editTargetExam,
  editTargetScore,
  editExamDate,
  editWeeklyStudyDays,
  editDailyStudyMinutes,
  editWeakSkillFocus,
  editMotivationNote,
  editIntensity,
  editDisplayFontSize,
  editDisplayDensity,
  isSavingProfile,
  onClose,
  onRetakeLevel,
  onSave,
  onEditName,
  onEditGrade,
  onEditStudyMode,
  onEditTargetExam,
  onEditTargetScore,
  onEditExamDate,
  onEditWeeklyStudyDays,
  onEditDailyStudyMinutes,
  onEditWeakSkillFocus,
  onEditMotivationNote,
  onEditIntensity,
  onEditDisplayFontSize,
  onEditDisplayDensity,
}) => {
  const isMobileViewport = useIsMobileViewport();
  if (!open) return null;

  const quickChoiceRailClassName = 'flex gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible';
  const quickChoiceClassName = 'min-h-11 shrink-0 sm:min-h-0';

  if (isMobileViewport) {
    return (
      <MobileSheetDialog
        onClose={onClose}
        mode="fullscreen"
        panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-[#fff8f1]"
      >
        <div
          data-testid="settings-modal-mobile"
          className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur"
        >
          <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
          <div className="pr-12">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Profile Settings</p>
            <h3 className="mt-2 text-[1.55rem] font-black tracking-tight text-slate-950">設定・プロフィール</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-500">
              今日はここだけ決めれば十分です。細かい項目は下のセクションであとから調整できます。
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-5">
          <div className="space-y-4">
            <section className="rounded-[28px] bg-medace-500 px-4 py-4 text-white shadow-[0_18px_45px_rgba(255,130,22,0.2)]">
              <div className="text-xs font-bold uppercase tracking-[0.18em] text-white/58">Today Summary</div>
              <div className="mt-2 text-xl font-black tracking-tight">いまの学習条件を 1 画面で確認</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">
                  {GRADE_LABELS[editGrade]}
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">
                  {USER_STUDY_MODE_LABELS[editStudyMode]}
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">
                  {editDailyStudyMinutes}分 / 日
                </span>
                <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">
                  {LEARNING_PREFERENCE_INTENSITY_LABELS[editIntensity]}
                </span>
              </div>
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/8 px-4 py-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/58">現在のレベル</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-lg font-black">{currentEnglishLevel || '未診断'}</span>
                  <button
                    onClick={onRetakeLevel}
                    className="inline-flex min-h-11 items-center gap-1 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-bold text-white"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    再診断
                  </button>
                </div>
                {accountOverview && (
                  <div className="mt-3 text-sm leading-relaxed text-white/78">
                    {SUBSCRIPTION_PLAN_LABELS[accountOverview.subscriptionPlan]} / {accountOverview.priceLabel}
                  </div>
                )}
              </div>
            </section>

            <MobileSettingsSection
              title="今日の学習条件"
              description="目標・学習時間・強度を先に整えると、毎日の導線が安定します。"
              defaultOpen
              badge={<span className="rounded-full border border-medace-200 bg-medace-50 px-3 py-1 text-[11px] font-bold text-medace-700">優先</span>}
            >
              <div>
                <label className="ui-form-label">目標試験・確認対象</label>
                <div className={quickChoiceRailClassName}>
                  {TARGET_EXAM_PRESETS.map((preset) => (
                    <QuickChoiceButton
                      key={preset}
                      active={editTargetExam === preset}
                      label={preset}
                      onClick={() => onEditTargetExam(preset)}
                      className={quickChoiceClassName}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={editTargetExam}
                  onChange={(event) => onEditTargetExam(event.target.value)}
                  placeholder="例: 英検2級 / 定期テスト / 共通テスト"
                  className="ui-input mt-3"
                />
              </div>

              <div className="grid gap-4">
                <div>
                  <label className="ui-form-label">目標の目安</label>
                  <div className={quickChoiceRailClassName}>
                    {TARGET_SCORE_PRESETS.map((preset) => (
                      <QuickChoiceButton
                        key={preset}
                        active={editTargetScore === preset}
                        label={preset}
                        onClick={() => onEditTargetScore(preset)}
                        className={quickChoiceClassName}
                      />
                    ))}
                  </div>
                  <input
                    type="text"
                    value={editTargetScore}
                    onChange={(event) => onEditTargetScore(event.target.value)}
                    placeholder="例: 合格 / 80点 / 偏差値60"
                    className="ui-input mt-3"
                  />
                </div>

                <div>
                  <label className="ui-form-label">試験日</label>
                  <div className="grid gap-3">
                    <input
                      type="date"
                      value={editExamDate}
                      onChange={(event) => onEditExamDate(event.target.value)}
                      className="ui-input"
                    />
                    {editExamDate && (
                      <button
                        type="button"
                        onClick={() => onEditExamDate('')}
                        className="min-h-11 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500"
                      >
                        試験日をクリア
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="ui-form-label">週の学習日数</label>
                <div className={quickChoiceRailClassName}>
                  {WEEKLY_STUDY_DAY_OPTIONS.map((days) => (
                    <QuickChoiceButton
                      key={days}
                      active={editWeeklyStudyDays === days}
                      label={`${days}日`}
                      onClick={() => onEditWeeklyStudyDays(days)}
                      className={quickChoiceClassName}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="ui-form-label">1日の学習時間</label>
                <div className={quickChoiceRailClassName}>
                  {DAILY_STUDY_MINUTE_OPTIONS.map((minutes) => (
                    <QuickChoiceButton
                      key={minutes}
                      active={editDailyStudyMinutes === minutes}
                      label={`${minutes}分`}
                      onClick={() => onEditDailyStudyMinutes(minutes)}
                      className={quickChoiceClassName}
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={editDailyStudyMinutes}
                    onChange={(event) => onEditDailyStudyMinutes(Number(event.target.value))}
                    className="w-full accent-[#f66d0b]"
                  />
                  <div className="rounded-full bg-medace-50 px-4 py-2 text-base font-black text-medace-700">{editDailyStudyMinutes}分</div>
                </div>
              </div>

              <div>
                <label className="ui-form-label">学習の濃さ</label>
                <div className="grid gap-3">
                  {Object.values(LearningPreferenceIntensity).map((intensity) => (
                    <button
                      key={intensity}
                      type="button"
                      onClick={() => onEditIntensity(intensity)}
                      className={`ui-option-card ${editIntensity === intensity ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                    >
                      <div className="text-base font-bold">{LEARNING_PREFERENCE_INTENSITY_LABELS[intensity]}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-500">
                        {intensity === LearningPreferenceIntensity.BALANCED
                          ? '無理なく続けやすい標準ペース'
                          : intensity === LearningPreferenceIntensity.REVIEW_HEAVY
                            ? '復習を多めに入れて定着重視'
                            : '短期間で多めに進めたい'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </MobileSettingsSection>

            <MobileSettingsSection
              title="プロフィールと表示"
              description="表示名・学年・表示密度など、普段の見え方を整える項目です。"
              badge={<span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">基本</span>}
            >
              <div>
                <label className="ui-form-label">表示名</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => onEditName(event.target.value)}
                  className="ui-input font-bold"
                  placeholder="表示名を入力"
                />
              </div>

              <div>
                <label className="ui-form-label">学年・属性</label>
                <select
                  value={editGrade}
                  onChange={(event) => onEditGrade(event.target.value as UserGrade)}
                  className="ui-input font-bold"
                >
                  {Object.values(UserGrade).map((grade) => (
                    <option key={grade} value={grade}>{GRADE_LABELS[grade]}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="ui-form-label">表示モード</label>
                <div className="grid gap-3">
                  {[UserStudyModeEnum.FOCUS, UserStudyModeEnum.GAME].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onEditStudyMode(mode)}
                      className={`ui-option-card ${editStudyMode === mode ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                    >
                      <div className="text-base font-bold">{USER_STUDY_MODE_LABELS[mode]}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-500">
                        {mode === UserStudyModeEnum.FOCUS
                          ? '今日やることを優先して、落ち着いて学習します。'
                          : '相棒・ランキングも出して、達成感を強めます。'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="ui-form-label">文字サイズ</label>
                <div className="grid gap-3">
                  {DISPLAY_FONT_SIZE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onEditDisplayFontSize(option.value)}
                      className={`ui-option-card ${editDisplayFontSize === option.value ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                    >
                      <div className="text-base font-bold">{option.label}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-500">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="ui-form-label">画面の余白</label>
                <div className="grid gap-3">
                  {DISPLAY_DENSITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onEditDisplayDensity(option.value)}
                      className={`ui-option-card ${editDisplayDensity === option.value ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                    >
                      <div className="text-base font-bold">{option.label}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-500">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </MobileSettingsSection>

            <MobileSettingsSection
              title="苦手分野とメモ"
              description="講師共有やプラン調整に使う補足情報です。必要なときだけ埋めれば十分です。"
              badge={<span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold text-slate-500">補足</span>}
            >
              <div>
                <label className="ui-form-label">苦手分野</label>
                <div className={quickChoiceRailClassName}>
                  {WEAK_SKILL_PRESETS.map((preset) => (
                    <QuickChoiceButton
                      key={preset}
                      active={editWeakSkillFocus === preset}
                      label={preset}
                      onClick={() => onEditWeakSkillFocus(preset)}
                      className={quickChoiceClassName}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={editWeakSkillFocus}
                  onChange={(event) => onEditWeakSkillFocus(event.target.value)}
                  placeholder="例: 長文読解 / 熟語 / 医療語彙"
                  className="ui-input mt-3"
                />
              </div>

              <div>
                <label className="ui-form-label">講師に伝えたいこと</label>
                <textarea
                  value={editMotivationNote}
                  onChange={(event) => onEditMotivationNote(event.target.value)}
                  placeholder="例: 通学中に15分だけ復習したい / テスト前は熟語を優先したい"
                  className="ui-input h-32 resize-none font-medium"
                />
                <p className="ui-field-note">
                  ここで設定した条件をもとに、学習プランと今日の導線を調整します。
                </p>
              </div>
            </MobileSettingsSection>
          </div>
        </div>

        <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur">
          <div className="flex flex-col-reverse gap-3">
            <button
              onClick={onClose}
              type="button"
              className="min-h-11 rounded-2xl border border-slate-200 px-6 py-3 text-base font-bold text-slate-600 transition-colors hover:bg-slate-50"
            >
              閉じる
            </button>
            <button
              data-testid="settings-save-button"
              onClick={onSave}
              disabled={isSavingProfile}
              className="min-h-11 rounded-2xl bg-medace-700 px-6 py-3 text-base font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isSavingProfile ? '保存中...' : '変更を保存'}
            </button>
          </div>
        </MobileStickyActionBar>
      </MobileSheetDialog>
    );
  }

  return (
    <MobileSheetDialog
      onClose={onClose}
      mode="fullscreen"
      panelClassName="flex h-full max-h-[100dvh] min-h-[100dvh] flex-col bg-white sm:max-h-[calc(100dvh-3rem)] sm:min-h-0 sm:rounded-[32px] sm:border sm:border-slate-200 sm:shadow-2xl"
    >
      <div className="safe-pad-top sticky top-0 z-10 border-b border-slate-100 bg-white/96 px-4 pb-4 pt-4 backdrop-blur sm:rounded-t-[32px] sm:px-7 sm:pt-6">
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-2.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 sm:right-5 sm:top-5">
          <X className="h-5 w-5" />
        </button>
        <div className="flex flex-wrap items-start gap-4 pr-12">
          <div className="rounded-2xl bg-slate-100 p-3 text-slate-600">
            <User className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500">Profile Settings</p>
            <h3 className="mt-2 text-[1.7rem] font-black tracking-tight text-slate-950 sm:text-[1.9rem]">設定・プロフィール</h3>
            <p className="mt-2 max-w-2xl text-[0.95rem] leading-relaxed text-slate-500 sm:text-[0.98rem]">
              よく使う項目はタップだけで埋められるようにしました。自由入力もそのまま使えます。
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-7 sm:py-6">
      <div className="grid gap-5 lg:grid-cols-[0.92fr_1.08fr]">
        <section className="space-y-5">
          <div className="ui-panel-subtle">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <User className="h-4 w-4 text-medace-600" />
              基本プロフィール
            </div>
            <div className="mt-4 space-y-4">
              <div>
                <label className="ui-form-label">表示名</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(event) => onEditName(event.target.value)}
                  className="ui-input font-bold"
                  placeholder="表示名を入力"
                />
              </div>
              <div>
                <label className="ui-form-label">学年・属性</label>
                <select
                  value={editGrade}
                  onChange={(event) => onEditGrade(event.target.value as UserGrade)}
                  className="ui-input font-bold"
                >
                  {Object.values(UserGrade).map((grade) => (
                    <option key={grade} value={grade}>{GRADE_LABELS[grade]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="ui-form-label">表示モード</label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {[UserStudyModeEnum.FOCUS, UserStudyModeEnum.GAME].map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => onEditStudyMode(mode)}
                      className={`ui-option-card ${editStudyMode === mode ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                    >
                      <div className="text-base font-bold">{USER_STUDY_MODE_LABELS[mode]}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-500">
                        {mode === UserStudyModeEnum.FOCUS
                          ? '今日やることを優先して、落ち着いて学習します。'
                          : '相棒・ランキングも出して、達成感を強めます。'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ui-panel">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Settings className="h-4 w-4 text-medace-600" />
              表示設定
            </div>
            <p className="ui-field-note">
              文字の大きさと余白を調整できます。ホーム画面から学習画面まで同じ表示で反映されます。
            </p>
            <div className="mt-4 space-y-5">
              <div>
                <label className="ui-form-label">文字サイズ</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DISPLAY_FONT_SIZE_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onEditDisplayFontSize(option.value)}
                      className={`ui-option-card ${editDisplayFontSize === option.value ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                    >
                      <div className="text-base font-bold">{option.label}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-500">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="ui-form-label">画面の余白</label>
                <div className="grid gap-3 sm:grid-cols-2">
                  {DISPLAY_DENSITY_OPTIONS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => onEditDisplayDensity(option.value)}
                      className={`ui-option-card ${editDisplayDensity === option.value ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                    >
                      <div className="text-base font-bold">{option.label}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-500">{option.description}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="ui-panel">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Target className="h-4 w-4 text-medace-600" />
              現在の学習状態
            </div>
            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="text-sm font-bold text-slate-500">現在のレベル</div>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-lg font-black text-medace-700">{currentEnglishLevel || '未診断'}</span>
                  <button
                    onClick={onRetakeLevel}
                    className="inline-flex items-center gap-1 rounded-full border border-medace-200 bg-white px-4 py-2.5 text-sm font-bold text-medace-700 hover:bg-medace-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    レベル診断を再受講
                  </button>
                </div>
              </div>
              {accountOverview && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                  <div className="text-sm font-bold text-slate-500">現在のプラン</div>
                  <div className="mt-2 text-[1.02rem] font-bold text-slate-900">{SUBSCRIPTION_PLAN_LABELS[accountOverview.subscriptionPlan]}</div>
                  <div className="mt-1 text-sm text-slate-500">{accountOverview.audienceLabel} / {accountOverview.priceLabel}</div>
                  <div className="mt-2 text-[0.98rem] leading-relaxed text-slate-500">{accountOverview.pricingNote}</div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="space-y-5">
          <div className="ui-panel-subtle">
            <div className="flex items-center gap-2 text-base font-bold text-slate-900">
              <Sparkles className="h-4 w-4 text-medace-600" />
              学習の個別設定
            </div>
            <p className="mt-2 text-[0.98rem] leading-relaxed text-slate-500">
              クイック選択で埋めてから、必要なところだけ自由入力できます。講師への共有メモにも使えます。
            </p>

            <div className="mt-5 space-y-5">
              <div>
                <label className="ui-form-label">目標試験・確認対象</label>
                <div className={quickChoiceRailClassName}>
                  {TARGET_EXAM_PRESETS.map((preset) => (
                    <QuickChoiceButton
                      key={preset}
                      active={editTargetExam === preset}
                      label={preset}
                      onClick={() => onEditTargetExam(preset)}
                      className={quickChoiceClassName}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={editTargetExam}
                  onChange={(event) => onEditTargetExam(event.target.value)}
                  placeholder="例: 英検2級 / 定期テスト / 共通テスト"
                  className="ui-input mt-3"
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[0.92fr_1.08fr]">
                <div>
                  <label className="ui-form-label">目標の目安</label>
                  <div className={quickChoiceRailClassName}>
                    {TARGET_SCORE_PRESETS.map((preset) => (
                      <QuickChoiceButton
                        key={preset}
                        active={editTargetScore === preset}
                        label={preset}
                        onClick={() => onEditTargetScore(preset)}
                        className={quickChoiceClassName}
                      />
                    ))}
                  </div>
                  <input
                    type="text"
                    value={editTargetScore}
                    onChange={(event) => onEditTargetScore(event.target.value)}
                    placeholder="例: 合格 / 80点 / 偏差値60"
                    className="ui-input mt-3"
                  />
                </div>
                <div>
                  <label className="ui-form-label">試験日</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={editExamDate}
                      onChange={(event) => onEditExamDate(event.target.value)}
                      className="ui-input"
                    />
                    {editExamDate && (
                      <button
                        type="button"
                        onClick={() => onEditExamDate('')}
                        className="rounded-full border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-500 hover:bg-slate-50"
                      >
                        クリア
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="ui-form-label">週の学習日数</label>
                <div className={quickChoiceRailClassName}>
                  {WEEKLY_STUDY_DAY_OPTIONS.map((days) => (
                    <QuickChoiceButton
                      key={days}
                      active={editWeeklyStudyDays === days}
                      label={`${days}日`}
                      onClick={() => onEditWeeklyStudyDays(days)}
                      className={quickChoiceClassName}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="ui-form-label">1日の学習時間</label>
                <div className={quickChoiceRailClassName}>
                  {DAILY_STUDY_MINUTE_OPTIONS.map((minutes) => (
                    <QuickChoiceButton
                      key={minutes}
                      active={editDailyStudyMinutes === minutes}
                      label={`${minutes}分`}
                      onClick={() => onEditDailyStudyMinutes(minutes)}
                      className={quickChoiceClassName}
                    />
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
                  <input
                    type="range"
                    min={5}
                    max={120}
                    step={5}
                    value={editDailyStudyMinutes}
                    onChange={(event) => onEditDailyStudyMinutes(Number(event.target.value))}
                    className="w-full accent-[#f66d0b]"
                  />
                  <div className="rounded-full bg-medace-50 px-4 py-2 text-base font-black text-medace-700">{editDailyStudyMinutes}分</div>
                </div>
              </div>

              <div>
                <label className="ui-form-label">苦手分野</label>
                <div className={quickChoiceRailClassName}>
                  {WEAK_SKILL_PRESETS.map((preset) => (
                    <QuickChoiceButton
                      key={preset}
                      active={editWeakSkillFocus === preset}
                      label={preset}
                      onClick={() => onEditWeakSkillFocus(preset)}
                      className={quickChoiceClassName}
                    />
                  ))}
                </div>
                <input
                  type="text"
                  value={editWeakSkillFocus}
                  onChange={(event) => onEditWeakSkillFocus(event.target.value)}
                  placeholder="例: 長文読解 / 熟語 / 医療語彙"
                  className="ui-input mt-3"
                />
              </div>

              <div>
                <label className="ui-form-label">学習の濃さ</label>
                <div className="grid gap-3 sm:grid-cols-3">
                  {Object.values(LearningPreferenceIntensity).map((intensity) => (
                    <button
                      key={intensity}
                      type="button"
                      onClick={() => onEditIntensity(intensity)}
                      className={`ui-option-card ${editIntensity === intensity ? 'ui-option-card-active' : 'ui-option-card-inactive'}`}
                    >
                      <div className="text-base font-bold">{LEARNING_PREFERENCE_INTENSITY_LABELS[intensity]}</div>
                      <div className="mt-2 text-sm leading-relaxed text-slate-500">
                        {intensity === LearningPreferenceIntensity.BALANCED
                          ? '無理なく続けやすい標準ペース'
                          : intensity === LearningPreferenceIntensity.REVIEW_HEAVY
                            ? '復習を多めに入れて定着重視'
                            : '短期間で多めに進めたい'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="ui-form-label">講師に伝えたいこと</label>
                <textarea
                  value={editMotivationNote}
                  onChange={(event) => onEditMotivationNote(event.target.value)}
                  placeholder="例: 通学中に15分だけ復習したい / テスト前は熟語を優先したい"
                  className="ui-input h-32 resize-none font-medium"
                />
                <p className="ui-field-note">
                  ここで設定した条件をもとに、学習プランと今日の導線を調整します。講師フォローがある場合は共有の前提にもなります。
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>
      </div>

      <MobileStickyActionBar className="safe-pad-bottom border-t border-slate-100 bg-white/96 px-4 py-4 backdrop-blur sm:px-7">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            type="button"
            className="min-h-11 rounded-2xl border border-slate-200 px-6 py-3 text-base font-bold text-slate-600 transition-colors hover:bg-slate-50"
          >
            閉じる
          </button>
          <button
            onClick={onSave}
            disabled={isSavingProfile}
            className="min-h-11 rounded-2xl bg-medace-700 px-6 py-3 text-base font-bold text-white shadow-lg transition-colors hover:bg-medace-800 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isSavingProfile ? '保存中...' : '変更を保存'}
          </button>
        </div>
      </MobileStickyActionBar>
    </MobileSheetDialog>
  );
};

export default DashboardSettingsModal;
