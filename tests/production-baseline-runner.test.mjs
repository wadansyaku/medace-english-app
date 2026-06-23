import { describe, expect, it } from 'vitest';

import {
  evaluateProductionBaselineReport,
  generateProductionBaselineReport,
  normalizeD1StatementResults,
  parseCliArgs,
  querySections,
} from '../scripts/analysis/run-production-baseline.mjs';

describe('run-production-baseline', () => {
  it('requires explicit D1 mode and validates local persist usage', () => {
    expect(parseCliArgs(['--help'])).toEqual(expect.objectContaining({
      help: true,
    }));
    expect(() => parseCliArgs([])).toThrow('Pass either --remote or --local');
    expect(parseCliArgs(['--remote'])).toEqual(expect.objectContaining({
      database: 'medace-db',
      mode: 'remote',
    }));
    expect(parseCliArgs(['--local', '--persist-to', '/tmp/d1'])).toEqual(expect.objectContaining({
      mode: 'local',
      persistTo: '/tmp/d1',
    }));
    expect(() => parseCliArgs(['--remote', '--persist-to', '/tmp/d1'])).toThrow('--persist-to');
    expect(() => parseCliArgs(['--remote', '--local'])).toThrow('Pass only one');
  });

  it('keeps the baseline query pack broad enough to cover product and business health', () => {
    const sectionNames = querySections.map((section) => section.name);

    expect(sectionNames).toEqual(expect.arrayContaining([
      'user_mix',
      'organization_mix',
      'catalog_mix',
      'learning_activity_windows',
      'writing_activity',
      'business_ops_activity',
      'product_telemetry_recency',
      'integrity_org_membership',
      'integrity_books_and_plans',
      'recency_markers',
    ]));
    expect(querySections.every((section) => !/\b(UPDATE|INSERT|DELETE|DROP|ALTER)\b/i.test(section.sql))).toBe(true);

    const productTelemetrySection = querySections.find((section) => section.name === 'product_telemetry_recency');
    expect(productTelemetrySection?.sql).toContain('COUNT(*) AS row_count');
    expect(productTelemetrySection?.sql).toContain('MAX(created_at) AS latest_created_at FROM product_events');
    expect(productTelemetrySection?.sql).toContain('MAX(updated_at) AS latest_updated_at');
    expect(productTelemetrySection?.sql).toContain('FROM product_kpi_daily_snapshots');
    expect(/\b(UPDATE|INSERT|DELETE|DROP|ALTER)\b/i.test(productTelemetrySection?.sql || '')).toBe(false);
  });

  it('normalizes both direct wrangler results and API result wrappers', () => {
    expect(normalizeD1StatementResults([
      { success: true, results: [{ count: 1 }], meta: { duration: 1 } },
    ])).toEqual([
      { success: true, results: [{ count: 1 }], meta: { duration: 1 }, error: null },
    ]);
    expect(normalizeD1StatementResults({
      result: [
        { success: false, results: [], error: 'no such table' },
      ],
    })).toEqual([
      { success: false, results: [], meta: null, error: 'no such table' },
    ]);
  });

  it('generates a report and marks successful query sections as ok', () => {
    const report = generateProductionBaselineReport({
      database: 'medace-db',
      mode: 'remote',
    }, () => [
      { success: true, results: [{ rows: 0 }], meta: null, error: null },
    ], new Date('2026-06-19T00:00:00.000Z'));

    const evaluation = evaluateProductionBaselineReport(report);

    expect(report.generatedAt).toBe('2026-06-19T00:00:00.000Z');
    expect(report.sections).toHaveLength(querySections.length);
    expect(report.sections.map((section) => section.name)).toContain('product_telemetry_recency');
    expect(evaluation.ok).toBe(true);
    expect(evaluation.errors).toEqual([]);
  });

  it('fails the report when a query result is unsuccessful or a section throws', () => {
    const report = {
      generatedAt: '2026-06-19T00:00:00.000Z',
      database: 'medace-db',
      mode: 'remote',
      sections: [
        {
          name: 'integrity_org_membership',
          queryResults: [
            { success: false, results: [], meta: null, error: 'no such column: organization_role' },
          ],
        },
        {
          name: 'business_ops_activity',
          queryResults: [],
          error: 'wrangler failed',
        },
      ],
    };

    const evaluation = evaluateProductionBaselineReport(report);

    expect(evaluation.ok).toBe(false);
    expect(evaluation.errors.join('\n')).toContain('integrity_org_membership[0]');
    expect(evaluation.errors.join('\n')).toContain('no such column');
    expect(evaluation.errors.join('\n')).toContain('business_ops_activity: wrangler failed');
  });
});
