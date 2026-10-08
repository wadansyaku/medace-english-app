import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
import {
  createPronunciationPresentation,
  getPronunciationMuted,
  pronunciationPlayer,
  setPronunciationMuted,
  subscribePronunciationMuted,
  type PronunciationStatus,
} from '../services/pronunciation';

interface WordPronunciationOptions {
  presentationKey: string | null;
  text: string | undefined;
  visible: boolean;
  rate?: number;
  preferStudyVoice?: boolean;
  targetRef?: RefObject<HTMLElement | null>;
  scopeRef?: RefObject<HTMLElement | null>;
}

const isVisible = (options: WordPronunciationOptions) => {
  if (!options.visible || !options.presentationKey || !options.text?.trim() || document.hidden) return false;
  const element = options.targetRef?.current;
  if (options.targetRef && !element) return false;
  if (!element) return true;
  if (!element.isConnected || element.closest('[inert], [aria-hidden="true"], [hidden]')) return false;
  const dialog = document.querySelector('[aria-modal="true"]');
  if (dialog && !dialog.contains(element)) return false;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0
    && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
};

const isManualAllowed = (options: WordPronunciationOptions, trigger?: HTMLElement | null) => {
  if (!options.presentationKey || document.hidden) return false;
  const element = trigger ?? (options.scopeRef ?? options.targetRef)?.current;
  if (element && (!element.isConnected || element.closest('[inert], [aria-hidden="true"], [hidden]'))) return false;
  // Manual example playback remains available on a card's reverse face.
  // A modal still blocks speech from its background, including delayed start.
  const dialog = document.querySelector('[aria-modal="true"]');
  return !dialog || !!element && dialog.contains(element);
};

export const useWordPronunciation = (options: WordPronunciationOptions) => {
  const owner = useRef<object>({});
  const presentation = useRef(createPronunciationPresentation());
  const current = useRef(options);
  current.current = options;
  const revision = useRef(0);
  const pageActive = useRef(true);
  const manualPlayback = useRef(false);
  const manualTrigger = useRef<HTMLElement | null>(null);
  const [status, setStatus] = useState<PronunciationStatus>('idle');
  const muted = useSyncExternalStore(subscribePronunciationMuted, getPronunciationMuted, () => false);

  const stop = () => {
    manualPlayback.current = false;
    manualTrigger.current = null;
    pronunciationPlayer.stop(owner.current);
    // Hiding the automatic word on a reverse face is normal. Keep a manual
    // refusal/error visible there until replay or a new presentation.
    setStatus(previous => previous === 'starting' || previous === 'speaking' ? 'idle' : previous);
  };
  const play = (text: string, generation: number, manual = false) => pronunciationPlayer.play(owner.current, text, {
    rate: current.current.rate,
    preferStudyVoice: current.current.preferStudyVoice,
    canPlay: () => pageActive.current && generation === revision.current && !getPronunciationMuted() && (manual ? isManualAllowed(current.current, manualTrigger.current) : isVisible(current.current)),
    onStatus: next => {
      if (generation !== revision.current) return;
      if (next !== 'starting' && next !== 'speaking') { manualPlayback.current = false; manualTrigger.current = null; }
      setStatus(next);
    },
  });

  // Stop the previous word before the next screen paints. Reserve automatic
  // playback in a passive effect: a layout RAF can fire before StrictMode's
  // simulated cleanup and consume then immediately cancel the first word.
  useLayoutEffect(() => {
    const generation = ++revision.current;
    pronunciationPlayer.stop(owner.current);
    manualPlayback.current = false;
    manualTrigger.current = null;
    presentation.current.prepare(options.presentationKey);
    setStatus('idle');
    return () => {
      if (generation === revision.current) ++revision.current;
      pronunciationPlayer.stop(owner.current);
    };
  }, [options.presentationKey, options.text, options.visible, muted]);

  useEffect(() => {
    const generation = revision.current;
    let frame: number | null = null;
    const check = () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (!pageActive.current || generation !== revision.current) return;
      if (manualPlayback.current && !isManualAllowed(current.current, manualTrigger.current)) stop();
      if (!isVisible(current.current)) {
        if (!manualPlayback.current || !isManualAllowed(current.current, manualTrigger.current)) stop();
        return;
      }
      frame = window.requestAnimationFrame(() => {
        frame = null;
        if (!pageActive.current || generation !== revision.current || !isVisible(current.current)) return;
        const next = current.current;
        if (!next.presentationKey || !presentation.current.claim(next.presentationKey)) return;
        if (!getPronunciationMuted()) play(next.text!, generation);
      });
    };
    check();
    const onVisibility = () => { if (document.hidden) stop(); else check(); };
    const onPageHide = () => {
      pageActive.current = false;
      if (frame !== null) window.cancelAnimationFrame(frame);
      frame = null;
      stop();
    };
    const onPageShow = () => { pageActive.current = true; check(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('scroll', check, true);
    window.addEventListener('resize', check);
    // Auth keeps guest learning mounted. Observe modal insertion/removal as
    // well as hidden/inert boundaries to stop both playing and delayed speech.
    const observer = options.presentationKey && (options.scopeRef ?? options.targetRef)?.current && typeof MutationObserver !== 'undefined'
      ? new MutationObserver(check) : null;
    observer?.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['inert', 'aria-hidden', 'aria-modal', 'hidden', 'style', 'class'] });
    return () => {
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (generation === revision.current) pronunciationPlayer.stop(owner.current);
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
      window.removeEventListener('scroll', check, true);
      window.removeEventListener('resize', check);
    };
  }, [options.presentationKey, options.text, options.visible, muted]);

  const speak = (text = current.current.text, trigger?: HTMLElement) => {
    if (!pageActive.current || !text?.trim() || getPronunciationMuted() || !isManualAllowed(current.current, trigger)) return;
    // A trusted manual click also consumes any pending automatic attempt.
    presentation.current.manual(current.current.presentationKey);
    manualPlayback.current = true;
    manualTrigger.current = trigger ?? null;
    play(text, revision.current, true);
  };
  const message = status === 'unavailable' ? 'このブラウザーでは発音を利用できません。'
    : status === 'blocked' ? '「発音を聞く」を押して再生してください。'
    : status === 'error' ? '発音を開始できませんでした。もう一度お試しください。' : null;
  return { muted, status, message, speak, stop, toggleMuted: () => setPronunciationMuted(!getPronunciationMuted()) };
};

export type WordPronunciation = ReturnType<typeof useWordPronunciation>;
