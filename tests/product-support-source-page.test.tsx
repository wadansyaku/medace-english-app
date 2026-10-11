import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ProductSupportSourcePage, { buildProductSupportSourcePath, readProductSupportSourceLocation } from '../components/ProductSupportSourcePage';
import { PRODUCT_SUPPORT_TARGET_VERSION, resolveProductSupportSources } from '../shared/productSupportKnowledge';

const render = (sourceId: string, role: 'GUEST' | 'STUDENT' | 'INSTRUCTOR' = 'GUEST', targetVersion = PRODUCT_SUPPORT_TARGET_VERSION) =>
  renderToStaticMarkup(<ProductSupportSourcePage sourceId={sourceId} targetVersion={targetVersion} role={role} onBack={() => undefined} />);

describe('public support source body and canonical location', () => {
  it('captures a public evidence query without accepting a claimed role or an arbitrary URL', () => {
    const location = readProductSupportSourceLocation('/public/', '?supportSource=guest-naru-records&role=ADMIN&url=https://invalid.test');
    expect(location).toEqual({ sourceId: 'guest-naru-records', targetVersion: PRODUCT_SUPPORT_TARGET_VERSION });
    expect(buildProductSupportSourcePath(location!)).toBe('/public?supportSource=guest-naru-records');
    expect(readProductSupportSourceLocation('/teacher', '?supportSource=staff-login-entry')).toBeNull();
    expect(readProductSupportSourceLocation('/public', '?other=value')).toBeNull();
  });

  it.each(['?supportSource=guest-naru-records&supportSource=staff-login-entry', '?supportSource=%3Cscript%3E', '?supportSource=https://invalid.test'])('sanitizes invalid or duplicate source IDs: %s', search => {
    const location = readProductSupportSourceLocation('/public', search)!;
    expect(location.sourceId).toBe('');
    expect(buildProductSupportSourcePath(location)).toBe('/public?supportSource=');
    expect(render(location.sourceId)).not.toContain('data-testid="product-support-source-body"');
  });

  it.each(['?supportSource=study-recall&supportVersion=old', `?supportSource=study-recall&supportVersion=${PRODUCT_SUPPORT_TARGET_VERSION}&supportVersion=${PRODUCT_SUPPORT_TARGET_VERSION}`])('rejects old or duplicate content versions: %s', search => {
    const location = readProductSupportSourceLocation('/public', search)!;
    expect(location.targetVersion).toBe('unsupported');
    const markup = render(location.sourceId, 'GUEST', location.targetVersion);
    expect(markup).toContain('この根拠を現在の案内で確認できません');
    expect(markup).not.toContain('data-testid="product-support-source-body"');
  });

  it('renders the complete canonical public body with its ID, date and specification version', () => {
    const source = resolveProductSupportSources(['guest-naru-records'], 'GUEST')![0];
    const markup = render(source.sourceId);
    expect(markup).toContain(source.title); expect(markup).toContain(source.content);
    expect(markup).toContain(source.sourceId); expect(markup).toContain(source.checkedAt); expect(markup).toContain(source.targetVersion);
    expect(markup).toContain('公開案内へ戻る');
    expect(markup).not.toContain('verifiedFrom'); expect(markup).not.toContain('components/'); expect(markup).not.toContain('href=');
  });

  it('denies staff evidence to students while retaining the existing guest and staff public guide', () => {
    const student = render('staff-login-entry', 'STUDENT');
    expect(student).not.toContain('/teacher'); expect(student).not.toContain('/school-admin'); expect(student).not.toContain('/service-admin');
    expect(student).not.toContain('data-testid="product-support-source-body"'); expect(student).toContain('自分の画面へ戻る');
    expect(render('staff-login-entry', 'GUEST')).toContain('/teacher');
    expect(render('staff-login-entry', 'INSTRUCTOR')).toContain('/teacher');
    expect(render('guest-naru-records', 'INSTRUCTOR')).not.toContain('data-testid="product-support-source-body"');
  });

  it('does not echo an unknown source or make an arbitrary link', () => {
    const markup = render('unrecognized-private-source');
    expect(markup).toContain('この根拠を現在の案内で確認できません');
    expect(markup).not.toContain('unrecognized-private-source'); expect(markup).not.toContain('href=');
  });
});
