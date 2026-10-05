-- Keep originals and R2 objects while releasing only detached draft upload slots.
ALTER TABLE writing_submission_assets ADD COLUMN draft_retired_at INTEGER;
