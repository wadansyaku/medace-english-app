-- Additive metadata: the original words, chapter structure, source archives,
-- approval/access gates and all learning history remain intact.
ALTER TABLE words ADD COLUMN aichi_exam_appeared INTEGER NOT NULL DEFAULT 0 CHECK(aichi_exam_appeared IN (0,1));
CREATE TABLE catalog_word_exam_annotations (
 word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind='AICHI_HIGH_SCHOOL_ENTRANCE'),
 source_entry_id TEXT NOT NULL REFERENCES catalog_source_entries(id),
 evidence_sheet TEXT NOT NULL,
 evidence_cell TEXT NOT NULL,
 fill_rgb TEXT NOT NULL CHECK(fill_rgb='FFFF00'),
 match_kind TEXT NOT NULL CHECK(match_kind IN ('word_cell','unique_index')),
 PRIMARY KEY(word_id,kind)
);
-- A changed meaning or source locator is no longer this verified entry. Keep
-- historical evidence while suppressing the learner badge on edited content.
CREATE TRIGGER invalidate_word_exam_annotation AFTER UPDATE OF word,definition,part_of_speech,source_sheet,source_entry_id,book_id ON words
WHEN OLD.word IS NOT NEW.word OR OLD.definition IS NOT NEW.definition
 OR OLD.part_of_speech IS NOT NEW.part_of_speech OR OLD.source_sheet IS NOT NEW.source_sheet
 OR OLD.source_entry_id IS NOT NEW.source_entry_id OR OLD.book_id IS NOT NEW.book_id
BEGIN
 UPDATE words SET aichi_exam_appeared=0 WHERE id=NEW.id;
END;
-- Source-coordinate metadata only. No book access/approval, word content or study history changes.
WITH marks(source_file,sha256,source_key,word,definition,pos,source_sheet,source_row,source_column,evidence_sheet,evidence_cell,evidence_row,match_kind) AS (VALUES
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R4C1','keep','〜のままである
保つ, 維持する','verb','文法分類',4,1,'文法分類','A4',4,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R8C1','become','〜になる','verb','文法分類',8,1,'文法分類','A8',8,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R10C1','grow','〜になる
成長する','verb','文法分類',10,1,'文法分類','A10',10,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R12C1','go','〜になる
行く','verb','文法分類',12,1,'文法分類','A12',12,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R14C1','seem','〜のように思われる','verb','文法分類',14,1,'文法分類','A14',14,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R15C1','appear','〜のように見える','verb','文法分類',15,1,'文法分類','A15',15,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R16C1','look','〜に見える','verb','文法分類',16,1,'文法分類','A16',16,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R18C1','sound','〜に聞こえる','verb','文法分類',18,1,'文法分類','A18',18,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R19C1','smell','〜のにおいがする','verb','文法分類',19,1,'文法分類','A19',19,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R20C1','taste','〜の味がする','verb','文法分類',20,1,'文法分類','A20',20,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R21C1','feel','〜の感じがする','verb','文法分類',21,1,'文法分類','A21',21,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R26C1','reach','到達する','verb','文法分類',26,1,'文法分類','A26',26,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R29C1','enter','入る','verb','文法分類',29,1,'文法分類','A29',29,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R31C1','join','参加する','verb','文法分類',31,1,'文法分類','A31',31,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R35C1','S want to V~','〜したい','verb','文法分類',35,1,'文法分類','A35',35,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R36C1','S hope to V~','〜を望む','verb','文法分類',36,1,'文法分類','A36',36,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R37C1','S decide to V~','〜を決定する','verb','文法分類',37,1,'文法分類','A37',37,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R39C1','S enjoy V ing~','〜を楽しむ','verb','文法分類',39,1,'文法分類','A39',39,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R40C1','S finish V ing~','〜を終える','verb','文法分類',40,1,'文法分類','A40',40,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R41C1','S stop V ing~','〜を止める','verb','文法分類',41,1,'文法分類','A41',41,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R42C1','S practice V ing~','〜を練習する','verb','文法分類',42,1,'文法分類','A42',42,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R44C1','S remember to V~','〜することを覚えている','verb','文法分類',44,1,'文法分類','A44',44,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R45C1','S remember V ing~','〜したことを覚えている','verb','文法分類',45,1,'文法分類','A45',45,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R46C1','S forget to V~','〜し忘れる','verb','文法分類',46,1,'文法分類','A46',46,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R47C1','S forget V ing~','〜したことを忘れる','verb','文法分類',47,1,'文法分類','A47',47,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R50C1','give','与える','verb','文法分類',50,1,'文法分類','A50',50,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R52C1','send','送る','verb','文法分類',52,1,'文法分類','A52',52,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R53C1','show','見せる','verb','文法分類',53,1,'文法分類','A53',53,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R54C1','tell','伝える','verb','文法分類',54,1,'文法分類','A54',54,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R55C1','teach','教える','verb','文法分類',55,1,'文法分類','A55',55,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R57C1','bring','持ってくる','verb','文法分類',57,1,'文法分類','A57',57,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R59C1','buy','買う','verb','文法分類',59,1,'文法分類','A59',59,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R60C1','make','作る','verb','文法分類',60,1,'文法分類','A60',60,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R65C1','make','〜(状態)にする','verb','文法分類',65,1,'文法分類','A65',65,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R66C1','keep','〜(状態)のままにする','verb','文法分類',66,1,'文法分類','A66',66,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R67C1','leave','〜(状態)のままにする','verb','文法分類',67,1,'文法分類','A67',67,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R72C1','S [is, are, was, were] crowded with','〜で混雑している','verb','文法分類',72,1,'文法分類','A72',72,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R75C1','S [is, are, was, were] surprised at','〜に驚く','verb','文法分類',75,1,'文法分類','A75',75,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R81C1','turn on','(電源・スイッチ)をいれる','verb','文法分類',81,1,'文法分類','A81',81,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R82C1','turn off','(電源・スイッチ)をきる','verb','文法分類',82,1,'文法分類','A82',82,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R85C1','take off','(服を)脱ぐ・離陸する','verb','文法分類',85,1,'文法分類','A85',85,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R86C1','get on','(乗り物に)乗る','verb','文法分類',86,1,'文法分類','A86',86,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R87C1','get off','(乗り物から)降りる','verb','文法分類',87,1,'文法分類','A87',87,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R89C1','go back to','〜へ戻る','verb','文法分類',89,1,'文法分類','A89',89,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R92C1','go up','上がる','verb','文法分類',92,1,'文法分類','A92',92,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R93C1','go down','下がる','verb','文法分類',93,1,'文法分類','A93',93,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R94C1','look at','〜をみる','verb','文法分類',94,1,'文法分類','A94',94,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R98C1','look like','〜のように見える','verb','文法分類',98,1,'文法分類','A98',98,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R100C1','work for','〜に勤める','verb','文法分類',100,1,'文法分類','A100',100,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R101C1','prepare for','〜の準備をする','verb','文法分類',101,1,'文法分類','A101',101,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R105C1','depend on','〜に依存する','verb','文法分類',105,1,'文法分類','A105',105,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R111C1','study','〜を勉強する、研究する','verb','文法分類',111,1,'文法分類','A111',111,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R112C1','learn','〜を学習する、学ぶ','verb','文法分類',112,1,'文法分類','A112',112,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R113C1','teach','〜を教える','verb','文法分類',113,1,'文法分類','A113',113,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R114C1','ask','〜を尋ねる','verb','文法分類',114,1,'文法分類','A114',114,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R116C1','solve','〜を解決する','verb','文法分類',116,1,'文法分類','A116',116,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R120C1','remember','〜を覚えている','verb','文法分類',120,1,'文法分類','A120',120,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R121C1','understand','〜を理解する','verb','文法分類',121,1,'文法分類','A121',121,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R122C1','forget','〜を忘れる','verb','文法分類',122,1,'文法分類','A122',122,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R125C1','repeat','〜を繰り返す、反復する','verb','文法分類',125,1,'文法分類','A125',125,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R127C1','become','～になる','verb','文法分類',127,1,'文法分類','A127',127,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R133C1','talk','話す','verb','文法分類',133,1,'文法分類','A133',133,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R134C1','speak','（言語を）話す','verb','文法分類',134,1,'文法分類','A134',134,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R139C1','grow','育つ、成長する、育てる','verb','文法分類',139,1,'文法分類','A139',139,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R141C1','do my best','最善を尽くす','verb','文法分類',141,1,'文法分類','A141',141,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R144C1','decrease','減る、減らす、減少する','verb','文法分類',144,1,'文法分類','A144',144,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R145C1','increase','増える、増やす、増加する','verb','文法分類',145,1,'文法分類','A145',145,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R146C1','change','変える、変わる、乗り換える','verb','文法分類',146,1,'文法分類','A146',146,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R148C1','search','探す、検索する','verb','文法分類',148,1,'文法分類','A148',148,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R149C1','discover','発見する','verb','文法分類',149,1,'文法分類','A149',149,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R150C1','guess','推測する、言い当てる','verb','文法分類',150,1,'文法分類','A150',150,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R151C1','seem','～のように見える、～と思われる','verb','文法分類',151,1,'文法分類','A151',151,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R153C1','plan','計画する','verb','文法分類',153,1,'文法分類','A153',153,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R154C1','prepare (for)','（～の）準備をする','verb','文法分類',154,1,'文法分類','A154',154,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R155C1','try','試す、～しようとする','verb','文法分類',155,1,'文法分類','A155',155,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R156C1','fail','失敗する、（試験などに）落ちる','verb','文法分類',156,1,'文法分類','A156',156,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R158C1','mean','意味する','verb','文法分類',158,1,'文法分類','A158',158,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R159C1','find','見つける、わかる','verb','文法分類',159,1,'文法分類','A159',159,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R160C1','publish','出版する','verb','文法分類',160,1,'文法分類','A160',160,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R162C1','work for','～で働く、～に勤める','verb','文法分類',162,1,'文法分類','A162',162,'word_cell')
)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id='naru-shisto-original-v1'
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;
WITH marks(source_file,sha256,source_key,word,definition,pos,source_sheet,source_row,source_column,evidence_sheet,evidence_cell,evidence_row,match_kind) AS (VALUES
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R163C1','attach','添付する、くっつける','verb','文法分類',163,1,'文法分類','A163',163,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R166C1','contact','連絡する','verb','文法分類',166,1,'文法分類','A166',166,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R169C1','send','送る','verb','文法分類',169,1,'文法分類','A169',169,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R170C1','receive','受け取る','verb','文法分類',170,1,'文法分類','A170',170,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R171C1','succeed','成功する','verb','文法分類',171,1,'文法分類','A171',171,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R173C1','scan','スキャンする、注意深く調べる','verb','文法分類',173,1,'文法分類','A173',173,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R174C1','produce','生産する、生み出す','verb','文法分類',174,1,'文法分類','A174',174,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R177C1','develop','開発する、発達させる','verb','文法分類',177,1,'文法分類','A177',177,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R178C1','lead','導く、案内する、（道が）通じる','verb','文法分類',178,1,'文法分類','A178',178,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R180C1','interview','インタビューする、面接する','verb','文法分類',180,1,'文法分類','A180',180,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R182C1','influence','影響を与える','verb','文法分類',182,1,'文法分類','A182',182,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R183C1','improve','向上させる、改善する','verb','文法分類',183,1,'文法分類','A183',183,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R185C1','appear','現れる、～のように見える','verb','文法分類',185,1,'文法分類','A185',185,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R188C1','choose','選ぶ','verb','文法分類',188,1,'文法分類','A188',188,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R195C1','decide to','～することに決める','verb','文法分類',195,1,'文法分類','A195',195,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R199C1','waste','無駄にする','verb','文法分類',199,1,'文法分類','A199',199,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R201C1','remove','取り除く、脱ぐ','verb','文法分類',201,1,'文法分類','A201',201,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R202C1','recycle','リサイクルする、再利用する','verb','文法分類',202,1,'文法分類','A202',202,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R203C1','reduce','減らす','verb','文法分類',203,1,'文法分類','A203',203,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R205C1','save','救う、節約する、貯める','verb','文法分類',205,1,'文法分類','A205',205,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R207C1','melt','溶ける、溶かす','verb','文法分類',207,1,'文法分類','A207',207,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R210C1','blow','吹く','verb','文法分類',210,1,'文法分類','A210',210,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R212C1','damage','損害を与える','verb','文法分類',212,1,'文法分類','A212',212,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R213C1','destroy','破壊する','verb','文法分類',213,1,'文法分類','A213',213,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R215C1','die','死ぬ','verb','文法分類',215,1,'文法分類','A215',215,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R223C1','protect','保護する、守る','verb','文法分類',223,1,'文法分類','A223',223,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R224C1','suffer','苦しむ','verb','文法分類',224,1,'文法分類','A224',224,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R225C1','survive','生き残る','verb','文法分類',225,1,'文法分類','A225',225,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R227C1','move','動く、引っ越す','verb','文法分類',227,1,'文法分類','A227',227,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R228C1','fly','飛ぶ','verb','文法分類',228,1,'文法分類','A228',228,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R230C1','get off','降りる','verb','文法分類',230,1,'文法分類','A230',230,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R231C1','get on','乗る','verb','文法分類',231,1,'文法分類','A231',231,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R232C1','leave','去る、出発する、残す','verb','文法分類',232,1,'文法分類','A232',232,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R233C1','ride','乗る','verb','文法分類',233,1,'文法分類','A233',233,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R235C1','reach','到着する、届く','verb','文法分類',235,1,'文法分類','A235',235,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R237C1','go','行く','verb','文法分類',237,1,'文法分類','A237',237,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R238C1','go back to','～へ戻る','verb','文法分類',238,1,'文法分類','A238',238,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R239C1','go down','降りる、下がる','verb','文法分類',239,1,'文法分類','A239',239,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R240C1','go up','上がる','verb','文法分類',240,1,'文法分類','A240',240,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R241C1','pick up','拾い上げる、車で迎えに行く','verb','文法分類',241,1,'文法分類','A241',241,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R242C1','drive','運転する','verb','文法分類',242,1,'文法分類','A242',242,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R243C1','carry','運ぶ','verb','文法分類',243,1,'文法分類','A243',243,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R245C1','take off','離陸する、脱ぐ','verb','文法分類',245,1,'文法分類','A245',245,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R246C1','cross','横切る、渡る','verb','文法分類',246,1,'文法分類','A246',246,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R251C1','travel','旅行する','verb','文法分類',251,1,'文法分類','A251',251,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R252C1','visit','訪問する','verb','文法分類',252,1,'文法分類','A252',252,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R253C1','guide','案内する','verb','文法分類',253,1,'文法分類','A253',253,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R258C1','practice','練習する','verb','文法分類',258,1,'文法分類','A258',258,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R260C1','hit','打つ','verb','文法分類',260,1,'文法分類','A260',260,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R263C1','perform','演じる、実行する','verb','文法分類',263,1,'文法分類','A263',263,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R267C1','ski','スキーをする','verb','文法分類',267,1,'文法分類','A267',267,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R268C1','snowboard','スノーボードをする','verb','文法分類',268,1,'文法分類','A268',268,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R270C1','stand','立つ','verb','文法分類',270,1,'文法分類','A270',270,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R273C1','run','走る','verb','文法分類',273,1,'文法分類','A273',273,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R274C1','walk','歩く','verb','文法分類',274,1,'文法分類','A274',274,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R275C1','walk across','歩いて渡る','verb','文法分類',275,1,'文法分類','A275',275,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R276C1','follow','ついていく、従う','verb','文法分類',276,1,'文法分類','A276',276,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R280C1','hike','ハイキングをする','verb','文法分類',280,1,'文法分類','A280',280,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R283C1','watch','（動くものを）見る','verb','文法分類',283,1,'文法分類','A283',283,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R284C1','look at','（注意して）見る','verb','文法分類',284,1,'文法分類','A284',284,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R285C1','listen','（意識して）聞く','verb','文法分類',285,1,'文法分類','A285',285,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R288C1','hear(heard)','聞こえる（聞こえた）','verb','文法分類',288,1,'文法分類','A288',288,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R289C1','touch','触れる','verb','文法分類',289,1,'文法分類','A289',289,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R290C1','taste','味がする','verb','文法分類',290,1,'文法分類','A290',290,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R295C1','wonder','～かしらと思う','verb','文法分類',295,1,'文法分類','A295',295,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R297C1','begin','始める、始まる','verb','文法分類',297,1,'文法分類','A297',297,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R299C1','finish','終える','verb','文法分類',299,1,'文法分類','A299',299,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R300C1','stop','止める、止まる','verb','文法分類',300,1,'文法分類','A300',300,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R303C1','put','置く','verb','文法分類',303,1,'文法分類','A303',303,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R313C1','connect','つなぐ、接続する','verb','文法分類',313,1,'文法分類','A313',313,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R314C1','continue','続ける、続く','verb','文法分類',314,1,'文法分類','A314',314,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R316C1','spread','広がる、広げる','verb','文法分類',316,1,'文法分類','A316',316,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R317C1','broaden','広げる','verb','文法分類',317,1,'文法分類','A317',317,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R319C1','collect','集める','verb','文法分類',319,1,'文法分類','A319',319,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R321C1','release','解放する、放つ','verb','文法分類',321,1,'文法分類','A321',321,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R322C1','raise','上げる、育てる','verb','文法分類',322,1,'文法分類','A322',322,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R327C1','feel','感じる','verb','文法分類',327,1,'文法分類','A327',327,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R330C1','imagine','想像する','verb','文法分類',330,1,'文法分類','A330',330,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R333C1','enjoy','楽しむ','verb','文法分類',333,1,'文法分類','A333',333,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R338C1','impress','感動させる、印象づける','verb','文法分類',338,1,'文法分類','A338',338,'word_cell')
)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id='naru-shisto-original-v1'
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;
WITH marks(source_file,sha256,source_key,word,definition,pos,source_sheet,source_row,source_column,evidence_sheet,evidence_cell,evidence_row,match_kind) AS (VALUES
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R339C1','smile','微笑む','verb','文法分類',339,1,'文法分類','A339',339,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R340C1','be surprised','驚く','verb','文法分類',340,1,'文法分類','A340',340,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R342C1','attract/be attracted','引きつける／引きつけられる','verb','文法分類',342,1,'文法分類','A342',342,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R346C1','believe','信じる','verb','文法分類',346,1,'文法分類','A346',346,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R348C1','cheer','応援する、元気づける','verb','文法分類',348,1,'文法分類','A348',348,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R349C1','respect','尊敬する','verb','文法分類',349,1,'文法分類','A349',349,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R359C1','wear','身に着けている、着ている','verb','文法分類',359,1,'文法分類','A359',359,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R360C1','wash','洗う','verb','文法分類',360,1,'文法分類','A360',360,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R361C1','brush','磨く','verb','文法分類',361,1,'文法分類','A361',361,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R363C1','live','住む、生きる','verb','文法分類',363,1,'文法分類','A363',363,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R371C1','wait','待つ','verb','文法分類',371,1,'文法分類','A371',371,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R375C1','bring','持ってくる','verb','文法分類',375,1,'文法分類','A375',375,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R376C1','catch','捕まえる、（電車などに）間に合う','verb','文法分類',376,1,'文法分類','A376',376,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R377C1','hold','持つ、開催する','verb','文法分類',377,1,'文法分類','A377',377,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R378C1','drop','落とす','verb','文法分類',378,1,'文法分類','A378',378,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R379C1','set','置く、設定する','verb','文法分類',379,1,'文法分類','A379',379,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R382C1','crowd','群がる、混雑する','verb','文法分類',382,1,'文法分類','A382',382,'word_cell'),
('verb_list.xlsx','5bc0fa2cd6798cad17df128f1906511d8745a3687b26e952023200bc13b7c30b','verb:文法分類:R385C1','remind','思い出させる','verb','文法分類',385,1,'文法分類','A385',385,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R2C12','transportation','交通機関 輸送','noun','国際 地図 町 建築物 旅行 移動 歴史',2,12,'国際 地図 町 建築物 旅行 移動 歴史','L2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R3C7','trip','旅行','noun','国際 地図 町 建築物 旅行 移動 歴史',3,7,'国際 地図 町 建築物 旅行 移動 歴史','G3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R4C7','tourist','観光客','noun','国際 地図 町 建築物 旅行 移動 歴史',4,7,'国際 地図 町 建築物 旅行 移動 歴史','G4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R4C12','announcement','アナウンス 発表','noun','国際 地図 町 建築物 旅行 移動 歴史',4,12,'国際 地図 町 建築物 旅行 移動 歴史','L4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R4C17','past','過去','noun','国際 地図 町 建築物 旅行 移動 歴史',4,17,'国際 地図 町 建築物 旅行 移動 歴史','Q4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R5C7','visitor','訪問者 来客','noun','国際 地図 町 建築物 旅行 移動 歴史',5,7,'国際 地図 町 建築物 旅行 移動 歴史','G5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R5C12','airplane','飛行機','noun','国際 地図 町 建築物 旅行 移動 歴史',5,12,'国際 地図 町 建築物 旅行 移動 歴史','L5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R5C17','reality','現実','noun','国際 地図 町 建築物 旅行 移動 歴史',5,17,'国際 地図 町 建築物 旅行 移動 歴史','Q5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R6C2','country','国 田舎','noun','国際 地図 町 建築物 旅行 移動 歴史',6,2,'国際 地図 町 建築物 旅行 移動 歴史','B6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R6C12','airport','空港','noun','国際 地図 町 建築物 旅行 移動 歴史',6,12,'国際 地図 町 建築物 旅行 移動 歴史','L6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R7C17','tradition','伝統','noun','国際 地図 町 建築物 旅行 移動 歴史',7,17,'国際 地図 町 建築物 旅行 移動 歴史','Q7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R8C7','goal','目標 ゴール','noun','国際 地図 町 建築物 旅行 移動 歴史',8,7,'国際 地図 町 建築物 旅行 移動 歴史','G8',8,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R9C2','population','人口','noun','国際 地図 町 建築物 旅行 移動 歴史',9,2,'国際 地図 町 建築物 旅行 移動 歴史','B9',9,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R9C7','place','場所 (物を)置く','noun','国際 地図 町 建築物 旅行 移動 歴史',9,7,'国際 地図 町 建築物 旅行 移動 歴史','G9',9,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R10C2','language','言語(母語mother tongue)','noun','国際 地図 町 建築物 旅行 移動 歴史',10,2,'国際 地図 町 建築物 旅行 移動 歴史','B10',10,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R10C12','station','駅','noun','国際 地図 町 建築物 旅行 移動 歴史',10,12,'国際 地図 町 建築物 旅行 移動 歴史','L10',10,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R11C12','train','電車','noun','国際 地図 町 建築物 旅行 移動 歴史',11,12,'国際 地図 町 建築物 旅行 移動 歴史','L11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R12C7','region','地方 地域','noun','国際 地図 町 建築物 旅行 移動 歴史',12,7,'国際 地図 町 建築物 旅行 移動 歴史','G12',12,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R13C2','government','政府','noun','国際 地図 町 建築物 旅行 移動 歴史',13,2,'国際 地図 町 建築物 旅行 移動 歴史','B13',13,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R14C7','land','土地 国 陸','noun','国際 地図 町 建築物 旅行 移動 歴史',14,7,'国際 地図 町 建築物 旅行 移動 歴史','G14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R15C7','field','畑 野原 分野','noun','国際 地図 町 建築物 旅行 移動 歴史',15,7,'国際 地図 町 建築物 旅行 移動 歴史','G15',15,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R15C12','car','車','noun','国際 地図 町 建築物 旅行 移動 歴史',15,12,'国際 地図 町 建築物 旅行 移動 歴史','L15',15,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R16C2','cooperation','協力 強調','noun','国際 地図 町 建築物 旅行 移動 歴史',16,2,'国際 地図 町 建築物 旅行 移動 歴史','B16',16,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R17C2','relationship','関係','noun','国際 地図 町 建築物 旅行 移動 歴史',17,2,'国際 地図 町 建築物 旅行 移動 歴史','B17',17,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R19C2','condition','状況 状態 条件','noun','国際 地図 町 建築物 旅行 移動 歴史',19,2,'国際 地図 町 建築物 旅行 移動 歴史','B19',19,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R19C12','traffic jam','交通渋滞','noun','国際 地図 町 建築物 旅行 移動 歴史',19,12,'国際 地図 町 建築物 旅行 移動 歴史','L19',19,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R20C12','bike(bicycle)','自転車','noun','国際 地図 町 建築物 旅行 移動 歴史',20,12,'国際 地図 町 建築物 旅行 移動 歴史','L20',20,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R22C2','future','将来 未来','noun','国際 地図 町 建築物 旅行 移動 歴史',22,2,'国際 地図 町 建築物 旅行 移動 歴史','B22',22,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R24C7','access','交通の便 接近','noun','国際 地図 町 建築物 旅行 移動 歴史',24,7,'国際 地図 町 建築物 旅行 移動 歴史','G24',24,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R25C2','culture','文化','noun','国際 地図 町 建築物 旅行 移動 歴史',25,2,'国際 地図 町 建築物 旅行 移動 歴史','B25',25,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R27C2','Africa','アフリカ','noun','国際 地図 町 建築物 旅行 移動 歴史',27,2,'国際 地図 町 建築物 旅行 移動 歴史','B27',27,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R27C7','road','道 道路','noun','国際 地図 町 建築物 旅行 移動 歴史',27,7,'国際 地図 町 建築物 旅行 移動 歴史','G27',27,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R28C2','Kenya','ケニア','noun','国際 地図 町 建築物 旅行 移動 歴史',28,2,'国際 地図 町 建築物 旅行 移動 歴史','B28',28,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R29C2','Asia','アジア','noun','国際 地図 町 建築物 旅行 移動 歴史',29,2,'国際 地図 町 建築物 旅行 移動 歴史','B29',29,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R29C7','way','道 方法','noun','国際 地図 町 建築物 旅行 移動 歴史',29,7,'国際 地図 町 建築物 旅行 移動 歴史','G29',29,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R30C2','Japan','日本','noun','国際 地図 町 建築物 旅行 移動 歴史',30,2,'国際 地図 町 建築物 旅行 移動 歴史','B30',30,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R31C2','Japanese','日本人','noun','国際 地図 町 建築物 旅行 移動 歴史',31,2,'国際 地図 町 建築物 旅行 移動 歴史','B31',31,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R31C7','direction','方向 指示','noun','国際 地図 町 建築物 旅行 移動 歴史',31,7,'国際 地図 町 建築物 旅行 移動 歴史','G31',31,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R32C2','China','中国','noun','国際 地図 町 建築物 旅行 移動 歴史',32,2,'国際 地図 町 建築物 旅行 移動 歴史','B32',32,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R32C7','sign','標識 記号 合図','noun','国際 地図 町 建築物 旅行 移動 歴史',32,7,'国際 地図 町 建築物 旅行 移動 歴史','G32',32,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R34C2','Thailand','タイ','noun','国際 地図 町 建築物 旅行 移動 歴史',34,2,'国際 地図 町 建築物 旅行 移動 歴史','B34',34,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R35C2','India','インド','noun','国際 地図 町 建築物 旅行 移動 歴史',35,2,'国際 地図 町 建築物 旅行 移動 歴史','B35',35,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R35C7','sea','海','noun','国際 地図 町 建築物 旅行 移動 歴史',35,7,'国際 地図 町 建築物 旅行 移動 歴史','G35',35,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R36C2','Europe','ヨーロッパ','noun','国際 地図 町 建築物 旅行 移動 歴史',36,2,'国際 地図 町 建築物 旅行 移動 歴史','B36',36,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R37C2','British','イギリスの ブリティッシュ','noun','国際 地図 町 建築物 旅行 移動 歴史',37,2,'国際 地図 町 建築物 旅行 移動 歴史','B37',37,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R37C7','beach','浜辺 ビーチ','noun','国際 地図 町 建築物 旅行 移動 歴史',37,7,'国際 地図 町 建築物 旅行 移動 歴史','G37',37,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R38C2','England','イングランド','noun','国際 地図 町 建築物 旅行 移動 歴史',38,2,'国際 地図 町 建築物 旅行 移動 歴史','B38',38,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R38C7','river','川','noun','国際 地図 町 建築物 旅行 移動 歴史',38,7,'国際 地図 町 建築物 旅行 移動 歴史','G38',38,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R39C7','bridge','橋','noun','国際 地図 町 建築物 旅行 移動 歴史',39,7,'国際 地図 町 建築物 旅行 移動 歴史','G39',39,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R41C7','dam','ダム','noun','国際 地図 町 建築物 旅行 移動 歴史',41,7,'国際 地図 町 建築物 旅行 移動 歴史','G41',41,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R42C2','France','フランス','noun','国際 地図 町 建築物 旅行 移動 歴史',42,2,'国際 地図 町 建築物 旅行 移動 歴史','B42',42,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R43C2','Paris','パリ','noun','国際 地図 町 建築物 旅行 移動 歴史',43,2,'国際 地図 町 建築物 旅行 移動 歴史','B43',43,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R43C7','hot spring','温泉','noun','国際 地図 町 建築物 旅行 移動 歴史',43,7,'国際 地図 町 建築物 旅行 移動 歴史','G43',43,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R44C2','Germany','ドイツ','noun','国際 地図 町 建築物 旅行 移動 歴史',44,2,'国際 地図 町 建築物 旅行 移動 歴史','B44',44,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R44C7','mountain','山','noun','国際 地図 町 建築物 旅行 移動 歴史',44,7,'国際 地図 町 建築物 旅行 移動 歴史','G44',44,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R45C2','Spain','スペイン','noun','国際 地図 町 建築物 旅行 移動 歴史',45,2,'国際 地図 町 建築物 旅行 移動 歴史','B45',45,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R45C7','hill','丘','noun','国際 地図 町 建築物 旅行 移動 歴史',45,7,'国際 地図 町 建築物 旅行 移動 歴史','G45',45,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R46C2','Portugal','ポルトガル','noun','国際 地図 町 建築物 旅行 移動 歴史',46,2,'国際 地図 町 建築物 旅行 移動 歴史','B46',46,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R47C2','Sweden','スウェーデン','noun','国際 地図 町 建築物 旅行 移動 歴史',47,2,'国際 地図 町 建築物 旅行 移動 歴史','B47',47,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R48C2','America','アメリカ','noun','国際 地図 町 建築物 旅行 移動 歴史',48,2,'国際 地図 町 建築物 旅行 移動 歴史','B48',48,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R51C2','state','州 状態','noun','国際 地図 町 建築物 旅行 移動 歴史',51,2,'国際 地図 町 建築物 旅行 移動 歴史','B51',51,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R52C7','view','眺め 景色','noun','国際 地図 町 建築物 旅行 移動 歴史',52,7,'国際 地図 町 建築物 旅行 移動 歴史','G52',52,'word_cell')
)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id='naru-shisto-original-v1'
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;
WITH marks(source_file,sha256,source_key,word,definition,pos,source_sheet,source_row,source_column,evidence_sheet,evidence_cell,evidence_row,match_kind) AS (VALUES
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R54C2','Mexico','メキシコ','noun','国際 地図 町 建築物 旅行 移動 歴史',54,2,'国際 地図 町 建築物 旅行 移動 歴史','B54',54,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R55C7','stay','滞在する とどまる','noun','国際 地図 町 建築物 旅行 移動 歴史',55,7,'国際 地図 町 建築物 旅行 移動 歴史','G55',55,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R56C2','Australia','オーストラリア','noun','国際 地図 町 建築物 旅行 移動 歴史',56,2,'国際 地図 町 建築物 旅行 移動 歴史','B56',56,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R56C7','everywhere','いたるところに','noun','国際 地図 町 建築物 旅行 移動 歴史',56,7,'国際 地図 町 建築物 旅行 移動 歴史','G56',56,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R57C7','countryside','田舎','noun','国際 地図 町 建築物 旅行 移動 歴史',57,7,'国際 地図 町 建築物 旅行 移動 歴史','G57',57,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R59C2','host family','ホストファミリー','noun','国際 地図 町 建築物 旅行 移動 歴史',59,2,'国際 地図 町 建築物 旅行 移動 歴史','B59',59,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R59C7','village','村','noun','国際 地図 町 建築物 旅行 移動 歴史',59,7,'国際 地図 町 建築物 旅行 移動 歴史','G59',59,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R60C7','city','都市 市','noun','国際 地図 町 建築物 旅行 移動 歴史',60,7,'国際 地図 町 建築物 旅行 移動 歴史','G60',60,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R62C7','downtown','繁華街 街の中心地','noun','国際 地図 町 建築物 旅行 移動 歴史',62,7,'国際 地図 町 建築物 旅行 移動 歴史','G62',62,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R63C7','hometown','故郷','noun','国際 地図 町 建築物 旅行 移動 歴史',63,7,'国際 地図 町 建築物 旅行 移動 歴史','G63',63,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R64C7','stranger','見知らぬ人 他人','noun','国際 地図 町 建築物 旅行 移動 歴史',64,7,'国際 地図 町 建築物 旅行 移動 歴史','G64',64,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R65C7','building','建物 ビル','noun','国際 地図 町 建築物 旅行 移動 歴史',65,7,'国際 地図 町 建築物 旅行 移動 歴史','G65',65,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R67C7','castle','城','noun','国際 地図 町 建築物 旅行 移動 歴史',67,7,'国際 地図 町 建築物 旅行 移動 歴史','G67',67,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R71C7','aquarium','水族館','noun','国際 地図 町 建築物 旅行 移動 歴史',71,7,'国際 地図 町 建築物 旅行 移動 歴史','G71',71,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R72C7','museum','博物館 美術館','noun','国際 地図 町 建築物 旅行 移動 歴史',72,7,'国際 地図 町 建築物 旅行 移動 歴史','G72',72,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R3C2','research','研究 調査','noun','学問 学校',3,2,'学問 学校','B3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R4C2','researcher','研究者','noun','学問 学校',4,2,'学問 学校','B4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R4C7','elementary school','小学校','noun','学問 学校',4,7,'学問 学校','G4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R5C2','science','科学 理科','noun','学問 学校',5,2,'学問 学校','B5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R6C7','high school','高校','noun','学問 学校',6,7,'学問 学校','G6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R9C7','facility','施設','noun','学問 学校',9,7,'学問 学校','G9',9,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R10C7','classroom','教室','noun','学問 学校',10,7,'学問 学校','G10',10,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R12C2','project','計画 プロジェクト','noun','学問 学校',12,2,'学問 学校','B12',12,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R13C2','problem','問題','noun','学問 学校',13,2,'学問 学校','B13',13,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R14C2','question','質問 問題','noun','学問 学校',14,2,'学問 学校','B14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R14C7','cafeteria','食堂','noun','学問 学校',14,7,'学問 学校','G14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R15C2','purpose','目的','noun','学問 学校',15,2,'学問 学校','B15',15,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R16C7','library','図書館','noun','学問 学校',16,7,'学問 学校','G16',16,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R18C2','presentation','発表 プレゼンテーション','noun','学問 学校',18,2,'学問 学校','B18',18,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R20C2','explanation','説明','noun','学問 学校',20,2,'学問 学校','B20',20,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R23C7','education','教育','noun','学問 学校',23,7,'学問 学校','G23',23,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R25C2','result','結果','noun','学問 学校',25,2,'学問 学校','B25',25,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R25C7','experience','経験 体験','noun','学問 学校',25,7,'学問 学校','G25',25,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R26C7','communication','コミュニケーション 意思疎通','noun','学問 学校',26,7,'学問 学校','G26',26,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R27C2','image','画像 イメージ','noun','学問 学校',27,2,'学問 学校','B27',27,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R27C7','conversation','会話','noun','学問 学校',27,7,'学問 学校','G27',27,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R28C2','idea','考え アイディア','noun','学問 学校',28,2,'学問 学校','B28',28,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R28C7','advice','助言 アドバイス','noun','学問 学校',28,7,'学問 学校','G28',28,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R29C2','opinion','意見','noun','学問 学校',29,2,'学問 学校','B29',29,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R31C2','point','点 要点','noun','学問 学校',31,2,'学問 学校','B31',31,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R31C7','guide','案内','noun','学問 学校',31,7,'学問 学校','G31',31,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R32C7','assistance','援助 手伝い','noun','学問 学校',32,7,'学問 学校','G32',32,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R33C2','goal','目標 ゴール','noun','学問 学校',33,2,'学問 学校','B33',33,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R34C7','growth','成長','noun','学問 学校',34,7,'学問 学校','G34',34,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R36C7','confidence','自信 信頼','noun','学問 学校',36,7,'学問 学校','G36',36,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R38C2','book','本','noun','学問 学校',38,2,'学問 学校','B38',38,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R38C7','horizon','視野 地平線','noun','学問 学校',38,7,'学問 学校','G38',38,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R39C2','story','物語 話','noun','学問 学校',39,2,'学問 学校','B39',39,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R39C7','effort','努力 心構え','noun','学問 学校',39,7,'学問 学校','G39',39,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R40C2','theme','主題 テーマ','noun','学問 学校',40,2,'学問 学校','B40',40,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R42C2','topic','話題 トピック','noun','学問 学校',42,2,'学問 学校','B42',42,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R42C7','behavior','振る舞い 行儀','noun','学問 学校',42,7,'学問 学校','G42',42,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R46C2','report','報告 レポート','noun','学問 学校',46,2,'学問 学校','B46',46,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R46C7','subject','教科','noun','学問 学校',46,7,'学問 学校','G46',46,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R47C2','poem','詩','noun','学問 学校',47,2,'学問 学校','B47',47,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R47C7','math','数学','noun','学問 学校',47,7,'学問 学校','G47',47,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R49C2','memory','記憶','noun','学問 学校',49,2,'学問 学校','B49',49,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R61C7','student','生徒 学生','noun','学問 学校',61,7,'学問 学校','G61',61,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R62C7','answer','答え 回答','noun','学問 学校',62,7,'学問 学校','G62',62,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R64C7','uniform','制服','noun','学問 学校',64,7,'学問 学校','G64',64,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R65C7','stationery','文房具','noun','学問 学校',65,7,'学問 学校','G65',65,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R68C7','dictionary','辞書','noun','学問 学校',68,7,'学問 学校','G68',68,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:学問 学校:R73C7','evacuation drill','避難訓練','noun','学問 学校',73,7,'学問 学校','G73',73,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R2C2','human','人間 人類','noun','家族 家庭 家 家具',2,2,'家族 家庭 家 家具','B2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R3C2','person','人 人物','noun','家族 家庭 家 家具',3,2,'家族 家庭 家 家具','B3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R3C12','house','家 一戸建て','noun','家族 家庭 家 家具',3,12,'家族 家庭 家 家具','L3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R4C2','people','人々','noun','家族 家庭 家 家具',4,2,'家族 家庭 家 家具','B4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R4C7','picture','写真 絵','noun','家族 家庭 家 家具',4,7,'家族 家庭 家 家具','G4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R6C2','woman','女性','noun','家族 家庭 家 家具',6,2,'家族 家庭 家 家具','B6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R7C7','wheelchair','車椅子','noun','家族 家庭 家 家具',7,7,'家族 家庭 家 家具','G7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R8C7','stroller','ベビーカー','noun','家族 家庭 家 家具',8,7,'家族 家庭 家 家具','G8',8,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R11C2','adult','成人','noun','家族 家庭 家 家具',11,2,'家族 家庭 家 家具','B11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R12C2','senior','高齢者 年上の','noun','家族 家庭 家 家具',12,2,'家族 家庭 家 家具','B12',12,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R12C12','ramp','スロープ 傾斜路','noun','家族 家庭 家 家具',12,12,'家族 家庭 家 家具','L12',12,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R12C17','pottery','陶器 陶芸','noun','家族 家庭 家 家具',12,17,'家族 家庭 家 家具','Q12',12,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R13C2','child','子供','noun','家族 家庭 家 家具',13,2,'家族 家庭 家 家具','B13',13,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R14C2','children','子供達','noun','家族 家庭 家 家具',14,2,'家族 家庭 家 家具','B14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R16C12','floor','床 階','noun','家族 家庭 家 家具',16,12,'家族 家庭 家 家具','L16',16,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R17C2','girl','女の子','noun','家族 家庭 家 家具',17,2,'家族 家庭 家 家具','B17',17,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R19C12','stair/upstair/downstair','階段/上の階(へ)/下の階(へ)','noun','家族 家庭 家 家具',19,12,'家族 家庭 家 家具','L19',19,'word_cell')
)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id='naru-shisto-original-v1'
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;
WITH marks(source_file,sha256,source_key,word,definition,pos,source_sheet,source_row,source_column,evidence_sheet,evidence_cell,evidence_row,match_kind) AS (VALUES
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R20C2','family','家族','noun','家族 家庭 家 家具',20,2,'家族 家庭 家 家具','B20',20,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R20C17','box','箱','noun','家族 家庭 家 家具',20,17,'家族 家庭 家 家具','Q20',20,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R22C2','partner','パートナー 相棒','noun','家族 家庭 家 家具',22,2,'家族 家庭 家 家具','B22',22,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R24C12','bath, bathtub','お風呂/浴槽','noun','家族 家庭 家 家具',24,12,'家族 家庭 家 家具','L24',24,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R26C2','father','父','noun','家族 家庭 家 家具',26,2,'家族 家庭 家 家具','B26',26,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R26C12','garbage','ゴミ','noun','家族 家庭 家 家具',26,12,'家族 家庭 家 家具','L26',26,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:家族 家庭 家 家具:R42C2','friend','友人 友達','noun','家族 家庭 家 家具',42,2,'家族 家庭 家 家具','B42',42,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R2C7','animal','動物','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',2,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R2C17','breakfast','朝食','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',2,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R3C2','society','社会','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',3,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R3C17','lunch','昼食','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',3,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R4C7','species','種','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',4,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R4C12','stadium','競技場 スタジアム','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',4,12,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','L4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R4C17','dinner','夕食','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',4,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R4C22','sound','音 響き','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',4,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R5C2','network','ネットワーク 網','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',5,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R5C17','meal','食事','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',5,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R6C2','daily lives','日常生活','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',6,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R6C17','dish','料理 皿','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',6,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R7C22','ticket','チケット 切符','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',7,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R8C7','monkey','猿','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',8,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G8',8,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R8C17','menu','メニュー','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',8,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q8',8,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R9C2','problem','問題','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',9,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B9',9,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R9C17','recipe','レシピ 調理法','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',9,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q9',9,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R11C2','accident','事故','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',11,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R12C2','challenge','挑戦','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',12,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B12',12,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R13C2','chance','機会','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',13,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B13',13,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R13C22','song','歌','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',13,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V13',13,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R14C2','case','場合 事件','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',14,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R15C2','situation','状況','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',15,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B15',15,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R17C2','something','何か','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',17,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B17',17,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R17C7','dolphin','イルカ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',17,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G17',17,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R19C17','fish','魚','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',19,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q19',19,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R21C2','life','生活 命 生命','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',21,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B21',21,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R21C7','insect','虫 昆虫','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',21,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G21',21,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R21C22','anime','アニメ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',21,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V21',21,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R22C2','alarm clock','目覚まし時計','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',22,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B22',22,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R22C7','bee','ハチ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',22,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G22',22,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R23C7','honey','はちみつ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',23,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G23',23,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R23C12','baseball','野球','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',23,12,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','L23',23,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R24C7','bird','鳥 鳥類','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',24,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G24',24,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R24C22','character','登場人物 キャラクター','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',24,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V24',24,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R25C2','letter','手紙 文字','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',25,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B25',25,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R27C2','choice','選択','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',27,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B27',27,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R27C7','tree','木','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',27,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G27',27,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R28C7','plant','植物','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',28,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G28',28,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R28C12','goal','ゴール 得点','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',28,12,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','L28',28,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R29C17','vegetable','野菜','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',29,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q29',29,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R30C2','feature','特徴','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',30,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B30',30,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R30C7','flower','花','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',30,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G30',30,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R31C22','aquarium','水族館','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',31,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V31',31,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R32C7','root','根','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',32,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G32',32,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R32C17','fruit','フルーツ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',32,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q32',32,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R32C22','movie','映画','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',32,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V32',32,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R34C2','electricity','電気','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',34,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B34',34,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R34C12','race','レース 競争','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',34,12,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','L34',34,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R34C17','orange','みかん オレンジ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',34,17,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','Q34',34,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R35C2','device','装置 デバイス','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',35,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B35',35,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R35C7','sunflower','ひまわり','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',35,7,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','G35',35,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R35C12','marathon','マラソン','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',35,12,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','L35',35,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R36C22','story','物語 話','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',36,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V36',36,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R37C22','TV program','テレビ番組','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',37,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V37',37,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R38C2','website','ウェブサイト','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',38,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B38',38,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R39C2','information','情報','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',39,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B39',39,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R39C22','game','ゲーム 試合','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',39,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V39',39,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R40C2','computer','コンピューター','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',40,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B40',40,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R40C22','video','ビデオ 映像','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',40,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V40',40,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R41C22','card','カード トランプ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',41,22,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','V41',41,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R42C2','phone/cell phone/telephone/smartphone','電話 携帯電話 スマートフォン','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',42,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B42',42,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R45C2','message','伝言 メッセージ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',45,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B45',45,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R46C2','news','ニュース 知らせ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',46,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B46',46,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R48C2','energy','エネルギー','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',48,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B48',48,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R49C2','elevator','エレベーター','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',49,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B49',49,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R50C2','escalator','エスカレーター','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',50,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B50',50,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R52C2','service','サービス','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',52,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B52',52,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R53C2','shopping','買い物','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',53,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B53',53,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R55C2','store','店','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',55,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B55',55,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R56C2','users','利用者 ユーザー','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',56,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B56',56,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R57C2','customer','客 顧客','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',57,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B57',57,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R59C2','convenience','便利さ','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',59,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B59',59,'word_cell')
)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id='naru-shisto-original-v1'
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;
WITH marks(source_file,sha256,source_key,word,definition,pos,source_sheet,source_row,source_column,evidence_sheet,evidence_cell,evidence_row,match_kind) AS (VALUES
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R60C2','department store','百貨店 デパート','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',60,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B60',60,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R63C2','gift','贈り物 ギフト','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',63,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B63',63,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R66C2','price','価格','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',66,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B66',66,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R69C2','supermarket','スーパーマーケット','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',69,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B69',69,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R72C2','magazine','雑誌','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',72,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B72',72,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R73C2','restaurant','レストラン','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',73,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B73',73,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R75C2','drugstore','ドラッグストア','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',75,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B75',75,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R80C2','style','スタイル やり方','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',80,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B80',80,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R81C2','cloth/clothes','服','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',81,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B81',81,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R83C2','button','ボタン','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',83,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B83',83,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R88C2','shoe','靴','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',88,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B88',88,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R91C2','money','お金','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',91,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B91',91,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R94C2','fare','運賃','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',94,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B94',94,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R108C2','promise','約束','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',108,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B108',108,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽:R114C2','sense','感覚 センス','noun','生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽',114,2,'生活 電子機器 消費 動植物 スポーツ 食べ物 娯楽','B114',114,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R2C2','shape','形','noun','図形 数字 時 季節 月',2,2,'図形 数字 時 季節 月','B2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R3C7','hundred','百','noun','図形 数字 時 季節 月',3,7,'図形 数字 時 季節 月','G3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R3C12','period','期間 時代','noun','図形 数字 時 季節 月',3,12,'図形 数字 時 季節 月','L3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R3C22','month','月','noun','図形 数字 時 季節 月',3,22,'図形 数字 時 季節 月','V3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R4C7','thousand','千','noun','図形 数字 時 季節 月',4,7,'図形 数字 時 季節 月','G4',4,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R5C7','million','百万','noun','図形 数字 時 季節 月',5,7,'図形 数字 時 季節 月','G5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R6C7','billion','十億','noun','図形 数字 時 季節 月',6,7,'図形 数字 時 季節 月','G6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R6C22','March','3月','noun','図形 数字 時 季節 月',6,22,'図形 数字 時 季節 月','V6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R7C7','time','時間','noun','図形 数字 時 季節 月',7,7,'図形 数字 時 季節 月','G7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R7C12','these days','最近','noun','図形 数字 時 季節 月',7,12,'図形 数字 時 季節 月','L7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R7C17','winter','冬','noun','図形 数字 時 季節 月',7,17,'図形 数字 時 季節 月','Q7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R8C7','second','秒','noun','図形 数字 時 季節 月',8,7,'図形 数字 時 季節 月','G8',8,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R8C12','someday','いつか','noun','図形 数字 時 季節 月',8,12,'図形 数字 時 季節 月','L8',8,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R8C22','May','5月','noun','図形 数字 時 季節 月',8,22,'図形 数字 時 季節 月','V8',8,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R9C2','inside','内側 中に','noun','図形 数字 時 季節 月',9,2,'図形 数字 時 季節 月','B9',9,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R10C12','weekend','週末','noun','図形 数字 時 季節 月',10,12,'図形 数字 時 季節 月','L10',10,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R11C2','part','部分','noun','図形 数字 時 季節 月',11,2,'図形 数字 時 季節 月','B11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R11C7','meter','メートル m','noun','図形 数字 時 季節 月',11,7,'図形 数字 時 季節 月','G11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R11C12','every day','毎日','noun','図形 数字 時 季節 月',11,12,'図形 数字 時 季節 月','L11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R14C7','first','第１の 最初の','noun','図形 数字 時 季節 月',14,7,'図形 数字 時 季節 月','G14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R15C7','second','第２の 2番目の','noun','図形 数字 時 季節 月',15,7,'図形 数字 時 季節 月','G15',15,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R15C12','morning','朝','noun','図形 数字 時 季節 月',15,12,'図形 数字 時 季節 月','L15',15,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R16C7','third','第３の ３番目の','noun','図形 数字 時 季節 月',16,7,'図形 数字 時 季節 月','G16',16,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R17C12','afternoon','午後','noun','図形 数字 時 季節 月',17,12,'図形 数字 時 季節 月','L17',17,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R18C7','circle','円 丸','noun','図形 数字 時 季節 月',18,7,'図形 数字 時 季節 月','G18',18,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:図形 数字 時 季節 月:R18C12','evening','夕方','noun','図形 数字 時 季節 月',18,12,'図形 数字 時 季節 月','L18',18,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R2C2','job','仕事 職','noun','職業 産業',2,2,'職業 産業','B2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R2C7','industry','産業','noun','職業 産業',2,7,'職業 産業','G2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R3C7','objects','物体 もの','noun','職業 産業',3,7,'職業 産業','G3',3,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R6C2','company','会社','noun','職業 産業',6,2,'職業 産業','B6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R6C7','thing','こと もの','noun','職業 産業',6,7,'職業 産業','G6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R7C7','product','製品','noun','職業 産業',7,7,'職業 産業','G7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R10C2','office','事務所 オフィス','noun','職業 産業',10,2,'職業 産業','B10',10,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R10C7','role','役割','noun','職業 産業',10,7,'職業 産業','G10',10,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R11C7','technology','科学技術','noun','職業 産業',11,7,'職業 産業','G11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R12C7','skill','技術 技能','noun','職業 産業',12,7,'職業 産業','G12',12,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R13C7','plant','工場 (植物)','noun','職業 産業',13,7,'職業 産業','G13',13,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R14C2','campaign','キャンペーン 運動','noun','職業 産業',14,2,'職業 産業','B14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R14C7','machine','機会','noun','職業 産業',14,7,'職業 産業','G14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R15C2','journalist','ジャーナリスト 記者','noun','職業 産業',15,2,'職業 産業','B15',15,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R16C2','journal','日誌 専門誌','noun','職業 産業',16,2,'職業 産業','B16',16,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R16C7','tool','道具','noun','職業 産業',16,7,'職業 産業','G16',16,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R17C2','article','記事 論文','noun','職業 産業',17,2,'職業 産業','B17',17,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R18C2','newspaper','新聞','noun','職業 産業',18,2,'職業 産業','B18',18,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R19C2','writer','作家 筆者','noun','職業 産業',19,2,'職業 産業','B19',19,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R23C7','fire','火','noun','職業 産業',23,7,'職業 産業','G23',23,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R25C2','hospital','病院','noun','職業 産業',25,2,'職業 産業','B25',25,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R25C7','value','価値','noun','職業 産業',25,7,'職業 産業','G25',25,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R26C7','variety','多様性 種類','noun','職業 産業',26,7,'職業 産業','G26',26,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R27C7','rule','規則 ルール','noun','職業 産業',27,7,'職業 産業','G27',27,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R32C2','law','法律','noun','職業 産業',32,2,'職業 産業','B32',32,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R36C2','art','芸術 美術','noun','職業 産業',36,2,'職業 産業','B36',36,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R37C2','painter','画家','noun','職業 産業',37,2,'職業 産業','B37',37,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R40C2','design','デザイン','noun','職業 産業',40,2,'職業 産業','B40',40,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R43C2','photograph','写真','noun','職業 産業',43,2,'職業 産業','B43',43,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R45C2','curator','学芸員','noun','職業 産業',45,2,'職業 産業','B45',45,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R48C2','agriculture','農業','noun','職業 産業',48,2,'職業 産業','B48',48,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R54C2','clerk','事務員 店員','noun','職業 産業',54,2,'職業 産業','B54',54,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:職業 産業:R57C2','engineer','エンジニア 技術者','noun','職業 産業',57,2,'職業 産業','B57',57,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R2C7','disaster','災害','noun','環境 天体 災害 戦争',2,7,'環境 天体 災害 戦争','G2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R5C7','hardship','困難 苦労','noun','環境 天体 災害 戦争',5,7,'環境 天体 災害 戦争','G5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R6C2','carbon dioxide','二酸化炭素','noun','環境 天体 災害 戦争',6,2,'環境 天体 災害 戦争','B6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R7C2','oxygen','酸素','noun','環境 天体 災害 戦争',7,2,'環境 天体 災害 戦争','B7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R7C7','emergency','緊急 緊急事態','noun','環境 天体 災害 戦争',7,7,'環境 天体 災害 戦争','G7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R9C7','earthquake','地震','noun','環境 天体 災害 戦争',9,7,'環境 天体 災害 戦争','G9',9,'word_cell')
)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id='naru-shisto-original-v1'
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;
WITH marks(source_file,sha256,source_key,word,definition,pos,source_sheet,source_row,source_column,evidence_sheet,evidence_cell,evidence_row,match_kind) AS (VALUES
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R10C7','typhoon','台風','noun','環境 天体 災害 戦争',10,7,'環境 天体 災害 戦争','G10',10,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R11C7','landslide','地滑り 土砂崩れ','noun','環境 天体 災害 戦争',11,7,'環境 天体 災害 戦争','G11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R13C2','oil','油 石油','noun','環境 天体 災害 戦争',13,2,'環境 天体 災害 戦争','B13',13,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R13C7','alarm','アラーム 警報','noun','環境 天体 災害 戦争',13,7,'環境 天体 災害 戦争','G13',13,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R14C2','chemicals','化学物質','noun','環境 天体 災害 戦争',14,2,'環境 天体 災害 戦争','B14',14,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R15C2','smoke','煙','noun','環境 天体 災害 戦争',15,2,'環境 天体 災害 戦争','B15',15,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R18C2','sky','空','noun','環境 天体 災害 戦争',18,2,'環境 天体 災害 戦争','B18',18,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R19C2','solar panel','ソーラーパネル','noun','環境 天体 災害 戦争',19,2,'環境 天体 災害 戦争','B19',19,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R22C2','ice','氷','noun','環境 天体 災害 戦争',22,2,'環境 天体 災害 戦争','B22',22,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R24C2','plastic bottle','ペットボトル','noun','環境 天体 災害 戦争',24,2,'環境 天体 災害 戦争','B24',24,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R26C2','garbage','ゴミ','noun','環境 天体 災害 戦争',26,2,'環境 天体 災害 戦争','B26',26,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R27C2','waste','ゴミ','noun','環境 天体 災害 戦争',27,2,'環境 天体 災害 戦争','B27',27,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R29C2','earth','地球','noun','環境 天体 災害 戦争',29,2,'環境 天体 災害 戦争','B29',29,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R30C2','moon','月','noun','環境 天体 災害 戦争',30,2,'環境 天体 災害 戦争','B30',30,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R30C7','shelter','避難所','noun','環境 天体 災害 戦争',30,7,'環境 天体 災害 戦争','G30',30,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R31C2','nature','自然','noun','環境 天体 災害 戦争',31,2,'環境 天体 災害 戦争','B31',31,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R32C2','environment','環境','noun','環境 天体 災害 戦争',32,2,'環境 天体 災害 戦争','B32',32,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R33C2','ecosystem','生態系','noun','環境 天体 災害 戦争',33,2,'環境 天体 災害 戦争','B33',33,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R34C2','forest','森','noun','環境 天体 災害 戦争',34,2,'環境 天体 災害 戦争','B34',34,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R37C2','rainwater','熱帯雨林','noun','環境 天体 災害 戦争',37,2,'環境 天体 災害 戦争','B37',37,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R38C2','water','水','noun','環境 天体 災害 戦争',38,2,'環境 天体 災害 戦争','B38',38,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R39C2','groundwater','地下水','noun','環境 天体 災害 戦争',39,2,'環境 天体 災害 戦争','B39',39,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R41C2','habit','習慣','noun','環境 天体 災害 戦争',41,2,'環境 天体 災害 戦争','B41',41,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R46C2','sunlight','日光','noun','環境 天体 災害 戦争',46,2,'環境 天体 災害 戦争','B46',46,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R50C2','tempereture','温度','noun','環境 天体 災害 戦争',50,2,'環境 天体 災害 戦争','B50',50,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R51C2','wild','野生','noun','環境 天体 災害 戦争',51,2,'環境 天体 災害 戦争','B51',51,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R54C2','wind','風','noun','環境 天体 災害 戦争',54,2,'環境 天体 災害 戦争','B54',54,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R57C2','cycle','循環 サイクル','noun','環境 天体 災害 戦争',57,2,'環境 天体 災害 戦争','B57',57,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:環境 天体 災害 戦争:R58C2','volunteer','ボランティア','noun','環境 天体 災害 戦争',58,2,'環境 天体 災害 戦争','B58',58,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R2C7','health','健康','noun','体のパーツ　医学',2,7,'体のパーツ　医学','G2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R5C7','disease','病気','noun','体のパーツ　医学',5,7,'体のパーツ　医学','G5',5,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R6C7','sick','病気の 気分の悪い','noun','体のパーツ　医学',6,7,'体のパーツ　医学','G6',6,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R7C2','eye','目','noun','体のパーツ　医学',7,2,'体のパーツ　医学','B7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R9C2','ear','耳','noun','体のパーツ　医学',9,2,'体のパーツ　医学','B9',9,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R10C2','hearing','聴力 聞くこと','noun','体のパーツ　医学',10,2,'体のパーツ　医学','B10',10,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R11C2','nose','鼻','noun','体のパーツ　医学',11,2,'体のパーツ　医学','B11',11,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R12C2','mouth','口','noun','体のパーツ　医学',12,2,'体のパーツ　医学','B12',12,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R18C2','arm','腕','noun','体のパーツ　医学',18,2,'体のパーツ　医学','B18',18,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R19C2','hand','手','noun','体のパーツ　医学',19,2,'体のパーツ　医学','B19',19,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:体のパーツ　医学:R24C2','leg','足 脚','noun','体のパーツ　医学',24,2,'体のパーツ　医学','B24',24,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:色:R2C2','color','色','noun','色',2,2,'色','B2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:色:R7C2','green','緑','noun','色',7,2,'色','B7',7,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:色:R8C2','blue','青','noun','色',8,2,'色','B8',8,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:天気:R2C2','weather','天気 天候','noun','天気',2,2,'天気','B2',2,'word_cell'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:国際 地図 町 建築物 旅行 移動 歴史:R2C17','history','歴史','noun','国際 地図 町 建築物 旅行 移動 歴史',2,17,'名詞一覧','A425',425,'unique_index'),
('noun_list_修正版_監査付き_20260411.xlsx','48fba95c875e3330708329e8eac4ee45d043d7ad03cb9b8df9bcd628b347f03d','noun:天気:R6C2','snow','雪','noun','天気',6,2,'名詞一覧','A772',772,'unique_index'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R8C6','exactly','正確に、まさに','adverb','副詞一覧',8,6,'副詞一覧','F8',8,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R17C6','usually','たいてい、ふつう','adverb','副詞一覧',17,6,'副詞一覧','F17',17,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R18C6','often','よく、しばしば','adverb','副詞一覧',18,6,'副詞一覧','F18',18,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R19C6','sometimes','時々','adverb','副詞一覧',19,6,'副詞一覧','F19',19,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R38C6','already','すでに、もう','adverb','副詞一覧',38,6,'副詞一覧','F38',38,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R42C6','easily','簡単に','adverb','副詞一覧',42,6,'副詞一覧','F42',42,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R44C6','quickly','速く、すぐに','adverb','副詞一覧',44,6,'副詞一覧','F44',44,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R45C6','slowly','ゆっくりと','adverb','副詞一覧',45,6,'副詞一覧','F45',45,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R47C6','silently','黙って、静かに','adverb','副詞一覧',47,6,'副詞一覧','F47',47,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R48C6','carefully','注意深く','adverb','副詞一覧',48,6,'副詞一覧','F48',48,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R49C6','safely','安全に','adverb','副詞一覧',49,6,'副詞一覧','F49',49,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R51C6','tightly','固く、きつく','adverb','副詞一覧',51,6,'副詞一覧','F51',51,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R53C6','precisely','正確に','adverb','副詞一覧',53,6,'副詞一覧','F53',53,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R55C6','effectively','効果的に','adverb','副詞一覧',55,6,'副詞一覧','F55',55,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R56C6','efficiently','効率的に','adverb','副詞一覧',56,6,'副詞一覧','F56',56,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R62C6','mentally','精神的に','adverb','副詞一覧',62,6,'副詞一覧','F62',62,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R63C6','suddenly','突然','adverb','副詞一覧',63,6,'副詞一覧','F63',63,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R64C6','freely','自由に','adverb','副詞一覧',64,6,'副詞一覧','F64',64,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R73C6','around','周りに、～のあたりに','adverb','副詞一覧',73,6,'副詞一覧','F73',73,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R90C6','alone','一人で','adverb','副詞一覧',90,6,'副詞一覧','F90',90,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R91C6','especially','特に','adverb','副詞一覧',91,6,'副詞一覧','F91',91,'word_cell'),
('adverb_list.xlsx','78d0c45fcee4cbade8f055aea5a57b0bc3f20f2a8926b50780adc680ffcab00a','adverb:副詞一覧:R92C6','along','沿って','adverb','副詞一覧',92,6,'副詞一覧','A10',10,'unique_index'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R1C1','bad','悪い','adjective','形容詞',1,1,'形容詞','A1',1,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R3C1','great','素晴らしい','adjective','形容詞',3,1,'形容詞','A3',3,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R4C1','nice','素敵な、親切な','adjective','形容詞',4,1,'形容詞','A4',4,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R5C1','kind','親切な、優しい','adjective','形容詞',5,1,'形容詞','A5',5,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R8C1','happy','幸せな、うれしい','adjective','形容詞',8,1,'形容詞','A8',8,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R9C1','fun','楽しい','adjective','形容詞',9,1,'形容詞','A9',9,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R10C1','shy','恥ずかしがり屋の','adjective','形容詞',10,1,'形容詞','A10',10,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R13C1','nervous','緊張している','adjective','形容詞',13,1,'形容詞','A13',13,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R17C1','ambitious','野心的な、大志を抱いた','adjective','形容詞',17,1,'形容詞','A17',17,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R20C1','smart','頭の良い、賢い','adjective','形容詞',20,1,'形容詞','A20',20,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R21C1','busy','忙しい','adjective','形容詞',21,1,'形容詞','A21',21,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R26C1','big','大きい','adjective','形容詞',26,1,'形容詞','A26',26,'word_cell')
)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id='naru-shisto-original-v1'
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;
WITH marks(source_file,sha256,source_key,word,definition,pos,source_sheet,source_row,source_column,evidence_sheet,evidence_cell,evidence_row,match_kind) AS (VALUES
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R27C1','large','大きい、広い','adjective','形容詞',27,1,'形容詞','A27',27,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R29C1','wide','広い','adjective','形容詞',29,1,'形容詞','A29',29,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R30C1','small','小さい','adjective','形容詞',30,1,'形容詞','A30',30,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R35C1','early','早い','adjective','形容詞',35,1,'形容詞','A35',35,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R40C1','hot','暑い','adjective','形容詞',40,1,'形容詞','A40',40,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R45C1','expensive','（値段が）高い','adjective','形容詞',45,1,'形容詞','A45',45,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R46C1','high','（高さが）高い','adjective','形容詞',46,1,'形容詞','A46',46,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R49C1','long','長い','adjective','形容詞',49,1,'形容詞','A49',49,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R50C1','short','短い','adjective','形容詞',50,1,'形容詞','A50',50,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R54C1','foreign','外国の','adjective','形容詞',54,1,'形容詞','A54',54,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R55C1','another','もう一つの、別の','adjective','形容詞',55,1,'形容詞','A55',55,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R56C1','other','他の、別の','adjective','形容詞',56,1,'形容詞','A56',56,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R60C1','whole','全体の、すべての','adjective','形容詞',60,1,'形容詞','A60',60,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R61C1','strange','奇妙な、見知らぬ','adjective','形容詞',61,1,'形容詞','A61',61,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R62C1','unique','独特の、ユニークな','adjective','形容詞',62,1,'形容詞','A62',62,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R63C1','special','特別な','adjective','形容詞',63,1,'形容詞','A63',63,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R69C1','young','若い','adjective','形容詞',69,1,'形容詞','A69',69,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R70C1','old','古い','adjective','形容詞',70,1,'形容詞','A70',70,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R72C1','weak','弱い','adjective','形容詞',72,1,'形容詞','A72',72,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R73C1','strong','強い','adjective','形容詞',73,1,'形容詞','A73',73,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R74C1','warm','暖かい','adjective','形容詞',74,1,'形容詞','A74',74,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R76C1','rainy','雨の','adjective','形容詞',76,1,'形容詞','A76',76,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R78C1','snowy','雪の','adjective','形容詞',78,1,'形容詞','A78',78,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R79C1','wetty','（やや）濡れた、湿った','adjective','形容詞',79,1,'形容詞','A79',79,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R80C1','wet','濡れた','adjective','形容詞',80,1,'形容詞','A80',80,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R82C1','dry','乾燥した','adjective','形容詞',82,1,'形容詞','A82',82,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R86C1','alive','生きている','adjective','形容詞',86,1,'形容詞','A86',86,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R88C1','bright','明るい','adjective','形容詞',88,1,'形容詞','A88',88,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R90C1','easy','簡単な','adjective','形容詞',90,1,'形容詞','A90',90,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R92C1','tough','困難な、たくましい','adjective','形容詞',92,1,'形容詞','A92',92,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R94C1','same','同じ','adjective','形容詞',94,1,'形容詞','A94',94,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R95C1','different','異なる、違う','adjective','形容詞',95,1,'形容詞','A95',95,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R96C1','safe','安全な','adjective','形容詞',96,1,'形容詞','A96',96,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R97C1','dangerous','危険な','adjective','形容詞',97,1,'形容詞','A97',97,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R100C1','light','軽い、明るい','adjective','形容詞',100,1,'形容詞','A100',100,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R101C1','heavy','重い','adjective','形容詞',101,1,'形容詞','A101',101,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R103C1','blind','目の不自由な','adjective','形容詞',103,1,'形容詞','A103',103,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R105C1','steep','険しい、急な','adjective','形容詞',105,1,'形容詞','A105',105,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R106C1','possible','可能な','adjective','形容詞',106,1,'形容詞','A106',106,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R107C1','impossible','不可能な','adjective','形容詞',107,1,'形容詞','A107',107,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R110C1','right','正しい、右の','adjective','形容詞',110,1,'形容詞','A110',110,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R111C1','wrong','間違った','adjective','形容詞',111,1,'形容詞','A111',111,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R112C1','several','いくつかの','adjective','形容詞',112,1,'形容詞','A112',112,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R113C1','various','さまざまな','adjective','形容詞',113,1,'形容詞','A113',113,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R114C1','main','主な','adjective','形容詞',114,1,'形容詞','A114',114,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R116C1','amazing','驚くべき、素晴らしい','adjective','形容詞',116,1,'形容詞','A116',116,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R117C1','beautiful','美しい','adjective','形容詞',117,1,'形容詞','A117',117,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R118C1','wonderful','素晴らしい','adjective','形容詞',118,1,'形容詞','A118',118,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R119C1','delicious','とても美味しい','adjective','形容詞',119,1,'形容詞','A119',119,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R122C1','comfortable','快適な、心地よい','adjective','形容詞',122,1,'形容詞','A122',122,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R123C1','uncomfortable','不快な、心地よくない','adjective','形容詞',123,1,'形容詞','A123',123,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R124C1','convenient','便利な','adjective','形容詞',124,1,'形容詞','A124',124,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R125C1','necessary','必要な','adjective','形容詞',125,1,'形容詞','A125',125,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R126C1','important','重要な','adjective','形容詞',126,1,'形容詞','A126',126,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R127C1','serious','深刻な、真面目な','adjective','形容詞',127,1,'形容詞','A127',127,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R128C1','helpful','役立つ、助けになる','adjective','形容詞',128,1,'形容詞','A128',128,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R129C1','useful','役に立つ','adjective','形容詞',129,1,'形容詞','A129',129,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R130C1','popular','人気のある','adjective','形容詞',130,1,'形容詞','A130',130,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R132C1','favorite','お気に入りの','adjective','形容詞',132,1,'形容詞','A132',132,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R134C1','professional','プロの、専門的な','adjective','形容詞',134,1,'形容詞','A134',134,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R135C1','scientific','科学的な','adjective','形容詞',135,1,'形容詞','A135',135,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R136C1','artificial','人工的な','adjective','形容詞',136,1,'形容詞','A136',136,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R137C1','mechanical','機械の','adjective','形容詞',137,1,'形容詞','A137',137,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R138C1','electric','電気の','adjective','形容詞',138,1,'形容詞','A138',138,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R139C1','efficient','効率的な','adjective','形容詞',139,1,'形容詞','A139',139,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R140C1','economic','経済の','adjective','形容詞',140,1,'形容詞','A140',140,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R142C1','global','地球規模の、世界的な','adjective','形容詞',142,1,'形容詞','A142',142,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R143C1','international','国際的な','adjective','形容詞',143,1,'形容詞','A143',143,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R145C1','clean','きれいな、清潔な','adjective','形容詞',145,1,'形容詞','A145',145,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R146C1','renewable','再生可能な','adjective','形容詞',146,1,'形容詞','A146',146,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R147C1','sustanable','持続可能な','adjective','形容詞',147,1,'形容詞','A147',147,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R152C1','interested','興味を持っている','adjective','形容詞',152,1,'形容詞','A152',152,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R153C1','interesting','興味深い、面白い','adjective','形容詞',153,1,'形容詞','A153',153,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R155C1','exciting','興奮させる、ハラハラする','adjective','形容詞',155,1,'形容詞','A155',155,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R156C1','bored','退屈した','adjective','形容詞',156,1,'形容詞','A156',156,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R158C1','surprised','驚いた','adjective','形容詞',158,1,'形容詞','A158',158,'word_cell'),
('adjective_list.xlsx','e17b364a7206f4e6abd1969ff13437e48c0f8c99dd4a8fbf264e573fd4bc14f4','adjective:形容詞:R159C1','surprising','驚くべき','adjective','形容詞',159,1,'形容詞','A159',159,'word_cell')
)
INSERT INTO catalog_word_exam_annotations(word_id,kind,source_entry_id,evidence_sheet,evidence_cell,fill_rgb,match_kind)
SELECT w.id,'AICHI_HIGH_SCHOOL_ENTRANCE',e.id,m.evidence_sheet,m.evidence_cell,'FFFF00',m.match_kind
FROM marks m JOIN catalog_workbook_sources s ON s.source_file=m.source_file AND s.sha256=m.sha256
JOIN catalog_source_entries e ON e.source_id=s.id AND e.source_key=m.source_key AND e.ready=1
JOIN catalog_word_source_links l ON l.source_entry_id=e.id
JOIN words w ON w.id=l.word_id AND w.book_id='naru-shisto-original-v1'
JOIN books b ON b.id=w.book_id AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.created_by IS NULL
JOIN catalog_workbook_sheet_rows r ON r.source_id=s.id AND r.sheet_name=m.evidence_sheet AND r.row_number=m.evidence_row
WHERE w.word=m.word AND w.definition=m.definition AND w.part_of_speech=m.pos AND w.source_sheet=m.source_sheet
AND json_extract(e.payload_json,'$.word')=w.word AND json_extract(e.payload_json,'$.definition')=w.definition
AND json_extract(e.payload_json,'$.partOfSpeech')=w.part_of_speech
AND w.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId')
AND json_extract(e.payload_json,'$.sourceRow')=m.source_row AND json_extract(e.payload_json,'$.sourceColumn')=m.source_column
AND EXISTS(SELECT 1 FROM json_each(r.payload_json,'$.cells') c
 WHERE json_extract(c.value,'$.address')=m.evidence_cell AND TRIM(json_extract(c.value,'$.value'))=m.word
 AND json_extract(c.value,'$.style.patternType')='solid'
 AND UPPER(json_extract(c.value,'$.style.fgColor.rgb')) IN ('FFFF00','FFFFFF00')
 AND COALESCE(json_extract(c.value,'$.style.fgColor.tint'),0)=0 AND json_extract(c.value,'$.style.fgColor.theme') IS NULL)
AND (m.match_kind='word_cell' OR (m.match_kind='unique_index' AND
 (SELECT COUNT(*) FROM catalog_source_entries ce WHERE ce.source_id=s.id AND json_extract(ce.payload_json,'$.word')=m.word)=1))
ON CONFLICT(word_id,kind) DO NOTHING;
UPDATE words SET aichi_exam_appeared=1 WHERE book_id='naru-shisto-original-v1' AND EXISTS(
 SELECT 1 FROM catalog_word_exam_annotations a JOIN catalog_source_entries e ON e.id=a.source_entry_id
 JOIN catalog_word_source_links l ON l.source_entry_id=e.id AND l.word_id=words.id
 WHERE a.word_id=words.id AND a.kind='AICHI_HIGH_SCHOOL_ENTRANCE' AND e.ready=1
 AND json_extract(e.payload_json,'$.word')=words.word AND json_extract(e.payload_json,'$.definition')=words.definition
 AND json_extract(e.payload_json,'$.partOfSpeech')=words.part_of_speech AND json_extract(e.payload_json,'$.sourceSheet')=words.source_sheet
 AND words.source_entry_id IS json_extract(e.payload_json,'$.sourceEntryId'));
