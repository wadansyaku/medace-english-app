import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import StaffWorkspaceSelector from '../components/auth/StaffWorkspaceSelector';
import { UserRole, type UserProfile } from '../types';

const service: UserProfile = { uid: 'synthetic-owner', displayName: '合成本人', email: 'owner@example.invalid', role: UserRole.ADMIN,
  workspaceAccess: { workspace: 'service-admin', grantVersion: 7, availableWorkspaces: ['service-admin'] } };
const render = (user: UserProfile) => renderToStaticMarkup(<StaffWorkspaceSelector user={user} switching={false} onSwitch={() => {}} />);

describe('staff workspace entry remains usable with a single explicit grant', () => {
  it('offers a personal return when only service administration remains available', () => {
    const html = render(service);
    expect(html).toContain('自分の学習に戻る');
    expect(html).toContain('すべての教室');
    expect(html).not.toContain('value="instructor"');
    expect(html).not.toContain('value="group-admin"');
  });
  it('keeps ordinary student and native single-role dashboards free of staff promotion', () => {
    expect(render({ ...service, role: UserRole.STUDENT })).toBe('');
    expect(render({ ...service, workspaceAccess: { ...service.workspaceAccess!, grantVersion: 0 } })).toBe('');
  });
});
