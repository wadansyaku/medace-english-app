export const createWebDriverClient = ({
  appiumBaseUrl,
  appUrl,
  sleep,
}) => {
  const webdriver = async (method, endpoint, body) => {
    const response = await fetch(`${appiumBaseUrl}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const raw = await response.text();
    const payload = raw ? JSON.parse(raw) : {};
    if (!response.ok || payload.value?.error) {
      throw new Error(`WebDriver request failed for ${method} ${endpoint}: ${raw}`);
    }
    return payload.value;
  };

  const execute = (sessionId, script, argsList = []) => webdriver('POST', `/session/${sessionId}/execute/sync`, {
    script,
    args: argsList,
  });

  const apiRequest = (sessionId, method, pathname, body = null, headers = {}) => execute(sessionId, `
    const [requestMethod, requestPath, requestBody, requestHeaders] = arguments;
    const xhr = new XMLHttpRequest();
    xhr.open(requestMethod, requestPath, false);
    const headersToApply = requestHeaders || {};
    Object.entries(headersToApply).forEach(([key, value]) => {
      xhr.setRequestHeader(key, value);
    });
    if (requestBody !== null && !headersToApply['Content-Type']) {
      xhr.setRequestHeader('Content-Type', 'application/json');
    }
    const payload = requestBody === null
      ? null
      : (typeof requestBody === 'string' ? requestBody : JSON.stringify(requestBody));
    xhr.send(payload);

    let data = null;
    try {
      data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
    } catch (error) {
      data = xhr.responseText;
    }

    return {
      ok: xhr.status >= 200 && xhr.status < 300,
      httpStatus: xhr.status,
      data,
    };
  `, [method, pathname, body, headers]);

  const extractSessionCookie = (response) => {
    const setCookieHeader = typeof response.headers.getSetCookie === 'function'
      ? response.headers.getSetCookie()[0]
      : response.headers.get('set-cookie');
    if (!setCookieHeader) return null;
    return setCookieHeader.split(';')[0] || null;
  };

  const serverRequest = async (method, pathname, body = null, { cookie, headers = {} } = {}) => {
    const nextHeaders = {
      ...headers,
    };
    if (cookie) nextHeaders.Cookie = cookie;
    if (body !== null && !nextHeaders['Content-Type']) {
      nextHeaders['Content-Type'] = 'application/json';
    }

    const response = await fetch(new URL(pathname, appUrl), {
      method,
      headers: nextHeaders,
      body: body === null
        ? undefined
        : typeof body === 'string'
          ? body
          : JSON.stringify(body),
    });

    const raw = await response.text();
    let data = null;
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch (error) {
      data = raw;
    }

    return {
      ok: response.ok,
      httpStatus: response.status,
      data,
      sessionCookie: extractSessionCookie(response),
    };
  };

  const waitFor = async (label, predicate, timeoutMs = 20000, intervalMs = 250) => {
    const startedAt = Date.now();
    let lastValue = null;

    while (Date.now() - startedAt < timeoutMs) {
      try {
        lastValue = await predicate();
        if (lastValue) return lastValue;
      } catch (error) {
        lastValue = String(error);
      }
      await sleep(intervalMs);
    }

    throw new Error(`Timed out waiting for ${label}. Last value: ${JSON.stringify(lastValue)}`);
  };

  const isVisibleByTestId = (sessionId, testId) => execute(sessionId, `
    const target = arguments[0];
    const element = document.querySelector(\`[data-testid="\${target}"]\`);
    if (!element) return null;
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      visible: style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0,
      ariaHidden: element.getAttribute('aria-hidden'),
      text: element.textContent || '',
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
    };
  `, [testId]);

  const clickByTestId = async (sessionId, testId) => {
    const clicked = await execute(sessionId, `
      const target = arguments[0];
      const element = document.querySelector(\`[data-testid="\${target}"]\`);
      if (!element) return false;
      element.scrollIntoView({ block: 'center', inline: 'center' });
      element.click();
      return true;
    `, [testId]);

    if (!clicked) {
      throw new Error(`Could not find element with data-testid="${testId}"`);
    }
  };

  const clickFirstBySelector = async (sessionId, selector) => {
    const clicked = await execute(sessionId, `
      const target = arguments[0];
      const element = document.querySelector(target);
      if (!element) return false;
      element.scrollIntoView({ block: 'center', inline: 'center' });
      element.click();
      return true;
    `, [selector]);

    if (!clicked) {
      throw new Error(`Could not find element matching selector "${selector}"`);
    }
  };

  const clickVisibleButtonContaining = async (sessionId, label) => {
    const clicked = await execute(sessionId, `
      const target = arguments[0];
      const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
      const candidate = buttons.find((button) => {
        const text = (button.innerText || button.textContent || '').replace(/\\s+/g, ' ').trim();
        if (!text.includes(target)) return false;
        const rect = button.getBoundingClientRect();
        const style = window.getComputedStyle(button);
        return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
      });
      if (!candidate) return false;
      candidate.scrollIntoView({ block: 'center', inline: 'center' });
      candidate.click();
      return true;
    `, [label]);

    if (!clicked) {
      throw new Error(`Could not find visible button containing "${label}"`);
    }
  };

  const waitForVisibleText = async (sessionId, text, timeoutMs = 12000) => waitFor(
    `visible text "${text}"`,
    async () => {
      const result = await execute(sessionId, `
        const target = arguments[0];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
        while (walker.nextNode()) {
          const element = walker.currentNode;
          const content = (element.innerText || element.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!content.includes(target)) continue;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
            return {
              text: content,
              top: rect.top,
              bottom: rect.bottom,
            };
          }
        }
        return null;
      `, [text]);
      return result || null;
    },
    timeoutMs,
  );

  const setFileInputByTestId = async (sessionId, testId, fileName, mimeType, contents) => {
    const updated = await execute(sessionId, `
      const [target, nextFileName, nextMimeType, fileContents] = arguments;
      const input = document.querySelector(\`[data-testid="\${target}"]\`);
      if (!(input instanceof HTMLInputElement)) return false;
      const transfer = new DataTransfer();
      transfer.items.add(new File([fileContents], nextFileName, { type: nextMimeType }));
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      return input.files?.length || 0;
    `, [testId, fileName, mimeType, contents]);

    if (!updated) {
      throw new Error(`Could not set files for ${testId}`);
    }
  };

  const setTextareaByPlaceholder = async (sessionId, placeholder, value) => {
    const updated = await execute(sessionId, `
      const [targetPlaceholder, nextValue] = arguments;
      const element = Array.from(document.querySelectorAll('textarea')).find((candidate) => candidate.getAttribute('placeholder') === targetPlaceholder);
      if (!(element instanceof HTMLTextAreaElement)) return false;
      element.value = nextValue;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    `, [placeholder, value]);

    if (!updated) {
      throw new Error(`Could not set textarea with placeholder "${placeholder}"`);
    }
  };

  const loginDemoViaApi = async (sessionId, role, organizationRole) => {
    const response = await apiRequest(sessionId, 'POST', '/api/auth', {
      action: 'demo-login',
      role,
      organizationRole,
    });

    if (!response.ok) {
      throw new Error(`Demo login failed: ${JSON.stringify(response)}`);
    }
  };

  const createServerSession = async (role, organizationRole) => {
    const response = await serverRequest('POST', '/api/auth', {
      action: 'demo-login',
      role,
      organizationRole,
    });

    if (!response.ok || !response.sessionCookie) {
      throw new Error(`Server demo login failed: ${JSON.stringify(response)}`);
    }

    return {
      cookie: response.sessionCookie,
      user: response.data,
    };
  };

  const getSessionUser = async (sessionId) => {
    const response = await apiRequest(sessionId, 'GET', '/api/session');
    if (!response.ok || !response.data) {
      throw new Error(`Could not retrieve session user: ${JSON.stringify(response)}`);
    }
    return response.data;
  };

  const waitForEither = async (sessionId, testIds, timeoutMs = 12000) => waitFor(
    testIds.join(' or '),
    async () => {
      for (const testId of testIds) {
        const state = await isVisibleByTestId(sessionId, testId);
        if (state?.visible) {
          return testId;
        }
      }
      return null;
    },
    timeoutMs,
  );

  return {
    webdriver,
    execute,
    apiRequest,
    serverRequest,
    waitFor,
    isVisibleByTestId,
    clickByTestId,
    clickFirstBySelector,
    clickVisibleButtonContaining,
    waitForVisibleText,
    setFileInputByTestId,
    setTextareaByPlaceholder,
    loginDemoViaApi,
    createServerSession,
    getSessionUser,
    waitForEither,
  };
};

export default createWebDriverClient;
