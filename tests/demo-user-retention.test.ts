import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { deleteExpiredDemoUsers } from '../functions/_shared/auth';
import type { AppEnv, D1PreparedStatement } from '../functions/_shared/types';

const migration = fs.readFileSync(
  `${process.cwd()}/migrations/0041_password_reset_token_creator_set_null.sql`,
  'utf8',
);

describe('expired demo user retention cleanup', () => {
  it('nulls password reset token creator references and deletes users in one atomic batch', async () => {
    const prepared: Array<{ sql: string; bindings: unknown[] }> = [];
    const run = vi.fn(() => {
      throw new Error('cleanup statements must run through DB.batch');
    });
    const prepare = vi.fn((sql: string) => {
      const record = { sql, bindings: [] as unknown[] };
      prepared.push(record);
      const statement = {
        bind: (...bindings: unknown[]) => {
          record.bindings = bindings;
          return statement;
        },
        run,
      } as unknown as D1PreparedStatement;
      return statement;
    });
    const batch = vi.fn(async () => prepared.map(() => ({
      success: true,
      meta: { changes: 1 },
    })));
    const env = { DB: { prepare, batch } } as unknown as AppEnv;
    const expiredBefore = 1_725_000_000_000;

    await expect(deleteExpiredDemoUsers(env, expiredBefore)).resolves.toBeUndefined();

    expect(batch).toHaveBeenCalledOnce();
    expect(run).not.toHaveBeenCalled();
    expect(prepared).toHaveLength(2);
    expect(prepared[0].sql).toContain('UPDATE password_reset_tokens');
    expect(prepared[0].sql).toContain('SET created_by = NULL');
    expect(prepared[0].sql).toContain("email GLOB 'demo_*@medace.app'");
    expect(prepared[0].bindings).toEqual([expiredBefore]);
    expect(prepared[1].sql).toContain('DELETE FROM users');
    expect(prepared[1].sql).toContain("email GLOB 'demo_*@medace.app'");
    expect(prepared[1].bindings).toEqual([expiredBefore]);
  });

  it('propagates a failed batch instead of continuing with a partially applied cleanup', async () => {
    const statement = {
      bind: () => statement,
    } as unknown as D1PreparedStatement;
    const expected = new Error('FOREIGN KEY constraint failed');
    const env = {
      DB: {
        prepare: vi.fn(() => statement),
        batch: vi.fn(async () => {
          throw expected;
        }),
      },
    } as unknown as AppEnv;

    await expect(deleteExpiredDemoUsers(env, 123)).rejects.toBe(expected);
  });
});

describe('password reset token creator foreign key migration', () => {
  it('preserves all token columns while changing creator deletion to SET NULL', () => {
    expect(migration).toContain('PRAGMA defer_foreign_keys = ON');
    expect(migration).toContain(
      'FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL',
    );
    expect(migration).toMatch(
      /INSERT INTO password_reset_tokens_next[\s\S]+SELECT[\s\S]+FROM password_reset_tokens;/,
    );

    for (const column of [
      'id',
      'recovery_request_id',
      'user_id',
      'token_hash',
      'expires_at',
      'used_at',
      'created_by',
      'created_at',
    ]) {
      const occurrences = migration.match(new RegExp(`\\b${column}\\b`, 'g')) || [];
      expect(occurrences.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('recreates the lookup indexes, including the creator foreign-key index', () => {
    expect(migration).toContain('idx_password_reset_tokens_user_expires');
    expect(migration).toContain('idx_password_reset_tokens_recovery_request');
    expect(migration).toContain('idx_password_reset_tokens_created_by');
  });
});
