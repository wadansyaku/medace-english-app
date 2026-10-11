import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  PRODUCT_SUPPORT_KNOWLEDGE, PRODUCT_SUPPORT_SOURCE_LINKS_READY, PRODUCT_SUPPORT_TARGET_VERSION,
  PRODUCT_SUPPORT_VERIFIED_SOURCE_SHA, getProductSupportKnowledge, getProductSupportSourceURL, resolveProductSupportSources,
} from '../shared/productSupportKnowledge';

describe('public product support knowledge provenance', () => {
  it('provides stable IDs, explicit content versions, public route proposals, and verified code locations', () => {
    expect(new Set(PRODUCT_SUPPORT_KNOWLEDGE.map(source => source.sourceId)).size).toBe(PRODUCT_SUPPORT_KNOWLEDGE.length);
    expect(PRODUCT_SUPPORT_VERIFIED_SOURCE_SHA).toMatch(/^[a-f0-9]{40}$/);
    expect(PRODUCT_SUPPORT_SOURCE_LINKS_READY).toBe(false);
    for (const source of PRODUCT_SUPPORT_KNOWLEDGE) {
      expect(source.targetVersion).toBe(PRODUCT_SUPPORT_TARGET_VERSION);
      expect(new Date(source.checkedAt).toISOString().slice(0, 10)).toBe(source.checkedAt);
      expect(source.roles.length).toBeGreaterThan(0);
      const url = new URL(source.sourceURL);
      expect(url.origin).toBe('https://medace-english-app.pages.dev');
      expect(url.pathname).toBe('/public');
      expect(url.searchParams.get('supportSource')).toBe(source.sourceId);
      expect(source.sourceURL).toBe(getProductSupportSourceURL(source.sourceId));
      expect(source.verifiedFrom.length).toBeGreaterThan(0);
      for (const location of source.verifiedFrom) expect(existsSync(new URL(`../${location.split(':')[0]}`, import.meta.url))).toBe(true);
      expect(source.content).not.toMatch(/@[a-z0-9.-]+\.[a-z]{2,}|sk-[a-z0-9]{12,}|API_TOKEN|database_id|client_secret|runbook/i);
    }
  });

  it('keeps Naru import and guest wordbooks separate, including the seven-day and no-XP conditions', () => {
    const records = PRODUCT_SUPPORT_KNOWLEDGE.find(source => source.sourceId === 'guest-naru-records')!;
    const books = PRODUCT_SUPPORT_KNOWLEDGE.find(source => source.sourceId === 'guest-local-wordbooks')!;
    expect(records.content).toContain('7日間');
    expect(records.content).toContain('自動保存しません');
    expect(records.content).toContain('このアカウントに学習記録を保存');
    expect(records.content).toContain('XPは加算しません');
    expect(books.content).toContain('クラウドへは引き継がれません');
    expect(books.content).toContain('1冊200語、合計10冊');
    const notice = readFileSync(new URL('../components/guest/GuestLearningImportNotice.tsx', import.meta.url), 'utf8');
    expect(notice).toContain('このアカウントに学習記録を保存');
    expect(notice).toContain('XPは加算しません');
  });

  it('does not confuse guest CSV limits with signed-in My limits or guarantee every plan has My creation', () => {
    const guest = PRODUCT_SUPPORT_KNOWLEDGE.find(source => source.sourceId === 'guest-local-wordbooks')!;
    const my = PRODUCT_SUPPORT_KNOWLEDGE.find(source => source.sourceId === 'my-wordbook-create')!;
    expect(guest.content).toContain('256KB');
    expect(my.content).toContain('1MB');
    expect(my.content).toContain('500語');
    expect(my.content).toContain('CSVの用意は必須ではありません');
    expect(my.content).toContain('作成が使えるプラン');
  });

  it('resolves only canonical, deduplicated, role- and version-scoped references', () => {
    expect(resolveProductSupportSources(['my-wordbook-create'], 'STUDENT')?.[0]).toBe(PRODUCT_SUPPORT_KNOWLEDGE.find(source => source.sourceId === 'my-wordbook-create'));
    expect(resolveProductSupportSources(['my-wordbook-create'], 'INSTRUCTOR')).toBeNull();
    expect(resolveProductSupportSources(['staff-login-entry'], 'STUDENT')).toBeNull();
    expect(resolveProductSupportSources(['staff-login-entry'], 'INSTRUCTOR')?.[0].sourceId).toBe('staff-login-entry');
    expect(resolveProductSupportSources(['my-wordbook-create'], 'STUDENT', 'old-version')).toBeNull();
    expect(resolveProductSupportSources(['word-pronunciation', 'word-pronunciation'], 'GUEST')).toBeNull();
    expect(resolveProductSupportSources(['https://attacker.invalid/help'], 'GUEST')).toBeNull();
    expect(getProductSupportKnowledge('STUDENT', 'future-version')).toEqual([]);
    expect(Object.isFrozen(PRODUCT_SUPPORT_KNOWLEDGE)).toBe(true);
    expect(Object.isFrozen(PRODUCT_SUPPORT_KNOWLEDGE[0].roles)).toBe(true);
  });
});
