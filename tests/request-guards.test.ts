import { describe, expect, it } from 'vitest';

import { assertSameOriginMutation } from '../functions/_shared/request-guards';

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
    }))).toThrowError('Cross-origin な mutation は許可されていません。');
  });

  it('rejects hostile fetch-site hints when origin headers are absent', () => {
    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'DELETE',
      headers: {
        'Sec-Fetch-Site': 'cross-site',
      },
    }))).toThrowError('Cross-site な mutation は許可されていません。');
  });

  it('rejects headerless production mutations', () => {
    expect(() => assertSameOriginMutation(new Request('https://steady-study.example/api/storage', {
      method: 'POST',
    }))).toThrowError('Origin / Referer / Sec-Fetch-Site のない mutation は許可されていません。');
  });
});
