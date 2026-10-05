import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildReviewedWordExamplesSql } from './_shared/reviewed-word-examples.mjs';

// An offline artifact builder. There is intentionally no DB, network or --remote option.
const options = new Map();
const args = process.argv.slice(2);
for (let index = 0; index < args.length; index += 2) {
  const key = args[index];
  const value = args[index + 1];
  if (!['--input', '--output'].includes(key) || !value || value.startsWith('--') || options.has(key)) {
    throw new Error('Usage: node scripts/build-reviewed-word-examples-sql.mjs --input <reviewed.json> --output <pending.sql>');
  }
  options.set(key, resolve(value));
}
if (options.size !== 2) throw new Error('--input and --output are required');
const inputPath = options.get('--input');
const outputPath = options.get('--output');
const manifestPath = `${outputPath}.manifest.json`;
if (inputPath === outputPath || inputPath === manifestPath) throw new Error('Output must not overwrite the input');
const input = JSON.parse(await readFile(inputPath, 'utf8'));
const result = buildReviewedWordExamplesSql(input);
await writeFile(outputPath, result.sql, { flag: 'wx', mode: 0o600 });
await writeFile(manifestPath, `${JSON.stringify(result.manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
process.stdout.write(`${JSON.stringify({ ...result.manifest, output: outputPath, manifest: manifestPath }, null, 2)}\n`);
