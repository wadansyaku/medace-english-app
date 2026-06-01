import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRAND_VISUAL_SYSTEM } from '../config/brand';

const readText = (path: string) => readFileSync(path, 'utf8');
const readBuffer = (path: string) => readFileSync(path);
const OLD_PURPLE_MARK_PATTERNS = [
  /#19006e/i,
  /rgba\(\s*25\s*,\s*0\s*,\s*110\s*,/i,
] as const;
const OLD_DARK_ORANGE_PATTERNS = [
  /#d24600/i,
  /#7a2f12/i,
  /rgba\(\s*194\s*,\s*65\s*,\s*12\s*,/i,
  /rgba\(\s*228\s*,\s*94\s*,\s*4\s*,/i,
] as const;

describe('MedAce Study Space brand tokens', () => {
  it('keeps the learner PWA surface calm, Japanese, and free of the old purple mark', () => {
    const indexHtml = readText('index.html');
    const manifest = JSON.parse(readText('public/manifest.webmanifest')) as {
      name: string;
      short_name: string;
      theme_color: string;
      background_color: string;
    };

    expect(BRAND_VISUAL_SYSTEM.palette.primary[500]).toBe('#ff7a00');
    expect(BRAND_VISUAL_SYSTEM.palette.primary[600]).toBe('#ff7a00');
    expect(BRAND_VISUAL_SYSTEM.palette.primary[700]).toBe('#e65100');
    expect(BRAND_VISUAL_SYSTEM.palette.mark).toBe('#ff7a00');
    expect(BRAND_VISUAL_SYSTEM.palette.neutral.canvas).toBe('#fff8f1');
    expect(indexHtml).toContain('<html lang="ja">');
    expect(indexHtml).toContain('name="apple-mobile-web-app-title" content="Steady Study"');
    expect(manifest.name).toBe('Steady Study');
    expect(manifest.short_name).toBe('Steady Study');
    expect(readText('public/icons/app-icon.svg')).toContain('aria-label="Steady Study"');
    expect(readText('public/icons/app-icon-maskable.svg')).toContain('aria-label="Steady Study maskable icon"');
    expect(indexHtml).toContain('name="theme-color" content="#fff8f1"');
    expect(indexHtml).toContain('color="#ff7a00"');
    expect(manifest.theme_color).toBe('#fff8f1');
    expect(manifest.background_color).toBe('#fff8f1');
    expect(readBuffer('public/apple-touch-icon.png').byteLength).toBeGreaterThan(10_000);

    for (const path of [
      'styles.css',
      'config/brand.ts',
      'index.html',
      'public/manifest.webmanifest',
      'public/favicon.svg',
      'public/icons/app-icon.svg',
      'public/icons/app-icon-maskable.svg',
      'components/Layout.tsx',
      'components/auth/AuthExperienceScreen.tsx',
      'components/onboarding/OnboardingProfileStep.tsx',
      'components/onboarding/OnboardingTestStep.tsx',
      'components/onboarding/OnboardingResultStep.tsx',
      'components/dashboard/DashboardHeroSection.tsx',
      'components/dashboard/DashboardLibrarySection.tsx',
      'components/dashboard/DashboardProgressSection.tsx',
      'components/dashboard/DashboardSettingsModal.tsx',
      'components/dashboard/DashboardPlanSection.tsx',
      'components/dashboard/DashboardTaskOverviewRail.tsx',
      'components/dashboard/DashboardWeaknessSection.tsx',
    ]) {
      const fileText = readText(path);

      for (const oldPurplePattern of OLD_PURPLE_MARK_PATTERNS) {
        expect(fileText, `${path} should not use the old purple brand mark`).not.toMatch(oldPurplePattern);
      }
      for (const oldDarkOrangePattern of OLD_DARK_ORANGE_PATTERNS) {
        expect(fileText, `${path} should not use the old dark orange ramp`).not.toMatch(oldDarkOrangePattern);
      }
      expect(fileText, `${path} should use medace tokens instead of Tailwind orange utilities`).not.toMatch(/\b(?:bg|text|border|from|to|via|accent)-orange-/);
    }
  });

  it('keeps core learner entry screens away from medace-gradient treatments', () => {
    for (const path of [
      'components/onboarding/OnboardingProfileStep.tsx',
      'components/onboarding/OnboardingTestStep.tsx',
      'components/dashboard/DashboardHeroSection.tsx',
      'components/Layout.tsx',
    ]) {
      const fileText = readText(path);

      expect(fileText, `${path} should not use radial gradient decoration`).not.toContain('radial-gradient');
      expect(fileText, `${path} should not use gradient utilities`).not.toMatch(/\bbg-gradient-|from-medace-|to-medace-|via-medace-/);
    }
  });
});
