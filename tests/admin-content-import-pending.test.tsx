import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BookCatalogSource } from '../types';
import type { CatalogImportResult } from '../contracts/storage';

const harness = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  mounted: false,
  cleanups: [] as (() => void)[],
}));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return {
    ...actual,
    useState: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = initial;
      return [
        harness.slots[index],
        (next: unknown) => {
          harness.slots[index] = typeof next === 'function' ? next(harness.slots[index]) : next;
        },
      ];
    },
    useRef: (initial: unknown) => {
      const index = harness.cursor++;
      if (!(index in harness.slots)) harness.slots[index] = { current: initial };
      return harness.slots[index];
    },
    useMemo: (factory: () => unknown) => factory(),
    useEffect: (callback: () => void | (() => void)) => {
      if (!harness.mounted) harness.effects.push(callback);
    },
  };
});
const service = vi.hoisted(() => ({
  import: vi.fn(),
  getBooks: vi.fn(),
  refresh: vi.fn(),
  enabled: true,
}));
vi.mock('../services/dashboard', () => ({
  dashboardService: { batchImportWords: service.import, getBooks: service.getBooks },
}));
vi.mock('../config/runtime', () => ({
  default: () => ({ enableDestructiveAdminActions: service.enabled }),
}));
vi.mock('../hooks/useAdminDashboardSnapshot', () => ({
  useAdminDashboardSnapshot: () => ({
    snapshot: null,
    loading: false,
    error: null,
    refresh: service.refresh,
  }),
}));
vi.mock('../hooks/useAdminCommercialOps', () => ({
  useAdminCommercialOps: () => ({
    requests: [],
    announcements: [],
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));
vi.mock('../components/admin/AdminDashboardView', () => ({ default: () => null }));
vi.mock('../components/admin/AdminCommercialOpsView', () => ({ default: () => null }));
import AdminPanel from '../components/AdminPanel';
import AdminContentImportView from '../components/admin/AdminContentImportView';

type Element = React.ReactElement<Record<string, any>>;
const find = (node: React.ReactNode, predicate: (element: Element) => boolean): Element | null => {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = find(child, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!React.isValidElement(node)) return null;
  const element = node as Element;
  return predicate(element) ? element : find(element.props.children, predicate);
};
let tree: React.ReactNode;
const render = () => {
  harness.cursor = 0;
  tree = AdminPanel({});
  if (!harness.mounted) {
    harness.mounted = true;
    harness.cleanups = harness.effects
      .map((effect) => effect())
      .filter((cleanup): cleanup is () => void => typeof cleanup === 'function');
  }
  return tree;
};
const content = () => {
  render();
  return find(tree, (element) => element.type === AdminContentImportView)!.props;
};
const tab = (label: string) =>
  find(tree, (element) => element.type === 'button' && element.props.children === label)!;
const openContent = () => {
  render();
  tab('教材運用').props.onClick();
  return content();
};
const prepareCsv = () => {
  const props = openContent();
  props.onCatalogSourceChange(BookCatalogSource.STEADY_STUDY_ORIGINAL);
  chooseFile(props, { name: 'A.csv', text: async () => 'A,1,synthetic,合成,Synthetic example.,合成の例文。' });
  return content();
};
const result: CatalogImportResult = {
  importedBookCount: 1,
  importedWordCount: 1,
  skippedRowCount: 0,
  warnings: [],
} as CatalogImportResult;
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};
const chooseFile = (
  props: Record<string, any>,
  file: { name: string; text: () => Promise<string> },
) => props.onFileChange({ target: { files: [file] } });

beforeEach(() => {
  harness.slots = [];
  harness.cursor = 0;
  harness.effects = [];
  harness.mounted = false;
  harness.cleanups = [];
  vi.resetAllMocks();
  service.enabled = true;
  service.import.mockResolvedValue(result);
  service.getBooks.mockResolvedValue([]);
  service.refresh.mockResolvedValue(undefined);
});

describe('administrator prepared content import', () => {
  it('locks the captured file and source while saving A and accepts B after completion', async () => {
    const save = deferred<CatalogImportResult>();
    service.import.mockReturnValue(save.promise);
    const props = prepareCsv();
    const request = props.onCsvUpload();
    await Promise.resolve();
    const pending = content();
    expect(pending.uploading).toBe(true);
    chooseFile(pending, { name: 'B.csv', text: async () => 'B,1,new,新規' });
    pending.onCatalogSourceChange(BookCatalogSource.LICENSED_PARTNER);
    tab('分析ダッシュボード').props.onClick();
    const retained = content();
    expect(retained.file.name).toBe('A.csv');
    expect(retained.catalogSource).toBe(BookCatalogSource.STEADY_STUDY_ORIGINAL);
    expect(service.import.mock.calls[0][0]).toMatchObject({
      defaultBookName: 'A', source: { kind: 'csv', fileName: 'A.csv' },
      options: { catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL },
    });
    save.resolve(result);
    await request;
    const finished = content();
    expect(finished.uploading).toBe(false);
    chooseFile(finished, { name: 'B.csv', text: async () => 'B,1,new,新規' });
    expect(content().file.name).toBe('B.csv');
  });

  it('starts one import for duplicate submissions and retains the pending file', async () => {
    const reading = deferred<string>();
    const props = prepareCsv();
    chooseFile(props, { name: 'A.csv', text: () => reading.promise });
    const ready = content();
    const first = ready.onCsvUpload();
    const duplicate = ready.onCsvUpload();
    chooseFile(content(), { name: 'B.csv', text: async () => 'B,1,new,新規' });
    expect(content().file.name).toBe('A.csv');
    reading.resolve('A,1,synthetic,合成');
    await Promise.all([first, duplicate]);
    expect(service.import).toHaveBeenCalledTimes(1);
  });

  it('retains the selected file and permits correction after save failure', async () => {
    const save = deferred<CatalogImportResult>();
    service.import.mockReturnValue(save.promise);
    const request = prepareCsv().onCsvUpload();
    await Promise.resolve();
    save.reject(new Error('Synthetic offline failure'));
    await request;
    const failed = content();
    expect(failed.uploading).toBe(false);
    expect(failed.file.name).toBe('A.csv');
    expect(failed.log.at(-1)).toContain('Synthetic offline failure');
    chooseFile(failed, { name: 'Corrected.csv', text: async () => 'B,1,new,新規' });
    expect(content().file.name).toBe('Corrected.csv');
  });

  it('does not begin saving after leaving during file reading', async () => {
    const reading = deferred<string>();
    const props = prepareCsv();
    chooseFile(props, { name: 'A.csv', text: () => reading.promise });
    const request = content().onCsvUpload();
    harness.cleanups.forEach((cleanup) => cleanup());
    reading.resolve('A,1,synthetic,合成');
    await request;
    expect(service.import).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])('ignores delayed %s after unmount', async (outcome) => {
    const save = deferred<CatalogImportResult>();
    service.import.mockReturnValue(save.promise);
    const request = prepareCsv().onCsvUpload();
    await Promise.resolve();
    const previous = content();
    harness.cleanups.forEach((cleanup) => cleanup());
    if (outcome === 'success') save.resolve(result);
    else save.reject(new Error('Synthetic late failure'));
    await request;
    expect(content().file).toBe(previous.file);
    expect(content().log).toEqual(previous.log);
    expect(service.refresh).not.toHaveBeenCalled();
  });

  it('ignores a late progress callback after completion', async () => {
    await prepareCsv().onCsvUpload();
    const progressCallback = service.import.mock.calls[0][1];
    chooseFile(content(), { name: 'B.csv', text: async () => '' });
    progressCallback(100);
    expect(content().progress).toBe(0);
  });

  it('keeps the disabled runtime write gate even through captured handlers', async () => {
    service.enabled = false;
    const props = prepareCsv();
    await props.onCsvUpload();
    expect(service.import).not.toHaveBeenCalled();
    expect(content().file).toBeNull();
  });

  it('offers CSV only with a keyboard button and locks it while pending', () => {
    const props = prepareCsv();
    harness.cursor = 0;
    const markup = renderToStaticMarkup(<AdminContentImportView {...(props as any)} />);
    expect(markup).toMatch(/<button[^>]*aria-controls="csv-upload"/);
    expect(markup).toContain('校正済み教材のCSV取込');
    expect(markup).toContain('取込は権利や公開の承認を意味しません');
    expect(markup).not.toContain('AI生成');
    expect(props.onAiImport).toBeUndefined();
    harness.cursor = 0;
    const pending = renderToStaticMarkup(<AdminContentImportView {...(props as any)} uploading={true} />);
    expect(pending).toMatch(/<input[^>]*disabled/);
    expect(pending).toContain('aria-busy="true"');
  });

  it('distinguishes a failed catalog read from an empty catalog', async () => {
    service.getBooks.mockRejectedValueOnce(new Error('Synthetic catalog unavailable'));
    openContent();
    await Promise.resolve();
    await Promise.resolve();
    expect(content().officialBooksError).toContain('取得できません');
    expect(content().loadingOfficialBooks).toBe(false);
    harness.cursor = 0;
    const markup = renderToStaticMarkup(<AdminContentImportView {...(content() as any)} />);
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('教材一覧を再取得');
    expect(markup).not.toContain('公式教材はまだありません');
    await content().onRetryOfficialBooks();
    expect(content().officialBooksError).toBeNull();
  });
});
