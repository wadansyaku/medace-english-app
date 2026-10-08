export const balancedNaruSql = (parts, operator = 'AND') => {
  if (!parts.length) throw new Error('Empty SQL condition');
  if (parts.length === 1) return parts[0];
  const middle = Math.floor(parts.length / 2);
  return `(${balancedNaruSql(parts.slice(0,middle),operator)} ${operator} ${balancedNaruSql(parts.slice(middle),operator)})`;
};
// This helper only accepts generated SELECT/boolean fragments, not arbitrary SQL.
// Recurse into groups/subqueries before splitting the current boolean expression.
export const balanceNaruSqlExpression = (sql) => {
  const groups=[];let plain='';
  for(let i=0;i<sql.length;i++){
    if(sql[i] === "'"){let end=i+1;while(end<sql.length){if(sql[end] === "'"){if(sql[end+1] === "'"){end+=2;continue;}break;}end++;}plain+=sql.slice(i,end+1);i=end;continue;}
    if(sql[i] === '('){let depth=1,end=i+1;for(;end<sql.length;end++){if(sql[end] === "'"){end++;while(end<sql.length){if(sql[end] === "'"){if(sql[end+1] === "'"){end+=2;continue;}break;}end++;}}else if(sql[end] === '(')depth++;else if(sql[end] === ')' && --depth===0)break;}
      const key=`\u0001${groups.length}\u0002`;groups.push(`(${balanceNaruSqlExpression(sql.slice(i+1,end))})`);plain+=key;i=end;continue;}
    plain+=sql[i];
  }
  // A SELECT has an expression tail after WHERE. JOIN ON clauses are separately
  // bounded before JOIN/WHERE; neither SELECT nor JOIN becomes a boolean operand.
  const masked=plain.replace(/'(?:''|[^'])*'/g,value=>' '.repeat(value.length));
  const where=masked.match(/\bWHERE\b/i);
  const balanceBoolean=value=>{
    const split=operator=>{const result=[];let start=0,quote=false;for(let i=0;i<value.length;i++){if(value[i] === "'"){if(quote&&value[i+1] === "'"){i++;continue;}quote=!quote;continue;}if(!quote){const match=value.slice(i).match(new RegExp(`^\\s+${operator}\\s+`,'i'));if(match){result.push(value.slice(start,i).trim());i+=match[0].length-1;start=i+1;}}}result.push(value.slice(start).trim());return result;};
    const ors=split('OR');if(ors.length>1)return balancedNaruSql(ors.map(balanceBoolean),'OR');
    const ands=split('AND');return ands.length>1?balancedNaruSql(ands):value;
  };
  if(where){const index=where.index;plain=plain.slice(0,index+where[0].length)+' '+balanceBoolean(plain.slice(index+where[0].length).trim());}
  else if(!/^\s*SELECT\b/i.test(plain))plain=balanceBoolean(plain);
  // JOIN ON predicates are not WHERE tails. Balance their bounded boolean lists.
  plain=plain.replace(/\bON\s+([\s\S]*?)(?=\s+(?:LEFT\s+)?JOIN\b|\s+WHERE\b|$)/gi,(_all,condition)=>'ON '+balanceBoolean(condition));
  return plain.replace(/\u0001(\d+)\u0002/g,(_all,index)=>groups[Number(index)]);
};
// Pure SQL contract shared by the fixed correction generator and guest read gate.
// No connector, user permission or runtime configuration is granted here.
export const naruSourceCorrectionGuard = ({ phase = 'before', payload = 'x.payload' } = {}) => {
  if (!['before','after','pending'].includes(phase)) throw new Error('Invalid correction phase');
  const j = key => `json_extract(${payload},'$.${key}')`;
  const after = phase === 'after';
  const words = `w.id=${j('originalWordId')} AND w.book_id=${j('bookId')} AND w.word_number=1361 AND w.word='actually' AND w.definition=${j(after?'definition':'previousAppDefinition')} AND w.example_sentence=${j('exampleSentence')} AND w.example_meaning=${j('exampleMeaning')} AND w.part_of_speech='adverb' AND w.category='文副詞' AND w.source_sheet='副詞一覧' AND w.source_entry_id IS NULL AND w.search_key='actually' AND w.subcategory='' AND w.section='' AND w.inflections='' AND w.pronunciation='' AND w.source_note='' AND w.aichi_exam_appeared=1 AND w.definition_supplemented=${after?0:1} ${after?'AND w.example_meaning_supplemented=1':''}`;
  const equalFields = Object.entries({word:'word',definition:'definition',example_sentence:'exampleSentence',example_meaning:'exampleMeaning',part_of_speech:'partOfSpeech',source_sheet:'sourceSheet',source_entry_id:'sourceEntryId',inflections:'inflections',pronunciation:'pronunciation',source_note:'sourceNote',category:'category',subcategory:'subcategory',section:'section'}).map(([column,field])=>`w.${column} IS json_extract(e.payload_json,'$.${field}')`).join(' AND ');
  const expression = `EXISTS(SELECT 1 FROM words w JOIN books b ON b.id=w.book_id JOIN material_source_ledger ml ON ml.book_id=b.id
    WHERE ${words} AND b.id='naru-shisto-original-v1' AND b.title='Naruシスト' AND b.created_by IS NULL AND b.catalog_source='STEADY_STUDY_ORIGINAL' AND b.access_scope='ALL_PLANS' AND b.word_count=1531 AND b.source_context='original-workbooks:'||${j('originalRevision')}
      AND ml.source_id='ledger-'||b.id AND ml.edition=${j('originalRevision')} AND ml.review_status='approved' AND ml.rights_status='approved' AND ml.qa_word_count=1531)
    AND (SELECT COUNT(*) FROM words WHERE book_id=${j('bookId')})=1531
    AND NOT EXISTS(SELECT 1 FROM words w WHERE w.book_id=${j('bookId')} AND w.id<>${j('originalWordId')} AND NOT EXISTS(SELECT 1 FROM catalog_word_source_links l JOIN catalog_source_entries e ON e.id=l.source_entry_id JOIN catalog_workbook_sources s ON s.id=e.source_id JOIN json_each(${payload},'$.originalSupplement.sources') expected WHERE l.word_id=w.id AND l.match_kind='snapshot_import' AND e.ready=1 AND s.series_key=json_extract(expected.value,'$.key') AND s.sha256=json_extract(expected.value,'$.sha256') AND s.source_file=json_extract(expected.value,'$.file') AND w.id LIKE json_extract(e.payload_json,'$.sourceSnapshotBookId')||'-%' AND ${equalFields} AND w.definition_supplemented=0 AND ((w.part_of_speech='verb' AND w.word_number=json_extract(e.payload_json,'$.number')) OR (w.part_of_speech='noun' AND w.word_number=json_extract(e.payload_json,'$.number')+353) OR (w.part_of_speech='adverb' AND w.word_number=json_extract(e.payload_json,'$.number')+1285) OR (w.part_of_speech='adjective' AND w.word_number=json_extract(e.payload_json,'$.number')+1372))))
    AND (SELECT COUNT(DISTINCT word_number) FROM words WHERE book_id=${j('bookId')})=1531
    AND (SELECT COUNT(*) FROM words WHERE book_id=${j('bookId')} AND aichi_exam_appeared=1)=638
    AND EXISTS(SELECT 1 FROM catalog_workbook_sources s WHERE s.id=${j('originalSourceId')} AND s.series_key='adverb' AND s.source_file='adverb_list.xlsx' AND s.sha256=${j('oldSha256')} AND s.archive_json=${j('originalArchiveJson')})
    AND EXISTS(SELECT 1 FROM catalog_source_entries e WHERE e.id=${j('originalSourceEntryId')} AND e.source_id=${j('originalSourceId')} AND e.source_key=${j('sourceKey')} AND e.content_hash=${j('originalSourceContentHash')} AND e.ready=0 AND e.payload_json=${j('originalPayloadJson')})
    AND EXISTS(SELECT 1 FROM catalog_word_source_links l WHERE l.word_id=${j('originalWordId')} AND l.source_entry_id=${j('originalSourceEntryId')} AND l.match_kind='snapshot_import')
    AND (SELECT COUNT(*) FROM catalog_word_source_links WHERE word_id=${j('originalWordId')})=1
    AND EXISTS(SELECT 1 FROM catalog_word_definition_supplements d WHERE d.id=${j('originalSupplementId')} AND d.word_id=${j('originalWordId')} AND d.source_entry_id=${j('originalSourceEntryId')} AND d.source_content_hash=${j('originalSourceContentHash')} AND d.source_file='adverb_list.xlsx' AND d.source_sha256=${j('oldSha256')} AND d.source_key=${j('sourceKey')} AND d.original_definition IS NULL AND d.definition=${j('previousAppDefinition')} AND d.original_example_meaning IS NULL AND d.example_meaning=${j('exampleMeaning')} AND d.reason=${j('originalSupplement.reason')} AND d.references_json=${j('originalSupplement.references')} AND d.approval_json=${j('originalSupplement.approval')} AND d.evidence_json=${j('originalSupplementEvidence')} AND d.applied_at>0)
    AND EXISTS(SELECT 1 FROM catalog_workbook_sources s WHERE s.id=${j('correctedSourceId')} AND s.series_key='adverb' AND s.source_file='adverb_list.xlsx' AND s.sha256=${j('correctedSha256')} AND s.archive_json=${j('correctedArchiveJson')})
    AND EXISTS(SELECT 1 FROM catalog_source_entries e WHERE e.id=${j('correctedSourceEntryId')} AND e.source_id=${j('correctedSourceId')} AND e.source_key=${j('sourceKey')} AND e.content_hash=${j('correctedSourceContentHash')} AND e.ready=1 AND e.payload_json=${j('correctedPayloadJson')})
    AND (SELECT COUNT(*) FROM catalog_source_entries WHERE source_id=${j('correctedSourceId')})=1
    AND (SELECT COUNT(*) FROM catalog_source_correction_archive_evidence WHERE correction_id=${j('id')})=${j('archiveRowCount')}
    AND (SELECT COUNT(*) FROM catalog_workbook_sheet_rows WHERE source_id=${j('originalSourceId')})=${j('archiveRowCount')}
    AND (SELECT COUNT(*) FROM catalog_workbook_sheet_rows WHERE source_id=${j('correctedSourceId')})=${j('archiveRowCount')}
    AND NOT EXISTS(SELECT 1 FROM catalog_source_correction_archive_evidence p LEFT JOIN catalog_workbook_sheet_rows old ON old.source_id=${j('originalSourceId')} AND old.sheet_name=p.sheet_name AND old.row_number=p.row_number LEFT JOIN catalog_workbook_sheet_rows corrected ON corrected.source_id=${j('correctedSourceId')} AND corrected.sheet_name=p.sheet_name AND corrected.row_number=p.row_number WHERE p.correction_id=${j('id')} AND (old.payload_json IS NOT p.original_payload_json OR corrected.payload_json IS NOT p.corrected_payload_json))
    AND NOT EXISTS(SELECT 1 FROM catalog_word_source_correction_invalidations WHERE correction_id=${j('id')})
    ${after ? `AND EXISTS(SELECT 1 FROM catalog_word_source_corrections c WHERE c.id=${j('id')} AND c.word_id=${j('originalWordId')} AND c.original_source_entry_id=${j('originalSourceEntryId')} AND c.corrected_source_entry_id=${j('correctedSourceEntryId')} AND c.proof_json=${payload} AND c.applied_at>0)` : phase === 'pending' ? `AND EXISTS(SELECT 1 FROM catalog_word_source_corrections c WHERE c.id=${j('id')} AND c.word_id=${j('originalWordId')} AND c.proof_json=${payload} AND c.applied_at=0)` : `AND NOT EXISTS(SELECT 1 FROM catalog_word_source_corrections WHERE id=${j('id')} OR word_id=${j('originalWordId')})`}`;
  return balanceNaruSqlExpression(expression);
};
