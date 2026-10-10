import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import AuthExperienceScreen, { AuthForm, type AuthExperienceScreenProps } from '../components/auth/AuthExperienceScreen';
import PublicRolePage from '../components/public/PublicRolePage';
import StaffEntryStatus from '../components/auth/StaffEntryStatus';
import { UserRole } from '../types';

const noop = () => {};
const base: AuthExperienceScreenProps = {
  currentView: 'login', publicRole: null, authMode: 'LOGIN', authSubmitting: false,
  displayName: '', email: '', password: '', confirmPassword: '', authError: null,
  showPasswordRecovery: false, passwordRecoveryLoading: false, passwordRecoveryMessage: null,
  showAlternateAccess: false, motivationSnapshot: null, motivationLoading: false, motivationError: null,
  onChangeAuthMode: noop, onOpenAuth: noop, onCloseAuth: noop, onDisplayNameChange: noop,
  onEmailChange: noop, onPasswordChange: noop, onConfirmPasswordChange: noop, onSubmitEmailAuth: noop,
  onOpenPasswordRecovery: noop, onClosePasswordRecovery: noop, onRequestPasswordRecovery: noop,
  onDemoLogin: noop, onToggleAlternateAccess: noop, onClosePublicInfo: noop, onOpenPublicRole: noop, onClosePublicRole: noop,
};
const form = (overrides: Partial<AuthExperienceScreenProps> = {}) => renderToStaticMarkup(<AuthForm {...base} {...overrides} />);

describe('focused auth experience', () => {
  it('keeps form fields and product explanation out of the default landing page', () => {
    const html = renderToStaticMarkup(<AuthExperienceScreen {...base} />);
    expect(html).toContain('data-testid="start-first-login"');
    expect(html).toContain('data-testid="start-first-signup"');
    expect(html).toContain('登録なしで生徒画面を体験する');
    expect(html).not.toContain('auth-email-input');
    expect(html).not.toContain('auth-edge-panel');
    expect(html).not.toContain('auth-product-explanation');
  });
  it('puts accessible login inputs directly after the concise identity guidance', () => {
    const html = form();
    expect(html).toContain('id="auth-dialog-title"');
    expect(html).toContain('for="auth-email"');
    expect(html).toContain('id="auth-email"');
    expect(html).toContain('for="auth-password"');
    expect(html).toContain('autoComplete="username"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).not.toContain('auth-display-name-input');
    expect(html).not.toContain('体験用アカウント');
    expect(html).not.toContain('<details');
    expect(html).not.toContain('role-preview');
  });
  it('keeps student signup identity explicit and labels every required field', () => {
    const html = form({ authMode: 'SIGNUP' });
    expect(html).toContain('生徒用アカウントを作ります');
    expect(html).toContain('for="auth-display-name"');
    expect(html).toContain('for="auth-confirm-password"');
    expect((html.match(/required=""/g) || [])).toHaveLength(4);
    expect(html).toContain('data-auth-initial-focus="true"');
    expect(html).not.toContain('ログイン不要で先に試せます');
  });
  it('recovery is an email-only task with receipt, resend, and return actions', () => {
    const html = form({ showPasswordRecovery: true, passwordRecoveryMessage: '依頼を受け付けました' });
    expect(html).toContain('data-testid="auth-email-input"');
    expect(html).not.toContain('auth-password-input');
    expect(html).not.toContain('auth-submit');
    expect(html).toContain('data-testid="submit-password-recovery"');
    expect(html).toContain('もう一度依頼する');
    expect(html).toContain('role="status"');
    expect(html).toContain('ログインに戻る');
  });
  it.each([{ authSubmitting: true }, { passwordRecoveryLoading: true }])('keeps visible inputs and every exit/mode action locked while pending: %j', (pending) => {
    const html = form(pending);
    expect(html).toContain('aria-busy="true"');
    for (const button of html.matchAll(/<button[^>]*>/g)) expect(button[0]).toContain('disabled=""');
    for (const input of html.matchAll(/<input[^>]*>/g)) expect(input[0]).toContain('disabled=""');
    expect(html).toContain('送信中...');
  });
  it('exposes authentication errors as a focusable alert while retaining the form', () => {
    const html = form({ authError: '入力内容を確認してください', email: 'synthetic@example.invalid' });
    expect(html).toContain('role="alert"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('synthetic@example.invalid');
    expect(html).toContain('data-testid="auth-submit"');
  });
  it('provides a real login and an explicit back action from a public role page', () => {
    const html = renderToStaticMarkup(<PublicRolePage roleKey="instructor" onBack={noop} onLogin={noop} onDemoLogin={noop} />);
    expect(html).toContain('data-testid="public-role-back"');
    expect(html).toContain('data-testid="public-role-login"');
    expect(html).toContain('登録済みのアカウントでログイン');
  });
  it.each(['instructor', 'group-admin', 'service-admin'] as const)('opens %s as a login-only form even with a signup query', (publicRole) => {
    const html = renderToStaticMarkup(<AuthExperienceScreen {...base} currentView="publicRole" publicRole={publicRole} authMode="SIGNUP" authPanelMode="SIGNUP" />);
    expect(html).toContain('としてログイン');
    expect(html).toContain('data-testid="auth-email-input"');
    expect(html).toContain('autoComplete="current-password"');
    expect(html).toContain('学習の入口へ戻る');
    for (const forbidden of ['auth-display-name-input', 'auth-confirm-password-input', '新規登録', 'demo-login', '画面プレビュー', 'business-role-preview']) expect(html).not.toContain(forbidden);
  });
  it('shows a safe return action for a signed-in student without another login or role switch', () => {
    const html = renderToStaticMarkup(<StaffEntryStatus user={{ uid: 'test', role: UserRole.STUDENT, email: 'test@example.invalid', displayName: 'Test' }} entry="service-admin" onOpenHome={noop} />);
    expect(html).toContain('この入口は利用できません');
    expect(html).toContain('自分の学習へ戻る');
    expect(html).not.toContain('auth-email');
    expect(html).not.toContain('demo-login');
    expect(html).not.toContain('role-card');
  });
});
