import { describe, expect, it } from 'vitest';

import {
  assertInternalJobMutation,
  assertSameOriginMutation,
  INTERNAL_JOB_SECRET_HEADER,
  MUTATING_REQUEST_FAILURE_MESSAGES,
  type MutatingRequestHeaderGuard,
} from '../functions/_shared/request-guards';

describe('request guards', () => {
  it('allows same-origin mutations', () => {
    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'POST',
      headers: {
        Origin: 'https://steady-study.example',
      },
    }))).not.toThrow();
  });

  it('allows same-origin fetch metadata when origin headers are absent', () => {
    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'POST',
      headers: {
        'Sec-Fetch-Site': 'same-origin',
      },
    }))).not.toThrow();
  });

  it('allows headerless localhost mutations for local scripts', () => {
    expect(() => assertSameOriginMutation(new Request('http://localhost/api/storage', {
      method: 'POST',
    }))).not.toThrow();
  });

  it('rejects explicit cross-origin mutations', () => {
    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.example',
      },
    }))).toThrowError(MUTATING_REQUEST_FAILURE_MESSAGES.originMismatch);
  });

  it('rejects explicit cross-referer mutations', () => {
    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'POST',
      headers: {
        Referer: 'https://attacker.example/form',
      },
    }))).toThrowError(MUTATING_REQUEST_FAILURE_MESSAGES.refererMismatch);
  });

  it('rejects hostile fetch-site hints when origin headers are absent', () => {
    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'DELETE',
      headers: {
        'Sec-Fetch-Site': 'cross-site',
      },
    }))).toThrowError(MUTATING_REQUEST_FAILURE_MESSAGES.fetchSiteUntrusted);
  });

  it('rejects headerless production mutations', () => {
    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'POST',
    }))).toThrowError(MUTATING_REQUEST_FAILURE_MESSAGES.missingBrowserHeaders);
  });

  it('keeps internal job mutations on an intentional non-browser guard path', () => {
    const request = new Request('https://steady-study.example/api/internal/analytics-snapshots/run', {
      method: 'POST',
      headers: {
        [INTERNAL_JOB_SECRET_HEADER]: 'expected-secret',
      },
    });

    expect(() => assertSameOriginMutation(request)).toThrowError(
      MUTATING_REQUEST_FAILURE_MESSAGES.missingBrowserHeaders,
    );
    expect(() => assertInternalJobMutation({ INTERNAL_JOB_SECRET: 'expected-secret' }, request)).not.toThrow();
  });

  it('runs additional header guards for future CSRF token enforcement', () => {
    const futureCsrfGuard: MutatingRequestHeaderGuard = (request) => (
      request.headers.get('X-CSRF-Token') === 'known-token'
        ? null
        : 'Mutating request rejected: X-CSRF-Token ヘッダーが不正です。'
    );

    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'POST',
      headers: {
        Origin: 'https://steady-study.example',
        'X-CSRF-Token': 'known-token',
      },
    }), { additionalHeaderGuards: [futureCsrfGuard] })).not.toThrow();

    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'POST',
      headers: {
        Origin: 'https://steady-study.example',
      },
    }), { additionalHeaderGuards: [futureCsrfGuard] })).toThrowError(
      'Mutating request rejected: X-CSRF-Token ヘッダーが不正です。',
    );
  });
});
