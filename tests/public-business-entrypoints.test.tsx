import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import AuthExperienceScreen, { AuthForm, type AuthExperienceScreenProps } from '../components/auth/AuthExperienceScreen';
import { getManagedRobotsContent } from '../components/Layout';
import PublicInfoPage from '../components/PublicInfoPage';
import PublicRolePage from '../components/public/PublicRolePage';
import { getHomeViewForUser, getWorkspaceRoleLabel } from '../config/access';
import {
  PUBLIC_BUSINESS_ROLE_CONFIGS,
  getPublicBusinessRoleConfig,
  getPublicBusinessRoleDirectPath,
  getPublicBusinessRolePrimaryAction,
} from '../shared/publicBusinessRoles';
import { resolveRuntimeFlags } from '../shared/runtimeFlags';
import { createEphemeralDemoUser } from '../services/storage/mockData';
import { OrganizationRole, ORGANIZATION_ROLE_LABELS, SubscriptionPlan, UserRole } from '../types';

const noop = () => {};

const buildAuthScreen = ({
  showPasswordRecovery = false,
  passwordRecoveryMessage = null,
  ...overrides
}: {
  showPasswordRecovery?: boolean;
  passwordRecoveryMessage?: string | null;
} & Partial<AuthExperienceScreenProps> = {}) => {
  // The recovery form now lives in a portal; its content contract is checked directly.
  const Surface = showPasswordRecovery ? AuthForm : AuthExperienceScreen;
  return renderToStaticMarkup(
  <Surface
    currentView="login"
    publicRole={null}
    authMode="LOGIN"
    displayName=""
    email=""
    password=""
    confirmPassword=""
    authError={null}
    showPasswordRecovery={showPasswordRecovery}
    passwordRecoveryLoading={false}
    passwordRecoveryMessage={passwordRecoveryMessage}
    showAlternateAccess={false}
    motivationSnapshot={null}
    motivationLoading={false}
    motivationError={null}
    onChangeAuthMode={noop}
    onOpenAuth={noop}
    onCloseAuth={noop}
    onDisplayNameChange={noop}
    onEmailChange={noop}
    onPasswordChange={noop}
    onConfirmPasswordChange={noop}
    onSubmitEmailAuth={(event) => event.preventDefault()}
    onOpenPasswordRecovery={noop}
    onClosePasswordRecovery={noop}
    onRequestPasswordRecovery={noop}
    onDemoLogin={noop}
    onToggleAlternateAccess={noop}
    onClosePublicInfo={noop}
    onOpenPublicRole={noop}
    onClosePublicRole={noop}
    authSubmitting={false}
    {...overrides}
  />,
  );
};

const buildPublicInfoPage = () => renderToStaticMarkup(
  <PublicInfoPage
    onBack={noop}
    motivationSnapshot={null}
    motivationLoading={false}
    motivationError={null}
    onOpenRole={noop}
  />,
);

describe('public business role entrypoints', () => {
  it('keeps login, signup and an explicit student trial clear on the first surface', () => {
    const authMarkup = buildAuthScreen();

    expect(authMarkup).toContain('data-testid="start-first-home"');
    expect(authMarkup).toContain('今日の単語学習');
    expect(authMarkup).toContain('data-testid="demo-login-student"');
    expect(authMarkup).toContain('data-testid="start-first-login"');
    expect(authMarkup).toContain('data-testid="start-first-signup"');
    expect(authMarkup).not.toContain('data-testid="auth-email-input"');
    expect(authMarkup).not.toContain('導入ガイド');
    expect(authMarkup).not.toContain('相談フォーム');
    expect(authMarkup).not.toContain('説明と料金を見る');
  });

  it('renders a password recovery panel without revealing account existence', () => {
    const authMarkup = buildAuthScreen({
      showPasswordRecovery: true,
      passwordRecoveryMessage: '再設定リクエストを受け付けました。',
    });

    expect(authMarkup).toContain('data-testid="password-recovery-panel"');
    expect(authMarkup).toContain('アカウントの有無は画面に表示しません');
    expect(authMarkup).toContain('data-testid="password-recovery-message"');
    expect(authMarkup).toContain('再設定リクエストを受け付けました。');
  });

  it('lets the no-login student trial reach the learner home before the diagnostic', () => {
    const demoStudent = createEphemeralDemoUser(UserRole.STUDENT);

    expect(demoStudent.needsOnboarding).toBe(false);
    expect(demoStudent.englishLevel).toBeTruthy();
  });

  it('keeps staff links out of the student entry and public learner guide', () => {
    const authMarkup = buildAuthScreen();
    const publicMarkup = buildPublicInfoPage();

    for (const role of PUBLIC_BUSINESS_ROLE_CONFIGS) {
      expect(authMarkup).not.toContain(role.cardActionTestId);
      expect(authMarkup).not.toContain(role.cardTestId);
      expect(authMarkup).not.toContain(role.title);
      if (role.key === 'student') {
        expect(publicMarkup).toContain(role.cardTestId);
        expect(publicMarkup).toContain(role.cardActionTestId);
      } else {
        expect(publicMarkup).not.toContain(role.cardTestId);
        expect(publicMarkup).not.toContain(role.cardActionTestId);
      }
    }
    expect(publicMarkup).not.toContain('導入相談を送る');
    expect(publicMarkup).not.toContain('学校・教室向け導入を相談する');
    expect(publicMarkup).not.toContain('Public Guide');
    expect(publicMarkup).not.toContain('相談フォーム');
    expect(authMarkup).not.toContain('role-entry-heading');
    expect(authMarkup).not.toContain('business-role-preview-section');
    expect(publicMarkup).toContain('生徒用アカウントでログインしてください');
  });

  it.each(['LOGIN', 'SIGNUP'] as const)('keeps the %s form free of role choices', (authMode) => {
    const markup = renderToStaticMarkup(<AuthForm
      currentView="login" publicRole={null} authMode={authMode} authSubmitting={false}
      displayName="" email="" password="" confirmPassword="" authError={null}
      showPasswordRecovery={false} passwordRecoveryLoading={false} passwordRecoveryMessage={null}
      showAlternateAccess={true} motivationSnapshot={null} motivationLoading={false} motivationError={null}
      onChangeAuthMode={noop} onOpenAuth={noop} onCloseAuth={noop} onDisplayNameChange={noop}
      onEmailChange={noop} onPasswordChange={noop} onConfirmPasswordChange={noop} onSubmitEmailAuth={noop}
      onOpenPasswordRecovery={noop} onClosePasswordRecovery={noop} onRequestPasswordRecovery={noop}
      onDemoLogin={noop} onToggleAlternateAccess={noop} onClosePublicInfo={noop} onOpenPublicRole={noop}
      onClosePublicRole={noop}
    />);
    expect(markup).not.toContain('<select');
    for (const role of PUBLIC_BUSINESS_ROLE_CONFIGS) expect(markup).not.toContain(role.cardActionTestId);
    expect(markup).not.toContain('demo-login-admin');
    if (authMode === 'SIGNUP') expect(markup).toContain('生徒用アカウントを作ります');
  });

  it.each(PUBLIC_BUSINESS_ROLE_CONFIGS)('preserves the separate $key page and real account login', (role) => {
    const markup = renderToStaticMarkup(<PublicRolePage roleKey={role.key} onBack={noop} onLogin={noop} onDemoLogin={noop} />);
    expect(markup).toContain(role.pageTestId);
    expect(markup).toContain(role.title);
    expect(markup).toContain('data-testid="public-role-login"');
    expect(markup).toContain('登録済みのアカウントでログイン');
  });

  it('uses one student home for personal and affiliated accounts while keeping membership and plan', () => {
    const personal = createEphemeralDemoUser(UserRole.STUDENT);
    const affiliated = createEphemeralDemoUser(UserRole.STUDENT, OrganizationRole.STUDENT);
    const before = { ...affiliated };
    expect(getHomeViewForUser(personal)).toBe('dashboard');
    expect(getHomeViewForUser(affiliated)).toBe('dashboard');
    expect(getWorkspaceRoleLabel(personal)).toBe('個人学習');
    expect(getWorkspaceRoleLabel(affiliated)).toBe('所属生徒');
    expect(getWorkspaceRoleLabel({ ...affiliated, organizationRole: undefined })).toBe('所属生徒');
    expect(getPublicBusinessRoleConfig('student').title).toBe(ORGANIZATION_ROLE_LABELS[OrganizationRole.STUDENT]);
    expect(getPublicBusinessRoleConfig('student').demoRole).toBe(UserRole.STUDENT);
    expect(affiliated.role).toBe(UserRole.STUDENT);
    expect(affiliated.subscriptionPlan).toBe(SubscriptionPlan.TOB_PAID);
    expect(affiliated.organizationRole).toBe(OrganizationRole.STUDENT);
    expect(affiliated.organizationId).toBeTruthy();
    expect(affiliated).toEqual(before);
  });

  it('treats service admin demo separately from the other public business demos', () => {
    const localFlags = resolveRuntimeFlags({
      hostname: 'localhost',
      env: {
        enablePublicBusinessDemo: true,
        enableAdminDemo: false,
      },
    });
    const productionFlags = resolveRuntimeFlags({
      hostname: 'medace-english-app.pages.dev',
    });

    expect(getPublicBusinessRolePrimaryAction('student', localFlags)).toMatchObject({
      kind: 'demo',
      label: 'この役割を試す',
    });
    expect(getPublicBusinessRolePrimaryAction('service-admin', localFlags)).toMatchObject({
      kind: 'preview',
      label: '管理画面プレビューを見る',
    });
    expect(getPublicBusinessRolePrimaryAction('group-admin', productionFlags)).toMatchObject({
      kind: 'demo',
      label: 'この役割を試す',
    });
    expect(getPublicBusinessRolePrimaryAction('service-admin', productionFlags)).toMatchObject({
      kind: 'preview',
      label: '管理画面プレビューを見る',
    });
  });

  it('keeps a dedicated service-admin preview dataset for production-safe browsing', () => {
    const serviceAdminConfig = getPublicBusinessRoleConfig('service-admin');

    expect(serviceAdminConfig.previewPanels?.length).toBeGreaterThan(0);
    expect(serviceAdminConfig.previewPanels?.map((panel) => panel.title)).toContain('受付を運用タスクとして並べる');
  });

  it('applies noindex only for preview deployments or explicit role pages', () => {
    expect(getManagedRobotsContent({
      isPreviewDeployment: false,
      forceNoIndex: false,
    })).toBeNull();

    expect(getManagedRobotsContent({
      isPreviewDeployment: true,
      forceNoIndex: false,
    })).toBe('noindex, nofollow, noarchive');

    expect(getManagedRobotsContent({
      isPreviewDeployment: false,
      forceNoIndex: true,
    })).toBe('noindex, nofollow, noarchive');
  });
});
