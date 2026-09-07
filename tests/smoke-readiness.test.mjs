import { createServer } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';

import { waitForSmokeServer } from '../scripts/_shared/smoke-readiness.mjs';

const expectedDeploymentSha = 'a'.repeat(40);
const html = `<!doctype html><html lang="ja"><head>
  <title>Steady Study | 英単語学習スペース</title>
  <meta name="apple-mobile-web-app-title" content="Steady Study">
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icon.png">
  <link rel="stylesheet" href="/assets/app.css">
  <script type="module" src="/assets/app.js"></script>
</head><body><div id="root"></div></body></html>`;
const manifest = {
  name: 'Steady Study', short_name: 'Steady Study', display: 'standalone', start_url: '/',
  icons: [{ src: '/icon.png' }],
};
const servers = [];

const startFixture = async ({ transient = false, failure } = {}) => {
  const requests = { session: 0, root: 0, asset: 0, manifest: 0, icon: 0 };
  const server = createServer((request, response) => {
    const send = (contentType, body, status = 200) => {
      response.writeHead(status, { 'content-type': contentType });
      response.end(body);
    };
    if (request.url === '/api/session') {
      requests.session += 1;
      if (failure === 'hanging session') return;
      const oldSha = failure === 'old deployment' || (transient && requests.session === 1);
      response.writeHead(204, { 'x-deployment-sha': oldSha ? 'b'.repeat(40) : expectedDeploymentSha });
      response.end();
    } else if (request.url === '/') {
      requests.root += 1;
      send('text/html', html);
    } else if (request.url?.startsWith('/assets/')) {
      requests.asset += 1;
      const missing = failure === 'missing asset' || (transient && requests.root === 1);
      send(missing ? 'text/html' : request.url.endsWith('.js') ? 'text/javascript' : 'text/css', missing ? html : '');
    } else if (request.url === '/manifest.webmanifest') {
      requests.manifest += 1;
      const stale = failure === 'stale manifest' || (transient && requests.root === 2);
      send('application/manifest+json', JSON.stringify(stale ? { ...manifest, name: 'Previous app' } : manifest));
    } else if (request.url === '/icon.png') {
      requests.icon += 1;
      const missing = transient && requests.root === 3;
      send(missing ? 'text/html' : 'image/png', missing ? html : 'fixture image');
    } else {
      send('text/plain', 'Not found', 404);
    }
  });
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { requests, url: `http://127.0.0.1:${server.address().port}` };
};

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => {
    server.close(resolve);
    server.closeAllConnections();
  })));
});

describe('deployed smoke readiness over HTTP', () => {
  it('waits through an old SHA, stale HTML assets, manifest, and icon until all match', async () => {
    const { url, requests } = await startFixture({ transient: true });

    await waitForSmokeServer(url, { expectedDeploymentSha, timeoutMs: 2_000, pollIntervalMs: 5 });

    expect(requests.session).toBe(5);
    expect(requests.root).toBe(4);
    expect(requests.manifest).toBe(3);
    expect(requests.icon).toBeGreaterThanOrEqual(2);
  });

  it.each([
    { failure: 'old deployment', message: 'deployment SHA does not match' },
    { failure: 'missing asset', message: 'HTML response instead of a static asset' },
    { failure: 'stale manifest', message: 'invalid PWA metadata' },
  ])('fails within the deadline when $failure never recovers', async ({ failure, message }) => {
    const { url, requests } = await startFixture({ failure });
    const startedAt = Date.now();

    await expect(waitForSmokeServer(url, { expectedDeploymentSha, timeoutMs: 150, pollIntervalMs: 5 }))
      .rejects.toThrow(message);

    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(requests.session).toBeGreaterThan(1);
    if (failure === 'old deployment') expect(requests.root).toBe(0);
  });

  it('bounds a session request that never sends response headers', async () => {
    const { url, requests } = await startFixture({ failure: 'hanging session' });
    const startedAt = Date.now();

    await expect(waitForSmokeServer(url, { expectedDeploymentSha, timeoutMs: 100, pollIntervalMs: 5 }))
      .rejects.toThrow('Timed out waiting for smoke server');

    expect(Date.now() - startedAt).toBeLessThan(1_500);
    expect(requests.session).toBe(1);
    expect(requests.root).toBe(0);
  });

  it('stops immediately with the local server failure instead of retrying it', async () => {
    const { url } = await startFixture({ failure: 'hanging session' });
    const controller = new AbortController();
    const failure = new Error('fixture server exited');
    const pending = waitForSmokeServer(url, { timeoutMs: 2_000, serverSignal: controller.signal });
    const assertion = expect(pending).rejects.toBe(failure);
    controller.abort(failure);
    await assertion;
  });
});
