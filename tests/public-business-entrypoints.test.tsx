import React from 'react';
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

import AuthExperienceScreen from '../components/auth/AuthExperienceScreen';
import { getManagedRobotsContent } from '../components/Layout';
import PublicInfoPage from '../components/PublicInfoPage';
import {
  PUBLIC_BUSINESS_ROLE_CONFIGS,
  getPublicBusinessRoleConfig,
  getPublicBusinessRolePrimaryAction,
} from '../shared/publicBusinessRoles';
import { resolveRuntimeFlags } from '../shared/runtimeFlags';

const noop = () => {};

const buildAuthScreen = () => renderToStaticMarkup(
  <AuthExperienceScreen
    currentView="login"
    publicRole={null}
    authMode="LOGIN"
    displayName=""
    email=""
    password=""
    confirmPassword=""
    authError={null}
    showAlternateAccess={false}
    motivationSnapshot={null}
    motivationLoading={false}
    motivationError={null}
    onChangeAuthMode={noop}
    onDisplayNameChange={noop}
    onEmailChange={noop}
    onPasswordChange={noop}
    onConfirmPasswordChange={noop}
    onSubmitEmailAuth={(event) => event.preventDefault()}
    onDemoLogin={noop}
    onToggleAlternateAccess={noop}
    onOpenPublicInfo={noop}
    onClosePublicInfo={noop}
    onOpenPublicRole={noop}
    onClosePublicRole={noop}
  />,
);

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
  it('renders every role card on both login and public guide surfaces', () => {
    const authMarkup = buildAuthScreen();
    const publicMarkup = buildPublicInfoPage();

    for (const role of PUBLIC_BUSINESS_ROLE_CONFIGS) {
      expect(authMarkup).toContain(role.cardTestId);
      expect(authMarkup).toContain(role.cardActionTestId);
      expect(publicMarkup).toContain(role.cardTestId);
      expect(publicMarkup).toContain(role.cardActionTestId);
    }
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
    expect(serviceAdminConfig.previewPanels?.map((panel) => panel.title)).toContain('導入相談を運用タスクとして並べる');
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
