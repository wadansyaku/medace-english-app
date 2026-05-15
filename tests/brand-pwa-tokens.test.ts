import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRAND_VISUAL_SYSTEM } from '../config/brand';

const readText = (path: string) => readFileSync(path, 'utf8');
const readBuffer = (path: string) => readFileSync(path);

describe('MedAce Study Space brand tokens', () => {
  it('keeps the learner PWA surface orange and white without the old purple mark', () => {
    const indexHtml = readText('index.html');
    const manifest = JSON.parse(readText('public/manifest.webmanifest')) as {
      theme_color: string;
      background_color: string;
    };

    expect(BRAND_VISUAL_SYSTEM.palette.primary[500]).toBe('#ff8216');
    expect(BRAND_VISUAL_SYSTEM.palette.mark).toBe('#ff8216');
    expect(BRAND_VISUAL_SYSTEM.palette.neutral.canvas).toBe('#fff8f1');
    expect(indexHtml).toContain('name="theme-color" content="#fff8f1"');
    expect(indexHtml).toContain('color="#ff8216"');
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
    ]) {
      expect(readText(path).toLowerCase(), `${path} should not use the old purple brand color`).not.toContain('#19006e');
    }
  });
});
