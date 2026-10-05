// Keep successful uploads attached to the same files and submission attempt.
// A provider failure must retry finalization without consuming another upload slot.
export interface WritingUploadRetryCache {
  scope: string;
  files: File[];
  assetIds: Array<string | undefined>;
}

export const resolveWritingUploadRetryCache = (
  current: WritingUploadRetryCache | null,
  scope: string,
  files: File[],
): WritingUploadRetryCache => (
  current?.scope === scope
  && current.files.length === files.length
  && files.every((file, index) => current.files[index] === file)
    ? current
    : { scope, files: [...files], assetIds: [] }
);
