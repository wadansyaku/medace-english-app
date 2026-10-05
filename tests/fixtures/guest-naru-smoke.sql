-- Synthetic original Naru fixture for ephemeral local smoke databases only.
-- The browser runner never writes this fixture to preview or production.
INSERT INTO books(id,title,word_count,is_priority,catalog_source,access_scope,created_at,updated_at)
VALUES('naru-shisto-original-v1','Naruシスト',20,1,'STEADY_STUDY_ORIGINAL','ALL_PLANS',1,1);
INSERT INTO material_source_ledger(source_id,book_id,catalog_source,book_title,edition,rights_status,review_status,
source_file,extracted_at,transform_log,content_qa_report,qa_word_count,qa_source_coverage_rate,created_at,updated_at)
VALUES('smoke-naru-source','naru-shisto-original-v1','STEADY_STUDY_ORIGINAL','Naruシスト','synthetic-v1','approved','approved',
'synthetic-original.csv','synthetic-date','synthetic-transform','synthetic-qa',20,1,1,1);
INSERT INTO catalog_workbook_sources(id,series_key,source_file,sha256,archive_json,created_at)
VALUES('smoke-naru-workbook','naru-smoke','synthetic-original.csv','synthetic-sha256','[]',1);
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<20)
INSERT INTO words(id,book_id,word_number,word,definition,search_key,source_sheet,example_sentence,created_at,updated_at)
SELECT 'smoke-naru-word-'||n,'naru-shisto-original-v1',n,'practice'||n,'合成の語義'||n,'practice'||n,
'synthetic-original','This is original practice number '||n||'.',1,1 FROM seq;
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<20)
INSERT INTO catalog_source_entries(id,source_id,source_key,content_hash,payload_json,ready)
SELECT 'smoke-naru-entry-'||n,'smoke-naru-workbook','synthetic-key-'||n,'synthetic-content-'||n,'{}',1 FROM seq;
WITH RECURSIVE seq(n) AS (SELECT 1 UNION ALL SELECT n+1 FROM seq WHERE n<20)
INSERT INTO catalog_word_source_links(source_entry_id,word_id,match_kind)
SELECT 'smoke-naru-entry-'||n,'smoke-naru-word-'||n,'snapshot_import' FROM seq;
