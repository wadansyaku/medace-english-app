import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitQuizAttempt } from '../functions/_shared/quiz-attempt-receipts';
import { handleRecordQuizAttempt } from '../functions/_shared/storage-learning-actions';
import { commitStudyAttempt } from '../functions/_shared/study-attempt-receipts';
import { quizAttemptFingerprint, type QuizAttemptInput } from '../shared/quizAttempt';
import { formatDateKey } from '../utils/date';
import { LearningTaskIntentType, type JapaneseTranslationFeedback } from '../types';
import type { AppEnv, DbUserRow } from '../functions/_shared/types';
import { createSqliteD1 } from './helpers/sqlite-d1';

const databases: ReturnType<typeof createSqliteD1>[] = [];
afterEach(() => { databases.splice(0).forEach(({ sqlite }) => sqlite.close()); vi.restoreAllMocks(); });
const setup = () => {
  const fixture = createSqliteD1(); databases.push(fixture);
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter((file) => file.endsWith('.sql')).sort()) fixture.sqlite.exec(readFileSync(new URL(file, dir), 'utf8'));
  fixture.sqlite.exec(`
    INSERT INTO users(id,email,display_name,role,created_at,updated_at) VALUES
      ('student-1','one@example.test','One','STUDENT',1,1),('student-2','two@example.test','Two','STUDENT',1,1);
    INSERT INTO books(id,title,created_by,created_at,updated_at) VALUES ('book-1','Synthetic','student-1',1,1),('book-2','Other','student-2',1,1);
    INSERT INTO words(id,book_id,word_number,word,definition,search_key,created_at,updated_at) VALUES
      ('word-1','book-1',1,'test','test','test',1,1),('word-2','book-1',2,'next','next','next',1,1),('word-other','book-2',1,'other','other','other',1,1);
    INSERT INTO ai_generated_contents(id,cache_key,content_kind,model,prompt_version,word_id,book_id,source_hash,payload_json,created_at,updated_at)
      VALUES ('content-1','cache-1','GRAMMAR_PROBLEM','synthetic','test','word-1','book-1','hash-1','{}',1,1),
             ('content-2','cache-2','GRAMMAR_PROBLEM','synthetic','test','word-2','book-1','hash-2','{}',1,1);
    INSERT INTO ai_generated_problems(id,content_id,word_id,book_id,question_mode,prompt_text,answer_text,created_at,updated_at)
      VALUES ('problem-1','content-1','word-1','book-1','GRAMMAR_CLOZE','Synthetic','is',1,1),('problem-2','content-2','word-2','book-1','GRAMMAR_CLOZE','Synthetic','is',1,1);
  `);
  return { ...fixture, env: { DB: fixture.DB } as AppEnv,
    user: fixture.sqlite.prepare('SELECT * FROM users WHERE id=?').get('student-1') as unknown as DbUserRow,
    history: (uid = 'student-1', word = 'word-1') => fixture.sqlite.prepare('SELECT * FROM learning_histories WHERE user_id=? AND word_id=?').get(uid,word),
    count: (table: string) => fixture.sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get()!.count,
  };
};
const input: QuizAttemptInput = { wordId:'word-1',bookId:'book-1',correct:true,questionMode:'EN_TO_JA',responseTimeMs:120,clientAttemptId:'quiz-1' };
const context = { bookProgressionBand:1 };
const feedback: JapaneseTranslationFeedback = { isCorrect:true,score:8,maxScore:10,verdictLabel:'正答',examTarget:'GENERAL',summaryJa:'Synthetic',strengths:[],issues:[],improvedTranslation:'合成',grammarAdviceJa:'合成',nextDrillJa:'合成',criteria:[],sourceSentence:'Synthetic',userTranslation:'合成' };
const call = (fixture: ReturnType<typeof setup>, candidate: QuizAttemptInput) => handleRecordQuizAttempt(fixture.env, fixture.user,
  candidate.wordId,candidate.bookId,candidate.correct,candidate.questionMode,candidate.responseTimeMs,candidate.missionAssignmentId,
  candidate.taskIntentType,candidate.generatedProblemId,candidate.grammarScopeId,candidate.translationFeedback,candidate.clientAttemptId);

describe('quiz canonical receipts', () => {
  it('replays the original receipt after a lost response and concurrent retries exactly once', async () => {
    const fixture = setup(); const first = await commitQuizAttempt(fixture.env,'student-1',input,context);
    const receipts = await Promise.all(Array.from({length:5},() => commitQuizAttempt(fixture.env,'student-1',input,context)));
    receipts.forEach((receipt) => expect(receipt).toMatchObject(first));
    expect(fixture.history()).toMatchObject({attempt_count:1,correct_count:1,total_response_time_ms:120,interaction_source:'QUIZ',interval_days:0});
    expect(fixture.count('learning_interaction_events')).toBe(1); expect(fixture.count('quiz_attempt_receipts')).toBe(1);
  });
  it('keeps distinct concurrent answers without promoting SRS mastery', async () => {
    const fixture = setup();
    await commitStudyAttempt(fixture.env,'student-1',{...input,rating:3,clientAttemptId:'study-1'},context);
    const before = fixture.history()!;
    await Promise.all(Array.from({length:5},(_,i)=>commitQuizAttempt(fixture.env,'student-1',{...input,correct:i%2===0,clientAttemptId:`distinct-${i}`},context)));
    expect(fixture.history()).toMatchObject({status:before.status,interval_days:before.interval_days,ease_factor:before.ease_factor,next_review_date:before.next_review_date,
      attempt_count:6,correct_count:4,total_response_time_ms:720,interaction_source:'STUDY'});
    expect(fixture.count('quiz_attempt_receipts')).toBe(5); expect(fixture.count('learning_interaction_events')).toBe(6);
  });
  it.each(['quiz_attempt_receipts','learning_histories','learning_interaction_events','cbt_learner_profiles','cbt_learner_word_states','cbt_problem_stats','cbt_learner_scope_states','japanese_translation_feedback_events'])('rolls back the entire batch when %s fails, then same-id retry succeeds', async(table) => {
    const fixture=setup(); const candidate={...input,questionMode:'JA_TRANSLATION_INPUT' as const,generatedProblemId:'problem-1',grammarScopeId:'be-verb' as const,translationFeedback:feedback};
    fixture.beforeRun((sql)=>{if(sql.includes(`INSERT INTO ${table}`))throw new Error(`injected ${table}`);});
    await expect(commitQuizAttempt(fixture.env,'student-1',candidate,context)).rejects.toThrow(`injected ${table}`);
    for(const name of ['quiz_attempt_receipts','learning_histories','learning_interaction_events','cbt_learner_profiles','cbt_learner_word_states','cbt_problem_stats','cbt_learner_scope_states','japanese_translation_feedback_events'])expect(fixture.count(name)).toBe(0);
    fixture.beforeRun(undefined);await commitQuizAttempt(fixture.env,'student-1',candidate,context);
    expect(fixture.history()?.attempt_count).toBe(1);expect(fixture.count('japanese_translation_feedback_events')).toBe(1);
    await commitQuizAttempt(fixture.env,'student-1',candidate,context);expect(fixture.count('japanese_translation_feedback_events')).toBe(1);
  });
  it('recomputes learner/scope snapshots across concurrent distinct words',async()=>{
    const fixture=setup(); await Promise.all([1,2].map(i=>commitQuizAttempt(fixture.env,'student-1',{...input,wordId:`word-${i}`,questionMode:'GRAMMAR_CLOZE',generatedProblemId:`problem-${i}`,grammarScopeId:'be-verb',clientAttemptId:`word-attempt-${i}`},context)));
    expect(fixture.sqlite.prepare('SELECT * FROM cbt_learner_profiles').get()).toMatchObject({attempt_count:2,correct_count:2});
    expect(fixture.sqlite.prepare('SELECT * FROM cbt_learner_scope_states').get()).toMatchObject({attempt_count:2,correct_count:2});
    expect(fixture.count('cbt_learner_word_states')).toBe(2);
  });
  it('recomputes shared problem statistics across concurrent different users',async()=>{
    const fixture=setup(); await Promise.all([1,2].map(i=>commitQuizAttempt(fixture.env,`student-${i}`,{...input,questionMode:'GRAMMAR_CLOZE',generatedProblemId:'problem-1',correct:i===1,responseTimeMs:i*100},context)));
    expect(fixture.sqlite.prepare('SELECT * FROM cbt_problem_stats').get()).toMatchObject({exposure_count:2,correct_count:1,avg_response_time_ms:150});
    expect(fixture.count('quiz_attempt_receipts')).toBe(2);
  });
  it.each([{correct:false},{wordId:'word-2'},{bookId:'book-2'},{questionMode:'JA_TO_EN'},{responseTimeMs:121},{missionAssignmentId:'new'},{taskIntentType:LearningTaskIntentType.WEAKNESS_QUIZ},{generatedProblemId:'problem-1'},{grammarScopeId:'be-verb'}])('rejects altered content for one ID: %s',async(change)=>{
    const fixture=setup();await commitQuizAttempt(fixture.env,'student-1',input,context);
    await expect(commitQuizAttempt(fixture.env,'student-1',{...input,...change} as QuizAttemptInput,context)).rejects.toMatchObject({status:409});
    expect(fixture.history()?.attempt_count).toBe(1);
  });
  it('fingerprints full feedback with stable property order and preserves array order',async()=>{
    const original={...input,translationFeedback:feedback};
    const reordered={...original,translationFeedback:Object.fromEntries(Object.entries(feedback).reverse()) as unknown as JapaneseTranslationFeedback};
    expect(await quizAttemptFingerprint(original)).toMatch(/^[0-9a-f]{64}$/);
    expect(await quizAttemptFingerprint(original)).toBe(await quizAttemptFingerprint(reordered));
    expect(await quizAttemptFingerprint(original)).not.toBe(await quizAttemptFingerprint({...original,translationFeedback:{...feedback,summaryJa:'changed'}}));
    const fixture=setup();await commitQuizAttempt(fixture.env,'student-1',{...original,questionMode:'JA_TRANSLATION_INPUT'},context);
    await expect(commitQuizAttempt(fixture.env,'student-1',{...reordered,questionMode:'JA_TRANSLATION_INPUT'},context)).resolves.toBeDefined();
    await expect(commitQuizAttempt(fixture.env,'student-1',{...original,questionMode:'JA_TRANSLATION_INPUT',translationFeedback:{...feedback,issues:['changed']}},context)).rejects.toMatchObject({status:409});
  });
  it('keeps IDs per-user and separate from SRS; no-ID callers preserve repeated legacy writes',async()=>{
    const fixture=setup();await commitStudyAttempt(fixture.env,'student-1',{...input,rating:2},context);
    await commitQuizAttempt(fixture.env,'student-1',input,context);await commitQuizAttempt(fixture.env,'student-2',input,context);
    expect(await call(fixture,{...input,clientAttemptId:undefined})).toBeNull();expect(await call(fixture,{...input,clientAttemptId:undefined})).toBeNull();
    expect(fixture.history()?.attempt_count).toBe(4);expect(fixture.count('quiz_attempt_receipts')).toBe(4);expect(fixture.count('study_attempt_receipts')).toBe(1);
  });
  it('cascades deleted users/materials instead of orphaning receipts',async()=>{
    const fixture=setup();await commitQuizAttempt(fixture.env,'student-1',input,context);fixture.sqlite.exec("DELETE FROM words WHERE id='word-1'");expect(fixture.count('quiz_attempt_receipts')).toBe(0);
  });
});

describe('authorized replay and derived recovery',()=>{
  it('reauthorizes material/word/mission before receipt replay',async()=>{
    const fixture=setup();await call(fixture,input);
    await expect(call(fixture,{...input,wordId:'word-other'})).rejects.toMatchObject({status:400});
    await expect(call(fixture,{...input,missionAssignmentId:'not-owned'})).rejects.toMatchObject({status:400});
    fixture.sqlite.exec("UPDATE books SET created_by='student-2' WHERE id='book-1'");
    await expect(call(fixture,input)).rejects.toMatchObject({status:403});expect(fixture.history()?.attempt_count).toBe(1);
  });
  it('keeps committed receipt pending on projection failure and rebuilds on same-answer retry',async()=>{
    const fixture=setup();vi.spyOn(console,'warn').mockImplementation(()=>{});
    fixture.beforeRun((sql)=>{if(sql.includes('INSERT INTO student_weakness_signals'))throw new Error('derived failure');});
    const receipt=await call(fixture,input);expect(receipt).toMatchObject({clientAttemptId:'quiz-1',storageMode:'cloudflare'});
    expect(fixture.sqlite.prepare('SELECT * FROM quiz_attempt_receipts').get()).toMatchObject({projection_status:'PENDING'});
    fixture.beforeRun(undefined);expect(await call(fixture,input)).toEqual(receipt);
    expect(fixture.sqlite.prepare('SELECT * FROM quiz_attempt_receipts').get()).toMatchObject({projection_status:'COMPLETE',projection_failed_at:null});
    expect(fixture.history()?.attempt_count).toBe(1);
  });
  it('retains original date/mission and never credits a mission assigned after an originally unassigned answer',async()=>{
    const fixture=setup();vi.spyOn(console,'warn').mockImplementation(()=>{});
    fixture.beforeRun((sql)=>{if(sql.includes('INSERT INTO student_weakness_signals'))throw new Error('derived failure');});
    const receipt=await call(fixture,input);
    fixture.sqlite.exec(`INSERT INTO weekly_missions(id,created_by_user_id,learning_track,title,rationale,due_at,created_at,updated_at)VALUES('mission-1','student-1','SCHOOL_TERM','Synthetic','Synthetic',9999999999999,1,1);
      INSERT INTO weekly_mission_assignments(id,mission_id,student_user_id,assigned_by_user_id,status,assigned_at,updated_at)VALUES('mission-new','mission-1','student-1','student-1','ASSIGNED',1,1);`);
    fixture.beforeRun(undefined);vi.spyOn(Date,'now').mockReturnValue((receipt?.committedAt||0)+86_400_000);
    expect(await call(fixture,input)).toEqual(receipt);
    expect(fixture.sqlite.prepare('SELECT * FROM weekly_mission_assignments').get()).toMatchObject({quiz_day_keys_json:'[]'});
  });
  it('rebuilds the original mission day after delayed recovery without crediting a later mission',async()=>{
    const fixture=setup();vi.spyOn(console,'warn').mockImplementation(()=>{});
    fixture.sqlite.exec(`INSERT INTO weekly_missions(id,created_by_user_id,learning_track,title,rationale,due_at,created_at,updated_at)VALUES('mission-1','student-1','SCHOOL_TERM','Synthetic','Synthetic',9999999999999,1,1);
      INSERT INTO weekly_mission_assignments(id,mission_id,student_user_id,assigned_by_user_id,status,assigned_at,updated_at)VALUES('mission-original','mission-1','student-1','student-1','ASSIGNED',1,1);`);
    fixture.beforeRun((sql)=>{if(sql.includes('INSERT INTO student_weakness_signals'))throw new Error('derived failure');});
    const receipt=await call(fixture,input);
    fixture.beforeRun(undefined);vi.spyOn(Date,'now').mockReturnValue((receipt?.committedAt||0)+86_400_000);
    expect(await call(fixture,input)).toEqual(receipt);
    expect(fixture.sqlite.prepare('SELECT * FROM weekly_mission_assignments WHERE id=?').get('mission-original')).toMatchObject({quiz_day_keys_json:JSON.stringify([formatDateKey(receipt!.committedAt)])});
    fixture.sqlite.exec(`UPDATE weekly_mission_assignments SET status='ARCHIVED' WHERE id='mission-original';
      INSERT INTO weekly_mission_assignments(id,mission_id,student_user_id,assigned_by_user_id,status,assigned_at,updated_at)VALUES('mission-later','mission-1','student-1','student-1','ASSIGNED',2,2);`);
    expect(await call(fixture,input)).toEqual(receipt);
    expect(fixture.sqlite.prepare('SELECT * FROM weekly_mission_assignments WHERE id=?').get('mission-later')).toMatchObject({quiz_day_keys_json:'[]'});
    expect(fixture.history()?.attempt_count).toBe(1);
  });
  it.each([{responseTimeMs:-1},{responseTimeMs:Infinity},{responseTimeMs:3_600_001},{clientAttemptId:''},{clientAttemptId:'x'.repeat(161)},{questionMode:'invalid'}])('rejects malformed input before D1 access: %s',async(change)=>{
    const prepare=vi.fn();const fixture={env:{DB:{prepare}},user:{id:'student-1'}};
    await expect(call(fixture as never,{...input,...change} as QuizAttemptInput)).rejects.toMatchObject({status:400});expect(prepare).not.toHaveBeenCalled();
  });
});
