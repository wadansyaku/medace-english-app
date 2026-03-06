import React, { useEffect, useMemo, useRef, useState } from 'react';
import { STATUS_LABELS, StudentSummary, StudentWorksheetSnapshot, UserProfile, WorksheetQuestionMode } from '../types';
import { storage } from '../services/storage';
import { GeneratedWorksheetQuestion, generateWorksheetQuestions, WORKSHEET_MODE_COPY } from '../utils/worksheet';
import { BookOpen, ExternalLink, Eye, FileDown, Loader2, Printer, ShieldCheck, X } from 'lucide-react';

type WorksheetStatusFilter = 'ALL' | 'REVIEW_PLUS' | 'GRADUATED_ONLY';

interface WorksheetPrintLauncherProps {
  user: UserProfile;
  buttonLabel?: string;
  buttonClassName?: string;
}

type WorksheetPrintVariant = 'HANDOUT' | 'ANSWER_KEY';

const STATUS_FILTER_COPY: Record<WorksheetStatusFilter, { label: string; description: string; }> = {
  ALL: {
    label: '学習済みすべて',
    description: '習得中を含めて、学習履歴がある単語を出題します。',
  },
  REVIEW_PLUS: {
    label: '復習期以上',
    description: '復習期と定着済みを中心に、確認テスト向けに絞ります。',
  },
  GRADUATED_ONLY: {
    label: '定着済みのみ',
    description: '一度定着した語彙だけを再確認したいときに使います。',
  },
};

const formatDate = (timestamp: number): string => new Date(timestamp).toLocaleString('ja-JP', {
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const shouldIncludeStatus = (filter: WorksheetStatusFilter, status: string): boolean => {
  if (filter === 'GRADUATED_ONLY') return status === 'graduated';
  if (filter === 'REVIEW_PLUS') return status === 'review' || status === 'graduated';
  return true;
};

const MAX_PRINTABLE_WORDS = 40;

const PRINT_VARIANT_COPY: Record<WorksheetPrintVariant, {
  label: string;
  shortLabel: string;
  description: string;
  previewNote: string;
}> = {
  HANDOUT: {
    label: '問題',
    shortLabel: '問題',
    description: '答え欄を空欄にした問題シートです。鉛筆で書き込みやすい余白を確保します。',
    previewNote: '答え欄を空欄にした問題シートです。書き込み用の余白を確保しています。',
  },
  ANSWER_KEY: {
    label: '解答',
    shortLabel: '解答',
    description: '問題シートと同じ答え欄に、正解を赤字で記入した解答シートです。',
    previewNote: '問題シートと同じ答え欄に、正解を赤字で記入した解答シートです。',
  },
};

const buildPrintableWorksheetHtml = (
  user: UserProfile,
  student: StudentSummary | undefined,
  snapshot: StudentWorksheetSnapshot,
  questions: GeneratedWorksheetQuestion[],
  variant: WorksheetPrintVariant,
): string => {
  const variantCopy = PRINT_VARIANT_COPY[variant];
  const isProblemSheet = variant === 'HANDOUT';
  const modeLabel = questions[0] ? WORKSHEET_MODE_COPY[questions[0].mode].label : '問題';
  const promptColumnLabel = questions[0]?.mode === 'EN_TO_JA'
    ? '英単語'
    : questions[0]?.mode === 'JA_TO_EN'
      ? '日本語'
      : '意味 / ヒント';
  const answerLabel = questions[0]?.mode === 'EN_TO_JA' ? '和訳' : '答え';
  const wordsPerColumn = Math.ceil(questions.length / 2);
  const footerNote = isProblemSheet
    ? '問題: 答え欄は空欄です。鉛筆で書き込みながら確認できます。'
    : '解答: 問題シートと同じ答え欄に、赤字で正解を記入しています。';
  const questionColumns = [
    questions.slice(0, wordsPerColumn),
    questions.slice(wordsPerColumn),
  ];

  const columnMarkup = questionColumns.map((column, columnIndex) => `
    <section class="table-column" data-column="${columnIndex + 1}">
      <table class="word-table" aria-label="worksheet column ${columnIndex + 1}">
        <thead>
          <tr>
            <th class="index-head">No.</th>
            <th>${promptColumnLabel}</th>
            <th class="answer-head">${answerLabel}</th>
          </tr>
        </thead>
        <tbody>
      ${column.map((question, index) => {
        const questionIndex = columnIndex * wordsPerColumn + index + 1;
        const promptText = question.mode === 'SPELLING_HINT'
          ? `${question.promptText} / ${question.maskedAnswer || question.answer}`
          : question.promptText;
        const answerMarkup = isProblemSheet
          ? `
            <div class="answer-blank" aria-label="${answerLabel}記入欄">
              <span class="answer-line"></span>
            </div>
          `
          : `
            <div class="answer-blank answer-blank--filled" aria-label="${answerLabel}解答欄">
              <span class="answer-fill">${question.answer}</span>
              <span class="answer-line"></span>
            </div>
          `;
        return `
          <tr>
            <td class="index-cell">${questionIndex}</td>
            <td class="prompt-cell">${promptText}</td>
            <td class="answer-cell ${isProblemSheet ? 'answer-cell--blank' : 'answer-cell--key'}">${answerMarkup}</td>
          </tr>
        `;
      }).join('')}
        </tbody>
      </table>
    </section>
  `).join('');

  return `<!DOCTYPE html>
  <html lang="ja">
    <head>
      <meta charset="UTF-8" />
      <title>${snapshot.studentName} - ${modeLabel} ワークシート (${variantCopy.label})</title>
      <style>
        :root {
          color-scheme: light;
          --ink: #1f2937;
          --muted: #6b7280;
          --line: #d1d5db;
          --accent: #f66d0b;
          --soft: #fff7ed;
        }
        * {
          box-sizing: border-box;
        }
        body {
          margin: 0;
          font-family: "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
          color: var(--ink);
          background: white;
        }
        .page {
          width: 210mm;
          min-height: 297mm;
          padding: 4.8mm 4.8mm 4mm;
        }
        .sheet-header {
          border: 1.3px solid var(--accent);
          border-radius: 4mm;
          padding: 2.35mm 2.8mm;
          background: linear-gradient(135deg, #fff7ed 0%, #ffffff 100%);
        }
        .header-top {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 3mm;
        }
        .eyebrow {
          font-size: 6.9pt;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--muted);
          font-weight: 700;
        }
        .title {
          margin: 1mm 0 0;
          font-size: 14.1pt;
          font-weight: 800;
          line-height: 1.15;
        }
        .header-chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 1.2mm;
        }
        .chip {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          border-radius: 999px;
          background: #fff1e5;
          border: 1px solid #fed7aa;
          color: #9a3412;
          font-size: 7pt;
          font-weight: 800;
          padding: 1.3mm 2.2mm;
        }
        .chip-subtle {
          background: white;
          border-color: #fdba74;
          color: #c2410c;
        }
        .meta-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 1.5mm;
          margin-top: 1.5mm;
        }
        .meta-card {
          border: 1px solid var(--line);
          border-radius: 2.6mm;
          padding: 1.3mm 1.6mm;
          background: white;
        }
        .meta-card .label {
          font-size: 6pt;
          font-weight: 700;
          color: var(--muted);
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .meta-card .value {
          margin-top: 0.4mm;
          font-size: 7.1pt;
          font-weight: 800;
          line-height: 1.15;
        }
        .sheet-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 2.2mm;
          margin-top: 1.8mm;
        }
        .table-column {
          min-width: 0;
        }
        .word-table {
          width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          table-layout: fixed;
          background: white;
        }
        .word-table th {
          border: 1px solid #fdba74;
          background: #fff4e8;
          color: #9a3412;
          font-size: 6.2pt;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          padding: 1mm 1.2mm;
          line-height: 1.1;
        }
        .word-table th:first-child {
          border-top-left-radius: 2.2mm;
        }
        .word-table th:last-child {
          border-top-right-radius: 2.2mm;
        }
        .word-table td {
          border-right: 1px solid var(--line);
          border-bottom: 1px solid var(--line);
          padding: 0.9mm 1.15mm;
          vertical-align: middle;
          background: white;
          line-height: 1.15;
          break-inside: avoid;
        }
        .word-table td:first-child {
          border-left: 1px solid var(--line);
        }
        .index-head, .index-cell {
          width: 8mm;
          text-align: center;
        }
        .answer-head, .answer-cell {
          width: 56%;
        }
        .index-cell {
          font-size: 7pt;
          font-weight: 800;
          color: #c2410c;
          background: #fffaf5;
        }
        .prompt-cell {
          font-size: 7.25pt;
          font-weight: 800;
          color: #1f2937;
          word-break: break-word;
        }
        .answer-cell {
          word-break: break-word;
        }
        .answer-cell--blank {
          padding: 0.5mm 1.15mm;
          background: white;
        }
        .answer-cell--key {
          padding: 0.5mm 1.15mm;
          background: #fff8f8;
        }
        .answer-blank {
          min-height: 8.6mm;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 0.35mm;
        }
        .answer-blank--filled {
          gap: 0.5mm;
        }
        .answer-fill {
          font-size: 6.45pt;
          font-weight: 800;
          color: #dc2626;
          line-height: 1.12;
        }
        .answer-line {
          display: block;
          width: 100%;
          border-bottom: 1px solid #cbd5e1;
        }
        .word-table tbody tr:last-child td:first-child {
          border-bottom-left-radius: 2.2mm;
        }
        .word-table tbody tr:last-child td:last-child {
          border-bottom-right-radius: 2.2mm;
        }
        .footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 2mm;
          margin-top: 1.2mm;
          font-size: 6.2pt;
          color: var(--muted);
          line-height: 1.15;
        }
        @page {
          size: A4 portrait;
          margin: 0;
        }
        @media print {
          body {
            padding: 0;
          }
          .page {
            padding: 4.8mm 4.8mm 4mm;
          }
        }
        @media screen {
          body {
            background: #e2e8f0;
            padding: 12px;
          }
          .page {
            margin: 0 auto;
            box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
          }
        }
        @media print, screen {
          body {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      </style>
    </head>
    <body>
      <main class="page">
        <header class="sheet-header">
          <div class="header-top">
            <div>
              <div class="eyebrow">Vocabulary Check Sheet</div>
              <h1 class="title">${snapshot.studentName} さん用 ${modeLabel} チェック</h1>
            </div>
            <div class="header-chips">
              <div class="chip chip-subtle">${variantCopy.label}</div>
              <div class="chip">A4 / 2列 / 最大 ${MAX_PRINTABLE_WORDS} 語</div>
            </div>
          </div>
          <div class="meta-grid">
            <div class="meta-card">
              <div class="label">作成者</div>
              <div class="value">${user.displayName}</div>
            </div>
            <div class="meta-card">
              <div class="label">生徒</div>
              <div class="value">${student?.name || snapshot.studentName}</div>
            </div>
            <div class="meta-card">
              <div class="label">語数</div>
              <div class="value">${questions.length} / ${MAX_PRINTABLE_WORDS}</div>
            </div>
            <div class="meta-card">
              <div class="label">作成日時</div>
              <div class="value">${formatDate(Date.now())}</div>
            </div>
          </div>
        </header>

        <section class="sheet-grid">${columnMarkup}</section>

        <footer class="footer">
          <span>${footerNote}</span>
          <span>${snapshot.organizationName || 'Steady Study'}</span>
        </footer>
      </main>
    </body>
  </html>`;
};

const WorksheetPrintLauncher: React.FC<WorksheetPrintLauncherProps> = ({
  user,
  buttonLabel = 'PDF問題を作る',
  buttonClassName = 'inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-300 hover:text-medace-700',
}) => {
  const [open, setOpen] = useState(false);
  const [students, setStudents] = useState<StudentSummary[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [snapshotLoading, setSnapshotLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<StudentWorksheetSnapshot | null>(null);
  const [selectedStudentUid, setSelectedStudentUid] = useState('');
  const [selectedBookId, setSelectedBookId] = useState('ALL');
  const [questionCount, setQuestionCount] = useState(MAX_PRINTABLE_WORDS);
  const [questionMode, setQuestionMode] = useState<WorksheetQuestionMode>('EN_TO_JA');
  const [statusFilter, setStatusFilter] = useState<WorksheetStatusFilter>('ALL');
  const [error, setError] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewVariant, setPreviewVariant] = useState<WorksheetPrintVariant>('HANDOUT');
  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (!open) return;

    const loadStudents = async () => {
      setStudentsLoading(true);
      setError(null);
      try {
        const nextStudents = await storage.getAllStudentsProgress();
        setStudents(nextStudents);
        if (!selectedStudentUid && nextStudents[0]) {
          setSelectedStudentUid(nextStudents[0].uid);
        }
      } catch (loadError) {
        console.error(loadError);
        setError((loadError as Error).message || '生徒一覧の取得に失敗しました。');
      } finally {
        setStudentsLoading(false);
      }
    };

    loadStudents();
  }, [open, selectedStudentUid]);

  useEffect(() => {
    if (!open || !selectedStudentUid) return;

    const loadSnapshot = async () => {
      setSnapshotLoading(true);
      setError(null);
      try {
        const nextSnapshot = await storage.getStudentWorksheetSnapshot(selectedStudentUid);
        setSnapshot(nextSnapshot);
      } catch (loadError) {
        console.error(loadError);
        setError((loadError as Error).message || '印刷対象データの取得に失敗しました。');
      } finally {
        setSnapshotLoading(false);
      }
    };

    loadSnapshot();
  }, [open, selectedStudentUid]);

  const selectedStudent = students.find((student) => student.uid === selectedStudentUid);

  const bookOptions = useMemo(() => {
    const map = new Map<string, string>();
    snapshot?.words.forEach((word) => {
      map.set(word.bookId, word.bookTitle);
    });
    return [...map.entries()].map(([bookId, title]) => ({ bookId, title }));
  }, [snapshot]);

  const filteredWords = useMemo(() => {
    if (!snapshot) return [];

    return snapshot.words.filter((word) => {
      if (selectedBookId !== 'ALL' && word.bookId !== selectedBookId) return false;
      return shouldIncludeStatus(statusFilter, word.status);
    });
  }, [selectedBookId, snapshot, statusFilter]);

  const generatedQuestions = useMemo(() => {
    if (!snapshot || filteredWords.length === 0) return [];
    return generateWorksheetQuestions(filteredWords, questionMode, Math.min(questionCount, MAX_PRINTABLE_WORDS));
  }, [filteredWords, questionCount, questionMode, snapshot]);

  const printableHtmlByVariant = useMemo<Record<WorksheetPrintVariant, string>>(() => {
    if (!snapshot || generatedQuestions.length === 0) {
      return {
        HANDOUT: '',
        ANSWER_KEY: '',
      };
    }
    return {
      HANDOUT: buildPrintableWorksheetHtml(user, selectedStudent, snapshot, generatedQuestions, 'HANDOUT'),
      ANSWER_KEY: buildPrintableWorksheetHtml(user, selectedStudent, snapshot, generatedQuestions, 'ANSWER_KEY'),
    };
  }, [generatedQuestions, selectedStudent, snapshot, user]);

  const printableHtml = printableHtmlByVariant[previewVariant];
  const previewVariantCopy = PRINT_VARIANT_COPY[previewVariant];

  useEffect(() => {
    if (!open) {
      setShowPreview(false);
      setPreviewVariant('HANDOUT');
    }
  }, [open]);

  const handleOpenPreview = (variant: WorksheetPrintVariant) => {
    if (generatedQuestions.length === 0) {
      setError('問題に使える単語が不足しています。条件を緩めてください。');
      return;
    }
    setError(null);
    setPreviewVariant(variant);
    setShowPreview(true);
  };

  const handlePrint = () => {
    const previewWindow = previewFrameRef.current?.contentWindow;
    if (!previewWindow || !printableHtml) {
      setError('印刷プレビューの準備ができていません。もう一度お試しください。');
      return;
    }

    previewWindow.focus();
    previewWindow.print();
  };

  const handleOpenInNewTab = () => {
    if (!printableHtml) {
      setError('プレビュー用データを作成できませんでした。');
      return;
    }

    const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
    const previewUrl = URL.createObjectURL(blob);
    const printWindow = window.open(previewUrl, '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!printWindow) {
      URL.revokeObjectURL(previewUrl);
      setError('プレビュータブを開けませんでした。ポップアップを許可してください。');
      return;
    }
    window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000);
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClassName}>
        <FileDown className="h-4 w-4" />
        {buttonLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-medace-900/35 p-4 backdrop-blur-sm">
          <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-4 top-4 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">PDF Worksheet</p>
                <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">学習済み単語を A4 1枚で確認する</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">
                  問題と解答を分けて作れます。解答は問題シートと同じ欄に赤字で答えを入れ、主に英語から和訳を確認しやすい A4 1枚の確認シートです。
                </p>
              </div>
              <div className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
                A4 / 2列 / 最大40語
              </div>
            </div>

            {error && (
              <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
              <div className="space-y-4">
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">対象生徒</label>
                  <select
                    value={selectedStudentUid}
                    onChange={(event) => setSelectedStudentUid(event.target.value)}
                    disabled={studentsLoading}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                  >
                    <option value="">生徒を選択</option>
                    {students.map((student) => (
                      <option key={student.uid} value={student.uid}>
                        {student.name} / {student.organizationName || '個人利用'}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">出題書籍</label>
                  <select
                    value={selectedBookId}
                    onChange={(event) => setSelectedBookId(event.target.value)}
                    disabled={snapshotLoading || bookOptions.length === 0}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                  >
                    <option value="ALL">すべての単語帳</option>
                    {bookOptions.map((book) => (
                      <option key={book.bookId} value={book.bookId}>{book.title}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">出題モード</label>
                  <div className="grid gap-3">
                    {(Object.keys(WORKSHEET_MODE_COPY) as WorksheetQuestionMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setQuestionMode(mode)}
                        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                          questionMode === mode
                            ? 'border-medace-500 bg-medace-50'
                            : 'border-slate-200 bg-slate-50 hover:border-medace-200 hover:bg-white'
                        }`}
                      >
                        <div className="text-sm font-bold text-slate-900">{WORKSHEET_MODE_COPY[mode].label}</div>
                        <div className="mt-1 text-sm text-slate-500">{WORKSHEET_MODE_COPY[mode].description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">学習ステータス</label>
                  <div className="grid gap-3">
                    {(Object.keys(STATUS_FILTER_COPY) as WorksheetStatusFilter[]).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setStatusFilter(filter)}
                        className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                          statusFilter === filter
                            ? 'border-medace-500 bg-medace-50'
                            : 'border-slate-200 bg-slate-50 hover:border-medace-200 hover:bg-white'
                        }`}
                      >
                        <div className="text-sm font-bold text-slate-900">{STATUS_FILTER_COPY[filter].label}</div>
                        <div className="mt-1 text-sm text-slate-500">{STATUS_FILTER_COPY[filter].description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-[0.14em] text-slate-500">問題数</label>
                  <input
                    type="number"
                    min={4}
                    max={MAX_PRINTABLE_WORDS}
                    value={questionCount}
                    onChange={(event) => setQuestionCount(Math.max(4, Math.min(MAX_PRINTABLE_WORDS, Number(event.target.value) || 4)))}
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-800 outline-none focus:border-medace-500 focus:ring-2 focus:ring-medace-100"
                  />
                  <p className="mt-2 text-xs text-slate-500">A4 1ページに収める前提で、最大 {MAX_PRINTABLE_WORDS} 語まで出力します。</p>
                </div>
              </div>

              <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(135deg,#fff9f2_0%,#ffffff_100%)] p-5">
                {(studentsLoading || snapshotLoading) ? (
                  <div className="flex min-h-[420px] flex-col items-center justify-center text-slate-500">
                    <Loader2 className="h-8 w-8 animate-spin text-medace-500" />
                    <div className="mt-3 text-sm font-medium">印刷データを準備中...</div>
                  </div>
                ) : snapshot ? (
                  <>
                    <div className="flex items-center gap-3 text-medace-700">
                      <ShieldCheck className="h-5 w-5" />
                      <span className="text-sm font-bold">出題プレビュー</span>
                    </div>
                    <h4 className="mt-3 text-xl font-black tracking-tight text-slate-950">
                      {snapshot.studentName} さん向けワークシート
                    </h4>
                    <p className="mt-2 text-sm leading-relaxed text-slate-500">
                      条件に合う学習済み単語から、紙配布しやすい問題形式で出力します。
                    </p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">対象語数</div>
                        <div className="mt-2 text-3xl font-black text-slate-950">{filteredWords.length}</div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                        <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">出力数</div>
                        <div className="mt-2 text-3xl font-black text-slate-950">{Math.min(questionCount, filteredWords.length)}</div>
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                      {[
                        { label: '習得中', count: filteredWords.filter((word) => word.status === 'learning').length },
                        { label: '復習期', count: filteredWords.filter((word) => word.status === 'review').length },
                        { label: '定着済', count: filteredWords.filter((word) => word.status === 'graduated').length },
                      ].map((item) => (
                        <div key={item.label} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">{item.label}</div>
                          <div className="mt-2 text-2xl font-black text-slate-950">{item.count}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 rounded-3xl border border-slate-200 bg-white px-4 py-4">
                      <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                        <BookOpen className="h-4 w-4 text-medace-600" />
                        問題候補
                      </div>
                      <div className="mt-3 space-y-2">
                        {filteredWords.slice(0, 6).map((word) => (
                          <div key={word.wordId} className="flex items-start justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50 px-3 py-3">
                            <div>
                              <div className="text-sm font-bold text-slate-900">{word.word}</div>
                              <div className="mt-1 text-sm text-slate-500">{word.definition}</div>
                            </div>
                            <div className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500">
                              {STATUS_LABELS[word.status]}
                            </div>
                          </div>
                        ))}
                        {filteredWords.length === 0 && (
                          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-800">
                            条件に合う学習済み単語がありません。書籍かステータス条件を緩めてください。
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      {(Object.keys(PRINT_VARIANT_COPY) as WorksheetPrintVariant[]).map((variant) => (
                        <div key={variant} className="rounded-2xl border border-slate-200 bg-white px-4 py-4">
                          <div className="text-sm font-bold text-slate-900">{PRINT_VARIANT_COPY[variant].label}</div>
                          <div className="mt-1 text-sm leading-relaxed text-slate-500">{PRINT_VARIANT_COPY[variant].description}</div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:justify-end">
                      <button
                        type="button"
                        onClick={() => setOpen(false)}
                        className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                      >
                        閉じる
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenPreview('HANDOUT')}
                        disabled={generatedQuestions.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl border border-medace-200 bg-white px-5 py-3 text-sm font-bold text-medace-700 hover:bg-medace-50 disabled:opacity-50"
                      >
                        <Eye className="h-4 w-4" />
                        問題を開く
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenPreview('ANSWER_KEY')}
                        disabled={generatedQuestions.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded-2xl bg-medace-700 px-5 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50"
                      >
                        <Eye className="h-4 w-4" />
                        解答を開く
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex min-h-[420px] flex-col items-center justify-center rounded-3xl border border-dashed border-slate-200 bg-white text-slate-500">
                    <div className="text-sm">生徒を選ぶと印刷候補を表示します。</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {open && showPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-medace-900/45 p-4 backdrop-blur-sm"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setShowPreview(false);
            }
          }}
        >
          <div className="relative flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
              <div>
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Print Preview</div>
                <div className="mt-1 text-lg font-black text-slate-950">
                  {snapshot?.studentName || '生徒'} さん向け {previewVariantCopy.label}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  {previewVariantCopy.previewNote} 印刷ダイアログで「PDF に保存」を選ぶと、そのまま PDF にできます。
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(Object.keys(PRINT_VARIANT_COPY) as WorksheetPrintVariant[]).map((variant) => (
                    <button
                      key={variant}
                      type="button"
                      onClick={() => setPreviewVariant(variant)}
                      className={`rounded-full border px-3 py-1.5 text-xs font-bold transition-colors ${
                        previewVariant === variant
                          ? 'border-medace-500 bg-medace-50 text-medace-700'
                          : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {PRINT_VARIANT_COPY[variant].label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleOpenInNewTab}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  この版を新しいタブで開く
                </button>
                <button
                  type="button"
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
                >
                  <Printer className="h-4 w-4" />
                  この版を印刷 / PDF保存
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                  閉じる
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 bg-slate-100 p-3">
              {printableHtml ? (
                <iframe
                  ref={previewFrameRef}
                  title="Worksheet print preview"
                  srcDoc={printableHtml}
                  className="h-full w-full rounded-[24px] border border-slate-200 bg-white"
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-[24px] border border-dashed border-slate-300 bg-white text-sm text-slate-500">
                  プレビューを作成できませんでした。
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default WorksheetPrintLauncher;
