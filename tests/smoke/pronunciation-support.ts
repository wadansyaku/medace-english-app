import type { Page } from '@playwright/test';

export const installPronunciation = async (page: Page, options: { blocked?: boolean; unsupported?: boolean; delayed?: boolean } = {}) => {
  await page.addInitScript(config => {
    const fixture: any = {
      spoken: [], utterances: [], cancels: 0, active: null,
      mode: config.blocked ? 'blocked' : config.delayed ? 'delayed' : 'normal',
      voices: [{ name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'fixture' }],
      emit(index: number, type: string, error = 'not-allowed') {
        const utterance = fixture.utterances[index];
        utterance?.[`on${type}`]?.({ type, error, utterance });
      },
    };
    (window as any).__pronunciationFixture = fixture;
    if (config.unsupported) {
      Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: undefined });
      Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: undefined });
      return;
    }
    class Utterance {
      lang = ''; rate = 1; volume = 1; voice: any = null;
      onstart: any = null; onend: any = null; onerror: any = null;
      constructor(public text: string) {}
    }
    const synthesis: any = new EventTarget();
    synthesis.getVoices = () => fixture.voices;
    synthesis.speak = (utterance: any) => {
      const index = fixture.utterances.length;
      fixture.utterances.push(utterance);
      fixture.spoken.push({ text: utterance.text, rate: utterance.rate, lang: utterance.lang, voice: utterance.voice?.name ?? null });
      fixture.active = index;
      if (fixture.mode === 'delayed') return;
      queueMicrotask(() => {
        if (fixture.active !== index) return;
        if (fixture.mode === 'blocked' || fixture.mode === 'error') {
          fixture.emit(index, 'error', fixture.mode === 'blocked' ? 'not-allowed' : 'synthesis-failed');
          fixture.active = null;
        } else {
          fixture.emit(index, 'start');
          setTimeout(() => { if (fixture.active === index) { fixture.emit(index, 'end'); fixture.active = null; } }, 100);
        }
      });
    };
    synthesis.cancel = () => {
      fixture.cancels++;
      const previous = fixture.active;
      fixture.active = null;
      if (previous !== null) fixture.emit(previous, 'error', 'canceled');
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: synthesis });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: Utterance });
  }, options);
};

export const readPronunciation = (page: Page): Promise<{ spoken: Array<{ text: string; rate: number; lang: string; voice: string | null }>; cancels: number }> =>
  page.evaluate(() => ({ spoken: (window as any).__pronunciationFixture.spoken, cancels: (window as any).__pronunciationFixture.cancels }));
