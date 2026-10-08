export type PronunciationStatus = 'idle' | 'starting' | 'speaking' | 'blocked' | 'unavailable' | 'error';

interface SpeechEnvironment {
  synthesis(): SpeechSynthesis | undefined;
  utterance(text: string): SpeechSynthesisUtterance;
  setTimer(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer(timer: ReturnType<typeof setTimeout>): void;
}

interface PlaybackOptions {
  rate?: number;
  preferStudyVoice?: boolean;
  canPlay?: () => boolean;
  onStatus: (status: PronunciationStatus) => void;
}

const browserEnvironment: SpeechEnvironment = {
  synthesis: () => typeof window !== 'undefined' && typeof window.SpeechSynthesisUtterance === 'function'
    ? window.speechSynthesis : undefined,
  utterance: text => new SpeechSynthesisUtterance(text),
  setTimer: (callback, ms) => setTimeout(callback, ms),
  clearTimer: timer => clearTimeout(timer),
};

// SpeechSynthesis.cancel clears the browser's entire queue. Only the owner of
// the current playback may stop it; stale component cleanup must not stop a
// newer screen. Invalidate callbacks before cancellation emits an error.
export const createPronunciationPlayer = (environment: SpeechEnvironment = browserEnvironment) => {
  let active: { owner: object; synthesis: SpeechSynthesis; timer?: ReturnType<typeof setTimeout> } | null = null;
  const stop = (owner?: object) => {
    if (!active || (owner && active.owner !== owner)) return;
    const previous = active;
    active = null;
    if (previous.timer !== undefined) environment.clearTimer(previous.timer);
    try { previous.synthesis.cancel(); } catch { /* A failed stop must not break navigation. */ }
  };
  const play = (owner: object, text: string, options: PlaybackOptions) => {
    if (!text.trim() || options.canPlay?.() === false) return;
    stop();
    let synthesis: SpeechSynthesis | undefined;
    try { synthesis = environment.synthesis(); } catch { /* Unsupported browser. */ }
    if (!synthesis || typeof synthesis.speak !== 'function' || typeof synthesis.cancel !== 'function') {
      options.onStatus('unavailable');
      return;
    }
    const playback = { owner, synthesis, timer: undefined as ReturnType<typeof setTimeout> | undefined };
    active = playback;
    const current = () => active === playback;
    const clearTimer = () => {
      if (playback.timer !== undefined) environment.clearTimer(playback.timer);
      playback.timer = undefined;
    };
    try {
      const utterance = environment.utterance(text);
      utterance.lang = 'en-US';
      utterance.rate = options.rate ?? 1;
      // Keep the existing Study voice preference. Read voices at playback time
      // so voiceschanged never schedules an obsolete card or repeats a word.
      if (options.preferStudyVoice) {
        let voices: SpeechSynthesisVoice[] = [];
        try { voices = synthesis.getVoices(); } catch { /* The default voice is usable. */ }
        const voice = voices.find(item => item.name === 'Google US English')
          ?? voices.find(item => item.name === 'Samantha')
          ?? voices.find(item => item.lang === 'en-US');
        if (voice) utterance.voice = voice;
      }
      utterance.onstart = () => {
        if (!current()) return;
        if (options.canPlay?.() === false) { stop(owner); return; }
        clearTimer();
        options.onStatus('speaking');
      };
      utterance.onend = () => {
        if (!current()) return;
        clearTimer();
        active = null;
        options.onStatus('idle');
      };
      utterance.onerror = event => {
        if (!current()) return;
        clearTimer();
        active = null;
        options.onStatus(event.error === 'canceled' || event.error === 'interrupted' ? 'idle'
          : event.error === 'not-allowed' ? 'blocked' : 'error');
      };
      options.onStatus('starting');
      playback.timer = environment.setTimer(() => {
        if (!current()) return;
        stop(owner);
        options.onStatus('blocked');
      }, 4000);
      synthesis.speak(utterance);
    } catch (error) {
      if (!current()) return;
      stop(owner);
      options.onStatus(error instanceof Error && error.name === 'NotAllowedError' ? 'blocked' : 'error');
    }
  };
  return { play, stop };
};

// One attempt per presentation, rather than one attempt per word in a session.
// StrictMode can cancel a scheduled effect without consuming this attempt.
export const createPronunciationPresentation = () => {
  let key: string | null = null;
  let attempted = false;
  return {
    prepare(next: string | null) {
      if (key !== next) { key = next; attempted = false; }
    },
    claim(next: string) {
      if (key !== next) { key = next; attempted = false; }
      if (attempted) return false;
      attempted = true;
      return true;
    },
    manual(next: string | null) { key = next; attempted = true; },
  };
};

export const pronunciationPlayer = createPronunciationPlayer();
const MUTE_KEY = 'steady-study:pronunciation-muted:v1';
let muted = false;
let initialized = false;
const listeners = new Set<() => void>();
export const getPronunciationMuted = () => {
  if (!initialized && typeof window !== 'undefined') {
    initialized = true;
    try { muted = window.localStorage.getItem(MUTE_KEY) === 'true'; } catch { /* In-memory fallback. */ }
  }
  return muted;
};
export const setPronunciationMuted = (next: boolean) => {
  initialized = true;
  muted = next;
  if (muted) pronunciationPlayer.stop();
  try { window.localStorage.setItem(MUTE_KEY, String(next)); } catch { /* In-memory fallback. */ }
  listeners.forEach(listener => listener());
};
export const subscribePronunciationMuted = (listener: () => void) => {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== MUTE_KEY && event.key !== null) return;
    try { muted = window.localStorage.getItem(MUTE_KEY) === 'true'; } catch { return; }
    initialized = true;
    if (muted) pronunciationPlayer.stop();
    listeners.forEach(notify => notify());
  };
  window.addEventListener('storage', onStorage);
  return () => { listeners.delete(listener); window.removeEventListener('storage', onStorage); };
};
