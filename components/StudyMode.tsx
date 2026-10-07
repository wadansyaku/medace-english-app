import WordExamBadge from './WordExamBadge';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Edit2,
  Flag,
  Image as ImageIcon,
  Loader2,
  RotateCw,
  Save,
  Volume2,
  X,
} from 'lucide-react';

import {
  GeneratedAssetAuditStatus,
  type LearningTaskIntent,
  type UserProfile,
} from '../types';
import { createFollowUpSpellingTaskIntent } from '../shared/learningTask';
import { getHintAuditTone } from '../shared/wordHintAssets';
import { getSmartSessionConfig } from '../shared/studySession';
import ModalOverlay from './ModalOverlay';
import { useStudyModeController } from '../hooks/useStudyModeController';
import { recordClientProductEvent } from '../services/productEvents';
import StudyFinishedView from './study/StudyFinishedView';
import StudyReportDialogs from './study/StudyReportDialogs';
import WordSourceDetails from './study/WordSourceDetails';
import NaruStudySetup from './study/NaruStudySetup';
import { createNaruChapterReturnTask, isNaruChapterStudyTask, resolveNaruStudyChapter } from '../shared/naruStudy';
import { NARU_BOOK_ID, NARU_RANGE_PRESETS } from '../shared/naruBook';

interface StudyModeProps {
  user: UserProfile;
  bookId: string;
  taskIntent?: LearningTaskIntent | null;
  onBack: () => void;
  onSessionComplete: (user: UserProfile) => void;
  onStartTask: (user: UserProfile, task: LearningTaskIntent) => void;
  backLabel?: string;
}

const RATING_OPTIONS = [
  { id: 0, label: 'もう一回', className: 'border-red-100 bg-red-50 text-red-700 hover:bg-red-100' },
  { id: 1, label: 'あとで復習', className: 'border-amber-100 bg-amber-50 text-amber-800 hover:bg-amber-100' },
  { id: 2, label: 'だいたいOK', className: 'border-blue-100 bg-blue-50 text-blue-700 hover:bg-blue-100' },
  { id: 3, label: 'すぐ分かる', className: 'border-green-100 bg-green-50 text-green-700 hover:bg-green-100' },
];

const getHiddenHintReviewState = (
  status: GeneratedAssetAuditStatus | null | undefined,
  label: '例文' | '画像ヒント',
): {
  title: string;
  description: string;
} | null => {
  switch (status) {
    case GeneratedAssetAuditStatus.PENDING:
      return {
        title: `${label}を確認中`,
        description: '保存済みの内容を確認しています。意味で学習を続けられます。',
      };
    case GeneratedAssetAuditStatus.REVIEW_REQUIRED:
      return {
        title: `${label}を見直し中`,
        description: '内容に気になる点があったため、いまは表示していません。',
      };
    case GeneratedAssetAuditStatus.FAILED:
      return {
        title: `${label}を確認できませんでした`,
        description: '確認処理を完了できなかったため、いまは表示していません。',
      };
    default:
      return null;
  }
};

// Keep every character; the page size follows the available text region.
export const splitStudyMeaning = (text: string, capacity: number): string[] => {
  const chars = Array.from(text);
  const size = Math.max(1, Math.floor(capacity));
  return chars.length ? Array.from({ length: Math.ceil(chars.length / size) }, (_, i) => chars.slice(i * size, (i + 1) * size).join('')) : [''];
};
const StudyMeaning: React.FC<{ text: string }> = ({ text }) => {
  const region = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState(100);
  const [page, setPage] = useState(0);
  useLayoutEffect(() => {
    const update = () => {
      const box = region.current;
      if (!box) return;
      // Conservative full-width glyph budget, including explicit line breaks.
      const columns = Math.max(1, Math.floor(box.clientWidth / 22));
      const lines = Math.max(1, Math.floor(box.clientHeight / 32));
      setCapacity(Math.max(1, columns * Math.max(1, lines - 1)));
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    if (region.current) observer?.observe(region.current);
    return () => observer?.disconnect();
  }, []);
  useEffect(() => setPage(0), [text, capacity]);
  const pages = splitStudyMeaning(text, capacity);
  const current = Math.min(page, pages.length - 1);
  return <div className="study-meaning" onClick={event => event.stopPropagation()}>
    <div ref={region} className="study-meaning-text" role="region" aria-label="単語の意味" tabIndex={0}>
      <p className="whitespace-pre-wrap break-words text-center text-xl font-bold leading-8">{pages[current]}</p>
    </div>
    {pages.length > 1 && <nav aria-label="意味のページ" className="study-meaning-pages">
      <button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>前へ</button>
      <span aria-live="polite">{current + 1} / {pages.length}</span>
      <button type="button" disabled={current === pages.length - 1} onClick={() => setPage(current + 1)}>次へ</button>
    </nav>}
  </div>;
};

const StudySession: React.FC<StudyModeProps> = ({ user, bookId, taskIntent, onBack, onSessionComplete, onStartTask, backLabel = 'ダッシュボードに戻る' }) => {
  const controller = useStudyModeController({
    user,
    bookId,
    taskIntent,
    onSessionComplete,
  });
  const [detailsForWord, setDetailsForWord] = useState<string | null>(null);
  const currentWordKey = `${controller.currentIndex}:${controller.currentWord?.id}`;
  useEffect(() => setDetailsForWord(null), [currentWordKey]);
  const startedRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    if (controller.loading || controller.queue.length === 0 || startedRef.current) return;
    startedRef.current = true;
    void recordClientProductEvent({
      eventName: 'study_session_started',
      subjectType: 'book',
      subjectId: bookId,
      status: 'STARTED',
      metadata: {
        intentType: taskIntent?.intentType || null,
        limit: taskIntent?.limit || null,
        missionAssignmentId: taskIntent?.missionAssignmentId || null,
      },
    }).catch(() => undefined);
  }, [bookId, controller.loading, controller.queue.length, taskIntent]);

  useEffect(() => {
    if (!controller.isFinished || finishedRef.current) return;
    finishedRef.current = true;
    void recordClientProductEvent({
      eventName: 'study_session_finished',
      subjectType: 'book',
      subjectId: bookId,
      status: 'FINISHED',
      metadata: {
        intentType: taskIntent?.intentType || null,
        sessionWordCount: controller.sessionWordCount,
        earnedXP: controller.earnedXP,
        streakBonusXP: controller.streakBonusXP,
      },
    }).catch(() => undefined);
  }, [
    bookId,
    controller.earnedXP,
    controller.isFinished,
    controller.sessionWordCount,
    controller.streakBonusXP,
    taskIntent,
  ]);

  if (controller.loading) {
    return (
      <div className="flex justify-center p-10">
        <div className="h-10 w-10 animate-spin rounded-full border-t-2 border-medace-500"></div>
      </div>
    );
  }

  if (controller.loadError) {
    return (
      <section role="alert" data-testid="study-load-error" className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-6 text-center">
        <h1 className="text-xl font-bold text-slate-900">単語を読み込めませんでした</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">{controller.loadError}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={controller.retryLoad} className="rounded-xl bg-medace-600 px-5 py-3 font-bold text-slate-950">もう一度読み込む</button>
          <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-700">{backLabel}</button>
        </div>
      </section>
    );
  }

  if (controller.queue.length === 0) {
    return (
      <div className="p-10 text-center">
        <p className="mb-2 text-lg font-bold text-slate-700">{taskIntent?.selectionPolicy === 'BOOK_DUE_ONLY' ? '期限が来た復習はありません' : '学習対象の単語はありません'}</p>
        <button onClick={onBack} className="rounded-lg bg-medace-600 px-6 py-2 font-bold text-slate-950">{backLabel}</button>
      </div>
    );
  }

  if (!controller.currentWord) return null;

  const exampleAuditTone = getHintAuditTone(controller.currentWord.exampleAuditStatus);
  const imageAuditTone = getHintAuditTone(controller.currentWord.exampleImageAuditStatus);
  const hiddenExampleReviewState = getHiddenHintReviewState(
    controller.currentWord.exampleAuditStatus,
    '例文',
  );


  if (controller.isFinished) {
    return (
      <StudyFinishedView
        isMobileViewport={controller.isMobileViewport}
        leveledUp={controller.leveledUp}
        sessionWordCount={controller.sessionWordCount}
        earnedXP={controller.earnedXP}
        streakBonusXP={controller.streakBonusXP}
        rewardNotice={controller.rewardNotice}
        nextReviewMessage={controller.nextReviewMessage}
        weaknessSummary={controller.weaknessSummary}
        reviewPreview={controller.reviewPreview}
        onStartSpellingCheck={() => {
          const spellingTask = createFollowUpSpellingTaskIntent(bookId, taskIntent?.wordRange);
          onStartTask(controller.updatedUser || user, taskIntent?.wordRange
            ? { ...spellingTask, label: `${resolveNaruStudyChapter(taskIntent.wordRange)?.label || '選択した章'}・スペル5問` }
            : spellingTask);
        }}
        onExit={controller.handleExit}
        exitLabel={backLabel}
        sessionLabel={taskIntent?.wordRange ? taskIntent.label : undefined}
      />
    );
  }

  const hasCoreExample = Boolean(controller.currentWord.exampleSentence?.trim()) && !hiddenExampleReviewState;
  const hasSourceDetails = Boolean(controller.currentWord.inflections || controller.currentWord.sourceNote || (controller.currentWord.bookId !== NARU_BOOK_ID && (controller.currentWord.sourceSheet || controller.currentWord.sourceEntryId != null)));
  const hasDetails = hasCoreExample || Boolean(hiddenExampleReviewState) || hasSourceDetails || Boolean(controller.currentWord.exampleImageUrl);

  const frontFace = (
    <section
      data-testid="study-card-front"
      aria-hidden={controller.isFlipped}
      inert={controller.isFlipped}
      className="study-card-face border border-slate-200 bg-white p-3 shadow-sm"
      onClick={controller.openBack}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-3">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">単語</div>
          <button
            type="button"
            aria-label="単語を読み上げる"
            onClick={(event) => controller.speakText(event, controller.currentWord.word)}
            className="rounded-full bg-medace-50 p-3 text-medace-500 transition-colors hover:bg-medace-100"
          >
            <Volume2 className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center text-center">
          <h2 className="break-words text-3xl font-black tracking-tight text-slate-800 sm:text-5xl">{controller.currentWord.word}</h2>
          <div className="mt-2"><WordExamBadge word={controller.currentWord} /></div>
          <WordSourceDetails word={controller.currentWord} compact />
        </div>


      </div>
    </section>
  );

  const backFace = (
    <section
      data-testid="study-card-back"
      aria-hidden={!controller.isFlipped}
      inert={!controller.isFlipped}
      className="study-card-face study-card-face-back border border-medace-200 bg-medace-50 p-3 text-slate-950 shadow-sm"
      onClick={controller.closeBack}
    >
      <div ref={controller.backFaceScrollRef} role="region" aria-label="単語の意味と例文" tabIndex={0} className="study-back-content">
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-800">意味</div>

            {(controller.currentWord.aichiExamAppeared || controller.currentWord.definitionSupplemented) &&
              <div className="mt-2"><WordExamBadge word={controller.currentWord} /></div>}
          </div>
          {!controller.isEditing ? (
            <button
              type="button"
              disabled={controller.isAdvancingCard}
              aria-label={controller.isBookOwner ? '定義を編集' : '問題を報告する'}
              onClick={controller.startEditing}
              className={`rounded-full border border-medace-200 p-2 transition-colors ${controller.isBookOwner ? 'text-slate-950/70 hover:bg-medace-100 hover:text-slate-950' : 'text-slate-950/70 hover:bg-red-500/20 hover:text-red-800'}`}
              title={controller.isBookOwner ? '定義を編集' : '問題を報告する'}
            >
              {controller.isBookOwner ? <Edit2 className="h-4 w-4" /> : <Flag className="h-4 w-4" />}
            </button>
          ) : (
            <div className="flex gap-2">
              <button type="button" aria-label="定義の変更を保存" disabled={controller.isSavingEdit} onClick={controller.saveEditing} className="rounded-full border border-medace-200 p-2 text-emerald-800 transition-colors hover:bg-medace-100 disabled:opacity-50">{controller.isSavingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}</button>
              <button type="button" aria-label="定義の編集をキャンセル" disabled={controller.isSavingEdit} onClick={controller.cancelEditing} className="rounded-full border border-medace-200 p-2 text-red-700 transition-colors hover:bg-medace-100 disabled:opacity-50"><X className="h-4 w-4" /></button>
            </div>
          )}
        </div>

        <div className="study-answer-content">
        <div className={`study-definition-panel ${controller.isEditing ? 'study-definition-editing' : ''}`}>
          {controller.isEditing ? (
            <div className="flex flex-col gap-3" onClick={(event) => event.stopPropagation()}>
              <input
                type="text"
                aria-label="単語"
                disabled={controller.isSavingEdit}
                value={controller.editWord}
                onChange={(event) => controller.setEditWord(event.target.value)}
                className="w-full rounded-2xl border border-medace-200 bg-white/80 p-3 text-slate-950"
              />
              <textarea
                aria-label="単語の意味"
                disabled={controller.isSavingEdit}
                value={controller.editDef}
                onChange={(event) => controller.setEditDef(event.target.value)}
                className="h-28 w-full resize-none rounded-2xl border border-medace-200 bg-white/80 p-3 text-slate-950"
              />
              {controller.editError && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{controller.editError}</p>}
            </div>
          ) : (
            <StudyMeaning text={controller.currentWord.definition} />
          )}
        </div>

            {!controller.isEditing && hasDetails && <button type="button" data-testid="study-details-open" className="study-details-button" disabled={controller.isAdvancingCard} onClick={event => { event.stopPropagation(); setDetailsForWord(currentWordKey); }}>例文・補足</button>}

        </div>
      </div>
    </section>
  );

  return (
    <div className="study-session mx-auto max-w-3xl">
      <StudyReportDialogs
        mode={controller.reportDialogMode}
        showReportModal={controller.showReportModal}
        reportReason={controller.reportReason}
        reportNotice={controller.reportNotice}
        reportError={controller.reportError}
        isSubmitting={controller.isSubmittingReport}
        onChangeReportReason={controller.setReportReason}
        onCloseReportModal={() => { if (!controller.isSubmittingReport) controller.setShowReportModal(false); }}
        onSubmitReport={controller.submitReport}
        onCloseNotice={() => controller.setReportNotice(null)}
      />

      {detailsForWord === currentWordKey && controller.isFlipped && !controller.isAdvancingCard && <ModalOverlay ariaLabel="例文・補足" mobileBehavior="sheet" panelClassName="study-details-panel w-full max-w-xl rounded-2xl bg-white p-4" onClose={() => setDetailsForWord(null)}>
        <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-bold">{controller.currentWord.word}・例文と補足</h2><button type="button" className="study-details-button" onClick={() => setDetailsForWord(null)}>閉じる</button></div>
            {hasCoreExample && <section data-testid="study-original-example" className="mb-3 rounded-2xl border border-medace-200 bg-white p-4" onClick={event => event.stopPropagation()}>
              <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><h3 className="text-xs font-bold text-slate-500">例文</h3>{exampleAuditTone && <span className={`rounded-full border px-2 py-1 text-[10px] ${exampleAuditTone.className}`}>{exampleAuditTone.label}</span>}</div><button type="button" aria-label="例文を読み上げる" onClick={event => controller.speakText(event, controller.currentWord.exampleSentence!)} className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-50"><Volume2 className="h-4 w-4" /></button></div>
              <p className="text-base font-semibold leading-relaxed text-steady-ink sm:text-lg">{controller.currentWord.exampleSentence}</p>
              {controller.currentWord.exampleMeaning?.trim() && (controller.showTranslation
                ? <p className="mt-3 border-t border-slate-100 pt-3 text-sm leading-relaxed text-slate-600">{controller.currentWord.exampleMeaning}</p>
                : <button type="button" onClick={() => controller.setShowTranslation(true)} className="mt-2 min-h-11 text-sm font-bold text-slate-600">例文の訳を表示</button>)}
            </section>}
            {hiddenExampleReviewState && <p role="status" className="mb-3 text-sm text-slate-600">{hiddenExampleReviewState.title}。{hiddenExampleReviewState.description}</p>}
            {hasSourceDetails && <details className="mb-2 rounded-lg border border-slate-200 bg-white px-3" onClick={event => event.stopPropagation()}>
              <summary className="min-h-11 cursor-pointer py-3 text-sm font-bold text-slate-600">{controller.currentWord.bookId === NARU_BOOK_ID ? '補足' : '補足・出典'}</summary>
              <WordSourceDetails word={controller.currentWord} />
            </details>}

            {controller.currentWord.exampleImageUrl && (
              <div className="rounded-2xl border border-slate-200 bg-white p-3" onClick={event => event.stopPropagation()}>
                <button type="button" aria-haspopup="dialog" aria-expanded={controller.showHints} onClick={() => { setDetailsForWord(null); controller.setShowHints(!controller.showHints); }} className="flex min-h-11 w-full items-center justify-between gap-2 text-sm font-bold text-slate-600">
                  <span className="flex items-center gap-2"><ImageIcon className="h-4 w-4" />保存済みの画像ヒント</span>
                  <span>{controller.showHints ? '閉じる' : '表示'}</span>
                </button>
              </div>
            )}

      </ModalOverlay>}

      {controller.showHints && controller.currentWord.exampleImageUrl && <ModalOverlay
        ariaLabel="保存済みの画像ヒント"
        returnFocusSelector="[data-testid='study-details-open']"
        mobileBehavior="sheet"
        panelClassName="w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 sm:p-6"
        onClose={() => controller.setShowHints(false)}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><h2 className="text-lg font-bold text-steady-ink">保存済みの画像ヒント</h2><p className="mt-1 break-words font-bold text-slate-700">{controller.currentWord.word}</p></div>
          <button type="button" onClick={() => controller.setShowHints(false)} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-3 text-sm font-bold text-slate-700">閉じる</button>
        </div>
        {imageAuditTone && <span className={`mt-3 inline-block rounded-full border px-2 py-1 text-xs ${imageAuditTone.className}`}>{imageAuditTone.label}</span>}
        <img src={controller.currentWord.exampleImageUrl} alt={`「${controller.currentWord.word}」の保存済み画像ヒント`} className="mt-3 h-[45dvh] max-h-[28rem] w-full rounded-xl object-contain" />
      </ModalOverlay>}

      {(controller.bookTitle || taskIntent?.label || getSmartSessionConfig(bookId)?.badgeLabel) && (
        <p data-testid="study-book-label" className="mb-2 break-words text-xs font-bold text-medace-800">
          {[controller.bookTitle, taskIntent?.label || getSmartSessionConfig(bookId)?.badgeLabel].filter(Boolean).join(' / ')}
        </p>
      )}
      <div className="study-session-heading flex items-center justify-between gap-3">
        <button type="button" aria-label={`学習を中断して${backLabel}`} onClick={onBack} disabled={controller.isAdvancingCard || controller.isSavingEdit} className="flex items-center gap-1 font-medium text-slate-500 hover:text-slate-800 disabled:opacity-50">
          <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">中断</span>
        </button>
        <div className="flex items-center gap-2">
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
          {/* A new card starts facing forward; never reverse the previous card's
              CSS rotation with the next word's answer already inside it.
              The index also distinguishes an immediate requeue of the same word. */}
          <div key={`${controller.currentIndex}:${controller.currentWord.id}`} className={`study-card-inner ${controller.isFlipped ? 'is-flipped' : ''} ${controller.supports3D ? '' : 'instant-swap'}`}>
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

      <div
        className="study-actions safe-pad-bottom"
      >
        {controller.saveError ? (
          <div ref={controller.actionBarRef} role="alert" data-testid="study-save-error" className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-slate-700">{controller.saveError}</p>
            <button type="button" onClick={() => void controller.retrySave()} disabled={controller.isAdvancingCard} className="mt-3 min-h-12 w-full rounded-xl bg-medace-600 px-4 py-3 font-bold text-slate-950 disabled:opacity-60">同じ回答を保存する</button>
          </div>
        ) : controller.isFlipped && !controller.isEditing ? (
          <div
            ref={controller.actionBarRef}
            data-testid="study-rating-actions"
            aria-busy={controller.isAdvancingCard}
            className="study-rating-grid grid gap-2"
          >
            {RATING_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                data-testid={`study-rate-${option.id}`}
                aria-pressed={controller.selectedRating === option.id}
                onClick={(event) => {
                  event.stopPropagation();
                  void controller.handleRating(option.id);
                }}
                disabled={controller.isAdvancingCard}
                className={`study-rating-button flex min-h-11 items-center justify-center gap-1 rounded-xl border px-2 py-2 text-base font-bold transition-transform active:scale-95 ${option.className}`}
              >
                <span>{option.label}</span>
                {controller.isAdvancingCard && controller.selectedRating === option.id && <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />}
              </button>
            ))}
            <p role="status" className="study-save-status sr-only">{controller.isAdvancingCard ? `「${RATING_OPTIONS.find(option => option.id === controller.selectedRating)?.label || '回答'}」を保存中…` : ''}</p>
          </div>
        ) : (
          <div ref={controller.actionBarRef} className="flex justify-center">
            <button
              data-testid="study-flip-button"
              onClick={controller.openBack}
              disabled={controller.isEditing || controller.isAdvancingCard}
              className={`flex min-h-11 items-center gap-2 rounded-xl px-6 py-2 font-bold shadow-lg transition-transform hover:scale-[1.01] ${
                controller.isEditing || controller.isAdvancingCard ? 'cursor-not-allowed bg-medace-200 text-medace-700/70' : 'bg-steady-action text-steady-on-action hover:bg-steady-action-hover'
              }`}
            >
              <RotateCw className="h-5 w-5" /> 答えを確認
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const StudyMode: React.FC<StudyModeProps> = (props) => {
  const isChapterStudy = isNaruChapterStudyTask(props.bookId, props.taskIntent);
  const chapter = isChapterStudy ? resolveNaruStudyChapter(props.taskIntent?.wordRange) : null;
  // The controller uses task identity to load a new session. Normalizing an
  // unchanged chapter must not discard the active card or its pending receipt.
  const taskIntent = useMemo(() => props.taskIntent && chapter
    ? { ...props.taskIntent, wordRange: { start: chapter.start, end: chapter.end } }
    : props.taskIntent, [props.taskIntent, chapter?.start, chapter?.end]);
  if (!isChapterStudy) return <StudySession {...props} />;
  const kind = props.taskIntent?.selectionPolicy === 'BOOK_DUE_ONLY' ? 'due' : 'new';
  const isReady = props.taskIntent?.autoStart && chapter
    && (props.taskIntent.selectionPolicy === 'BOOK_NEW_ONLY' || props.taskIntent.selectionPolicy === 'BOOK_DUE_ONLY');
  if (!isReady) return <NaruStudySetup user={props.user} chapter={chapter || NARU_RANGE_PRESETS[0]} kind={kind}
    invalidSelection={!chapter} onSelect={task => props.onStartTask(props.user, task)} onBack={props.onBack} />;
  const returnToChapter = (user: UserProfile) => props.onStartTask(user, createNaruChapterReturnTask(props.taskIntent!));
  return <StudySession {...props} key={`${props.user.uid}:${chapter.id}:${kind}`}
    taskIntent={taskIntent}
    onBack={() => returnToChapter(props.user)} onSessionComplete={returnToChapter} backLabel="章の学習に戻る" />;
};

export default StudyMode;
