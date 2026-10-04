import type { ProductFeedbackAction, ProductFeedbackInput, ProductFeedbackReport, ProductFeedbackStatus } from '../contracts/productFeedback';

export const PRODUCT_FEEDBACK_VERSION = '2026-10-04-feedback-v1';
export const PRODUCT_FEEDBACK_STATUS_LABELS: Record<ProductFeedbackStatus, string> = {
  NEW: '確認待ち', TRIAGED: '優先度確定', HANDOFF_PREPARED: '引継ぎ準備済み',
  FIXED: '修正版の再テスト待ち', RETEST_PASS: '再テスト成功', RETEST_FAIL: '再テスト失敗',
};
const privateContact = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b0\d{1,4}[- ]\d{1,4}[- ]\d{3,4}\b|\b0[789]0\d{8}\b/i;
export const feedbackText = (value: unknown, label: string, max = 2000): string => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new Error(`${label}を${max}文字以内で入力してください。`);
  if (privateContact.test(value)) throw new Error('メールアドレスや電話番号は報告に含めず、匿名の手順で記録してください。');
  return value.trim();
};
export const validateFeedbackInput = (input: unknown): ProductFeedbackInput => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('報告の内容を確認してください。');
  const value = input as Record<string, unknown>;
  return {
    title: feedbackText(value.title, '件名', 200), version: feedbackText(value.version, '試した版', 200),
    screen: feedbackText(value.screen, '画面・操作の場所', 200), steps: feedbackText(value.steps, '再現する手順'),
    expected: feedbackText(value.expected, '期待する動作'), actual: feedbackText(value.actual, '実際の動作'),
    impact: feedbackText(value.impact, '困ったこと・影響'),
  };
};
// This validates content and state; the server separately authorizes the actor.
export const advanceFeedback = (
  report: ProductFeedbackReport,
  action: ProductFeedbackAction,
  actorRole: 'INSTRUCTOR' | 'ADMIN',
  now: number,
): ProductFeedbackReport => {
  let status: ProductFeedbackStatus;
  let note: string;
  let changes: Partial<ProductFeedbackReport> = {};
  if (action.type === 'triage') {
    if (!['NEW', 'TRIAGED'].includes(report.status) || !['P0', 'P1', 'P2', 'P3'].includes(action.priority)) throw new Error('現在の状態では優先度を変更できません。');
    const acceptance = feedbackText(action.acceptance, '受入条件');
    changes = { priority: action.priority, acceptance }; status = 'TRIAGED'; note = `優先度 ${action.priority}。受入条件: ${acceptance}`;
  } else if (action.type === 'prepare-handoff') {
    if (report.status !== 'TRIAGED') throw new Error('先に優先度と受入条件を確定してください。');
    status = 'HANDOFF_PREPARED'; note = '構造化した引継ぎを準備。外部への送信・受領確認は行っていません。';
  } else if (action.type === 'record-fix') {
    if (!['HANDOFF_PREPARED', 'RETEST_FAIL'].includes(report.status)) throw new Error('現在の状態では修正版を記録できません。');
    const revision = feedbackText(action.revision, '修正版・コミット', 200);
    note = `修正版: ${revision}。変更内容: ${feedbackText(action.note, '修正内容')}`;
    changes = { fixRevision: revision }; status = 'FIXED';
  } else {
    if (action.type !== 'retest' || report.status !== 'FIXED' || typeof action.passed !== 'boolean') throw new Error('先に修正版を記録してください。');
    note = `対象版: ${report.fixRevision}。再テスト: ${feedbackText(action.note, '再テストした条件と結果')}`;
    status = action.passed ? 'RETEST_PASS' : 'RETEST_FAIL';
  }
  const revision = report.revision + 1;
  const at = Math.max(now, report.updatedAt + 1);
  return { ...report, ...changes, status, revision, updatedAt: at,
    history: [...report.history, { revision, at, status, actorRole, note }] };
};
export const exportFeedback = (report: ProductFeedbackReport): string => {
  if (!report.historyLoaded) throw new Error('対応履歴を取得してから引継ぎファイルを用意してください。');
  return JSON.stringify({
  schemaVersion: 1, purpose: 'manual-product-feedback-handoff',
  notice: '本人が内容を確認して手動で渡す準備用です。送信・受領・修正完了を示しません。',
  report: { id: report.id, revision: report.revision, title: report.title, version: report.version,
    screen: report.screen, steps: report.steps, expected: report.expected, actual: report.actual, impact: report.impact,
    status: report.status, priority: report.priority, acceptance: report.acceptance, fixRevision: report.fixRevision,
    createdAt: report.createdAt, updatedAt: report.updatedAt, history: report.history },
  }, null, 2);
};

export interface ProductFaqFact { id: string; question: string; aliases: readonly string[]; answer: string; checkedAt: string }
export const PRODUCT_FEEDBACK_FAQ: readonly ProductFaqFact[] = [
  { id: 'learning', question: 'どのように学習を進めますか？', aliases: ['学習方法を教えてください', '学習効果について'],
    answer: '意味を表示する前に単語を思い出し、自分の理解度を選びます。回答に合わせて復習時期を調整し、忘れた語は同じ回でもう一度出題します。収録済みの例文で使い方も確認できます。他のアプリより学習効果が高いかは、今後の継続率・再テスト正答率・遅延後の定着率で検証します。', checkedAt: '2026-10-04' },
  { id: 'review', question: '復習はいつ行いますか？', aliases: ['復習のタイミングは', '忘れた単語はどうなりますか'],
    answer: '回答した理解度に応じて次の復習日を記録します。ホームでは期限が来た語を優先します。「もう一回」は同じ回に再出題し、「あとで復習」は24時間後を目安に復習します。', checkedAt: '2026-10-04' },
  { id: 'privacy', question: '製品の報告は誰が見ますか？', aliases: ['報告の保存先は', '報告は共有されますか'],
    answer: 'ログインした講師が送信した報告はサーバーに保存され、報告した本人とサービス管理者が確認できます。他の講師や生徒には表示されません。生徒の氏名・連絡先・答案を含めず、匿名の操作手順で記録してください。', checkedAt: '2026-10-04' },
  { id: 'handoff', question: 'GPT Workへ自動送信されますか？', aliases: ['報告は自動で外部に送られますか'],
    answer: '外部へ自動送信しません。サービス管理者が優先度と受入条件を確認し、構造化した引継ぎファイルを保存して、本人が内容を確認して手動で渡します。「引継ぎ準備済み」は送信・受領済みを意味しません。', checkedAt: '2026-10-04' },
];
const normalize = (text: string) => text.normalize('NFKC').toLocaleLowerCase('ja').replace(/[\s？?！!。．.,、]/g, '');
export const findFeedbackFaq = (question: string): ProductFaqFact | undefined => PRODUCT_FEEDBACK_FAQ.find(fact =>
  [fact.question, ...fact.aliases].some(value => normalize(value) === normalize(question)));
