import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPronunciationPlayer, createPronunciationPresentation, type PronunciationStatus } from '../services/pronunciation';

const fixture = () => {
  const utterances: SpeechSynthesisUtterance[] = [];
  const voices = [{ name: 'Other', lang: 'en-US' }, { name: 'Samantha', lang: 'en-US' }, { name: 'Google US English', lang: 'en-US' }] as SpeechSynthesisVoice[];
  const synthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: vi.fn(() => voices) } as unknown as SpeechSynthesis;
  const player = createPronunciationPlayer({
    synthesis: () => synthesis,
    utterance: text => { const value = { text } as SpeechSynthesisUtterance; utterances.push(value); return value; },
    setTimer: (cb, ms) => setTimeout(cb, ms), clearTimer: timer => clearTimeout(timer),
  });
  const statuses: PronunciationStatus[] = [];
  const owner = {};
  const play = (text = 'learn', extra = {}) => player.play(owner, text, { onStatus: value => statuses.push(value), ...extra });
  return { synthesis, player, statuses, owner, utterances, voices, play };
};

describe('pronunciation playback ownership and browser failures', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());
  it('preserves Study rate and English voice preference, and marks speaking only at start', () => {
    const f = fixture(); f.play('learn', { rate: 0.9, preferStudyVoice: true });
    expect(f.utterances[0]).toMatchObject({ text: 'learn', lang: 'en-US', rate: 0.9, voice: f.voices[2] });
    expect(f.statuses).toEqual(['starting']);
    f.utterances[0].onstart?.({} as SpeechSynthesisEvent);
    expect(f.statuses).toEqual(['starting', 'speaking']);
    vi.advanceTimersByTime(5000);
    expect(f.synthesis.cancel).not.toHaveBeenCalled();
    f.utterances[0].onend?.({} as SpeechSynthesisEvent);
    expect(f.statuses.at(-1)).toBe('idle');
  });
  it('uses the default guest voice and rate without waiting for voices', () => {
    const f = fixture(); f.play();
    expect(f.utterances[0]).toMatchObject({ lang: 'en-US', rate: 1 });
    expect(f.synthesis.getVoices).not.toHaveBeenCalled();
  });
  it.each(['Samantha', 'Other'])('falls back to available English voice %s', name => {
    const f = fixture(); f.voices.splice(name === 'Samantha' ? 2 : 1);
    f.play('learn', { preferStudyVoice: true }); expect(f.utterances[0].voice?.name).toBe(name);
  });
  it('keeps default voice when an empty or throwing voice list is returned', () => {
    const f = fixture(); f.voices.splice(0); f.play('learn', { preferStudyVoice: true });
    expect(f.synthesis.speak).toHaveBeenCalledOnce();
    vi.mocked(f.synthesis.getVoices).mockImplementation(() => { throw Error('unavailable'); });
    f.play('read', { preferStudyVoice: true }); expect(f.synthesis.speak).toHaveBeenCalledTimes(2);
  });
  it('stale cleanup and late callbacks cannot cancel or change a new owner', () => {
    const f = fixture(); f.play(); const old = f.utterances[0]; const nextStatuses: PronunciationStatus[] = [];
    const nextOwner = {}; f.player.play(nextOwner, 'read', { onStatus: value => nextStatuses.push(value) });
    expect(f.synthesis.cancel).toHaveBeenCalledOnce();
    f.player.stop(f.owner);
    old.onstart?.({} as SpeechSynthesisEvent); old.onerror?.({ error: 'synthesis-failed' } as SpeechSynthesisErrorEvent);
    expect(f.statuses).toEqual(['starting']); expect(nextStatuses).toEqual(['starting']);
    expect(f.synthesis.cancel).toHaveBeenCalledOnce();
    f.player.stop(nextOwner); expect(f.synthesis.cancel).toHaveBeenCalledTimes(2);
  });
  it('invalidates synchronous canceled events before calling browser cancel', () => {
    const f = fixture(); f.play();
    vi.mocked(f.synthesis.cancel).mockImplementation(() => f.utterances[0].onerror?.({ error: 'canceled' } as SpeechSynthesisErrorEvent));
    f.player.stop(f.owner); expect(f.statuses).toEqual(['starting']);
    vi.runAllTimers(); expect(f.statuses).toEqual(['starting']);
  });
  it('does not queue a hidden answer and cancels a delayed start after visibility is lost', () => {
    const f = fixture(); let visible = false;
    f.play('hidden', { canPlay: () => visible }); expect(f.synthesis.speak).not.toHaveBeenCalled();
    visible = true; f.play('revealed', { canPlay: () => visible }); visible = false;
    f.utterances[0].onstart?.({} as SpeechSynthesisEvent);
    expect(f.synthesis.cancel).toHaveBeenCalledOnce(); expect(f.statuses).toEqual(['starting']);
  });
  it.each(['not-allowed', 'synthesis-failed', 'canceled', 'interrupted'])('handles %s without a replay loop', error => {
    const f = fixture(); f.play(); f.utterances[0].onerror?.({ error } as SpeechSynthesisErrorEvent);
    vi.runAllTimers();
    expect(f.statuses.at(-1)).toBe(error === 'not-allowed' ? 'blocked' : ['canceled', 'interrupted'].includes(error) ? 'idle' : 'error');
    expect(f.synthesis.speak).toHaveBeenCalledOnce();
  });
  it('silently unstarted speech is stopped and offers manual replay', () => {
    const f = fixture(); f.play(); vi.advanceTimersByTime(4000);
    expect(f.statuses).toEqual(['starting', 'blocked']); expect(f.synthesis.cancel).toHaveBeenCalledOnce();
    f.play(); expect(f.synthesis.speak).toHaveBeenCalledTimes(2);
  });
  it('handles a throwing browser method and still allows a later manual attempt', () => {
    const f = fixture(); vi.mocked(f.synthesis.speak).mockImplementationOnce(() => { throw new DOMException('denied', 'NotAllowedError'); });
    f.play(); expect(f.statuses.at(-1)).toBe('blocked'); f.play(); expect(f.synthesis.speak).toHaveBeenCalledTimes(2);
  });
  it('does not throw when speech APIs or the constructor are missing', () => {
    const statuses: PronunciationStatus[] = [];
    const player = createPronunciationPlayer({ synthesis: () => undefined, utterance: () => { throw Error('missing'); }, setTimer: (cb, ms) => setTimeout(cb, ms), clearTimer: timer => clearTimeout(timer) });
    player.play({}, 'learn', { onStatus: value => statuses.push(value) }); expect(statuses).toEqual(['unavailable']);
    const f = fixture();
    const missingConstructor = createPronunciationPlayer({ synthesis: () => f.synthesis, utterance: () => { throw Error('missing constructor'); },
      setTimer: (cb, ms) => setTimeout(cb, ms), clearTimer: timer => clearTimeout(timer) });
    expect(() => missingConstructor.play(f.owner, 'learn', { onStatus: value => statuses.push(value) })).not.toThrow();
    expect(statuses.at(-1)).toBe('error'); expect(f.synthesis.speak).not.toHaveBeenCalled();
  });
});

describe('visible word presentation identity', () => {
  it('does not consume a scheduled StrictMode effect until its actual attempt', () => {
    const p = createPronunciationPresentation(); p.prepare('round:0:word'); p.prepare('round:0:word');
    expect(p.claim('round:0:word')).toBe(true); expect(p.claim('round:0:word')).toBe(false);
  });
  it('allows the same word at a later position, restart and backward navigation once each', () => {
    const p = createPronunciationPresentation();
    for (const key of ['round:0:word', 'round:1:word', 'round:0:word', 'restart:0:word']) {
      p.prepare(key); expect(p.claim(key)).toBe(true); expect(p.claim(key)).toBe(false);
    }
  });
  it('manual or muted first presentation prevents a pending auto replay', () => {
    const p = createPronunciationPresentation(); p.prepare('first'); p.manual('first'); expect(p.claim('first')).toBe(false);
    p.prepare('muted'); expect(p.claim('muted')).toBe(true); expect(p.claim('muted')).toBe(false);
  });
});
