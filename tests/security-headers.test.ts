import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const headersText = readFileSync('public/_headers', 'utf8');

const readHeader = (name: string): string => {
  const match = headersText.match(new RegExp(`^\\s*${name}:\\s*(.+)$`, 'im'));
  if (!match) throw new Error(`Missing header: ${name}`);
  return match[1].trim();
};

const readCspDirectives = (): Map<string, string[]> => {
  const csp = readHeader('Content-Security-Policy');
  return new Map(
    csp
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [name, ...sources] = entry.split(/\s+/);
        return [name, sources];
      }),
  );
};

describe('Cloudflare Pages security headers', () => {
  it('sets conservative baseline browser security headers', () => {
    expect(headersText).toMatch(/^\/\*/);
    expect(readHeader('X-Content-Type-Options')).toBe('nosniff');
    expect(readHeader('X-Frame-Options')).toBe('DENY');
    expect(readHeader('Referrer-Policy')).toBe('strict-origin-when-cross-origin');
    expect(readHeader('Permissions-Policy')).toBe('camera=(), geolocation=(), microphone=()');
  });

  it('keeps the CSP compatible with Google Fonts and AdSense', () => {
    const directives = readCspDirectives();

    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('base-uri')).toEqual(["'self'"]);
    expect(directives.get('object-src')).toEqual(["'none'"]);
    expect(directives.get('frame-ancestors')).toEqual(["'none'"]);
    expect(directives.get('form-action')).toEqual(["'self'"]);

    expect(directives.get('script-src')).toEqual(expect.arrayContaining([
      "'self'",
      'https://*.googlesyndication.com',
      'https://*.doubleclick.net',
      'https://*.googleadservices.com',
      'https://*.google.com',
      'https://*.gstatic.com',
      'https://*.googletagservices.com',
      'https://ep1.adtrafficquality.google',
      'https://ep2.adtrafficquality.google',
    ]));
    expect(directives.get('script-src')).not.toContain("'unsafe-inline'");
    expect(directives.get('script-src')).not.toContain("'unsafe-eval'");

    expect(directives.get('style-src')).toEqual(expect.arrayContaining([
      "'self'",
      "'unsafe-inline'",
      'https://fonts.googleapis.com',
    ]));
    expect(directives.get('font-src')).toEqual(expect.arrayContaining([
      "'self'",
      'https://fonts.gstatic.com',
      'data:',
    ]));
    expect(directives.get('img-src')).toEqual(expect.arrayContaining(["'self'", 'data:', 'blob:', 'https:']));
    expect(directives.get('connect-src')).toEqual(["'self'", 'https:']);
    expect(directives.get('frame-src')).toEqual(expect.arrayContaining([
      "'self'",
      'https://*.googlesyndication.com',
      'https://*.doubleclick.net',
      'https://*.google.com',
    ]));
  });

  it('does not add high-blast-radius isolation or long-lived transport headers', () => {
    expect(headersText).not.toMatch(/^\s*Strict-Transport-Security:/im);
    expect(headersText).not.toMatch(/^\s*Cross-Origin-Embedder-Policy:/im);
    expect(headersText).not.toMatch(/^\s*Cross-Origin-Opener-Policy:/im);
    expect(readHeader('Content-Security-Policy')).not.toContain('upgrade-insecure-requests');
  });
});
