-- Weakness signals are derived cache. Clear pre-gate signals so they rebuild
-- only from source-approved learning material after the material ledger rollout.
DELETE FROM student_weakness_signals;
