import React, { useState } from 'react';
import type { CatalogImportResult } from '../contracts/storage';
import getClientRuntimeFlags from '../config/runtime';
import { dashboardService } from '../services/dashboard';
import { extractVocabularyFromText, isAiUnavailableError } from '../services/gemini';
import { BookAccessScope, BookCatalogSource } from '../types';
import { BRAND } from '../config/brand';
import { useAdminDashboardSnapshot } from '../hooks/useAdminDashboardSnapshot';
import { useAdminCommercialOps } from '../hooks/useAdminCommercialOps';
import { AlertTriangle, Loader2, RefreshCw, Trash2 } from 'lucide-react';
import ModalOverlay from './ModalOverlay';
import AdminCommercialOpsView from './admin/AdminCommercialOpsView';
import AdminContentImportView from './admin/AdminContentImportView';
import AdminDashboardView from './admin/AdminDashboardView';

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
  const [panelView, setPanelView] = useState<'dashboard' | 'content' | 'commercial'>('dashboard');
  const [mode, setMode] = useState<'csv' | 'ai'>('ai');
  const {
    snapshot,
    loading: dashboardLoading,
    error: dashboardError,
    refresh: fetchDashboard,
  } = useAdminDashboardSnapshot();
  const {
    requests,
    announcements,
    loading: commercialLoading,
    error: commercialError,
    refresh: refreshCommercialOps,
    updateRequest,
    upsertAnnouncement,
  } = useAdminCommercialOps();

  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [contentTitle, setContentTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [catalogSource, setCatalogSource] = useState<BookCatalogSource>(BookCatalogSource.LICENSED_PARTNER);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const runtimeFlags = getClientRuntimeFlags();
  const destructiveActionsEnabled = runtimeFlags.enableDestructiveAdminActions;
  const destructiveActionsMessage = '本番/導入 pilot では教材更新と初期化を UI から実行できません。バックアップ付き CLI runbook で dry-run 確認後に反映してください。';

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setLog([]);
      setProgress(0);
    }
  };

  const handleCsvUpload = async () => {
    if (!file) return;

    setUploading(true);
    setLog((previous) => [...previous, 'ファイル読み込み中...']);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        if (!text.trim()) throw new Error('有効なデータが見つかりませんでした。');
        setLog((previous) => [...previous, 'サーバーで CSV を検証しています...']);
        const defaultBookName = file.name.replace('.csv', '');

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
          setProgress(nextProgress);
        });

        appendImportSummary(setLog, result, 'インポート完了');
        await fetchDashboard();
      } catch (error) {
        console.error(error);
        setLog((previous) => [...previous, `エラー: ${(error as Error).message}`]);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsText(file);
  };

  const handleAiImport = async () => {
    if (!rawText.trim() || !contentTitle.trim()) return;

    setUploading(true);
    setLog(['教材解析を開始します...', 'テキストから重要単語を抽出中...']);

    try {
      const extracted = await extractVocabularyFromText(rawText);
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
        setProgress(nextProgress);
      });

      appendImportSummary(setLog, result, '独自教材の追加が完了');
      setRawText('');
      setContentTitle('');
      await fetchDashboard();
    } catch (error) {
      console.error(error);
      const message = isAiUnavailableError(error)
        ? 'AI教材生成はまだ利用できません。CSV一括に切り替えるか、Gemini 設定後に再試行してください。'
        : (error as Error).message;
      setLog((previous) => [...previous, `エラー: ${message}`]);
    } finally {
      setUploading(false);
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
      onModeChange={setMode}
      onCatalogSourceChange={setCatalogSource}
      onContentTitleChange={setContentTitle}
      onRawTextChange={setRawText}
      onFileChange={handleFileChange}
      onAiImport={handleAiImport}
      onCsvUpload={handleCsvUpload}
      onOpenResetModal={() => {
        if (!destructiveActionsEnabled) return;
        setShowResetModal(true);
      }}
      destructiveActionsEnabled={destructiveActionsEnabled}
      destructiveActionsMessage={destructiveActionsMessage}
    />
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      {showResetModal && (
        <ModalOverlay onClose={() => !resetting && setShowResetModal(false)} align="center" panelClassName="max-w-lg">
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
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-medace-500">運営画面</p>
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
          <div className="inline-flex rounded-2xl border border-medace-100 bg-medace-50 p-1">
            <button
              onClick={() => setPanelView('dashboard')}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${panelView === 'dashboard' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
            >
              分析ダッシュボード
            </button>
            <button
              onClick={() => setPanelView('content')}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${panelView === 'content' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
            >
              教材運用
            </button>
            <button
              onClick={() => setPanelView('commercial')}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition-colors ${panelView === 'commercial' ? 'bg-white text-medace-900 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
            >
              導入・お知らせ
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              if (panelView === 'commercial') {
                void refreshCommercialOps();
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
        />
      ) : panelView === 'commercial' ? (
        <AdminCommercialOpsView
          requests={requests}
          announcements={announcements}
          loading={commercialLoading}
          error={commercialError}
          onUpdateRequest={updateRequest}
          onUpsertAnnouncement={upsertAnnouncement}
        />
      ) : (
        contentOps
      )}
    </div>
  );
};

export default AdminPanel;
