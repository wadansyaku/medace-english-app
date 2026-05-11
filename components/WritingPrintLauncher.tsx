import React, { useMemo, useState } from 'react';
import { ExternalLink, Eye, FileDown, Printer } from 'lucide-react';
import type { WritingAssignment } from '../types';
import { buildSubmissionQrSvg, encodeSubmissionMarker } from '../utils/writing';
import ModalOverlay from './ModalOverlay';

interface WritingPrintLauncherProps {
  assignment: WritingAssignment | null;
  buttonLabel?: string;
  buttonClassName?: string;
}

const buildPrintableAssignmentHtml = (assignment: WritingAssignment): string => {
  const attemptNo = Math.min(assignment.attemptCount + 1, assignment.maxAttempts);
  const markerValue = encodeSubmissionMarker(assignment.id, assignment.submissionCode, attemptNo);
  const qrSvg = buildSubmissionQrSvg(markerValue);

  return `<!DOCTYPE html>
  <html lang="ja">
    <head>
      <meta charset="UTF-8" />
      <title>${assignment.studentName} - ${assignment.promptTitle}</title>
      <style>
        :root {
          --ink: #0f172a;
          --muted: #475569;
          --line: #dbe4ef;
          --accent: #ff8216;
          --soft: #fff8f1;
        }
        * { box-sizing: border-box; }
        body { margin: 0; font-family: "Hiragino Sans", "Noto Sans JP", sans-serif; color: var(--ink); background: white; }
        .page { width: 210mm; min-height: 297mm; padding: 7mm; }
        .hero { border: 1px solid #fed7aa; border-radius: 18px; padding: 16px; background: #fff8f1; }
        .eyebrow { font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted); }
        .title { margin: 8px 0 0; font-size: 25px; font-weight: 900; line-height: 1.2; }
        .meta-grid { display: grid; grid-template-columns: 1.1fr 1fr 1fr 0.92fr; gap: 10px; margin-top: 14px; }
        .meta-card { border: 1px solid var(--line); border-radius: 14px; padding: 12px; background: white; min-height: 72px; }
        .meta-label { font-size: 10px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; color: var(--muted); }
        .meta-value { margin-top: 6px; font-size: 14px; font-weight: 800; }
        .layout { margin-top: 12px; display: grid; grid-template-columns: 1.22fr 0.78fr; gap: 12px; }
        .panel { border: 1px solid var(--line); border-radius: 18px; padding: 14px; background: white; }
        .panel-title { margin: 0 0 10px; font-size: 16px; font-weight: 900; }
        .prompt { font-size: 14px; line-height: 1.8; }
        .note { margin-top: 10px; padding: 10px 12px; border-radius: 12px; background: #f8fafc; color: var(--muted); font-size: 12px; line-height: 1.7; }
        .code { margin-top: 10px; font-family: "SFMono-Regular", "Menlo", monospace; font-size: 13px; font-weight: 700; word-break: break-all; }
        .qr { display: grid; place-items: center; min-height: 112px; border-radius: 14px; background: #f8fafc; padding: 10px; }
        .lines { margin-top: 14px; display: grid; gap: 10px; }
        .line { border-bottom: 1px solid #cbd5e1; min-height: 38px; }
        .footer { margin-top: 12px; display: flex; justify-content: space-between; gap: 12px; font-size: 11px; color: var(--muted); }
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>
      <div class="page">
        <section class="hero">
          <div class="eyebrow">Writing Assignment</div>
          <h1 class="title">${assignment.promptTitle}</h1>
          <div class="meta-grid">
            <div class="meta-card">
              <div class="meta-label">Student</div>
              <div class="meta-value">${assignment.studentName}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">語数</div>
              <div class="meta-value">${assignment.wordCountMin} - ${assignment.wordCountMax} words</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">提出コード</div>
              <div class="meta-value">${assignment.submissionCode}</div>
            </div>
            <div class="meta-card">
              <div class="meta-label">提出回数</div>
              <div class="meta-value">${attemptNo} / ${assignment.maxAttempts}</div>
            </div>
          </div>
        </section>
        <section class="layout">
          <div class="panel">
            <h2 class="panel-title">設問</h2>
            <div class="prompt">${assignment.promptText}</div>
            <div class="note">${assignment.guidance}</div>
            <div class="lines">
              ${Array.from({ length: 10 }).map(() => '<div class="line"></div>').join('')}
            </div>
          </div>
          <div class="panel">
            <h2 class="panel-title">提出マーカー</h2>
            <div class="qr">${qrSvg}</div>
            <div class="code">${markerValue}</div>
            <div class="note">
              生徒スマホまたは校舎スキャナーで提出するときは、この提出コードが一致する答案として扱われます。
            </div>
          </div>
        </section>
        <div class="footer">
          <span>${assignment.organizationName}</span>
          <span>Instructor: ${assignment.instructorName}</span>
        </div>
      </div>
    </body>
  </html>`;
};

const WritingPrintLauncher: React.FC<WritingPrintLauncherProps> = ({
  assignment,
  buttonLabel = '問題を印刷する',
  buttonClassName = 'inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800 disabled:opacity-50',
}) => {
  const [open, setOpen] = useState(false);
  const printableHtml = useMemo(() => (assignment ? buildPrintableAssignmentHtml(assignment) : ''), [assignment]);

  const handleDownload = () => {
    if (!printableHtml || !assignment) return;
    const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${assignment.studentName}-${assignment.promptTitle}.html`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenExternal = () => {
    if (!printableHtml) return;
    const blob = new Blob([printableHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank', 'noopener,noreferrer,width=1200,height=900');
    if (!win) return;
    win.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
  };

  return (
    <>
      <button
        type="button"
        data-testid="writing-print-launcher"
        disabled={!assignment}
        onClick={() => setOpen(true)}
        className={buttonClassName}
      >
        <Printer className="h-4 w-4" />
        {buttonLabel}
      </button>

      {open && assignment && (
        <ModalOverlay
          onClose={() => setOpen(false)}
          panelClassName="max-w-6xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">Writing Print</p>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-950">{assignment.promptTitle}</h3>
              <p className="mt-2 text-sm text-slate-500">
                提出コードと印刷レイアウトを確認してから、そのまま印刷または別タブで開けます。
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleOpenExternal}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
              >
                <ExternalLink className="h-4 w-4" />
                別タブで開く
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:border-medace-200 hover:text-medace-700"
              >
                <Eye className="h-4 w-4" />
                印刷ダイアログ
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-2 rounded-2xl bg-medace-700 px-4 py-3 text-sm font-bold text-white hover:bg-medace-800"
              >
                <FileDown className="h-4 w-4" />
                HTML保存
              </button>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-200 bg-slate-50">
            <iframe
              title="Writing print preview"
              srcDoc={printableHtml}
              className="min-h-[72vh] w-full bg-white"
            />
          </div>
        </ModalOverlay>
      )}
    </>
  );
};

export default WritingPrintLauncher;
