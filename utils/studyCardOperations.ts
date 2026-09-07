export type StudyCardOperationKind = 'example' | 'image' | 'edit' | 'report';

export interface StudyCardOperation {
  kind: StudyCardOperationKind;
  generation: number;
  wordId: string;
  index: number;
}

export const createStudyCardOperations = () => {
  let generation = 0;
  const pending = new Map<StudyCardOperationKind, StudyCardOperation>();
  return {
    begin(kind: StudyCardOperationKind, wordId: string, index: number): StudyCardOperation | null {
      if (pending.has(kind)) return null;
      const operation = { kind, generation, wordId, index };
      pending.set(kind, operation);
      return operation;
    },
    isCurrent: (operation: StudyCardOperation) => operation.generation === generation,
    finish(operation: StudyCardOperation): boolean {
      if (operation.generation !== generation || pending.get(operation.kind) !== operation) return false;
      pending.delete(operation.kind);
      return true;
    },
    invalidate() {
      generation += 1;
      pending.clear();
    },
  };
};
