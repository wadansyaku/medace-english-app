import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogImportResult } from '../contracts/storage';
import getClientRuntimeFlags from '../config/runtime';
import { dashboardService } from '../services/dashboard';
import { extractVocabularyFromText, isAiUnavailableError } from '../services/gemini';
import { BookAccessScope, BookCatalogSource, type BookMetadata, type WordData } from '../types';
import { getAiActionEstimate } from '../config/subscription';
import { BRAND } from '../config/brand';
import { useAdminDashboardSnapshot } from '../hooks/useAdminDashboardSnapshot';
import { useAdminCommercialOps } from '../hooks/useAdminCommercialOps';
import { AlertTriangle, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import AdminCommercialOpsView from './admin/AdminCommercialOpsView';
import AdminContentImportView from './admin/AdminContentImportView';
import AdminDashboardView from './admin/AdminDashboardView';
import ProductFeedbackPanel from './ProductFeedbackPanel';

const formatCost = (milliYen: number): string => {
  const yen = milliYen / 1000;
  return `${yen.toFixed(yen >= 10 ? 0 : 1)}円`;
};

const appendImportSummary = (
  setLog: React.Dispatch<React.SetStateAction<string[]>>,
  result: CatalogImportResult,
  headline: string,
) => {
  setLog((previous) => [
    ...previous,
    `${headline}: ${result.importedBookCount}冊 / ${result.importedWordCount}語を登録しました。`,
    ...(result.skippedRowCount > 0 ? [`スキップ行: ${result.skippedRowCount}`] : []),
    ...result.warnings.map((warning) => `注意: ${warning.message}${warning.rowNumber ? ` (row ${warning.rowNumber})` : ''}`),
  ]);
};

const AdminPanel: React.FC = () => {
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [panelView, setPanelView] = useState<'dashboard' | 'content' | 'commercial'>('dashboard');
  const [mode, setMode] = useState<'csv' | 'ai'>('ai');
  const {
    snapshot,
    loading: dashboardLoading,
    error: dashboardError,
    refresh: fetchDashboard,
    passwordRecoveryUpdatingId,
    updatePasswordRecoveryRequest,
    passwordResetIssuingId,
    passwordResetLinkByRequestId,
    issuePasswordResetLink,
  } = useAdminDashboardSnapshot();
  const {
    requests,
    announcements,
    loading: commercialLoading,
    error: commercialError,
    refresh: refreshCommercialOps,
    updateRequest,
    runInitialB2BSetup,
    upsertAnnouncement,
  } = useAdminCommercialOps();

  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [contentTitle, setContentTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const importPending = useRef(false);
  const importVersion = useRef(0);
  const mounted = useRef(true);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [catalogSource, setCatalogSource] = useState<BookCatalogSource>(BookCatalogSource.LICENSED_PARTNER);
  const [catalogBooks, setCatalogBooks] = useState<BookMetadata[]>([]);
  const [loadingCatalogBooks, setLoadingCatalogBooks] = useState(true);
  const [preparingExamplesBookId, setPreparingExamplesBookId] = useState<string | null>(null);
  const examplePreparationPending = useRef(false);
  const [examplePreview, setExamplePreview] = useState<{ book: BookMetadata; words: WordData[] | null; error: string | null } | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const runtimeFlags = getClientRuntimeFlags();
  const destructiveActionsEnabled = runtimeFlags.enableDestructiveAdminActions;
  const destructiveActionsMessage = '本番/導入テストでは教材更新と初期化を UI から実行できません。バックアップ付き運用手順で事前確認後に反映してください。';

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      importVersion.current += 1;
      importPending.current = false;
    };
  }, []);

  const loadCatalogBooks = async () => {
    setLoadingCatalogBooks(true);
    try {
      const nextBooks = await dashboardService.getBooks();
      setCatalogBooks(nextBooks);
    } catch (error) {
      console.error(error);
      setLog((previous) => [...previous, `エラー: 公式教材一覧の取得に失敗しました。${(error as Error).message}`]);
    } finally {
      setLoadingCatalogBooks(false);
    }
  };

  useEffect(() => {
    void loadCatalogBooks();
  }, []);

  const officialBooks = useMemo(
    () => catalogBooks
      .filter((book) => book.catalogSource !== BookCatalogSource.USER_GENERATED)
      .sort((left, right) => {
        if ((left.isPriority ? 1 : 0) !== (right.isPriority ? 1 : 0)) {
          return left.isPriority ? -1 : 1;
        }
        return left.title.localeCompare(right.title, 'ja');
      }),
    [catalogBooks],
  );

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (importPending.current || !destructiveActionsEnabled) return;
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setLog([]);
      setProgress(0);
    }
  };

  const handleCsvUpload = async () => {
    if (!file || importPending.current || !destructiveActionsEnabled) return;

    importPending.current = true;
    const version = ++importVersion.current;
    const isCurrent = () => mounted.current && version === importVersion.current;
    setUploading(true);
    setProgress(0);
    setLog((previous) => [...previous, 'ファイル読み込み中...']);

    try {
      const text = await file.text();
      if (!isCurrent()) return;
      if (!text.trim()) throw new Error('有効なデータが見つかりませんでした。');
      setLog((previous) => [...previous, 'サーバーで CSV を検証しています...']);
      const defaultBookName = file.name.replace(/\.csv$/i, '');

      const result = await dashboardService.batchImportWords({
        defaultBookName,
        source: {
          kind: 'csv',
          csvText: text,
          fileName: file.name,
        },
        options: {
          catalogSource,
          accessScope: BookAccessScope.BUSINESS_ONLY,
        },
      }, (nextProgress) => {
        if (isCurrent()) setProgress(nextProgress);
      });

      if (!isCurrent()) return;
      appendImportSummary(setLog, result, 'インポート完了');
      await Promise.all([fetchDashboard(), loadCatalogBooks()]);
    } catch (error) {
      if (!isCurrent()) return;
      console.error(error);
      setLog((previous) => [...previous, `エラー: ${(error as Error).message}`]);
    } finally {
      if (isCurrent()) {
        importVersion.current += 1;
        importPending.current = false;
        setUploading(false);
      }
    }
  };

  const handleAiImport = async () => {
    if (!rawText.trim() || !contentTitle.trim() || importPending.current || !destructiveActionsEnabled) return;

    importPending.current = true;
    const version = ++importVersion.current;
    const isCurrent = () => mounted.current && version === importVersion.current;
    setUploading(true);
    setProgress(0);
    setLog(['教材解析を開始します...', 'テキストから重要単語を抽出中...']);

    try {
      const extracted = await extractVocabularyFromText(rawText);
      if (!isCurrent()) return;
      if (extracted.words.length === 0) throw new Error('単語を抽出できませんでした。');

      setLog((previous) => [...previous, `抽出成功: ${extracted.words.length}語を検出しました。`]);
      setLog((previous) => [...previous, 'データベースへ保存中...']);
      const result = await dashboardService.batchImportWords({
        defaultBookName: contentTitle,
        source: {
          kind: 'rows',
          rows: extracted.words.map((item, index) => ({
            bookName: contentTitle,
            number: index + 1,
            word: item.word,
            definition: item.definition,
          })),
        },
        contextSummary: extracted.contextSummary,
        options: {
          catalogSource,
          accessScope: BookAccessScope.BUSINESS_ONLY,
        },
      }, (nextProgress) => {
        if (isCurrent()) setProgress(nextProgress);
      });

      if (!isCurrent()) return;
      appendImportSummary(setLog, result, '独自教材の追加が完了');
      setRawText('');
      setContentTitle('');
      await Promise.all([fetchDashboard(), loadCatalogBooks()]);
    } catch (error) {
      if (!isCurrent()) return;
      console.error(error);
      const message = isAiUnavailableError(error)
        ? 'AI教材生成はまだ利用できません。CSV一括に切り替えるか、Gemini 設定後に再試行してください。'
        : (error as Error).message;
      setLog((previous) => [...previous, `エラー: ${message}`]);
    } finally {
      if (isCurrent()) {
        importVersion.current += 1;
        importPending.current = false;
        setUploading(false);
      }
    }
  };

  const handleReset = async () => {
    setResetting(true);
    try {
      await dashboardService.resetAllData();
      setShowResetModal(false);
      setLog((previous) => [...previous, 'データをリセットしました。ページを更新します。']);
      window.location.reload();
    } finally {
      setResetting(false);
    }
  };

  const handlePrepareBookExamples = async (book: BookMetadata) => {
    if (examplePreparationPending.current || uploading) return;
    setExamplePreview({ book, words: null, error: null });
    try {
      const words = await dashboardService.getWordsByBook(book.id);
      setExamplePreview(previous => previous?.book.id === book.id ? { book, words, error: null } : previous);
    } catch (error) {
      setExamplePreview(previous => previous?.book.id === book.id ? { book, words: null, error: error instanceof Error ? error.message : '例文の状態を読み込めませんでした。' } : previous);
    }
  };

  const confirmPrepareBookExamples = async () => {
    if (!examplePreview?.words || examplePreparationPending.current) return;
    const book = examplePreview.book;
    examplePreparationPending.current = true;
    setPreparingExamplesBookId(book.id);
    try {
      const result = await dashboardService.prepareBookExamples(book.id);
      setLog(previous => [...previous, `${book.title}: ${result.preparedCount}件を承認待ちで保存。英例文の欠損は残り ${result.remainingCount}件です。保存済みと学習者への公開は別です。`]);
      const words = await dashboardService.getWordsByBook(book.id);
      setExamplePreview(previous => previous?.book.id === book.id ? { book, words, error: null } : previous);
      await loadCatalogBooks();
    } catch (error) {
      setExamplePreview(previous => previous?.book.id === book.id ? { ...previous, error: `準備結果を確認できませんでした。自動再送はしません。${error instanceof Error ? error.message : ''}` } : previous);
    } finally {
      examplePreparationPending.current = false;
      setPreparingExamplesBookId(null);
    }
  };

  const overview = snapshot?.overview;
  const headline = overview
    ? overview.atRiskCount > 0
      ? `優先して見たい生徒が ${overview.atRiskCount} 名います`
      : '学習の流れは安定しています'
    : '運営状況を読み込み中';
  const subcopy = overview
    ? `登録生徒 ${overview.totalStudents} 名、教材 ${overview.officialBookCount + overview.customBookCount} 冊、今月のAI利用は ${formatCost(overview.aiCostThisMonthMilliYen)} です。`
    : `${BRAND.officialName} の運営状況を集計しています。`;

  const contentOps = (
    <AdminContentImportView
      mode={mode}
      file={file}
      rawText={rawText}
      contentTitle={contentTitle}
      uploading={uploading}
      progress={progress}
      log={log}
      catalogSource={catalogSource}
      onModeChange={(value) => { if (!importPending.current) setMode(value); }}
      onCatalogSourceChange={(value) => { if (!importPending.current) setCatalogSource(value); }}
      onContentTitleChange={(value) => { if (!importPending.current) setContentTitle(value); }}
      onRawTextChange={(value) => { if (!importPending.current) setRawText(value); }}
      onFileChange={handleFileChange}
      onAiImport={handleAiImport}
      onCsvUpload={handleCsvUpload}
      officialBooks={officialBooks}
      loadingOfficialBooks={loadingCatalogBooks}
      preparingExamplesBookId={preparingExamplesBookId}
      onPrepareExamples={handlePrepareBookExamples}
      onOpenResetModal={() => {
        if (!destructiveActionsEnabled || importPending.current) return;
        setShowResetModal(true);
      }}
      destructiveActionsEnabled={destructiveActionsEnabled}
      destructiveActionsMessage={destructiveActionsMessage}
    />
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <ProductFeedbackPanel open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      {examplePreview && <ModalOverlay ariaLabel="例文の事前準備" mobileBehavior="sheet" panelClassName="w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 sm:p-6" onClose={() => { if (!examplePreparationPending.current) setExamplePreview(null); }}>
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="text-xl font-bold text-slate-900">例文の事前準備</h2><p className="mt-1 break-words text-sm text-slate-600">{examplePreview.book.title}</p></div><button type="button" disabled={Boolean(preparingExamplesBookId)} onClick={() => setExamplePreview(null)} className="min-h-11 shrink-0 whitespace-nowrap rounded-lg border px-3 text-sm">閉じる</button></div>
        {examplePreview.error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{examplePreview.error}</p>}
        {!examplePreview.words ? <div className="mt-4"><p role="status" className="text-sm text-slate-600">{examplePreview.error ? '状態を取得できていません。' : '保存済みの状態を確認中...'}</p>{examplePreview.error && <button type="button" onClick={() => void handlePrepareBookExamples(examplePreview.book)} className="mt-3 min-h-11 rounded-lg border px-3 text-sm">一覧を再取得</button>}</div> : <>
          <p className="mt-4 text-sm leading-relaxed text-slate-700">取得した {examplePreview.words.length}語のうち、学習画面で表示できる例文は {examplePreview.words.filter(word => word.exampleSentence?.trim()).length}件。訳がない例文は {examplePreview.words.filter(word => word.exampleSentence?.trim() && !word.exampleMeaning?.trim()).length}件です。</p>
          <details className="mt-3 rounded-xl border p-3"><summary className="min-h-11 cursor-pointer text-sm font-bold">表示できる例文がない単語（{examplePreview.words.filter(word => !word.exampleSentence?.trim()).length}件）</summary><ul className="mt-2 space-y-1 text-sm">{examplePreview.words.filter(word => !word.exampleSentence?.trim()).slice(0,20).map(word => <li key={word.id}>{word.number}. {word.word} {word.exampleAuditStatus ? '（内容確認中・非公開）' : '（未準備）'}</li>)}</ul>{examplePreview.words.filter(word => !word.exampleSentence?.trim()).length > 20 && <p className="mt-2 text-xs text-slate-500">先頭20件を表示しています。</p>}</details>
          <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">有料AIによる事前準備は1回最大10件、概算上限 {formatCost(getAiActionEstimate('generateGeminiSentence').estimatedCostMilliYen * 10)}。既存例文は上書きせず、作成結果は承認待ちで保存します。訳のみの欠損はこの処理では補完されません。</p>
          <p className="mt-3 text-xs leading-relaxed text-slate-600">定期の有料再監査は停止しています。未承認内容は公開せず、内容確認済みの例文をCSVで事前保存する方法も使えます。結果不明の実行は管理者が確認し、自動再生成しません。</p>
          <button type="button" disabled={Boolean(preparingExamplesBookId) || Boolean(examplePreview.error) || !examplePreview.words.some(word => !word.exampleSentence?.trim() && !word.exampleAuditStatus)} onClick={() => void confirmPrepareBookExamples()} className="mt-4 min-h-11 w-full rounded-xl bg-steady-action px-4 py-3 font-bold text-steady-on-action disabled:opacity-50">{preparingExamplesBookId ? '事前準備を実行中...' : '見積もりを確認して最大10件準備する'}</button>
        </>}
      </ModalOverlay>}

      {showResetModal && (
        <ModalOverlay
          onClose={() => !resetting && setShowResetModal(false)}
          align="center"
          ariaLabel="デモデータを初期化する"
          panelClassName="max-w-lg"
        >
          <div className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-lg font-black text-slate-950">デモデータを初期化する</div>
                <div className="mt-1 text-sm text-slate-500">教材、学習履歴、通知、割当履歴を削除します。</div>
              </div>
            </div>
            <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
              この操作は取り消せません。ローカル検証やデモ環境の初期化に限定してください。
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleReset}
                disabled={resetting}
                className="inline-flex items-center gap-2 rounded-2xl bg-red-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                初期化する
              </button>
            </div>
          </div>
        </ModalOverlay>
      )}

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold text-medace-500">運営画面</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-medace-900">{BRAND.officialName} 運営ダッシュボード</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-medace-900/70">
            学習状況、停滞リスク、教材運用、報告対応、AI利用を一画面で見渡せるように整理しています。
          </p>
          {!destructiveActionsEnabled && (
            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
              {destructiveActionsMessage}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => setFeedbackOpen(true)} className="min-h-11 rounded-xl border border-orange-200 bg-[#FDF3ED] px-4 py-2 text-sm font-bold text-[#2F1609]">FAQ・製品の報告</button>
          <div className="inline-flex rounded-2xl border border-medace-100 bg-medace-50 p-1">
            <button
              onClick={() => { if (!importPending.current) setPanelView('dashboard'); }}
              disabled={uploading}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${panelView === 'dashboard' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
            >
              分析ダッシュボード
            </button>
            <button
              onClick={() => { if (!importPending.current) setPanelView('content'); }}
              disabled={uploading}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${panelView === 'content' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
            >
              教材運用
            </button>
            <button
              onClick={() => { if (!importPending.current) setPanelView('commercial'); }}
              disabled={uploading}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${panelView === 'commercial' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
            >
              受付・お知らせ
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (panelView === 'commercial') {
                void refreshCommercialOps();
                return;
              }
              if (panelView === 'content') {
                void Promise.all([fetchDashboard(), loadCatalogBooks()]);
                return;
              }
              void fetchDashboard();
            }}
            disabled={dashboardLoading || commercialLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-medace-200 bg-white px-4 py-2.5 text-sm font-bold text-medace-800 shadow-sm transition-colors hover:bg-medace-50 disabled:opacity-50"
          >
            {dashboardLoading || commercialLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            最新化
          </button>
        </div>
      </div>

      {panelView === 'dashboard' ? (
        <AdminDashboardView
          snapshot={snapshot}
          loading={dashboardLoading}
          error={dashboardError}
          headline={headline}
          subcopy={subcopy}
          passwordRecoveryUpdatingId={passwordRecoveryUpdatingId}
          onUpdatePasswordRecoveryRequest={updatePasswordRecoveryRequest}
          passwordResetIssuingId={passwordResetIssuingId}
          passwordResetLinkByRequestId={passwordResetLinkByRequestId}
          onIssuePasswordResetLink={issuePasswordResetLink}
        />
      ) : panelView === 'commercial' ? (
        <AdminCommercialOpsView
          requests={requests}
          announcements={announcements}
          loading={commercialLoading}
          error={commercialError}
          onUpdateRequest={updateRequest}
          onRunInitialB2BSetup={runInitialB2BSetup}
          onUpsertAnnouncement={upsertAnnouncement}
        />
      ) : (
        contentOps
      )}
    </div>
  );
};

export default AdminPanel;
