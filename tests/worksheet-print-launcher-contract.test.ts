import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path: string) => readFileSync(`${process.cwd()}/${path}`, 'utf8');

describe('worksheet print launcher role contracts', () => {
  it('keeps instructor and school-admin worksheet entrypoints in book-range handout mode', () => {
    const instructorSource = readSource('components/dashboard/InstructorDashboardSections.tsx');
    const schoolAdminSource = readSource('components/dashboard/businessAdmin/BusinessAdminWorksheetsSection.tsx');

    expect(instructorSource).toContain('defaultSourceMode="BOOK_RANGE"');
    expect(instructorSource).toContain('allowSourceModeSwitch={false}');
    expect(schoolAdminSource).toContain('defaultSourceMode="BOOK_RANGE"');
    expect(schoolAdminSource).toContain('allowSourceModeSwitch={false}');
  });

  it('shows the actual randomized handout questions and supports explicit reshuffle', () => {
    const launcherSource = readSource('components/WorksheetPrintLauncher.tsx');

    expect(launcherSource).toContain("source: 'book_range'");
    expect(launcherSource).toContain('data-testid="worksheet-reshuffle"');
    expect(launcherSource).toContain('今回出す問題');
    expect(launcherSource).toContain('generatedQuestions.slice(0, 6)');
    expect(launcherSource).not.toContain('filteredWords.slice(0, 6).map');
  });
});
