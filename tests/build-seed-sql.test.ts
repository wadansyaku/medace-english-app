import { execFile } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const scriptPath = `${root}/scripts/build-seed-sql.mjs`;

const createTempCsv = async (csvText: string) => {
  const tmpRoot = (process.env['TMPDIR'] || '/tmp').replace(/\/$/, '');
  const dir = await mkdtemp(`${tmpRoot}/medace-seed-`);
  const inputPath = `${dir}/catalog.csv`;
  const outputPath = `${dir}/seed.sql`;
  await writeFile(inputPath, csvText, 'utf8');
  return { inputPath, outputPath };
};

describe('build-seed-sql content quality guard', () => {
  it('preserves word metadata when generating seed SQL', async () => {
    const { inputPath, outputPath } = await createTempCsv([
      '単語帳名,単語番号,単語,日本語訳,例文,例文訳,カテゴリ,小分類,セクション,出典シート,出典番号',
      'Starter,7,care,注意,Take care of your notes.,ノートを大切に扱いなさい。,core,noun,unit-1,SheetA,42',
    ].join('\n'));

    await execFileAsync(process.execPath, [scriptPath, inputPath, outputPath]);

    const sql = await readFile(outputPath, 'utf8');
    expect(sql).toContain('category, subcategory, section, source_sheet, source_entry_id, example_sentence, example_meaning');
    expect(sql).toContain("'core'");
    expect(sql).toContain("'noun'");
    expect(sql).toContain("'unit-1'");
    expect(sql).toContain("'SheetA'");
    expect(sql).toContain('42');
    expect(sql).toContain("'Take care of your notes.'");
  });

  it('fails when extracted source still contains blocked marker rows', async () => {
    const { inputPath, outputPath } = await createTempCsv([
      '単語帳名,単語番号,単語,日本語訳',
      'Starter,1,[未抽出],注意',
    ].join('\n'));

    await expect(
      execFileAsync(process.execPath, [scriptPath, inputPath, outputPath]),
    ).rejects.toMatchObject({
      stderr: expect.stringContaining('Blocked content marker'),
    });
  });
});
