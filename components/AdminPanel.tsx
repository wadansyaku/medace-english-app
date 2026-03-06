import React, { useEffect, useState } from 'react';
import { storage } from '../services/storage';
import { extractVocabularyFromText } from '../services/gemini';
import { AdminDashboardSnapshot, BookAccessScope, BookCatalogSource, BOOK_CATALOG_SOURCE_LABELS, StudentRiskLevel, SUBSCRIPTION_PLAN_LABELS, SubscriptionPlan } from '../types';
import { BRAND } from '../config/brand';
import { Activity, AlertTriangle, BarChart3, BellRing, BookOpen, Bot, Clock3, Database, FileText, Loader2, MessageSquareText, RefreshCw, ShieldAlert, Sparkles, Target, Trash2, Upload, Users } from 'lucide-react';

const formatCost = (milliYen: number): string => {
  const yen = milliYen / 1000;
  return `${yen.toFixed(yen >= 10 ? 0 : 1)}円`;
};

const formatDateLabel = (date: string): string => {
  const [, month, day] = date.split('-');
  return `${month}/${day}`;
};

const formatDateTime = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString('ja-JP', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const riskTone = (riskLevel: StudentRiskLevel): string => {
  if (riskLevel === StudentRiskLevel.DANGER) return 'border-red-200 bg-red-50 text-red-700';
  if (riskLevel === StudentRiskLevel.WARNING) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
};

const planTone = (plan: SubscriptionPlan): string => {
  if (plan === SubscriptionPlan.TOB_PAID) return 'border-medace-900 bg-medace-900 text-white';
  if (plan === SubscriptionPlan.TOB_FREE) return 'border-medace-200 bg-medace-100 text-medace-900';
  if (plan === SubscriptionPlan.TOC_PAID) return 'border-medace-200 bg-medace-50 text-medace-800';
  return 'border-slate-200 bg-white text-slate-600';
};

const MetricCard: React.FC<{
  label: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
}> = ({ label, value, detail, icon }) => (
  <div className="rounded-[28px] border border-medace-100 bg-white p-5 shadow-sm">
    <div className="flex items-center gap-3 text-medace-700">
      <div className="rounded-2xl bg-medace-50 p-3">{icon}</div>
      <span className="text-sm font-bold">{label}</span>
    </div>
    <div className="mt-4 text-3xl font-black tracking-tight text-slate-950">{value}</div>
    <p className="mt-2 text-sm leading-relaxed text-slate-500">{detail}</p>
  </div>
);

const AdminPanel: React.FC = () => {
  const [panelView, setPanelView] = useState<'dashboard' | 'content'>('dashboard');
  const [mode, setMode] = useState<'csv' | 'ai'>('ai');
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [contentTitle, setContentTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [catalogSource, setCatalogSource] = useState<BookCatalogSource>(BookCatalogSource.LICENSED_PARTNER);

  const fetchDashboard = async () => {
    setDashboardLoading(true);
    setDashboardError(null);
    try {
      const nextSnapshot = await storage.getAdminDashboardSnapshot();
      setSnapshot(nextSnapshot);
    } catch (error) {
      console.error(error);
      setDashboardError((error as Error).message || '管理者ダッシュボードの取得に失敗しました。');
    } finally {
      setDashboardLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setFile(event.target.files[0]);
      setLog([]);
      setProgress(0);
    }
  };

  const parseCSV = (text: string) => {
    let content = text;
    if (content.charCodeAt(0) === 0xFEFF) {
      content = content.slice(1);
    }

    const rows: any[] = [];
    const lines: string[][] = [];
    let currentRow: string[] = [];
    let currentVal = '';
    let inQuote = false;

    for (let index = 0; index < content.length; index += 1) {
      const char = content[index];
      const nextChar = content[index + 1];

      if (inQuote) {
        if (char === '"' && nextChar === '"') {
          currentVal += '"';
          index += 1;
        } else if (char === '"') {
          inQuote = false;
        } else {
          currentVal += char;
        }
      } else if (char === '"') {
        inQuote = true;
      } else if (char === ',') {
        currentRow.push(currentVal);
        currentVal = '';
      } else if (char === '\r' || char === '\n') {
        if (char === '\r' && nextChar === '\n') {
          index += 1;
        }
        currentRow.push(currentVal);
        if (currentRow.length > 0 && (currentRow.length > 1 || currentRow[0] !== '')) {
          lines.push(currentRow);
        }
        currentRow = [];
        currentVal = '';
      } else {
        currentVal += char;
      }
    }

    if (currentVal || currentRow.length > 0) {
      currentRow.push(currentVal);
      lines.push(currentRow);
    }

    if (lines.length < 2) return [];

    const headers = lines[0].map((header) => header.trim());
    for (let index = 1; index < lines.length; index += 1) {
      const values = lines[index];
      if (values.length === 0) continue;
      const row: any = {};
      headers.forEach((header, headerIndex) => {
        row[header] = values[headerIndex] || '';
      });
      row._col0 = values[0] || '';
      row._col1 = values[1] || '';
      row._col2 = values[2] || '';
      row._col3 = values[3] || '';
      rows.push(row);
    }

    return rows;
  };

  const handleCsvUpload = async () => {
    if (!file) return;

    setUploading(true);
    setLog((previous) => [...previous, 'ファイル読み込み中...']);

    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      try {
        const rows = parseCSV(text);
        if (rows.length === 0) throw new Error('有効なデータが見つかりませんでした。');

        setLog((previous) => [...previous, `${rows.length} 件のデータを解析しました。データベースへ転送中...`]);
        const defaultBookName = file.name.replace('.csv', '');

        await storage.batchImportWords(defaultBookName, rows, (nextProgress) => {
          setProgress(nextProgress);
        }, undefined, undefined, {
          catalogSource,
          accessScope: BookAccessScope.BUSINESS_ONLY,
        });

        setLog((previous) => [...previous, 'インポート完了。ダッシュボードを更新しています...']);
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

      const rows = extracted.words.map((item, index) => ({
        BookName: contentTitle,
        Number: index + 1,
        Word: item.word,
        Meaning: item.definition,
      }));

      setLog((previous) => [...previous, 'データベースへ保存中...']);
      await storage.batchImportWords(contentTitle, rows, (nextProgress) => {
        setProgress(nextProgress);
      }, undefined, extracted.contextSummary, {
        catalogSource,
        accessScope: BookAccessScope.BUSINESS_ONLY,
      });

      setLog((previous) => [...previous, '完了: 独自教材を追加しました。ダッシュボードを更新しています...']);
      setRawText('');
      setContentTitle('');
      await fetchDashboard();
    } catch (error) {
      console.error(error);
      setLog((previous) => [...previous, `エラー: ${(error as Error).message}`]);
    } finally {
      setUploading(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('本当にすべてのデータを初期化しますか？この操作は取り消せません。')) return;
    await storage.resetAllData();
    alert('データをリセットしました。');
    window.location.reload();
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

  const maxTrendValue = snapshot
    ? Math.max(
        ...snapshot.trend.map((point) => Math.max(point.activeStudents, point.studiedWords, point.notifications, point.newStudents)),
        1
      )
    : 1;

  const planCoverageRate = overview && overview.totalStudents > 0
    ? Math.round((overview.studentsWithPlan / overview.totalStudents) * 100)
    : 0;

  const contentOps = (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h2 className="text-3xl font-bold text-medace-900">教材運用</h2>
          <p className="text-medace-700/70">教材追加と、ビジネス限定の公式カタログ運用をこの画面から管理します。</p>
        </div>
        <div className="inline-flex rounded-2xl border border-medace-100 bg-medace-50 p-1">
          <button
            onClick={() => setMode('ai')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${mode === 'ai' ? 'bg-white text-medace-700 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
          >
            <Sparkles className="w-4 h-4" /> AI生成
          </button>
          <button
            onClick={() => setMode('csv')}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-colors ${mode === 'csv' ? 'bg-white text-medace-700 shadow-sm' : 'text-medace-700/70 hover:text-medace-900'}`}
          >
            <FileText className="w-4 h-4" /> CSV一括
          </button>
        </div>
      </div>

      <div className="rounded-[28px] border border-medace-100 bg-white p-8 shadow-[0_18px_50px_rgba(246,109,11,0.08)]">
        <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Catalog Scope</div>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {[BookCatalogSource.STEADY_STUDY_ORIGINAL, BookCatalogSource.LICENSED_PARTNER].map((source) => (
              <button
                key={source}
                type="button"
                onClick={() => setCatalogSource(source)}
                className={`rounded-2xl border px-4 py-4 text-left transition-colors ${catalogSource === source ? 'border-medace-500 bg-medace-50 text-medace-900' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                <div className="font-bold">{BOOK_CATALOG_SOURCE_LABELS[source]}</div>
                <div className="mt-1 text-sm">
                  {source === BookCatalogSource.STEADY_STUDY_ORIGINAL
                    ? 'Steady Study原本として、ビジネス限定の公式教材カタログへ登録します。'
                    : 'ライセンス取得済み教材として、ビジネス限定の公式教材カタログへ登録します。'}
                </div>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-slate-500">
            現在の方針では、ここで登録した公式教材は個人/無料ユーザーには表示されません。
          </p>
        </div>
        {mode === 'ai' ? (
          <div className="space-y-6 animate-in fade-in">
            <div className="flex items-start gap-3 rounded-xl border border-medace-100 bg-medace-50 p-4">
              <div className="rounded-full bg-white p-2 shadow-sm">
                <Sparkles className="w-5 h-5 text-medace-600" />
              </div>
              <div>
                <h3 className="font-bold text-medace-900">AI教材生成</h3>
                <p className="mt-1 text-sm text-medace-700">
                  プリント、長文問題、Web記事の英語テキストから、学習させたい重要単語を抽出して教材へ変換します。
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">教材タイトル</label>
                <div className="relative">
                  <BookOpen className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={contentTitle}
                    onChange={(event) => setContentTitle(event.target.value)}
                    placeholder="例: 中3定期テスト対策 Lesson 4"
                    className="w-full rounded-xl border border-slate-300 py-3 pl-10 pr-4 font-bold text-slate-700 outline-none transition-all focus:border-medace-500 focus:ring-2 focus:ring-medace-200"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold text-slate-700">ソーステキスト (英語)</label>
                <textarea
                  value={rawText}
                  onChange={(event) => setRawText(event.target.value)}
                  placeholder="ここに英文を貼り付けてください..."
                  className="h-48 w-full rounded-xl border border-slate-300 p-4 font-mono text-sm text-slate-600 outline-none transition-all focus:border-medace-500 focus:ring-2 focus:ring-medace-200"
                />
              </div>

              <button
                onClick={handleAiImport}
                disabled={uploading || !rawText || !contentTitle}
                className={`flex w-full items-center justify-center gap-2 rounded-xl py-4 text-lg font-bold text-white shadow-lg transition-all ${uploading || !rawText ? 'cursor-not-allowed bg-medace-200' : 'bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_100%)] hover:scale-[1.01]'}`}
              >
                {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
                {uploading ? '生成中...' : '教材を生成する'}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in">
            <div className="mb-6 flex items-center gap-3">
              <div className="rounded-lg bg-medace-50 p-3">
                <Upload className="w-6 h-6 text-medace-600" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-800">CSVインポート</h3>
                <p className="text-sm text-slate-500">既存の単語リストを一括で取り込みたい場合はこちらを利用します。</p>
                <p className="mt-1 text-xs text-slate-400">推奨フォーマット: 1列目=単語帳名, 2列目=番号, 3列目=単語, 4列目=日本語訳</p>
              </div>
            </div>

            <div className="rounded-xl border-2 border-dashed border-medace-200 bg-[#fff8ef] p-10 text-center transition-colors hover:border-medace-400">
              <FileText className="mx-auto mb-4 h-12 w-12 text-slate-400" />
              <p className="mb-4 text-slate-600">
                {file ? `選択中: ${file.name}` : 'ここにCSVをドラッグ＆ドロップ、またはクリックして選択'}
              </p>
              <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="csv-upload" />
              <label
                htmlFor="csv-upload"
                className="inline-block cursor-pointer rounded-lg border border-medace-200 bg-white px-6 py-3 font-medium text-medace-800 shadow-sm transition-all hover:border-medace-500 hover:bg-medace-50 hover:text-medace-700"
              >
                ファイルを選択
              </label>
            </div>

            {file && (
              <button
                onClick={handleCsvUpload}
                disabled={uploading}
                className={`w-full rounded-xl py-3 font-bold text-white transition-colors ${uploading ? 'cursor-not-allowed bg-medace-300' : 'bg-[linear-gradient(135deg,#66321A_0%,#F66D0B_100%)] hover:opacity-95'}`}
              >
                {uploading ? '処理中...' : 'CSVを取り込む'}
              </button>
            )}
          </div>
        )}

        {(uploading || progress > 0) && (
          <div className="mt-8">
            <div className="mb-2 flex justify-between text-sm font-medium">
              <span className="text-slate-600">ステータス</span>
              <span className="text-medace-600">{Math.round(progress)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-medace-50">
              <div className="h-3 rounded-full bg-medace-500 transition-all duration-200" style={{ width: `${progress}%` }}></div>
            </div>
          </div>
        )}

        {log.length > 0 && (
          <div className="mt-8 max-h-48 overflow-y-auto rounded-xl border border-medace-800 bg-medace-900 p-6 font-mono text-xs text-medace-100 shadow-inner">
            {log.map((line, index) => <div key={index} className="mb-1">&gt; {line}</div>)}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-red-100 bg-red-50 p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-red-500" />
          <h3 className="text-lg font-bold text-red-700">システムリセット</h3>
        </div>
        <p className="mb-4 text-sm text-red-600">
          デモ用のデータをすべて消去し、初期状態に戻します。分析データも含めて削除されます。
        </p>
        <button
          onClick={handleReset}
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-600 hover:text-white"
        >
          <Trash2 className="w-4 h-4" /> データをリセット
        </button>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-7xl space-y-8 pb-12">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-medace-500">運営画面</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-medace-900">{BRAND.officialName} 運営ダッシュボード</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-medace-900/70">
            学習状況、停滞リスク、教材運用、報告対応、AI利用を一画面で見渡せるように整理しています。
          </p>
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
          </div>

          <button
            type="button"
            onClick={fetchDashboard}
            disabled={dashboardLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-medace-200 bg-white px-4 py-2.5 text-sm font-bold text-medace-800 shadow-sm transition-colors hover:bg-medace-50 disabled:opacity-50"
          >
            {dashboardLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            最新化
          </button>
        </div>
      </div>

      {panelView === 'dashboard' ? (
        <>
          <div className="relative overflow-hidden rounded-[32px] bg-[linear-gradient(135deg,#2F1609_0%,#66321A_44%,#F66D0B_100%)] p-7 text-white shadow-[0_24px_70px_rgba(228,94,4,0.18)] md:p-8">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(255,191,82,0.28),_transparent_24%),radial-gradient(circle_at_bottom_left,_rgba(252,215,151,0.18),_transparent_22%)]"></div>
            <div className="relative">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white/70">
                  運営インサイト
                </span>
                {overview && (
                  <>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/85">
                      生徒 {overview.totalStudents} 名
                    </span>
                    <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-white/85">
                      教材 {overview.officialBookCount + overview.customBookCount} 冊
                    </span>
                  </>
                )}
              </div>
              <h2 className="mt-4 text-3xl font-black tracking-tight md:text-4xl">{headline}</h2>
              <p className="mt-4 max-w-3xl text-sm leading-relaxed text-white/78 md:text-base">{subcopy}</p>
            </div>
          </div>

          {dashboardError && (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm font-medium text-red-700">
              {dashboardError}
            </div>
          )}

          {dashboardLoading && !snapshot ? (
            <div className="flex min-h-[40vh] items-center justify-center rounded-[32px] border border-medace-100 bg-white">
              <div className="flex items-center gap-3 text-medace-700">
                <Loader2 className="h-5 w-5 animate-spin" />
                <span className="font-bold">ダッシュボードを集計中...</span>
              </div>
            </div>
          ) : snapshot ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <MetricCard
                  label="登録生徒"
                  value={`${overview?.totalStudents || 0}名`}
                  detail={`7日以内に学習した生徒は ${overview?.active7d || 0} 名です。`}
                  icon={<Users className="h-5 w-5" />}
                />
                <MetricCard
                  label="今日のアクティブ"
                  value={`${overview?.activeToday || 0}名`}
                  detail="当日中に単語へ触れた生徒数です。"
                  icon={<Activity className="h-5 w-5" />}
                />
                <MetricCard
                  label="要フォロー"
                  value={`${overview?.atRiskCount || 0}名`}
                  detail="学習が空き始めた生徒を優先順で抽出しています。"
                  icon={<ShieldAlert className="h-5 w-5" />}
                />
                <MetricCard
                  label="学習プラン設定率"
                  value={`${planCoverageRate}%`}
                  detail={`${overview?.studentsWithPlan || 0} 名が個別プランを保持しています。`}
                  icon={<Target className="h-5 w-5" />}
                />
                <MetricCard
                  label="教材総語数"
                  value={`${overview?.totalWordCount?.toLocaleString() || 0}語`}
                  detail={`公式 ${overview?.officialBookCount || 0} 冊 / 独自 ${overview?.customBookCount || 0} 冊`}
                  icon={<Database className="h-5 w-5" />}
                />
                <MetricCard
                  label="今月のAI利用"
                  value={formatCost(overview?.aiCostThisMonthMilliYen || 0)}
                  detail={`${overview?.aiRequestsThisMonth || 0} リクエスト / 通知 ${overview?.notifications7d || 0} 件`}
                  icon={<Bot className="h-5 w-5" />}
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm md:p-7">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="h-5 w-5 text-medace-600" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">推移</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">直近14日間の推移</h3>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">学習アクティブ</div>
                      <div className="mt-2 text-2xl font-black text-medace-900">
                        {snapshot.trend.reduce((sum, point) => sum + point.activeStudents, 0)}
                      </div>
                      <div className="mt-1 text-sm text-medace-900/70">延べ人数</div>
                    </div>
                    <div className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">学習更新</div>
                      <div className="mt-2 text-2xl font-black text-medace-900">
                        {snapshot.trend.reduce((sum, point) => sum + point.studiedWords, 0)}
                      </div>
                      <div className="mt-1 text-sm text-medace-900/70">単語の更新件数</div>
                    </div>
                    <div className="rounded-2xl border border-medace-100 bg-medace-50/70 px-4 py-4">
                      <div className="text-xs font-bold uppercase tracking-[0.18em] text-medace-700/70">新規登録</div>
                      <div className="mt-2 text-2xl font-black text-medace-900">
                        {snapshot.trend.reduce((sum, point) => sum + point.newStudents, 0)}
                      </div>
                      <div className="mt-1 text-sm text-medace-900/70">直近14日</div>
                    </div>
                  </div>

                  <div className="mt-6 overflow-x-auto">
                    <div className="grid min-w-[720px] grid-cols-14 gap-3">
                      {snapshot.trend.map((point) => {
                        const activeHeight = point.activeStudents > 0 ? Math.max(10, (point.activeStudents / maxTrendValue) * 120) : 0;
                        const studiedHeight = point.studiedWords > 0 ? Math.max(10, (point.studiedWords / maxTrendValue) * 120) : 0;
                        const notificationHeight = point.notifications > 0 ? Math.max(6, (point.notifications / maxTrendValue) * 120) : 0;
                        return (
                          <div key={point.date} className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4">
                            <div className="flex h-36 items-end justify-center gap-1.5">
                              <div className="w-3 rounded-full bg-medace-300" style={{ height: `${activeHeight}px` }} title={`アクティブ ${point.activeStudents}`} />
                              <div className="w-3 rounded-full bg-medace-600" style={{ height: `${studiedHeight}px` }} title={`学習 ${point.studiedWords}`} />
                              <div className="w-3 rounded-full bg-slate-300" style={{ height: `${notificationHeight}px` }} title={`通知 ${point.notifications}`} />
                            </div>
                            <div className="mt-4 text-center text-[11px] font-bold text-slate-500">{formatDateLabel(point.date)}</div>
                            <div className="mt-2 space-y-1 text-[11px] text-slate-500">
                              <div>学習 {point.studiedWords}</div>
                              <div>人 {point.activeStudents}</div>
                              <div>通知 {point.notifications}</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </section>

                <div className="space-y-6">
                  <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <Users className="h-5 w-5 text-medace-600" />
                      <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">プラン構成</p>
                        <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">プラン構成</h3>
                      </div>
                    </div>
                    <div className="mt-5 space-y-3">
                      {snapshot.planBreakdown.map((item) => {
                        const width = overview && overview.totalStudents > 0 ? Math.max(8, Math.round((item.count / overview.totalStudents) * 100)) : 0;
                        return (
                          <div key={item.plan} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${planTone(item.plan)}`}>
                                {SUBSCRIPTION_PLAN_LABELS[item.plan]}
                              </span>
                              <span className="text-sm font-bold text-slate-700">{item.count} 名</span>
                            </div>
                            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                              <div className="h-full rounded-full bg-medace-500" style={{ width: `${width}%` }}></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                    <div className="flex items-center gap-3">
                      <ShieldAlert className="h-5 w-5 text-medace-600" />
                      <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">リスク構成</p>
                        <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">リスク構成</h3>
                      </div>
                    </div>
                    <div className="mt-5 space-y-3">
                      {snapshot.riskBreakdown.map((item) => {
                        const width = overview && overview.totalStudents > 0 ? Math.max(8, Math.round((item.count / overview.totalStudents) * 100)) : 0;
                        return (
                          <div key={item.riskLevel} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex items-center justify-between gap-3">
                              <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(item.riskLevel)}`}>{item.riskLevel}</span>
                              <span className="text-sm font-bold text-slate-700">{item.count} 名</span>
                            </div>
                            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                              <div
                                className={`h-full rounded-full ${item.riskLevel === StudentRiskLevel.DANGER ? 'bg-red-500' : item.riskLevel === StudentRiskLevel.WARNING ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${width}%` }}
                              ></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <BookOpen className="h-5 w-5 text-medace-600" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">教材</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">学習されている教材</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {snapshot.topBooks.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">教材データがまだありません。</div>
                    ) : (
                      snapshot.topBooks.map((book) => (
                        <div key={book.bookId} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-slate-900">{book.title}</div>
                              <div className="mt-1 text-xs text-slate-500">{book.isOfficial ? '公式教材' : '独自教材'} / {book.wordCount.toLocaleString()} 語</div>
                            </div>
                            <span className="rounded-full border border-medace-200 bg-white px-2.5 py-1 text-xs font-bold text-medace-800">
                              平均進行 {book.averageProgress.toFixed(0)}%
                            </span>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                            <div className="rounded-2xl bg-white px-3 py-3">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習者</div>
                              <div className="mt-1 font-black text-slate-900">{book.learnerCount}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">更新</div>
                              <div className="mt-1 font-black text-slate-900">{book.learnedEntries}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">語数</div>
                              <div className="mt-1 font-black text-slate-900">{book.wordCount}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Bot className="h-5 w-5 text-medace-600" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">AI利用</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">今月のAI利用内訳</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {snapshot.aiActions.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">まだAI利用はありません。</div>
                    ) : (
                      snapshot.aiActions.map((action) => (
                        <div key={action.action} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-slate-900">{action.label}</div>
                              <div className="mt-1 text-xs text-slate-500">{action.requestCount} リクエスト</div>
                            </div>
                            <div className="text-right">
                              <div className="font-black text-slate-900">{formatCost(action.estimatedCostMilliYen)}</div>
                              <div className="mt-1 text-xs text-slate-500">{action.action}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Clock3 className="h-5 w-5 text-medace-600" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">フォロー対象</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">優先フォロー対象</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {snapshot.atRiskStudents.length === 0 ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-sm font-medium text-emerald-700">
                        いま強いフォローが必要な生徒は見当たりません。
                      </div>
                    ) : (
                      snapshot.atRiskStudents.map((student) => {
                        const daysSinceActive = student.lastActive > 0 ? Math.floor((Date.now() - student.lastActive) / 86400000) : null;
                        return (
                          <div key={student.uid} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="font-bold text-slate-900">{student.name}</div>
                                <div className="mt-1 text-xs text-slate-500">{student.email}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${riskTone(student.riskLevel)}`}>{student.riskLevel}</span>
                                <span className={`rounded-full border px-2.5 py-1 text-xs font-bold ${planTone(student.subscriptionPlan || SubscriptionPlan.TOC_FREE)}`}>
                                  {SUBSCRIPTION_PLAN_LABELS[student.subscriptionPlan || SubscriptionPlan.TOC_FREE]}
                                </span>
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                              <div className="rounded-2xl bg-white px-3 py-3">
                                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">学習語数</div>
                                <div className="mt-1 font-black text-slate-900">{student.totalLearned}</div>
                              </div>
                              <div className="rounded-2xl bg-white px-3 py-3">
                                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">正答率</div>
                                <div className="mt-1 font-black text-slate-900">{Math.round((student.accuracy || 0) * 100)}%</div>
                              </div>
                              <div className="rounded-2xl bg-white px-3 py-3">
                                <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">最終学習</div>
                                <div className="mt-1 font-black text-slate-900">{daysSinceActive === null ? '未学習' : `${daysSinceActive}日`}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </section>

                <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <Users className="h-5 w-5 text-medace-600" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">所属別</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">所属別の概況</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {snapshot.organizations.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">所属データはまだありません。</div>
                    ) : (
                      snapshot.organizations.map((organization) => (
                        <div key={organization.organizationName} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="font-bold text-slate-900">{organization.organizationName}</div>
                            <div className="text-sm font-bold text-slate-700">{organization.studentCount} 名</div>
                          </div>
                          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                            <div className="rounded-2xl bg-white px-3 py-3">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">7日内学習</div>
                              <div className="mt-1 font-black text-slate-900">{organization.active7dCount}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">有料</div>
                              <div className="mt-1 font-black text-slate-900">{organization.paidCount}</div>
                            </div>
                            <div className="rounded-2xl bg-white px-3 py-3">
                              <div className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">平均学習語数</div>
                              <div className="mt-1 font-black text-slate-900">{organization.averageLearnedWords}</div>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <BellRing className="h-5 w-5 text-medace-600" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">通知履歴</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">直近のフォロー通知</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {snapshot.recentNotifications.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">通知送信履歴はまだありません。</div>
                    ) : (
                      snapshot.recentNotifications.map((notification) => (
                        <div key={notification.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="font-bold text-slate-900">{notification.studentName}さんへ送信</div>
                              <div className="mt-1 text-xs text-slate-500">{notification.instructorName} / {notification.triggerReason}</div>
                            </div>
                            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600">
                              {notification.usedAi ? 'AI下書き' : '手動'}
                            </span>
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-slate-700">{notification.message}</p>
                          <div className="mt-3 text-xs text-slate-400">{formatDateTime(notification.createdAt)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </section>

                <section className="rounded-[32px] border border-medace-100 bg-white p-6 shadow-sm">
                  <div className="flex items-center gap-3">
                    <MessageSquareText className="h-5 w-5 text-medace-600" />
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">報告履歴</p>
                      <h3 className="mt-1 text-xl font-black tracking-tight text-slate-950">直近の報告</h3>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {snapshot.recentReports.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">報告はまだありません。</div>
                    ) : (
                      snapshot.recentReports.map((report) => (
                        <div key={report.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-bold text-slate-900">{report.word}</div>
                              <div className="mt-1 text-xs text-slate-500">{report.bookTitle} / {report.reporterName}</div>
                            </div>
                            <div className="text-xs text-slate-400">{formatDateTime(report.createdAt)}</div>
                          </div>
                          <p className="mt-3 text-sm leading-relaxed text-slate-700">{report.reason}</p>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </>
          ) : null}
        </>
      ) : (
        contentOps
      )}
    </div>
  );
};

export default AdminPanel;
