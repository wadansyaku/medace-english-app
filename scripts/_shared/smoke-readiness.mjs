import { setTimeout as delay } from 'node:timers/promises';

const normalizeAssetPath = (assetPath) => {
  try {
    return new URL(assetPath, 'http://smoke.local').pathname;
  } catch {
    return assetPath.split('?')[0].split('#')[0];
  }
};

const normalizeLocalStaticPath = (staticPath) => {
  if (!staticPath || staticPath.startsWith('#') || staticPath.startsWith('data:')) {
    return null;
  }

  try {
    const url = new URL(staticPath, 'http://smoke.local');
    if (url.origin !== 'http://smoke.local') {
      return null;
    }
    return url.pathname;
  } catch {
    return staticPath.startsWith('/') ? staticPath : `/${staticPath}`;
  }
};

const parseHtmlAttributes = (tag) => {
  const attrs = {};
  for (const match of tag.matchAll(/\s([^\s=]+)=["']([^"']*)["']/g)) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  return attrs;
};

export const extractAssetPaths = (html) => {
  const assetPaths = new Set();
  for (const match of html.matchAll(/\b(?:src|href)=["']([^"']*\/assets\/[^"']+)["']/g)) {
    assetPaths.add(normalizeAssetPath(match[1]));
  }
  return [...assetPaths];
};

export const extractHtmlPwaReferences = (html) => {
  const manifestPaths = new Set();
  const iconPaths = new Set();

  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const attrs = parseHtmlAttributes(match[0]);
    const href = normalizeLocalStaticPath(attrs.href);
    if (!href) {
      continue;
    }

    const relTokens = new Set((attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean));
    if (relTokens.has('manifest')) {
      manifestPaths.add(href);
    }
    if (relTokens.has('icon') || relTokens.has('apple-touch-icon') || relTokens.has('mask-icon')) {
      iconPaths.add(href);
    }
  }

  return {
    manifestPaths: [...manifestPaths],
    iconPaths: [...iconPaths],
  };
};

export const extractManifestIconPaths = (manifest) => {
  if (!Array.isArray(manifest.icons)) {
    return [];
  }

  return manifest.icons
    .map((icon) => normalizeLocalStaticPath(icon?.src || ''))
    .filter(Boolean);
};

export const verifyAppShellMetadata = (html, locationLabel) => {
  if (!/<html\b[^>]*\blang=["']ja["']/i.test(html)) {
    throw new Error(`[smoke] ${locationLabel} is missing html lang="ja"`);
  }
  if (!/<title>\s*Steady Study \| 英単語学習スペース\s*<\/title>/i.test(html)) {
    throw new Error(`[smoke] ${locationLabel} is missing the Steady Study app title`);
  }
  if (!/name=["']apple-mobile-web-app-title["']\s+content=["']Steady Study["']/i.test(html)) {
    throw new Error(`[smoke] ${locationLabel} is missing the iOS PWA app title`);
  }
};

export const verifyPwaManifestMetadata = (manifest, locationLabel) => {
  const failures = [];
  if (manifest.name !== 'Steady Study') {
    failures.push(`name=${JSON.stringify(manifest.name)}`);
  }
  if (manifest.short_name !== 'Steady Study') {
    failures.push(`short_name=${JSON.stringify(manifest.short_name)}`);
  }
  if (manifest.display !== 'standalone') {
    failures.push(`display=${JSON.stringify(manifest.display)}`);
  }
  if (manifest.start_url !== '/') {
    failures.push(`start_url=${JSON.stringify(manifest.start_url)}`);
  }
  if (!extractManifestIconPaths(manifest).length) {
    failures.push('icons=[]');
  }

  if (failures.length) {
    throw new Error(`[smoke] ${locationLabel} has invalid PWA metadata: ${failures.join(', ')}`);
  }
};

const verifyServedAssetReferences = async (baseUrl, signal) => {
  const rootResponse = await fetch(`${baseUrl}/`, { signal, cache: 'no-store' });
  if (!rootResponse.ok) {
    throw new Error(`[smoke] / returned ${rootResponse.status}`);
  }

  const rootContentType = rootResponse.headers.get('content-type') || '';
  if (!rootContentType.includes('text/html')) {
    throw new Error(`[smoke] / returned unexpected content-type "${rootContentType || '(missing)'}"`);
  }

  const html = await rootResponse.text();
  if (!html.includes('id="root"')) {
    throw new Error('[smoke] / did not return the app shell root element');
  }
  verifyAppShellMetadata(html, '/');

  const assetPaths = extractAssetPaths(html);
  if (!assetPaths.length) {
    throw new Error('[smoke] / did not reference any /assets files');
  }

  const failures = [];
  await Promise.all(assetPaths.map(async (assetPath) => {
    const assetUrl = new URL(assetPath, baseUrl).toString();
    let response;
    try {
      response = await fetch(assetUrl, { signal, cache: 'no-store' });
      const contentType = response.headers.get('content-type') || '';
      if (!response.ok) {
        failures.push(`${assetPath} -> HTTP ${response.status}`);
        return;
      }
      if (contentType.includes('text/html')) {
        failures.push(`${assetPath} -> HTML response instead of a static asset`);
        return;
      }
      if (assetPath.endsWith('.js') && !/javascript|ecmascript/i.test(contentType)) {
        failures.push(`${assetPath} -> unexpected JS content-type "${contentType || '(missing)'}"`);
      }
      if (assetPath.endsWith('.css') && !/text\/css/i.test(contentType)) {
        failures.push(`${assetPath} -> unexpected CSS content-type "${contentType || '(missing)'}"`);
      }
    } catch (error) {
      failures.push(`${assetPath} -> ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      await response?.body?.cancel();
    }
  }));

  if (failures.length) {
    throw new Error(`[smoke] static asset readiness failed:\n${failures.sort().join('\n')}`);
  }

  await verifyServedPwaReferences(baseUrl, html, signal);
};

const verifyServedStaticFile = async (baseUrl, staticPath, expectedKind, signal) => {
  const assetUrl = new URL(staticPath, baseUrl).toString();
  const response = await fetch(assetUrl, { signal, cache: 'no-store' });
  const contentType = response.headers.get('content-type') || '';

  try {
    if (!response.ok) {
      throw new Error(`${staticPath} -> HTTP ${response.status}`);
    }
    if (contentType.includes('text/html')) {
      throw new Error(`${staticPath} -> HTML response instead of ${expectedKind}`);
    }
    if (expectedKind === 'image' && contentType && !/^image\//i.test(contentType) && !/octet-stream/i.test(contentType)) {
      throw new Error(`${staticPath} -> unexpected image content-type "${contentType}"`);
    }
    return response;
  } catch (error) {
    await response.body?.cancel();
    throw error;
  }
};

const verifyServedPwaReferences = async (baseUrl, html, signal) => {
  const { manifestPaths, iconPaths } = extractHtmlPwaReferences(html);
  if (!manifestPaths.length) {
    throw new Error('[smoke] / did not reference a web manifest');
  }

  const failures = [];
  const manifestIconPaths = [];
  await Promise.all(manifestPaths.map(async (manifestPath) => {
    try {
      const response = await verifyServedStaticFile(baseUrl, manifestPath, 'manifest', signal);
      const manifest = await response.json();
      verifyPwaManifestMetadata(manifest, manifestPath);
      manifestIconPaths.push(...extractManifestIconPaths(manifest));
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }));

  await Promise.all([...new Set([...iconPaths, ...manifestIconPaths])].map(async (iconPath) => {
    try {
      const response = await verifyServedStaticFile(baseUrl, iconPath, 'image', signal);
      await response.body?.cancel();
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }));

  if (failures.length) {
    throw new Error(`[smoke] served PWA asset readiness failed:\n${failures.sort().join('\n')}`);
  }
};

export const MAX_SMOKE_READINESS_TIMEOUT_MS = 180_000;

export const waitForSmokeServer = async (baseUrl, {
  expectedDeploymentSha = '',
  timeoutMs = MAX_SMOKE_READINESS_TIMEOUT_MS,
  pollIntervalMs = 500,
  serverSignal,
} = {}) => {
  const boundedTimeout = Number.isSafeInteger(timeoutMs) && timeoutMs > 0
    ? Math.min(timeoutMs, MAX_SMOKE_READINESS_TIMEOUT_MS)
    : MAX_SMOKE_READINESS_TIMEOUT_MS;
  const interval = Number.isSafeInteger(pollIntervalMs) && pollIntervalMs > 0 ? pollIntervalMs : 500;
  const deadline = Date.now() + boundedTimeout;
  const timeoutSignal = AbortSignal.timeout(boundedTimeout);
  const readinessSignal = serverSignal
    ? AbortSignal.any([serverSignal, timeoutSignal])
    : timeoutSignal;
  let lastError = '';

  while (Date.now() < deadline) {
    serverSignal?.throwIfAborted();
    try {
      const response = await fetch(`${baseUrl}/api/session`, { signal: readinessSignal, cache: 'no-store' });
      const status = response.status;
      const servedSha = response.headers.get('x-deployment-sha');
      await response.body?.cancel();
      if (status !== 200 && status !== 204) {
        throw new Error(`/api/session returned ${status}`);
      }
      if (expectedDeploymentSha && servedSha !== expectedDeploymentSha) {
        throw new Error('/api/session deployment SHA does not match the expected deployment');
      }
      await verifyServedAssetReferences(baseUrl, readinessSignal);
      readinessSignal.throwIfAborted();
      return;
    } catch (error) {
      serverSignal?.throwIfAborted();
      if (!timeoutSignal.aborted || !lastError) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    }
    if (timeoutSignal.aborted) break;
    try {
      await delay(interval, undefined, { signal: readinessSignal });
    } catch {
      serverSignal?.throwIfAborted();
      break;
    }
  }

  throw new Error(`Timed out waiting for smoke server at ${baseUrl} after ${boundedTimeout}ms${lastError ? `; last error: ${lastError}` : ''}`);
};
