import { useEffect, useRef, useState } from 'react';
import type { GenerateWritingAiDraftRequest, SaveWritingInputDraftRequest, WritingAiCapabilities, WritingAiDraftResponse, WritingDraftOperation, WritingInputDraft } from '../contracts/writing-ai-drafts';
import { generateWritingAiDraft, getWritingAiCapabilities, getWritingAiDraft, getWritingInputDraft, saveWritingInputDraft } from '../services/writingAiDrafts';
import { calculateWritingAssetSha256Base64, createWritingUploadUrl, uploadWritingAsset } from '../services/writing';
import { resolveWritingUploadMimeType, validateWritingSubmissionFiles } from '../utils/writingSubmissionValidation';
import { resolveWritingUploadRetryCache, type WritingUploadRetryCache } from '../utils/writingUploadRetry';

export const useWritingDraftEditor = (assignmentId: string, attemptNo: number) => {
  const [capabilities, setCapabilities] = useState<WritingAiCapabilities | null>(null);
  const [saved, setSaved] = useState<WritingInputDraft | null>(null);
  const [manual, setManual] = useState('');
  const [assetsChanged, setAssetsChanged] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [aiDraft, setAiDraft] = useState<WritingAiDraftResponse | null>(null);
  const lock = useRef(false);
  const scope = useRef('');
  const version = useRef(0);
  const uploads = useRef<WritingUploadRetryCache | null>(null);
  const saveRequest = useRef<{ signature: string; request: SaveWritingInputDraftRequest } | null>(null);
  const aiRequest = useRef<GenerateWritingAiDraftRequest | null>(null);
  const currentScope = `${assignmentId}:${attemptNo}`;
  scope.current = currentScope;

  const reload = async (preserveManual = true) => {
    if (lock.current) return;
    const requestVersion = ++version.current;
    setLoading(true); setLoaded(false); setError(null);
    const [cap, input] = await Promise.allSettled([getWritingAiCapabilities(assignmentId), getWritingInputDraft(assignmentId, attemptNo)]);
    if (scope.current !== currentScope || version.current !== requestVersion) return;
    setCapabilities(cap.status === 'fulfilled' ? cap.value : null);
    if (input.status === 'fulfilled' && (!input.value.draft || (input.value.draft.assignmentId === assignmentId && input.value.draft.attemptNo === attemptNo))) {
      setSaved(input.value.draft); setAssetsChanged(false); setLoaded(true);
      if (!preserveManual) setManual(input.value.draft?.manualTranscript || '');
      setNotice(input.value.draft ? '保存済みの入力を復元しました（未評価）。' : null);
      saveRequest.current = null;
    } else setError('下書きの復元を確認できません。入力を保持しています。再取得してから保存してください。');
    setLoading(false);
  };
  useEffect(() => {
    setCapabilities(null); setSaved(null); setManual(''); setFiles([]); setNotice(null); setAiDraft(null);
    uploads.current = null; saveRequest.current = null; aiRequest.current = null;
    void reload(false);
    return () => { version.current += 1; scope.current = ''; };
  }, [assignmentId, attemptNo]);

  const save = async () => {
    if (lock.current || !loaded || loading) return;
    if (!manual.trim() && files.length === 0 && !saved?.assets.length) { setError('本文または答案ファイルを入力してください。'); return; }
    const validation = validateWritingSubmissionFiles(files);
    if (files.length > 0 && !validation.valid) { setError(validation.message); return; }
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const assets = saved?.assets || [];
      const mimes = [...assets.map(asset => asset.mimeType), ...files.map(resolveWritingUploadMimeType)];
      if (mimes.length > 4 || (mimes.includes('application/pdf') && mimes.length > 1)) throw new Error('PDF 1件、または画像最大4件で保存してください。');
      const cache = resolveWritingUploadRetryCache(uploads.current, currentScope, files); uploads.current = cache;
      const assetIds = assets.map(asset => asset.id);
      for (const [index, file] of files.entries()) {
        if (!cache.assetIds[index]) {
          const upload = await createWritingUploadUrl({ assignmentId, attemptNo, assetOrder: assets.length + index + 1,
            fileName: file.name, mimeType: resolveWritingUploadMimeType(file), byteSize: file.size,
            sha256Base64: await calculateWritingAssetSha256Base64(file) });
          await uploadWritingAsset(upload, file); cache.assetIds[index] = upload.assetId;
        }
        assetIds.push(cache.assetIds[index]!);
      }
      const payload = { assignmentId, attemptNo, expectedRevision: saved?.revision || 0, assetIds, manualTranscript: manual };
      const signature = JSON.stringify(payload);
      if (saveRequest.current?.signature !== signature) saveRequest.current = { signature, request: { ...payload, requestId: crypto.randomUUID() } };
      const response = await saveWritingInputDraft(saveRequest.current.request);
      if (!response.draft || response.draft.assignmentId !== assignmentId || response.draft.attemptNo !== attemptNo) throw new Error('保存した下書きを確認できません。');
      if (scope.current !== currentScope) return;
      setSaved(response.draft); setAssetsChanged(false); setFiles([]); setAiDraft(null); uploads.current = null; saveRequest.current = null;
      setNotice('下書きを保存しました。未評価で、成績・提出は確定していません。');
    } catch (failure) {
      if (scope.current === currentScope) setError(`${failure instanceof Error ? failure.message : '保存を確認できません。'} 入力は保持しています。競合時は再取得して確認してください。`);
    } finally { lock.current = false; if (scope.current === currentScope) setBusy(false); }
  };
  const inputIsSaved = Boolean(saved && !assetsChanged && manual === saved.manualTranscript && files.length === 0);
  const canOcr = capabilities?.state === 'ENABLED' && capabilities.ocrEnabled && inputIsSaved
    && Boolean(saved?.assets.length && saved.assets.length <= 4 && saved.assets.every(asset => asset.mimeType.startsWith('image/')));
  const canFeedback = capabilities?.state === 'ENABLED' && capabilities.feedbackEnabled && inputIsSaved && Boolean(saved?.manualTranscript.trim());
  const generate = async (operation: WritingDraftOperation, recheck = false) => {
    if (lock.current || loading || !saved || !(operation === 'OCR' ? canOcr : canFeedback)) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      if (!aiRequest.current || aiRequest.current.inputDraftRevision !== saved.revision || aiRequest.current.operation !== operation) {
        aiRequest.current = { requestId: crypto.randomUUID(), assignmentId, attemptNo, operation, inputDraftRevision: saved.revision };
      }
      const response = recheck ? await getWritingAiDraft(aiRequest.current.requestId) : await generateWritingAiDraft(aiRequest.current);
      if (response.requestId !== aiRequest.current.requestId || response.assignmentId !== assignmentId || response.attemptNo !== attemptNo) throw new Error('対象のGPT下書きを確認できません。');
      if (scope.current === currentScope) setAiDraft(response);
    } catch (failure) {
      if (scope.current === currentScope) setError(`${failure instanceof Error ? failure.message : 'GPT下書きを確認できません。'} 入力・成績は変更していません。`);
    } finally { lock.current = false; if (scope.current === currentScope) setBusy(false); }
  };
  return { capabilities, saved, manual, files, loading, loaded, busy, error, notice, aiDraft, canOcr, canFeedback,
    reload: () => void reload(true), save, generate,
    setManual: (text: string) => { if (!lock.current && !loading) { setManual(text); setNotice(null); } },
    setFiles: (value: File[]) => { if (!lock.current && !loading) { setFiles(value); setNotice(null); } },
    removeAsset: (id: string) => { if (!lock.current && !loading) { setSaved(draft => draft ? { ...draft, assets: draft.assets.filter(asset => asset.id !== id), assetIds: draft.assetIds.filter(assetId => assetId !== id) } : null); setAssetsChanged(true); setNotice(null); } },
    hasPendingRequest: Boolean(aiRequest.current), pendingOperation: aiRequest.current?.operation,
  };
};
