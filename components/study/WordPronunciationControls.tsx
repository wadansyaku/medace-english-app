import { Volume2, VolumeX } from 'lucide-react';
import type { WordPronunciation } from '../../hooks/useWordPronunciation';

interface Props { pronunciation: WordPronunciation; disabled?: boolean; className?: string }
export const PronunciationMuteButton = ({ pronunciation }: { pronunciation: WordPronunciation }) => (
  <button type="button" aria-label={pronunciation.muted ? '音声をオンにする' : '音声をオフにする'}
        aria-pressed={pronunciation.muted} onClick={pronunciation.toggleMuted}
        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-slate-200 bg-white px-2 text-sm font-bold text-slate-600 hover:bg-slate-50">
        {pronunciation.muted ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
        音声{pronunciation.muted ? 'オフ' : 'オン'}
      </button>
);

const WordPronunciationControls = ({ pronunciation, disabled = false, className = '' }: Props) => (
  <div className={`min-w-0 ${className}`} onClick={event => event.stopPropagation()}>
    <div className="flex flex-wrap items-center gap-1">
      <button type="button" aria-label="発音を聞く" disabled={disabled || pronunciation.muted}
        onClick={event => pronunciation.speak(undefined, event.currentTarget)}
        className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-medace-50 px-2 text-sm font-bold text-medace-800 hover:bg-medace-100 disabled:opacity-50">
        <Volume2 className="h-4 w-4" aria-hidden="true" />発音を聞く
      </button>
      <PronunciationMuteButton pronunciation={pronunciation} />
    </div>
    {pronunciation.message && <p role="status" className="mt-1 text-xs leading-relaxed text-slate-600">{pronunciation.message}</p>}
  </div>
);
export default WordPronunciationControls;
