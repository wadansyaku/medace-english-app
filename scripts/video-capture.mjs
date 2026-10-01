#!/usr/bin/env node
/** Record reviewed UI actions against a local demo, never a production origin.
 * Input is a scenario JSON under output/meeting-video. Supported actions are
 * navigation, reviewed selectors, scrolling and pauses. No credentials, page
 * dumps, API responses, browser profile reuse, tracing or network logging.
 */
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';

const argv = process.argv.slice(2);
const value = (flag) => argv[argv.indexOf(flag) + 1];
if (!argv.includes('--scenario')) {
  console.error('Usage: node scripts/video-capture.mjs --scenario output/meeting-video/scenario.json');
  process.exit(1);
}
const file = resolve(value('--scenario'));
const spec = JSON.parse(await readFile(file, 'utf8'));
const base = new URL(spec.baseUrl);
if (!['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname)) {
  throw new Error('Capture is restricted to an isolated local demo origin.');
}
if (spec.syntheticData !== true || spec.verifiedNewUi !== true) {
  throw new Error('Scenario must confirm syntheticData=true and verifiedNewUi=true.');
}
const output = resolve(dirname(file), 'capture');
await mkdir(output, { recursive: true });
const only = argv.includes('--only') ? value('--only') : null;
if (only && !spec.clips.some((clip) => clip.name === only)) throw new Error('Unknown clip name.');
const browser = await chromium.launch({ headless: true,
  ...(spec.browserExecutable ? { executablePath: spec.browserExecutable } : {}) });
let evidence = { capturedAt: new Date().toISOString(), localOrigin: base.origin,
  syntheticData: true, verifiedNewUi: true, clips: [] };
try {
  const prior = JSON.parse(await readFile(resolve(output, 'evidence.json'), 'utf8'));
  if (prior.localOrigin === base.origin && prior.syntheticData === true) evidence = prior;
} catch { /* First capture has no previous evidence. */ }
const sharedSyntheticSessions = new Map();
try {
  for (const clip of spec.clips.filter((item) => !only || item.name === only)) {
    if (!/^[a-z0-9-]+$/.test(clip.name)) throw new Error('Clip names must use lowercase safe filenames.');
    const viewport = clip.viewport ?? { width: 1440, height: 810 };
    let storageState = clip.sessionGroup ? sharedSyntheticSessions.get(clip.sessionGroup) : undefined;
    if (clip.storageStatePath) {
      const statePath = resolve(clip.storageStatePath);
      if (!statePath.startsWith('/tmp/') && !statePath.startsWith('/private/tmp/')) {
        throw new Error('Synthetic session state must remain in the temporary directory.');
      }
      storageState = JSON.parse(await readFile(statePath, 'utf8'));
    }
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1,
      locale: 'ja-JP', timezoneId: 'Asia/Tokyo',
      ...(storageState ? { storageState } : {}),
      recordVideo: { dir: output, size: viewport } });
    const page = await context.newPage();
    page.setDefaultTimeout(20_000);
    const started = performance.now();
    const result = { name: clip.name, viewport, pageErrorCount: 0, actions: [] };
    const htmlSnapshot = async () => {
      const response = await context.request.get(base.origin + '/');
      const html = await response.text();
      const snapshot = { status: response.status(),
        sha256: createHash('sha256').update(html).digest('hex'),
        module: html.match(/<script\b[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/)?.[1] };
      if (snapshot.status !== 200 || (spec.expectedHtmlSha256 && snapshot.sha256 !== spec.expectedHtmlSha256)
        || (spec.expectedModule && snapshot.module !== spec.expectedModule)) {
        throw new Error('Fixed Cloudflare preview HTML/module does not match reviewed runtime.');
      }
      return snapshot;
    };
    const verifyAuthenticatedRuntime = async () => {
      const session = await context.request.get(base.origin + '/api/session');
      // Only status and original-material aggregates are retained, no users/cookies/response dumps.
      const response = await context.request.post(base.origin + '/api/storage', {
        headers: { Origin: base.origin, Referer: base.origin + '/' }, data: { action: 'getBooks' } });
      const books = response.status() === 200 ? await response.json() : [];
      const originals = Array.isArray(books) ? books.filter((book) =>
        /^メッドエース オリジナル(?:動詞|名詞|副詞|形容詞)（原本監査版）$/.test(book.title)) : [];
      const check = { sessionStatus: session.status(), catalogReadStatus: response.status(),
        originalBookCount: originals.length,
        originalWordCount: originals.reduce((sum, book) => sum + book.wordCount, 0),
        originalBooks: originals.map(({ title, wordCount }) => ({ title, wordCount })) };
      if (check.sessionStatus !== 200 || check.catalogReadStatus !== 200 ||
        check.originalBookCount !== 4 || check.originalWordCount !== 1530) {
        throw new Error('Authenticated local D1 runtime/original four-book aggregate check failed.');
      }
      return check;
    };
    page.on('pageerror', () => { result.pageErrorCount += 1; });
    const locator = (step) => step.testId ? page.getByTestId(step.testId)
      : step.role ? page.getByRole(step.role, { name: step.name, exact: step.exact ?? true })
        : step.selector ? page.locator(step.selector) : null;
    try {
      result.beforeHtml = await htmlSnapshot();
      for (const [index, step] of clip.actions.entries()) {
        if (step.action === 'goto') {
          const url = new URL(step.path, base);
          if (url.origin !== base.origin) throw new Error('External navigation is not allowed.');
          await page.goto(url.href, { waitUntil: 'domcontentloaded' });
        } else if (step.action === 'reload') {
          await page.reload({ waitUntil: 'domcontentloaded' });
        } else if (step.action === 'click') {
          const target = locator(step);
          if (!target) throw new Error('Click requires a reviewed locator.');
          const chosen = step.first ? target.first() : target;
          await chosen.waitFor({ state: 'visible' });
          await chosen.click();
        } else if (step.action === 'visible' || step.action === 'hidden') {
          const target = locator(step);
          if (!target) throw new Error('UI assertion requires a reviewed locator.');
          await (step.first ? target.first() : target).waitFor({ state: step.action });
        } else if (step.action === 'pause') {
          if (!(step.seconds > 0 && step.seconds <= 20)) throw new Error('Pause must be 0–20 seconds.');
          await page.waitForTimeout(step.seconds * 1000);
        } else if (step.action === 'scroll') {
          await page.mouse.wheel(0, step.pixels ?? 450);
        } else if (step.action === 'screenshot') {
          const name = basename(step.name ?? `${clip.name}-${index}.png`);
          await page.screenshot({ path: resolve(output, name), fullPage: false });
        } else if (step.action === 'verifyRuntime') {
          result.authenticatedBefore = await verifyAuthenticatedRuntime();
        } else {
          throw new Error(`Unsupported capture action: ${step.action}`);
        }
        result.actions.push({ action: step.action, marker: step.marker,
          testId: step.testId, role: step.role, name: step.name,
          atSeconds: Math.round((performance.now() - started) / 10) / 100 });
      }
      const video = page.video();
      if (result.pageErrorCount > 0) throw new Error(`${clip.name}: browser runtime error during capture.`);
      result.authenticatedAfter = await verifyAuthenticatedRuntime();
      result.afterHtml = await htmlSnapshot();
      if (result.beforeHtml.sha256 !== result.afterHtml.sha256) throw new Error('Preview build changed during recording.');
      if (clip.sessionGroup) sharedSyntheticSessions.set(clip.sessionGroup, await context.storageState());
      await context.close();
      const savedVideo = resolve(output, `${clip.name}.webm`);
      await video.saveAs(savedVideo);
      await video.delete(); // Remove only this context's duplicate hashed raw asset.
      result.video = basename(savedVideo);
      result.elapsedSeconds = Math.round((performance.now() - started) / 10) / 100;
      evidence.clips = evidence.clips.filter((item) => item.name !== clip.name);
      evidence.clips.push(result);
      await writeFile(resolve(output, 'evidence.json'), JSON.stringify(evidence, null, 2));
      console.log(`${clip.name}: ${result.video}, ${result.elapsedSeconds}s, expected UI states confirmed`);
    } catch (error) {
      await context.close();
      throw error;
    }
  }
} finally {
  await browser.close();
}
