ALTER TABLE words
  ADD COLUMN category TEXT;

ALTER TABLE words
  ADD COLUMN subcategory TEXT;

ALTER TABLE words
  ADD COLUMN section TEXT;

ALTER TABLE words
  ADD COLUMN source_sheet TEXT;

ALTER TABLE words
  ADD COLUMN source_entry_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_words_book_category
  ON words(book_id, category, subcategory, section, word_number);
