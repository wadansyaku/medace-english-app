# Writing draft actor lifetime repair

PR57 review `discussion_r4187132746` is reproduced with the real `deleteExpiredDemoUsers` function and isolated SQLite: an expired non-owner administrator referenced by `writing_input_drafts.last_saved_by` causes the entire cleanup batch to fail. The draft owner and assignment instructor can still be active. The same lifetime conflict exists for AI request actors and approval administrators.

Additive migration 0053 rebuilds the three new draft tables without changing existing values, keys, constraints or assignment deletion behavior. Actor metadata (`last_saved_by`, `requested_by`, `approved_by`) becomes nullable with `ON DELETE SET NULL`. Original input, asset IDs, revisions, request fingerprints, results and approval evidence survive actor deletion. Owners still cascade through their assignments. No learner records or R2 objects are deleted by the migration.

An approval whose administrator has been deleted becomes unusable: the existing server `JOIN users ... role='ADMIN'` no longer matches. Null metadata never grants external transmission. Current role, organization, assignment and provider policy guards remain authoritative. Input and result APIs do not expose these actor metadata columns.

Five native SQLite tests reproduce the original failure, compare every existing column before/after migration, verify cleanup with preserved answers and inert approval, verify atomic rollback if another account restriction fails, and verify owner cascades with zero foreign-key violations. Type checking passed. Full migration replay and integrated release gates remain required after the other review fixes are combined.

Migration 0051 is retained unchanged, including if the already-running preview applies it before this repair. 0053 is the separate recovery for both fresh and previously-applied schemas.
