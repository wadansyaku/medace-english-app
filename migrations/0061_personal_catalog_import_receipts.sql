-- Personal direct-entry imports commit the book, all words and this immutable
-- replay result in one D1 batch. Keep the receipt after book deletion so an old
-- retry cannot resurrect a deleted personal book.
CREATE TABLE personal_catalog_import_receipts (
  user_id TEXT NOT NULL,
  client_import_id TEXT NOT NULL,
  request_fingerprint TEXT NOT NULL,
  book_id TEXT NOT NULL,
  result_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, client_import_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
