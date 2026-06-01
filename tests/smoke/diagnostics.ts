import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

type SmokeDiagnostics = {
  events: string[];
  label: string;
  page: Page;
};

const diagnosticsByTest = new WeakMap<TestInfo, SmokeDiagnostics[]>();
const attachedPages = new WeakSet<Page>();

const slugLabel = (label: string) => label.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'page';

const shouldIgnoreResponse = (url: string, status: number) => (
  status < 400
    || url.endsWith('/favicon.ico')
    || url.includes('/__scheduled')
);

export const attachSmokeDiagnostics = (page: Page, testInfo: TestInfo, label = 'page') => {
  if (attachedPages.has(page)) {
    return;
  }
  attachedPages.add(page);

  const diagnostics = diagnosticsByTest.get(testInfo) || [];
  const entry: SmokeDiagnostics = {
    events: [],
    label,
    page,
  };
  diagnostics.push(entry);
  diagnosticsByTest.set(testInfo, diagnostics);

  page.on('console', (message) => {
    const type = message.type();
    if (type !== 'error' && type !== 'warning') return;
    entry.events.push(`[${label}] console.${type}: ${message.text()}`);
  });

  page.on('pageerror', (error) => {
    entry.events.push(`[${label}] pageerror: ${error.message}${error.stack ? `\n${error.stack}` : ''}`);
  });

  page.on('requestfailed', (request) => {
    entry.events.push(`[${label}] requestfailed: ${request.method()} ${request.url()} ${request.failure()?.errorText || ''}`.trim());
  });

  page.on('response', (response) => {
    const status = response.status();
    const url = response.url();
    if (shouldIgnoreResponse(url, status)) return;
    entry.events.push(`[${label}] response.${status}: ${url}`);
  });
};

const appendPageState = async (diagnostics: SmokeDiagnostics) => {
  try {
    const state = await diagnostics.page.evaluate(() => ({
      bodyText: document.body?.innerText?.slice(0, 1200) || '',
      rootChildren: document.querySelector('#root')?.childElementCount ?? null,
      title: document.title,
      url: window.location.href,
    }));
    diagnostics.events.push(
      `[${diagnostics.label}] page-state: ${JSON.stringify(state)}`,
    );
  } catch (error) {
    diagnostics.events.push(
      `[${diagnostics.label}] page-state unavailable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

export const test = base.extend({
  page: async ({ page }, use, testInfo) => {
    attachSmokeDiagnostics(page, testInfo);
    await use(page);
  },
});

test.afterEach(async ({}, testInfo) => {
  const diagnostics = diagnosticsByTest.get(testInfo) || [];
  if (!diagnostics.length) return;

  const shouldAttach = process.env['PLAYWRIGHT_ATTACH_SMOKE_DIAGNOSTICS'] === '1'
    || testInfo.errors.length > 0
    || testInfo.status !== testInfo.expectedStatus;
  if (!shouldAttach) return;

  for (const entry of diagnostics) {
    await appendPageState(entry);
    if (!entry.events.length) continue;
    await testInfo.attach(`smoke-diagnostics-${slugLabel(entry.label)}.txt`, {
      body: entry.events.slice(-120).join('\n'),
      contentType: 'text/plain',
    });
  }
});

export { expect };
