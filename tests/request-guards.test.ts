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
});
