import {
  getProductSupportKnowledge, resolveProductSupportSources, PRODUCT_SUPPORT_TARGET_VERSION, PRODUCT_SUPPORT_SOURCE_LINKS_READY,
  type ProductSupportKnowledgeSource, type ProductSupportRole, type ProductSupportTopic,
} from './productSupportKnowledge';

export interface ProductSupportTurn { readonly userText: string }
export interface ProductSupportSearchInput {
  readonly question: string;
  readonly role: ProductSupportRole;
  readonly history?: readonly ProductSupportTurn[];
  readonly targetVersion?: string;
}
export type ProductSupportUnknownReason = 'unsafe-request' | 'private-input' | 'unsupported-topic'
  | 'unsupported-premise' | 'uncovered-question' | 'version-mismatch' | 'role-mismatch';
export type ProductSupportSearchResult = {
  readonly kind: 'grounded';
  readonly sources: readonly ProductSupportKnowledgeSource[];
  readonly usedHistory: boolean;
} | {
  readonly kind: 'clarification';
  readonly sources: readonly ProductSupportKnowledgeSource[];
  readonly reason: 'missing-topic' | 'ambiguous-topic';
  readonly clarification: string;
} | {
  readonly kind: 'unknown';
  readonly sources: readonly ProductSupportKnowledgeSource[];
  readonly reason: ProductSupportUnknownReason;
};

const normalize = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '').trim();
const has = (text: string, pattern: RegExp) => pattern.test(text);
// These are conservative tripwires, not a complete PII or prompt-injection filter.
const unsafeRequest = (text: string) => has(text, /(?:指示|命令|ルール|制約).{0,12}(?:無視|破棄|上書き)|(?:ignore|override|disregard).{0,30}(?:instructions?|rules?|system)|system\s*prompt|システムプロンプト|内部runbook|秘密.{0,10}(?:表示|出力)|権限.{0,8}(?:付与|昇格)/i);
const privateInput = (text: string) => has(text, /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}|\b(?:sk-[a-z0-9_-]{12,}|bearer\s+[a-z0-9._-]{12,})|(?:電話番号|パスワード|apiキー|api key)\s*[:=：]\s*\S+/i);
const unsupportedTopic = (text: string) => has(text, /料金|課金|請求|解約|退会|返金|クレジットカード|決済|成績|答案|学籍|個人情報|(?:生徒|他人).{0,8}(?:氏名|連絡先)|\b(?:billing|refund|subscription price|cancel subscription|student grades)\b/);
const followUp = (text: string) => has(text, /それ|その|さっき|では|じゃあ|いつまで|何日|どこ(?:で|から|に)|保存|どうやって|上限|登録後|ログイン後|自動|引き継|引継|\b(?:it|that|then|how long|where|xp)\b/);
const explicitGuestBook = (text: string) => has(text, /(?:ゲスト|登録なし|登録不要|登録前|ログインなし|ログイン前).{0,10}(?:単語帳|自作)|\bguest\s*(?:wordbook|word book)\b/);
const explicitMyBook = (text: string) => has(text, /my\s*単語帳|マイ単語帳|ログイン後.{0,8}単語帳|\bmy\s*(?:wordbook|word book)\b/);
const genericBookFollowUp = (text: string) => !explicitGuestBook(text) && !explicitMyBook(text)
  && has(text, /単語帳|csv|直接入力|手入力|一語ずつ|単語と意味|\b(?:manually|type words)\b/);

const topicsIn = (text: string): ProductSupportTopic[] => {
  const topics: ProductSupportTopic[] = [];
  const guest = explicitGuestBook(text);
  const book = has(text, /単語帳|自作|自分の単語|単語と意味|一語ずつ|\b(?:wordbook|word book|csv|type words)\b/);
  const my = explicitMyBook(text);
  if (book) {
    if (guest && my) topics.push('guest-wordbooks', 'my-wordbooks');
    else if (guest) topics.push('guest-wordbooks');
    else if (my || has(text, /直接入力|手入力|一語ずつ|csv.{0,8}(?:必要|必須|なし|不要)|\b(?:manually|type words)\b/)) topics.push('my-wordbooks');
    else topics.push('guest-wordbooks', 'my-wordbooks');
  }
  if (has(text, /登録前の(?:記録|回答)|ゲストの(?:記録|回答)|(?:記録|回答).{0,8}(?:引き継|引継)|\bimport guest\b/)
    || has(text, /naru|ナル/) && (!book || has(text, /記録|回答|引き継|引継/))) topics.push('guest-records');
  if (has(text, /発音|読み上げ|音声|再生|音が|声が|音を|聞く|聴く|\b(?:audio|pronunciation|mute)\b/)) topics.push('pronunciation');
  if (has(text, /\bai\b|自動生成|生成ai|例文.{0,6}生成/)) topics.push('learning-ai');
  if (has(text, /理解度|復習|忘れた|意味を思い出|学習.{0,4}(?:方法|進め)|勉強.{0,4}進め|\bstudy\b/)) topics.push('study');
  if (has(text, /講師|学校管理者|サービス管理者|先生.{0,8}(?:入口|ログイン)|\b(?:teacher|instructor|school admin)\b/)) topics.push('staff-login');
  return [...new Set(topics)];
};

const falsePremise = (text: string, topics: readonly ProductSupportTopic[]) => {
  // Match a claim to its own feature clause. A correct negation or another
  // feature's predicate must not become an asserted unsupported premise.
  const positiveClaim = (clause: string, pattern: RegExp) => {
    const match = pattern.exec(clause);
    if (!match) return false;
    if (/\b(?:not|never)\s*$/.test(clause.slice(0, match.index))) return false;
    const suffix = clause.slice(match.index + match[0].length, match.index + match[0].length + 14);
    return !/^(?:では|じゃ|で|され|し|する|でき|になって|ことは|ことが|わけでは|とは限ら)?(?:ない|ません|なく|なかった)|^\s*(?:is\s+)?not\b/.test(suffix);
  };
  return text.split(/[?？。;；\n]+|ですが|けれど|けど|なのに|でも|\bbut\b/).some(clause => {
    if (!has(clause, /はず|ですよね|だよね|前提|済み|必ず|\b(?:since|already|guaranteed)\b/)) return false;
    const clauseTopics = topicsIn(clause);
    return topics.includes('guest-wordbooks') && clauseTopics.includes('guest-wordbooks')
      && positiveClaim(clause, /(?:クラウド|アカウント).{0,8}(?:保存済|保存される|保存できる|同期済|引継済|引き継がれる|引き継げる)|(?:同期|cloud).{0,6}(?:済|はず)/)
      || topics.includes('guest-records') && clauseTopics.includes('guest-records')
      && positiveClaim(clause, /自動(?:で)?保存|自動で(?:引き継|引継)|永久|ずっと|期限なし|\b(?:automatic|forever)\b/)
      || topics.includes('learning-ai') && clauseTopics.includes('learning-ai')
      && positiveClaim(clause, /生成できる|生成済み|使える|利用可能|動く|有効|\b(?:enabled|generates)\b/)
      || positiveClaim(clause, /(?:他|別).{0,8}アプリ.{0,8}(?:効果|優れ|高い)|効果.{0,8}(?:実証|保証)/);
  });
};

/** Retrieve context for a future generator. This function never generates an answer. */
export const searchProductSupportConversation = (input: ProductSupportSearchInput): ProductSupportSearchResult => {
  const question = normalize(input.question);
  if (question.length > 2000 || unsafeRequest(question)) return { kind: 'unknown', sources: [], reason: 'unsafe-request' };
  if (privateInput(question)) return { kind: 'unknown', sources: [], reason: 'private-input' };
  const available = getProductSupportKnowledge(input.role, input.targetVersion ?? PRODUCT_SUPPORT_TARGET_VERSION);
  if (!available.length) return { kind: 'unknown', sources: [], reason: 'version-mismatch' };
  if (!question) return { kind: 'clarification', sources: [], reason: 'missing-topic', clarification: 'どの画面や操作について知りたいですか？' };
  let topics = topicsIn(question);
  let usedHistory = false;
  const sourcesFor = (selected: readonly ProductSupportTopic[]) => available.filter(source => selected.includes(source.topic));
  if (unsupportedTopic(question)) return { kind: 'unknown', sources: sourcesFor(topics), reason: 'unsupported-topic' };

  // Only the user's most recent three turns can supply a missing subject.
  // Follow-up and social turns can retain a subject; a newer unsupported or
  // unsafe subject clears it. Nothing before this three-turn window is used.
  if (!topics.length && followUp(question) || genericBookFollowUp(question)) {
    let previousTopics: ProductSupportTopic[] = [];
    for (const turn of input.history?.slice(-3) ?? []) {
      const text = normalize(turn.userText);
      if (text.length > 2000 || unsafeRequest(text) || privateInput(text) || unsupportedTopic(text)) { previousTopics = []; continue; }
      const next = topicsIn(text);
      if (next.length) {
        previousTopics = genericBookFollowUp(text) && previousTopics.length === 1 && ['guest-wordbooks', 'my-wordbooks'].includes(previousTopics[0])
          ? [...new Set([...previousTopics, ...next.filter(topic => topic !== 'guest-wordbooks' && topic !== 'my-wordbooks')])]
          : next;
      }
      else if (!next.length && !followUp(text) && !/^(?:ありがとう|ありがとうございます|なるほど|はい|ok|thanks|thank you)[。.!！]*$/.test(text)) previousTopics = [];
    }
    if (!topics.length || topics.every(topic => topic === 'guest-wordbooks' || topic === 'my-wordbooks')
      && previousTopics.length > 0 && previousTopics.every(topic => topic === 'guest-wordbooks' || topic === 'my-wordbooks')) {
      if (previousTopics.length) { topics = previousTopics; usedHistory = true; }
    }
  }
  const sources = sourcesFor(topics);
  if (!topics.length) return followUp(question)
    ? { kind: 'clarification', sources, reason: 'missing-topic', clarification: '何についての続きか、画面や機能を教えてください。' }
    : { kind: 'unknown', sources: [], reason: 'unsupported-topic' };
  if (sources.length !== topics.length) return { kind: 'unknown', sources, reason: 'role-mismatch' };
  if (topics.includes('guest-wordbooks') && topics.includes('my-wordbooks')) return {
    kind: 'clarification', sources, reason: 'ambiguous-topic', clarification: '登録なしの「この端末の単語帳」と、ログイン後のMy単語帳のどちらですか？',
  };
  if (usedHistory && topics.length > 1) return {
    kind: 'clarification', sources, reason: 'ambiguous-topic', clarification: '直前に複数の機能が出ています。どの機能についての続きですか？',
  };
  if (falsePremise(question, topics)) return { kind: 'unknown', sources, reason: 'unsupported-premise' };
  const clauses = question.split(/[?？。;；\n]+|それと|それから|あと、|(?<!こ)(?<!単語)と(?!意味|いう|いった|の|して|き)|\band\b/).map(value => value.trim()).filter(Boolean);
  const bareFollowUp = (clause: string) => /^(?:(?:それ|その|では|じゃあ)[はの、,\s]*)?(?:いつまで|何日|何語まで|どこ(?:で|から|に)|保存(?:できる|される|する)?|どうやって|上限|xp)(?:ですか|できますか|できる|です|は|\s)*$/.test(clause);
  if (clauses.length > 1 && clauses.some(clause => !topicsIn(clause).length && !bareFollowUp(clause))) return { kind: 'unknown', sources, reason: 'uncovered-question' };
  return { kind: 'grounded', sources, usedHistory };
};

/** Proposed generator output. Valid references do not prove semantic entailment. */
export interface ProductSupportAnswer {
  readonly answer: string;
  readonly sourceIds: readonly string[];
  readonly unknown: boolean;
  readonly clarification: string | null;
}
export type ProductSupportAnswerValidation = { readonly valid: true; readonly value: ProductSupportAnswer; readonly sources: readonly ProductSupportKnowledgeSource[] }
  | { readonly valid: false; readonly reason: 'shape' | 'unsafe-content' | 'invalid-source' | 'missing-evidence' | 'decision-conflict' };

/** Canonical role/version/URL and retrieved-source checks; no network or model calls. */
export const validateProductSupportAnswer = (value: unknown, input: ProductSupportSearchInput, decision: ProductSupportSearchResult): ProductSupportAnswerValidation => {
  const canonicalDecision = searchProductSupportConversation(input);
  if (decision.kind !== canonicalDecision.kind
    || decision.sources.length !== canonicalDecision.sources.length
    || decision.sources.some(source => !canonicalDecision.sources.some(canonical => canonical.sourceId === source.sourceId))) return { valid: false, reason: 'decision-conflict' };
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, reason: 'shape' };
  const candidate = value as Record<string, unknown>;
  if (Object.keys(candidate).some(key => !['answer', 'sourceIds', 'unknown', 'clarification'].includes(key))
    || typeof candidate.answer !== 'string' || !candidate.answer.trim() || candidate.answer.length > 3000
    || !Array.isArray(candidate.sourceIds) || candidate.sourceIds.some(id => typeof id !== 'string')
    || typeof candidate.unknown !== 'boolean' || candidate.clarification !== null && (typeof candidate.clarification !== 'string' || !candidate.clarification.trim() || candidate.clarification.length > 300)) return { valid: false, reason: 'shape' };
  const sources = resolveProductSupportSources(candidate.sourceIds as string[], input.role, input.targetVersion ?? PRODUCT_SUPPORT_TARGET_VERSION);
  if (!sources || sources.some(source => !decision.sources.some(retrieved => retrieved.sourceId === source.sourceId))) return { valid: false, reason: 'invalid-source' };
  const text = normalize(`${candidate.answer} ${candidate.clarification ?? ''}`);
  const urls = text.match(/https?:\/\/[^\s<>"'）)]+/g) ?? [];
  if (privateInput(text) || unsafeRequest(text) || /<\/?[a-z][^>]*>|javascript:|data:|\]\s*\(/i.test(text)
    || input.role === 'STUDENT' && /\/(?:teacher|school-admin|service-admin|admin-access)\b|\/public\/roles\/(?:instructor|group-admin|service-admin)\b/.test(text)
    || !PRODUCT_SUPPORT_SOURCE_LINKS_READY && urls.length > 0
    || urls.some(url => !sources.some(source => source.sourceURL.toLowerCase() === url))) return { valid: false, reason: 'unsafe-content' };
  if (decision.kind !== 'grounded' && !candidate.unknown || decision.kind === 'clarification' && candidate.clarification === null
    || !candidate.unknown && candidate.clarification !== null) return { valid: false, reason: 'decision-conflict' };
  if (!candidate.unknown && !sources.length) return { valid: false, reason: 'missing-evidence' };
  if (!candidate.unknown && decision.sources.some(source => !sources.some(cited => cited.sourceId === source.sourceId))) return { valid: false, reason: 'missing-evidence' };
  return { valid: true, value: Object.freeze({ answer: candidate.answer.trim(), sourceIds: Object.freeze([...candidate.sourceIds as string[]]), unknown: candidate.unknown, clarification: candidate.clarification as string | null }), sources };
};
