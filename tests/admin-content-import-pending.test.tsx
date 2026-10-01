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
  extract: vi.fn(),
  import: vi.fn(),
  getBooks: vi.fn(),
  refresh: vi.fn(),
  enabled: true,
}));
vi.mock('../services/dashboard', () => ({
  dashboardService: { batchImportWords: service.import, getBooks: service.getBooks },
}));
vi.mock('../services/gemini', () => ({
  extractVocabularyFromText: service.extract,
  isAiUnavailableError: () => false,
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
const prepareAi = () => {
  const props = openContent();
  props.onContentTitleChange('Official A');
  props.onRawTextChange('Synthetic source A.');
  props.onCatalogSourceChange(BookCatalogSource.STEADY_STUDY_ORIGINAL);
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
const extracted = {
  words: [{ word: 'synthetic', definition: '合成テスト用' }],
  contextSummary: 'Synthetic fixture only.',
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
  service.extract.mockResolvedValue(extracted);
  service.import.mockResolvedValue(result);
  service.getBooks.mockResolvedValue([]);
  service.refresh.mockResolvedValue(undefined);
});

describe('admin content pending operations', () => {
  it('locks draft and navigation while saving captured A and accepts new B only after completion', async () => {
    const save = deferred<CatalogImportResult>();
    service.import.mockReturnValue(save.promise);
    const props = prepareAi();
    const request = props.onAiImport();
    await Promise.resolve();
    const pending = content();
    expect(pending.uploading).toBe(true);
    pending.onContentTitleChange('New B');
    pending.onRawTextChange('New B text');
    pending.onCatalogSourceChange(BookCatalogSource.LICENSED_PARTNER);
    pending.onModeChange('csv');
    tab('分析ダッシュボード').props.onClick();
    const retained = content();
    expect(retained.contentTitle).toBe('Official A');
    expect(retained.rawText).toBe('Synthetic source A.');
    expect(retained.mode).toBe('ai');
    expect(service.import.mock.calls[0][0]).toMatchObject({
      defaultBookName: 'Official A',
      options: { catalogSource: BookCatalogSource.STEADY_STUDY_ORIGINAL },
    });
    save.resolve(result);
    await request;
    const finished = content();
    expect(finished.uploading).toBe(false);
    expect(finished.contentTitle).toBe('');
    finished.onContentTitleChange('New B');
    finished.onRawTextChange('New B text');
    expect(content().contentTitle).toBe('New B');
    expect(content().rawText).toBe('New B text');
  });

  it('starts one AI operation for two submissions in the same tick', async () => {
    const extraction = deferred<typeof extracted>();
    service.extract.mockReturnValue(extraction.promise);
    const props = prepareAi();
    const first = props.onAiImport();
    const second = props.onAiImport();
    expect(service.extract).toHaveBeenCalledTimes(1);
    extraction.resolve(extracted);
    await Promise.all([first, second]);
    expect(service.import).toHaveBeenCalledTimes(1);
  });

  it('shares the operation lock between CSV and AI and ignores pending file changes', async () => {
    const reading = deferred<string>();
    const props = prepareAi();
    chooseFile(props, { name: 'A.csv', text: () => reading.promise });
    const ready = content();
    const first = ready.onCsvUpload();
    const duplicate = ready.onCsvUpload();
    const ai = ready.onAiImport();
    chooseFile(content(), { name: 'B.csv', text: async () => 'B,1,new,新規' });
    expect(content().file.name).toBe('A.csv');
    expect(service.extract).not.toHaveBeenCalled();
    reading.resolve('A,1,synthetic,合成');
    await Promise.all([first, duplicate, ai]);
    expect(service.import).toHaveBeenCalledTimes(1);
    expect(service.import.mock.calls[0][0].source.fileName).toBe('A.csv');
  });

  it('retains the submitted draft and unlocks editing after a save failure', async () => {
    const save = deferred<CatalogImportResult>();
    service.import.mockReturnValue(save.promise);
    const request = prepareAi().onAiImport();
    await Promise.resolve();
    save.reject(new Error('Synthetic offline failure'));
    await request;
    const failed = content();
    expect(failed.uploading).toBe(false);
    expect(failed.contentTitle).toBe('Official A');
    expect(failed.rawText).toBe('Synthetic source A.');
    failed.onRawTextChange('Corrected B');
    expect(content().rawText).toBe('Corrected B');
  });

  it('does not begin a save after leaving the panel during AI extraction', async () => {
    const extraction = deferred<typeof extracted>();
    service.extract.mockReturnValue(extraction.promise);
    const request = prepareAi().onAiImport();
    harness.cleanups.forEach((cleanup) => cleanup());
    extraction.resolve(extracted);
    await request;
    expect(service.import).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])(
    'ignores delayed %s after the panel has unmounted',
    async (outcome) => {
      const save = deferred<CatalogImportResult>();
      service.import.mockReturnValue(save.promise);
      const request = prepareAi().onAiImport();
      await Promise.resolve();
      const previous = content();
      harness.cleanups.forEach((cleanup) => cleanup());
      if (outcome === 'success') save.resolve(result);
      else save.reject(new Error('Synthetic late failure'));
      await request;
      expect(content().contentTitle).toBe(previous.contentTitle);
      expect(content().log).toEqual(previous.log);
      expect(service.refresh).not.toHaveBeenCalled();
    },
  );

  it('does not publish a late progress callback after the operation has completed', async () => {
    await prepareAi().onAiImport();
    const progressCallback = service.import.mock.calls[0][1];
    chooseFile(content(), { name: 'B.csv', text: async () => '' });
    progressCallback(100);
    expect(content().progress).toBe(0);
  });

  it('keeps disabled runtime actions unavailable even through captured handlers', async () => {
    service.enabled = false;
    const props = prepareAi();
    await props.onAiImport();
    chooseFile(props, { name: 'A.csv', text: async () => 'A,1,word,語' });
    await content().onCsvUpload();
    expect(service.extract).not.toHaveBeenCalled();
    expect(service.import).not.toHaveBeenCalled();
    expect(content().file).toBeNull();
  });

  it('renders a native keyboard button for CSV selection and locks all draft fields when pending', () => {
    const props = prepareAi();
    harness.cursor = 0;
    const csv = renderToStaticMarkup(<AdminContentImportView {...(props as any)} mode="csv" />);
    expect(csv).toMatch(/<button[^>]*aria-controls="csv-upload"/);
    expect(csv).not.toMatch(/<label[^>]*for="csv-upload"/);
    harness.cursor = 0;
    const pending = renderToStaticMarkup(
      <AdminContentImportView {...(props as any)} uploading={true} />,
    );
    expect(pending).toMatch(/<textarea[^>]*disabled/);
    expect(pending).toMatch(/<input[^>]*disabled/);
    expect(pending).toContain('aria-busy="true"');
  });
});
