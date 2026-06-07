import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import OfficialCatalogAccessPanel from '../components/OfficialCatalogAccessPanel';
import { SubscriptionPlan, UserRole, type UserProfile } from '../types';

const user: UserProfile = {
  uid: 'user-1',
  email: 'learner@example.com',
  displayName: 'Learner',
  role: UserRole.STUDENT,
  subscriptionPlan: SubscriptionPlan.TOB_PAID,
};

describe('OfficialCatalogAccessPanel copy', () => {
  it('describes catalog access as approved-material only', () => {
    const rendered = renderToStaticMarkup(
      <OfficialCatalogAccessPanel
        user={user}
        onSelectBook={() => undefined}
      />,
    );

    expect(rendered).toContain('承認済み公式コースを開く');
    expect(rendered).toContain('承認済み教材は学習・テストで使えます。確認中の教材は承認後に利用できます。');
    expect(rendered).not.toContain('そのままアクセスする');
    expect(rendered).not.toContain('そのまま開けます');
  });
});
