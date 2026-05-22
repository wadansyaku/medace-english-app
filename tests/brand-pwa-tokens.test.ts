import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRAND_VISUAL_SYSTEM } from '../config/brand';

const readText = (path: string) => readFileSync(path, 'utf8');
const readBuffer = (path: string) => readFileSync(path);
const OLD_PURPLE_MARK_PATTERNS = [
  /#19006e/i,
  /rgba\(\s*25\s*,\s*0\s*,\s*110\s*,/i,
] as const;

describe('MedAce Study Space brand tokens', () => {
  it('keeps the learner PWA surface orange and white without the old purple mark', () => {
    const indexHtml = readText('index.html');
    const manifest = JSON.parse(readText('public/manifest.webmanifest')) as {
      theme_color: string;
      background_color: string;
    };

    expect(BRAND_VISUAL_SYSTEM.palette.primary[500]).toBe('#ff7a00');
    expect(BRAND_VISUAL_SYSTEM.palette.primary[700]).toBe('#d24600');
    expect(BRAND_VISUAL_SYSTEM.palette.mark).toBe('#ff7a00');
    expect(BRAND_VISUAL_SYSTEM.palette.neutral.canvas).toBe('#fff8f1');
    expect(indexHtml).toContain('name="theme-color" content="#fff8f1"');
    expect(indexHtml).toContain('color="#ff7a00"');
    expect(manifest.theme_color).toBe('#fff8f1');
    expect(manifest.background_color).toBe('#fff8f1');
    expect(readBuffer('public/apple-touch-icon.png').byteLength).toBeGreaterThan(20_000);

    for (const path of [
      'styles.css',
      'config/brand.ts',
      'index.html',
      'public/manifest.webmanifest',
      'public/favicon.svg',
      'public/icons/app-icon.svg',
      'public/icons/app-icon-maskable.svg',
      'components/Layout.tsx',
      'components/dashboard/DashboardHeroSection.tsx',
      'components/dashboard/DashboardLibrarySection.tsx',
      'components/dashboard/DashboardProgressSection.tsx',
      'components/dashboard/DashboardSettingsModal.tsx',
    ]) {
      const fileText = readText(path);

      for (const oldPurplePattern of OLD_PURPLE_MARK_PATTERNS) {
        expect(fileText, `${path} should not use the old purple brand mark`).not.toMatch(oldPurplePattern);
      }
    }
  });
});
