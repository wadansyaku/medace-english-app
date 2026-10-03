ALTER TABLE users ADD COLUMN diagnostic_deferred_at INTEGER;

-- Dedicated guest records never reference books/words or grant SRS, quiz, XP,
-- mastery, or diagnostic levels. One trial can be claimed by one account only.
CREATE TABLE guest_trial_claims (
  trial_id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  imported_at INTEGER NOT NULL
);
CREATE INDEX idx_guest_trial_claims_user ON guest_trial_claims(user_id);

CREATE TABLE guest_trial_answers (
  attempt_id TEXT PRIMARY KEY NOT NULL,
  trial_id TEXT NOT NULL REFERENCES guest_trial_claims(trial_id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  choice_index INTEGER NOT NULL CHECK (choice_index BETWEEN 0 AND 3),
  answered_at INTEGER NOT NULL,
  correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
  UNIQUE (trial_id, question_id)
);
