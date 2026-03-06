export type DisplayFontSize = 'standard' | 'large';
export type DisplayDensity = 'standard' | 'comfortable';

export interface DisplayPreferences {
  fontSize: DisplayFontSize;
  density: DisplayDensity;
}

export const DEFAULT_DISPLAY_PREFERENCES: DisplayPreferences = {
  fontSize: 'standard',
  density: 'standard',
};

const STORAGE_KEY = 'medace:display-preferences';

const normalizeFontSize = (value: unknown): DisplayFontSize =>
  value === 'large' ? 'large' : DEFAULT_DISPLAY_PREFERENCES.fontSize;

const normalizeDensity = (value: unknown): DisplayDensity =>
  value === 'comfortable' ? 'comfortable' : DEFAULT_DISPLAY_PREFERENCES.density;

const normalizeDisplayPreferences = (value: unknown): DisplayPreferences => {
  if (!value || typeof value !== 'object') return DEFAULT_DISPLAY_PREFERENCES;
  const next = value as Partial<DisplayPreferences>;
  return {
    fontSize: normalizeFontSize(next.fontSize),
    density: normalizeDensity(next.density),
  };
};

const getStorageKey = (uid?: string | null): string => (uid ? `${STORAGE_KEY}:${uid}` : `${STORAGE_KEY}:default`);

export const getStoredDisplayPreferences = (uid?: string | null): DisplayPreferences => {
  if (typeof window === 'undefined') return DEFAULT_DISPLAY_PREFERENCES;

  const candidates = [getStorageKey(uid), getStorageKey()];
  for (const key of candidates) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      return normalizeDisplayPreferences(JSON.parse(raw));
    } catch (error) {
      console.warn('Failed to parse display preferences', error);
    }
  }

  return DEFAULT_DISPLAY_PREFERENCES;
};

export const applyDisplayPreferences = (preferences: DisplayPreferences): void => {
  if (typeof document === 'undefined') return;
  const normalized = normalizeDisplayPreferences(preferences);
  document.documentElement.dataset.uiFontSize = normalized.fontSize;
  document.documentElement.dataset.uiDensity = normalized.density;
};

export const saveDisplayPreferences = (uid: string | undefined, preferences: DisplayPreferences): DisplayPreferences => {
  const normalized = normalizeDisplayPreferences(preferences);
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(getStorageKey(uid), JSON.stringify(normalized));
    window.localStorage.setItem(getStorageKey(), JSON.stringify(normalized));
  }
  applyDisplayPreferences(normalized);
  return normalized;
};
