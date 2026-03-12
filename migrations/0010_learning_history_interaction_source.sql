ALTER TABLE learning_histories
  ADD COLUMN interaction_source TEXT;

CREATE INDEX IF NOT EXISTS idx_histories_user_book_source
  ON learning_histories(user_id, book_id, interaction_source);
