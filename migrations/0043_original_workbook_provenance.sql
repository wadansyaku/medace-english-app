-- Additive only: existing word IDs and all learning history remain intact.
ALTER TABLE words ADD COLUMN part_of_speech TEXT CHECK (part_of_speech IN ('verb', 'noun', 'adverb', 'adjective'));
ALTER TABLE words ADD COLUMN inflections TEXT;
ALTER TABLE words ADD COLUMN pronunciation TEXT;
ALTER TABLE words ADD COLUMN source_note TEXT;

CREATE TABLE catalog_workbook_sources (
  id TEXT PRIMARY KEY,
  series_key TEXT NOT NULL,
  source_file TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  archive_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(series_key, sha256)
);

CREATE TABLE catalog_source_entries (
  id TEXT PRIMARY KEY,
  source_id TEXT NOT NULL,
  source_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  ready INTEGER NOT NULL CHECK (ready IN (0, 1)),
  FOREIGN KEY(source_id) REFERENCES catalog_workbook_sources(id),
  UNIQUE(source_id, source_key)
);
CREATE INDEX idx_catalog_source_entries_key ON catalog_source_entries(source_key);

-- Row-sized archives keep individual SQL statements within D1 limits.
CREATE TABLE catalog_workbook_sheet_rows (
  source_id TEXT NOT NULL,
  sheet_name TEXT NOT NULL,
  row_number INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(source_id, sheet_name, row_number),
  FOREIGN KEY(source_id) REFERENCES catalog_workbook_sources(id)
);

CREATE TABLE catalog_word_source_links (
  source_entry_id TEXT PRIMARY KEY,
  word_id TEXT NOT NULL,
  match_kind TEXT NOT NULL CHECK (match_kind IN ('snapshot_import', 'verified_existing')),
  FOREIGN KEY(source_entry_id) REFERENCES catalog_source_entries(id),
  FOREIGN KEY(word_id) REFERENCES words(id)
);
CREATE INDEX idx_catalog_word_source_links_word ON catalog_word_source_links(word_id);
