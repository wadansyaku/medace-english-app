import fs from 'node:fs/promises';
import path from 'node:path';

const FIXED_DUPLICATE_PREFIXES = new Map([
  ['0019', [
    '0019_commercial_request_teaching_format.sql',
    '0019_weekly_missions.sql',
  ]],
]);

const repoRoot = process.cwd();
const migrationsDir = path.join(repoRoot, 'migrations');

const files = (await fs.readdir(migrationsDir))
  .filter((file) => file.endsWith('.sql'))
  .sort();

const byPrefix = new Map();
for (const file of files) {
  const match = /^(\d+)_/.exec(file);
  if (!match) continue;
  const prefix = match[1];
  const bucket = byPrefix.get(prefix) || [];
  bucket.push(file);
  byPrefix.set(prefix, bucket);
}

const unexpectedDuplicates = [...byPrefix.entries()]
  .filter(([prefix, bucket]) => bucket.length > 1 && !FIXED_DUPLICATE_PREFIXES.has(prefix));

const mismatchedFixedDuplicates = [...byPrefix.entries()]
  .filter(([prefix, bucket]) => bucket.length > 1 && FIXED_DUPLICATE_PREFIXES.has(prefix))
  .map(([prefix, bucket]) => ({
    prefix,
    actual: [...bucket].sort(),
    expected: [...(FIXED_DUPLICATE_PREFIXES.get(prefix) || [])].sort(),
  }))
  .filter(({ actual, expected }) => (
    actual.length !== expected.length
    || actual.some((file, index) => file !== expected[index])
  ));

if (unexpectedDuplicates.length > 0) {
  console.error('Unexpected duplicate migration prefixes detected:');
  unexpectedDuplicates.forEach(([prefix, bucket]) => {
    console.error(`- ${prefix}: ${bucket.join(', ')}`);
  });
  process.exit(1);
}

if (mismatchedFixedDuplicates.length > 0) {
  console.error('Fixed duplicate migration prefixes no longer match the approved historical exception set:');
  mismatchedFixedDuplicates.forEach(({ prefix, actual, expected }) => {
    console.error(`- ${prefix}: actual=[${actual.join(', ')}] expected=[${expected.join(', ')}]`);
  });
  process.exit(1);
}

const fixedDuplicates = [...byPrefix.entries()]
  .filter(([prefix, bucket]) => bucket.length > 1 && FIXED_DUPLICATE_PREFIXES.has(prefix));

if (fixedDuplicates.length > 0) {
  console.info('Fixed duplicate migration prefixes are approved historical exceptions:');
  fixedDuplicates.forEach(([prefix, bucket]) => {
    console.info(`- ${prefix}: ${bucket.join(', ')}`);
  });
}
