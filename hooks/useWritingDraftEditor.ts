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
  const manualDirty = useRef(false);
  const assetsNeedRetirement = useRef(false);
  const committedInput = useRef<WritingInputDraft | null>(null);
  const lock = useRef(false);
  const scope = useRef('');
  const version = useRef(0);
  const uploads = useRef<WritingUploadRetryCache | null>(null);
  const pendingUploads = useRef<{ cache: WritingUploadRetryCache; requests: Array<Awaited<ReturnType<typeof createWritingUploadUrl>> | undefined> } | null>(null);
  const preparedInput = useRef<{ cache: WritingUploadRetryCache; signature: string; revision: number } | null>(null);
  const saveRequest = useRef<{ signature: string; request: SaveWritingInputDraftRequest } | null>(null);
  const retirementRequest = useRef<{ signature: string; request: SaveWritingInputDraftRequest } | null>(null);
  const aiRequest = useRef<GenerateWritingAiDraftRequest | null>(null);
  const aiResultId = useRef<string | null>(null);
  const aiRecovery = useRef<WritingAiDraftResponse['recoveryAction']>(undefined);
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
      if (!input.value.draft || aiRequest.current?.inputDraftRevision !== input.value.draft.revision) {
        aiRequest.current = null; aiResultId.current = null; aiRecovery.current = undefined; setAiDraft(null);
      }
      committedInput.current = input.value.draft;
      assetsNeedRetirement.current = false;
      setSaved(input.value.draft); setAssetsChanged(false); setLoaded(true);
      const keepEditedManual = preserveManual && manualDirty.current;
      if (!keepEditedManual) { setManual(input.value.draft?.manualTranscript || ''); manualDirty.current = false; }
      setNotice(input.value.draft ? (keepEditedManual
        ? '保存済みの添付を確認しました。編集中の本文は保持しています（未保存）。'
        : '保存済みの入力を復元しました（未評価）。') : null);
      saveRequest.current = null; retirementRequest.current = null; preparedInput.current = null;
    } else setError('下書きの復元を確認できません。入力を保持しています。再取得してから保存してください。');
    setLoading(false);
  };
  useEffect(() => {
    setCapabilities(null); setSaved(null); setManual(''); setFiles([]); setNotice(null); setAiDraft(null);
    uploads.current = null; pendingUploads.current = null; saveRequest.current = null; retirementRequest.current = null; preparedInput.current = null; aiRequest.current = null; aiResultId.current = null; aiRecovery.current = undefined;
    manualDirty.current = false; assetsNeedRetirement.current = false; committedInput.current = null;
    void reload(false);
    return () => { version.current += 1; scope.current = ''; };
  }, [assignmentId, attemptNo]);

  const save = async () => {
    if (lock.current || !loaded || loading) return;
    if (!manual.trim() && files.length === 0 && !saved?.assets.length && !committedInput.current?.revision) { setError('本文または答案ファイルを入力してください。'); return; }
    const validation = validateWritingSubmissionFiles(files);
    if (files.length > 0 && !validation.valid) { setError(validation.message); return; }
    lock.current = true; setBusy(true); setError(null); setNotice(null);
    try {
      const previousCache = uploads.current;
      const cache = resolveWritingUploadRetryCache(previousCache, currentScope, files);
      if (cache !== previousCache) {
        retirementRequest.current = null; saveRequest.current = null; preparedInput.current = null;
        pendingUploads.current = { cache, requests: [] };
      }
      uploads.current = cache;
      // Completed uploads still represented by local Files are not original attachments.
      const transientIds = new Set([...(previousCache?.assetIds.filter(Boolean) || []),
        ...(pendingUploads.current?.cache === previousCache ? pendingUploads.current.requests.filter(upload => Boolean(upload)).map(upload => upload!.assetId) : [])]);
      const assets = (saved?.assets || []).filter(asset => !transientIds.has(asset.id));
      const mimes = [...assets.map(asset => asset.mimeType), ...files.map(resolveWritingUploadMimeType)];
      if (mimes.length > 4 || (mimes.includes('application/pdf') && mimes.length > 1)) throw new Error('PDF 1件、または画像最大4件で保存してください。');
      let expectedRevision = committedInput.current?.revision || saved?.revision || 0;
      const persistInput = async (assetIds: string[], revision: number, retiring = false): Promise<WritingInputDraft> => {
        const pendingRequest = retiring ? retirementRequest : saveRequest;
        const payload = { assignmentId, attemptNo, expectedRevision: revision, assetIds, manualTranscript: manual,
          ...(retiring && files.length > 0 ? { prepareUpload: true as const } : {}) };
        const signature = JSON.stringify(payload);
        if (pendingRequest.current?.signature !== signature) pendingRequest.current = { signature, request: { ...payload, requestId: crypto.randomUUID() } };
        const response = await saveWritingInputDraft(pendingRequest.current.request);
        if (!response.draft || response.draft.assignmentId !== assignmentId || response.draft.attemptNo !== attemptNo) throw new Error('保存した下書きを確認できません。');
        if (scope.current !== currentScope) throw new Error('編集対象が変更されました。');
        committedInput.current = response.draft;
        // Pending uploads remain represented by Files until the final CAS succeeds.
        const transientAssetIds = retiring && files.length > 0 ? new Set(cache.assetIds.filter(Boolean)) : new Set<string>();
        setSaved({ ...response.draft, assetIds: response.draft.assetIds.filter(id => !transientAssetIds.has(id)),
          assets: response.draft.assets.filter(asset => !transientAssetIds.has(asset.id)) });
        manualDirty.current = false;
        pendingRequest.current = null;
        return response.draft;
      };
      // Preparation releases removed/orphaned originals before any new upload.
      // Retrying unchanged Files reuses its confirmed revision and successful uploads.
      // An uncertain completed PUT may still have consumed its URL. After expiry,
      // prepare again before minting a replacement so its orphan frees the quota.
      for (const [index, issued] of pendingUploads.current!.requests.entries()) {
        if (issued && !cache.assetIds[index] && issued.expiresAt <= Date.now()) {
          pendingUploads.current!.requests[index] = undefined;
          preparedInput.current = null;
        }
      }
      // Manual text is saved by the final CAS; it does not change upload preparation.
      const preparationSignature = JSON.stringify({ assetIds: assets.map(asset => asset.id) });
      if (files.length > 0 || assetsNeedRetirement.current) {
        const prepared = preparedInput.current;
        if (files.length > 0 && !assetsNeedRetirement.current && prepared?.cache === cache
          && prepared.signature === preparationSignature && prepared.revision === expectedRevision) {
          expectedRevision = prepared.revision;
        } else {
          // Restore/revision changes invalidate preparation, not the pending PUT.
          // Confirm its same File/body before preparation can retire unknown uploads.
          for (const [index, issued] of pendingUploads.current!.requests.entries()) {
            if (issued && !cache.assetIds[index] && files[index]) {
              await uploadWritingAsset(issued, files[index]);
              if (scope.current !== currentScope) throw new Error('編集対象が変更されました。');
              cache.assetIds[index] = issued.assetId;
            }
          }
          const retainedIds = [...new Set([...assets.map(asset => asset.id), ...cache.assetIds.filter((id): id is string => Boolean(id))])];
          const retained = await persistInput(retainedIds, expectedRevision, true);
          expectedRevision = retained.revision;
          preparedInput.current = { cache, signature: preparationSignature, revision: expectedRevision };
          assetsNeedRetirement.current = false; setAssetsChanged(false); setAiDraft(null);
        }
        if (files.length === 0) {
          setNotice('下書きを保存しました。未評価で、成績・提出は確定していません。');
          return;
        }
        setNotice('添付と本文の保存準備は確認済みです。新しいファイルはまだ保存されていません。');
      }
      const assetIds = assets.map(asset => asset.id);
      for (const [index, file] of files.entries()) {
        if (!cache.assetIds[index]) {
          const requests = pendingUploads.current!;
          const upload = requests.requests[index] || await createWritingUploadUrl({ assignmentId, attemptNo, assetOrder: assets.length + index + 1,
            fileName: file.name, mimeType: resolveWritingUploadMimeType(file), byteSize: file.size,
            sha256Base64: await calculateWritingAssetSha256Base64(file) });
          requests.requests[index] = upload;
          await uploadWritingAsset(upload, file); cache.assetIds[index] = upload.assetId;
        }
        assetIds.push(cache.assetIds[index]!);
      }
      await persistInput(assetIds, expectedRevision);
      setAssetsChanged(false); setFiles([]); setAiDraft(null); uploads.current = null; pendingUploads.current = null; preparedInput.current = null;
      setNotice('下書きを保存しました。未評価で、成績・提出は確定していません。');
    } catch (failure) {
      if (scope.current === currentScope) setError(`${failure instanceof Error ? failure.message : '保存を確認できません。'} 入力は保持しています。競合時は再取得して確認してください。`);
    } finally { lock.current = false; if (scope.current === currentScope) setBusy(false); }
  };
  const inputIsSaved = Boolean(saved && !assetsChanged && manual === saved.manualTranscript && files.length === 0);
  const canOcr = capabilities?.state === 'ENABLED' && capabilities.ocrEnabled && inputIsSaved
    && Boolean(saved?.assets.length && saved.assets.length <= 4 && saved.assets.every(asset => asset.mimeType.startsWith('image/')));
  const canFeedback = capabilities?.state === 'ENABLED' && capabilities.feedbackEnabled && inputIsSaved && Boolean(saved?.manualTranscript.trim());
  const pendingMatchesInput = Boolean(saved && aiRequest.current && aiRequest.current.assignmentId === assignmentId
    && aiRequest.current.attemptNo === attemptNo && aiRequest.current.inputDraftRevision === saved.revision);
  const hasPendingRequest = pendingMatchesInput && aiRecovery.current !== 'NONE';
  const canResumePendingRequest = hasPendingRequest && aiRecovery.current === 'RESEND_SAME_REQUEST'
    && Boolean(aiRequest.current?.operation === 'OCR' ? canOcr : canFeedback);
  const generate = async (operation: WritingDraftOperation, recheck = false) => {
    if (lock.current || loading || !saved) return;
    const matchesRequest = pendingMatchesInput && aiRequest.current?.operation === operation;
    const canGenerate = operation === 'OCR' ? canOcr : canFeedback;
    if (hasPendingRequest && !matchesRequest) {
      setError('先に処理中のGPT下書きの結果を再確認してください。保存した答案は保持しています。'); return;
    }
    if (!matchesRequest && (recheck || !canGenerate)) return;
    // A second click checks the existing request. Only explicit, verified resume dispatches.
    const shouldPost = !matchesRequest || (recheck && aiRecovery.current === 'RESEND_SAME_REQUEST');
    if (shouldPost && !canGenerate) { setError('GPT下書きの再開は現在利用できません。保存した答案は保持しています。'); return; }
    lock.current = true; setBusy(true); setError(null);
    try {
      if (!matchesRequest) {
        aiRequest.current = { requestId: crypto.randomUUID(), assignmentId, attemptNo, operation, inputDraftRevision: saved.revision };
        aiResultId.current = null; aiRecovery.current = undefined; setAiDraft(null);
      }
      const request = aiRequest.current!;
      // Keep the original POST identity: canonical IDs belong only to result lookup.
      if (shouldPost) aiRecovery.current = 'CHECK_RESULT';
      const response = shouldPost ? await generateWritingAiDraft(request)
        : await getWritingAiDraft(aiResultId.current || request.requestId);
      if (response.assignmentId !== request.assignmentId || response.attemptNo !== request.attemptNo
        || response.operation !== request.operation
        || (response.inputDraftRevision !== undefined && response.inputDraftRevision !== request.inputDraftRevision)
        || (response.requestId !== request.requestId && response.inputDraftRevision !== request.inputDraftRevision)) {
        throw new Error('保存した答案と一致するGPT下書きを確認できません。');
      }
      if (scope.current !== currentScope) return;
      if (committedInput.current?.revision !== request.inputDraftRevision) throw new Error('保存した答案が更新されました。GPT下書きは採用していません。');
      aiResultId.current = response.requestId;
      aiRecovery.current = response.status === 'PENDING'
        ? response.recoveryAction === 'RESEND_SAME_REQUEST' && response.inputDraftRevision === request.inputDraftRevision ? 'RESEND_SAME_REQUEST' : 'CHECK_RESULT'
        : 'NONE';
      setAiDraft(response);
    } catch (failure) {
      if (scope.current === currentScope) {
        aiRecovery.current = 'CHECK_RESULT';
        setError(`${failure instanceof Error ? failure.message : 'GPT下書きを確認できません。'} 保存した答案と成績は変更していません。送信し直さず、結果を再確認できます。`);
      }
    } finally { lock.current = false; if (scope.current === currentScope) setBusy(false); }
  };
  return { capabilities, saved, manual, files, loading, loaded, busy, error, notice, aiDraft, canOcr, canFeedback,
    reload: () => void reload(true), save, generate,
    setManual: (text: string) => { if (!lock.current && !loading) { manualDirty.current = true; setManual(text); setNotice(null); } },
    setFiles: (value: File[]) => { if (!lock.current && !loading) { setFiles(value); setNotice(null); } },
    removeAsset: (id: string) => { if (!lock.current && !loading) { setSaved(draft => draft ? { ...draft, assets: draft.assets.filter(asset => asset.id !== id), assetIds: draft.assetIds.filter(assetId => assetId !== id) } : null); assetsNeedRetirement.current = true; setAssetsChanged(true); setNotice(null); } },
    hasPendingRequest, canResumePendingRequest, pendingRecoveryAction: aiRecovery.current, pendingOperation: aiRequest.current?.operation,
  };
};
