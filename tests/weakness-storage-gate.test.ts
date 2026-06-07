import { describe, expect, it, vi } from 'vitest';

const {
  readAllMock,
  readFirstMock,
} = vi.hoisted(() => ({
  readAllMock: vi.fn(),
  readFirstMock: vi.fn(),
}));

vi.mock('../functions/_shared/storage-support', async () => {
  const actual = await vi.importActual<typeof import('../functions/_shared/storage-support')>('../functions/_shared/storage-support');
  return {
    ...actual,
    readAll: readAllMock,
    readFirst: readFirstMock,
  };
});

import { rebuildWeaknessSignalsForUser } from '../functions/_shared/weakness-actions';
import { EnglishLevel, UserGrade } from '../types';

describe('weakness storage quality gate', () => {
  it('rebuilds weakness signals from learner-selectable materials only', async () => {
    readAllMock.mockReset();
    readFirstMock.mockReset();
    readAllMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const run = vi.fn();
    const bind = vi.fn(() => ({ run }));
    const prepare = vi.fn(() => ({ bind }));
    const batch = vi.fn();
    const env = { DB: { prepare, batch } } as any;

    await rebuildWeaknessSignalsForUser(env, 'student-1', {
      grade: UserGrade.SHS1,
      english_level: EnglishLevel.B1,
    } as any);

    const eventSql = readAllMock.mock.calls[0]?.[1] as string;
    const historySql = readAllMock.mock.calls[1]?.[1] as string;
    expect(eventSql).toContain('JOIN books b ON b.id = e.book_id');
    expect(eventSql).toContain('LEFT JOIN material_source_ledger m ON m.book_id = b.id');
    expect(eventSql).toContain("m.rights_status = 'approved'");
    expect(historySql).toContain('JOIN books b ON b.id = h.book_id');
    expect(historySql).toContain('LEFT JOIN material_source_ledger m ON m.book_id = b.id');
    expect(historySql).toContain("m.review_status = 'approved'");
    expect(readAllMock.mock.calls[0]).toContain('student-1');
    expect(readAllMock.mock.calls[1]).toContain('student-1');
    expect(prepare).toHaveBeenCalledWith('DELETE FROM student_weakness_signals WHERE user_id = ?');
    expect(bind).toHaveBeenCalledWith('student-1');
    expect(run).toHaveBeenCalled();
  });
});
