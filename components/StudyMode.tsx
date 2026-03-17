import React from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Edit2,
  Flag,
  Image as ImageIcon,
  Languages,
  Loader2,
  RotateCw,
  Save,
  Sparkles,
  Volume2,
  X,
  Zap,
} from 'lucide-react';

import type { LearningTaskIntent, UserProfile } from '../types';
import { getSmartSessionConfig, isSmartSessionBookId } from '../shared/studySession';
import MobileStickyActionBar from './mobile/MobileStickyActionBar';
import { useStudyModeController } from '../hooks/useStudyModeController';
import StudyFinishedView from './study/StudyFinishedView';
import StudyReportDialogs from './study/StudyReportDialogs';

interface StudyModeProps {
  user: UserProfile;
  bookId: string;
  taskIntent?: LearningTaskIntent | null;
  onBack: () => void;
  onSessionComplete: (user: UserProfile) => void;
}

function HelpCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path>
      <path d="M12 17h.01"></path>
    </svg>
  );
}

const RATING_OPTIONS = [
  { id: 0, label: 'もう一度', className: 'border-red-100 bg-red-50 text-red-600 hover:bg-red-100', icon: <AlertCircle className="h-5 w-5" /> },
  { id: 1, label: '難しい', className: 'border-amber-100 bg-amber-50 text-amber-700 hover:bg-amber-100', icon: <HelpCircleIcon /> },
  { id: 2, label: '普通', className: 'border-blue-100 bg-blue-50 text-blue-600 hover:bg-blue-100', icon: <Clock className="h-5 w-5" /> },
  { id: 3, label: '簡単', className: 'border-green-100 bg-green-50 text-green-600 hover:bg-green-100', icon: <Zap className="h-5 w-5" /> },
];

const StudyMode: React.FC<StudyModeProps> = ({ user, bookId, taskIntent, onBack, onSessionComplete }) => {
  const controller = useStudyModeController({
    user,
    bookId,
    taskIntent,
    onSessionComplete,
  });

  if (controller.loading) {
    return (
      <div className="flex justify-center p-10">
        <div className="h-10 w-10 animate-spin rounded-full border-t-2 border-medace-500"></div>
      </div>
    );
  }

  if (controller.queue.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="mb-2 text-lg font-bold text-slate-700">学習対象の単語はありません</p>
        <button onClick={onBack} className="rounded-lg bg-medace-600 px-6 py-2 font-bold text-white">ダッシュボードに戻る</button>
      </div>
    );
  }

  if (!controller.currentWord) return null;

  if (controller.isFinished) {
    return (
      <StudyFinishedView
        isMobileViewport={controller.isMobileViewport}
        leveledUp={controller.leveledUp}
        sessionWordCount={controller.sessionWordCount}
        earnedXP={controller.earnedXP}
        streakBonusXP={controller.streakBonusXP}
        nextReviewMessage={controller.nextReviewMessage}
        weaknessSummary={controller.weaknessSummary}
        reviewPreview={controller.reviewPreview}
        onExit={controller.handleExit}
      />
    );
  }

  const frontFace = (
    <section
      data-testid="study-card-front"
      aria-hidden={controller.isFlipped}
      className="study-card-face border border-slate-200 bg-white px-5 py-5 shadow-xl transition-shadow hover:shadow-2xl sm:px-8 sm:py-8"
      onClick={controller.openBack}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">単語</div>
          <button
            onClick={(event) => controller.speakText(event, controller.currentWord.word)}
            className="rounded-full bg-orange-50 p-3 text-medace-500 transition-colors hover:bg-medace-100"
          >
            <Volume2 className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h2 className="break-words text-3xl font-black tracking-tight text-slate-800 sm:text-5xl">{controller.currentWord.word}</h2>
        </div>

        <div className="rounded-[22px] border border-slate-200 bg-slate-50 px-4 py-3 text-center text-xs font-medium text-slate-400">
          カードか下のボタンで答えを確認
        </div>
      </div>
    </section>
  );

  const backFace = (
    <section
      data-testid="study-card-back"
      aria-hidden={!controller.isFlipped}
      className="study-card-face study-card-face-back border border-medace-300 bg-medace-500 px-4 py-4 text-white shadow-xl sm:px-6 sm:py-5"
      onClick={controller.closeBack}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-200">意味</div>
            <div className="mt-2 text-base font-black text-white/95 sm:text-lg">{controller.currentWord.word}</div>
          </div>
          {!controller.isEditing ? (
            <button
              onClick={controller.startEditing}
              className={`rounded-full border border-white/15 p-2 transition-colors ${controller.isBookOwner ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-white/70 hover:bg-red-500/20 hover:text-red-100'}`}
              title={controller.isBookOwner ? '定義を編集' : '問題を報告する'}
            >
              {controller.isBookOwner ? <Edit2 className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={controller.saveEditing} className="rounded-full border border-white/15 p-2 text-green-200 transition-colors hover:bg-white/10 hover:text-green-100"><Save className="h-4 w-4" /></button>
              <button onClick={controller.cancelEditing} className="rounded-full border border-white/15 p-2 text-red-200 transition-colors hover:bg-white/10 hover:text-red-100"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        <div className="mt-3 shrink-0 rounded-[24px] border border-white/10 bg-white/8 px-4 py-4">
          {controller.isEditing ? (
            <div className="flex flex-col gap-3" onClick={(event) => event.stopPropagation()}>
              <input
                type="text"
                value={controller.editWord}
                onChange={(event) => controller.setEditWord(event.target.value)}
                className="w-full rounded-2xl border border-white/20 bg-white/10 p-3 text-white"
              />
              <textarea
                value={controller.editDef}
                onChange={(event) => controller.setEditDef(event.target.value)}
                className="h-28 w-full resize-none rounded-2xl border border-white/20 bg-white/10 p-3 text-white"
              />
            </div>
          ) : (
            <p className="text-center text-[1.35rem] font-black leading-snug text-white sm:text-3xl">{controller.currentWord.definition}</p>
          )}
        </div>

        <div className="mt-3 min-h-0 flex-1 overflow-hidden">
          <div ref={controller.backFaceScrollRef} className="h-full overflow-y-auto pr-1 scrollbar-hide">
            {!controller.showHints ? (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  controller.setShowHints(true);
                }}
                className="flex min-h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/20 bg-white/6 px-4 py-5 text-center text-white/78 transition-colors hover:bg-white/10"
              >
                <Sparkles className="h-5 w-5 text-medace-300" />
                <span className="text-sm font-bold">まだ難しいときだけヒントを見る</span>
                <span className="text-xs text-white/60">例文・訳・画像ヒントをあとから開けます</span>
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-xs font-bold uppercase tracking-[0.16em] text-white/68">
                  <span>ヒントを表示中</span>
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      controller.setShowHints(false);
                    }}
                    className="rounded-full border border-white/15 px-3 py-1 text-[11px] font-bold text-white/82 transition-colors hover:bg-white/10"
                  >
                    閉じる
                  </button>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  {controller.aiContextLoading ? (
                    <div className="flex flex-col items-center gap-2 py-4 text-medace-200">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-xs">AI例文を生成中...</span>
                    </div>
                  ) : controller.aiContext ? (
                    <div className="text-center">
                      <div className="mb-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-medace-200">
                        <span className="flex items-center gap-1">
                          <Sparkles className="h-3 w-3" />
                          AI例文 {controller.bookContext && `(${controller.bookContext.slice(0, 15)}...)`}
                        </span>
                        <button onClick={(event) => controller.speakText(event, controller.aiContext!.english)} className="transition-colors hover:text-white"><Volume2 className="h-4 w-4" /></button>
                      </div>
                      <p className="mb-3 text-base font-medium leading-relaxed text-white/88 sm:text-lg">"{controller.aiContext.english}"</p>

                      {controller.showTranslation ? (
                        <p className="animate-in fade-in border-t border-white/10 pt-2 text-xs text-white/70 sm:text-sm">{controller.aiContext.japanese}</p>
                      ) : (
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            controller.setShowTranslation(true);
                          }}
                          className="mx-auto flex items-center justify-center gap-1 text-xs text-white/65 transition-colors hover:text-white"
                        >
                          <Languages className="h-3 w-3" /> 訳を表示
                        </button>
                      )}
                    </div>
                  ) : (
                    <p className="text-center text-xs text-white/60">このカードは単語と意味に集中しましょう。</p>
                  )}
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/10 p-4">
                  {controller.aiImageLoading ? (
                    <div className="flex flex-col items-center gap-2 py-6 text-medace-200">
                      <Loader2 className="h-5 w-5 animate-spin" />
                      <span className="text-xs text-center">AIイメージ生成中...</span>
                    </div>
                  ) : controller.aiImage ? (
                    <div className="relative h-40 w-full overflow-hidden rounded-2xl bg-white/5">
                      <img src={controller.aiImage} alt="視覚的記憶補助" className="h-full w-full object-contain opacity-90 transition-opacity hover:opacity-100" />
                    </div>
                  ) : controller.imageHintUnavailable ? (
                    <p className="px-4 py-6 text-center text-xs text-white/60">画像ヒントは今は利用できません。</p>
                  ) : (
                    <button onClick={controller.generateImage} className="group flex h-full w-full flex-col items-center justify-center gap-2 py-6 text-white/65 transition-colors hover:text-white">
                      <div className="rounded-full bg-white/10 p-2 transition-colors group-hover:bg-white/18">
                        <ImageIcon className="h-4 w-4" />
                      </div>
                      <span className="text-xs font-bold text-center">画像ヒントを表示</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );

  return (
    <div className="mx-auto max-w-3xl pb-20 md:pb-24">
      <StudyReportDialogs
        mode={controller.reportDialogMode}
        showReportModal={controller.showReportModal}
        reportReason={controller.reportReason}
        reportNotice={controller.reportNotice}
        onChangeReportReason={controller.setReportReason}
        onCloseReportModal={() => controller.setShowReportModal(false)}
        onSubmitReport={controller.submitReport}
        onCloseNotice={() => controller.setReportNotice(null)}
      />

      <div className="mb-3 flex items-center justify-between gap-3 md:mb-6">
        <button onClick={onBack} className="flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">中断</span>
        </button>
        <div className="flex items-center gap-2">
          {(isSmartSessionBookId(bookId) || taskIntent) && (
            <span className="flex items-center gap-1 rounded bg-medace-100 px-2 py-1 text-xs font-bold text-medace-700">
              <Zap className="h-3 w-3" /> {taskIntent?.label || getSmartSessionConfig(bookId)?.badgeLabel}
            </span>
          )}
          <span className="rounded-full bg-medace-50 px-3 py-1 font-mono text-sm text-medace-700">
            {controller.currentIndex + 1} / {controller.queue.length}
          </span>
        </div>
      </div>

      <div
        ref={controller.shellRef}
        className="study-card-shell"
        style={controller.mobileShellHeight ? { height: controller.mobileShellHeight, minHeight: controller.mobileShellHeight } : undefined}
      >
        <div className="study-card-3d">
          <div className={`study-card-inner ${controller.isFlipped ? 'is-flipped' : ''} ${controller.supports3D ? '' : 'instant-swap'}`}>
            {controller.supports3D ? (
              <>
                {frontFace}
                {backFace}
              </>
            ) : (
              controller.isFlipped ? backFace : frontFace
            )}
          </div>
        </div>
      </div>

      <MobileStickyActionBar
        className="safe-pad-bottom mt-3 rounded-[28px] border border-slate-200 bg-white/94 px-3 pb-3 pt-3 shadow-[0_16px_32px_rgba(15,23,42,0.08)] md:mt-4 md:px-0 md:pb-0 md:pt-4"
      >
        {controller.isFlipped && !controller.isEditing ? (
          <div
            ref={controller.actionBarRef}
            data-testid="study-rating-actions"
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3 animate-in slide-in-from-bottom-4 fade-in duration-300"
          >
            {RATING_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                data-testid={`study-rate-${option.id}`}
                onClick={(event) => {
                  event.stopPropagation();
                  void controller.handleRating(option.id);
                }}
                disabled={controller.isAdvancingCard}
                className={`flex min-h-12 flex-col items-center gap-1 rounded-2xl border p-3 text-xs font-bold transition-transform active:scale-95 disabled:opacity-60 ${option.className}`}
              >
                <span>{option.label}</span>
                {option.icon}
              </button>
            ))}
          </div>
        ) : (
          <div ref={controller.actionBarRef} className="flex justify-center">
            <button
              data-testid="study-flip-button"
              onClick={controller.openBack}
              disabled={controller.isEditing || controller.isAdvancingCard}
              className={`flex min-h-12 items-center gap-2 rounded-full px-8 py-4 font-bold shadow-lg transition-transform hover:scale-[1.01] ${
                controller.isEditing || controller.isAdvancingCard ? 'cursor-not-allowed bg-medace-200 text-medace-700/70' : 'bg-medace-600 text-white hover:bg-medace-700'
              }`}
            >
              <RotateCw className="h-5 w-5" /> 答えを確認
            </button>
          </div>
        )}
      </MobileStickyActionBar>
    </div>
  );
};

export default StudyMode;
