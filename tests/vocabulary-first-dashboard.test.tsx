import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it} from 'vitest';
import {useStudentDashboardViewModel} from '../hooks/useStudentDashboardViewModel';
import DashboardHeroSection from '../components/dashboard/DashboardHeroSection';
import {buildSuggestedDashboardPrimaryMission} from '../shared/dashboardPrimaryMission';
import {NARU_BOOK_ID} from '../shared/naruBook';
import {getTodayDateKey} from '../utils/date';
import {BookCatalogSource,EnglishLevel,UserRole,UserGrade,SubscriptionPlan,LearningTrack,MissionNextActionType,WeeklyMissionStatus,WeaknessDimension,WeaknessSignalLevel,RecommendedActionType,type BookMetadata,type DashboardSnapshot,type UserProfile,type PrimaryMissionSnapshot} from '../types';
const user:UserProfile={uid:'synthetic-vocabulary-first',email:'synthetic@example.invalid',displayName:'Learner',role:UserRole.STUDENT,grade:UserGrade.JHS3,englishLevel:EnglishLevel.B1,subscriptionPlan:SubscriptionPlan.TOC_FREE};
const book=(id:string):BookMetadata=>({id,title:id===NARU_BOOK_ID?'Naruシスト':id,wordCount:120,isPriority:false,catalogSource:BookCatalogSource.STEADY_STUDY_ORIGINAL,qualityGate:{status:'approved',label:'approved',summary:'reviewed',isApprovedForLearner:true,isSelectableForToday:true,blockingReasons:[],warnings:[]}});
const snapshot=(extra:Partial<DashboardSnapshot>={}):DashboardSnapshot=>({dueCount:0,officialBooks:[book(NARU_BOOK_ID),book('other')],myBooks:[],progressMap:{},learningPlan:null,learningPreference:null,primaryMission:null,weaknessProfile:null,leaderboard:[],masteryDist:null,activityLogs:[],motivationSnapshot:null,coachNotifications:[],accountOverview:null,commercialRequests:[],...extra});
const view=(extra:Partial<DashboardSnapshot>={},lane:'translation'|'grammar'='translation')=>useStudentDashboardViewModel({user,snapshot:snapshot(extra),englishPracticeRecommendation:{lane,labelJa:lane==='translation'?'和訳':'文法',actionJa:'演習を始める',reasonJa:'optional practice',scopeIds:[],readingQuestionKinds:[]}});
const plan={uid:user.uid,createdAt:1,targetDate:'2027-01-01',goalDescription:'explicit selection',dailyWordGoal:10,selectedBookIds:['other'],status:'ACTIVE' as const};
const completeToday={activityLogs:[{date:getTodayDateKey(),count:30,intensity:3 as const}]};
const mission:PrimaryMissionSnapshot={assignmentId:'synthetic-assignment',missionId:'synthetic-mission',isSuggested:false,track:LearningTrack.SCHOOL_TERM,title:'Assigned',rationale:'explicit teacher assignment',dueAt:1,dueDate:'2026-10-08',sourceBookId:'other',sourceBookTitle:'other',newWordsCompleted:0,newWordsTarget:10,reviewWordsCompleted:0,reviewWordsTarget:0,quizCompletedCount:0,quizTargetCount:0,writingCompleted:false,writingRequired:false,completionRate:0,overdue:false,status:WeeklyMissionStatus.ASSIGNED,nextActionType:MissionNextActionType.OPEN_STUDY,nextActionLabel:'課題の単語',blockers:[]};
describe('vocabulary-first recommendation and rendered primary action',()=>{
 it.each(['grammar','translation'] as const)('starts with Naru rather than the automatic %s recommendation',lane=>{
  const v=view({},lane);expect(v.primaryTask).toMatchObject({id:'today',command:{type:'start_learning',task:{mode:'study',preferredBookIds:[NARU_BOOK_ID],selectionPolicy:'DUE_FIRST'}}});
  expect(v.questButtonLabel).toBe('単語学習を始める');expect(v.primaryLearningRouteId).toBe('today');
  expect(v.supportingTasks.some(t=>t.id==='englishPractice')).toBe(true);
 });
 it('does not let a grammar weakness replace outstanding vocabulary',()=>{
  const weaknessProfile={hasSufficientData:true,updatedAt:1,signals:[],topWeaknesses:[{dimension:WeaknessDimension.GRAMMAR_APPLICATION,level:WeaknessSignalLevel.HIGH,score:88,sampleSize:24,reason:'grammar weakness',nextActionLabel:'文法を5問',recommendedActionType:RecommendedActionType.START_REVIEW,targetQuestionModes:['GRAMMAR_CLOZE' as const],updatedAt:1}]};
  const v=view({weaknessProfile},'grammar');expect(v.primaryTask?.id).toBe('today');expect(v.practiceRecommendation.lane).toBe('grammar');
 });
 it('continues the learned book and due-first vocabulary after daily completion',()=>{
  const v=view({...completeToday,dueCount:12,progressMap:{other:{bookId:'other',learnedCount:40,totalCount:120,percentage:33}}});
  expect(v.primaryTask?.command).toMatchObject({type:'start_learning',task:{preferredBookIds:['other'],selectionPolicy:'DUE_FIRST'}});
  expect(v.remainingWords).toBe(0);expect(v.heroTitle).toBe('今日の単語学習は完了');expect(v.questButtonLabel).toBe('単語学習を続ける');expect(v.heroCopy).toContain('選択教材に期限語があれば優先');
 });
 it('honors explicit different material ahead of learned/default Naru without mutating the snapshot',()=>{
  const s=snapshot({learningPlan:plan,progressMap:{[NARU_BOOK_ID]:{bookId:NARU_BOOK_ID,learnedCount:5,totalCount:1531,percentage:1}}});const before=JSON.stringify(s);
  const v=useStudentDashboardViewModel({user,snapshot:s});expect(v.primaryTask?.command).toMatchObject({type:'start_learning',task:{preferredBookIds:['other']}});expect(JSON.stringify(s)).toBe(before);
 });
 it('does not promise global due words from a different explicitly selected material',()=>{
  const v=view({learningPlan:plan,dueCount:12,progressMap:{[NARU_BOOK_ID]:{bookId:NARU_BOOK_ID,learnedCount:12,totalCount:1531,percentage:1},other:{bookId:'other',learnedCount:0,totalCount:120,percentage:0}}});
  expect(v.heroTitle).not.toContain('復習');expect(v.questButtonLabel).not.toContain('復習');
  expect(v.heroCopy).toContain('選択教材に期限語があれば優先');
  expect(v.primaryTask?.command).toMatchObject({type:'start_learning',task:{preferredBookIds:['other'],selectionPolicy:'DUE_FIRST'}});
 });
 it('keeps vocabulary primary with no due words after completion, leaving practice optional',()=>{
  const v=view({...completeToday,dueCount:0,progressMap:{other:{bookId:'other',learnedCount:120,totalCount:120,percentage:100}}});
  expect(v.primaryTask?.id).toBe('today');expect(v.heroTitle).toBe('今日の単語学習は完了');expect(v.questButtonLabel).toBe('単語学習を続ける');expect(v.heroCopy).toContain('単語学習を続け');expect(v.supportingTasks.some(t=>t.id==='englishPractice')).toBe(true);
  expect(v.primaryTask?.command).toMatchObject({type:'start_learning',task:{preferredBookIds:['other']}});
 });
 it('labels optional additional new words as vocabulary continuation when the goal is done and no review is due',()=>{
  const v=view({...completeToday,dueCount:0,progressMap:{other:{bookId:'other',learnedCount:40,totalCount:120,percentage:33}}});
  expect(v.questButtonLabel).toBe('単語学習を続ける');expect(v.heroCopy).not.toContain('単語を復習');
  expect(v.primaryTask?.command).toMatchObject({type:'start_learning',task:{preferredBookIds:['other'],selectionPolicy:'DUE_FIRST'}});
 });
 it('does not substitute grammar or authorize a blocked/empty book',()=>{
  const b=book(NARU_BOOK_ID);b.qualityGate={...b.qualityGate!,isSelectableForToday:false,isApprovedForLearner:false};
  const v=view({officialBooks:[b]});expect(v.hasStudyBooks).toBe(false);expect(v.primaryTask?.command).toEqual({type:'open_section',sectionId:'library'});
  expect(view({officialBooks:[]}).primaryTask?.command).toEqual({type:'open_section',sectionId:'library'});
 });
 it('preserves an assigned quiz command instead of forcing Naru',()=>{
  const v=view({primaryMission:{...mission,nextActionType:MissionNextActionType.OPEN_QUIZ}});expect(v.primaryTask?.id).toBe('mission');expect(v.primaryTask?.command).toMatchObject({type:'start_learning',task:{mode:'quiz',bookId:'other',missionAssignmentId:'synthetic-assignment'}});
 });
 it('only makes explicit writing assignments primary, not an automatic suggested writing target',()=>{
  const paid={...user,subscriptionPlan:SubscriptionPlan.TOB_PAID,organizationName:'Synthetic organization'};
  const assigned={...mission,writingRequired:true,nextActionType:MissionNextActionType.OPEN_WRITING};
  const suggested=useStudentDashboardViewModel({user:paid,snapshot:snapshot({primaryMission:{...assigned,isSuggested:true,assignmentId:undefined}})});
  expect(suggested.primaryTask?.id).toBe('today');
  expect(useStudentDashboardViewModel({user:paid,snapshot:snapshot({primaryMission:assigned})}).primaryTask?.id).toBe('writing');
 });
 it('renders a vocabulary primary button and both grammar and translation secondary buttons',()=>{
  const v=view();const noop=()=>{};
  const markup=renderToStaticMarkup(<DashboardHeroSection grade={UserGrade.JHS3} heroTitle={v.heroTitle} heroCopy={v.heroCopy} heroMetrics={v.heroMetrics} preferenceSummary={v.preferenceSummary} hasStudyBooks={v.hasStudyBooks} questButtonLabel={v.questButtonLabel} learningPlan={null} generatingPlan={false} remainingWords={v.remainingWords} dueCount={v.dueCount} estimatedMinutes={v.estimatedMinutes} todayCount={v.todayCount} todayWordGoal={v.todayWordGoal} todayProgressPercent={v.todayProgressPercent} primaryLearningRouteId={v.primaryLearningRouteId} practiceRecommendation={v.practiceRecommendation} onOpenSettings={noop} onStartQuest={noop} onSelectPracticeLane={noop} onOpenPlan={noop} onGeneratePlan={noop}/>);
  expect(markup).toMatch(/student-hero-primary-cta[^]*?単語学習を始める/);expect(markup).toContain('dashboard-practice-lane-grammar');expect(markup).toContain('dashboard-practice-lane-translation');expect(markup).toContain('ほかの練習');
  expect(markup.indexOf('student-hero-primary-cta')).toBeLessThan(markup.indexOf('dashboard-command-metrics'));
  expect(markup).toContain('grid-cols-[minmax(0,1fr)_auto]');
  expect(markup).toContain('max-height:500px');
  expect(markup).toMatch(/student-hero-primary-cta[^>]*min-h-11[^>]*text-base/);
  expect(markup).toContain(v.heroCopy);
  expect(markup).toContain('今日の学習目標');
  expect(markup).toContain('学習の設定を開く');
 });
 it('keeps server suggested missions on default Naru but honors an explicit selected book',()=>{
  const input={user:{id:user.uid,grade:UserGrade.JHS3,english_level:EnglishLevel.B1},books:[{id:'other',title:'Other',word_count:120,is_priority:1},{id:NARU_BOOK_ID,title:'Naruシスト',word_count:1531}],now:1};
  expect(buildSuggestedDashboardPrimaryMission(input).sourceBookId).toBe(NARU_BOOK_ID);
  expect(buildSuggestedDashboardPrimaryMission({...input,learningPlan:{dailyWordGoal:10,selectedBookIds:['other']}}).sourceBookId).toBe('other');
 });
});
