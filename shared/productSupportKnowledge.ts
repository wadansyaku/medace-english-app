/** Public product help only: no learner records, private runbooks, or provider calls. */
export type ProductSupportRole = 'GUEST' | 'STUDENT' | 'INSTRUCTOR' | 'GROUP_ADMIN' | 'ADMIN';
export type ProductSupportTopic = 'guest-records' | 'guest-wordbooks' | 'my-wordbooks'
  | 'pronunciation' | 'learning-ai' | 'study' | 'staff-login';

// A content version, not this file's eventual commit (which would be circular).
export const PRODUCT_SUPPORT_TARGET_VERSION = 'steady-study-public-2026-10-11-v1';
export const PRODUCT_SUPPORT_VERIFIED_SOURCE_SHA = '85e2945c5cd0ea8c816de14c08c8d72997a6d350';
// Proposed public evidence route. Its body/URL handler is not implemented here.
export const PRODUCT_SUPPORT_SOURCE_LINKS_READY = false;
export const PRODUCT_SUPPORT_PUBLIC_SOURCE_BASE_URL = 'https://medace-english-app.pages.dev/public';
export const getProductSupportSourceURL = (sourceId: string): string =>
  `${PRODUCT_SUPPORT_PUBLIC_SOURCE_BASE_URL}?supportSource=${encodeURIComponent(sourceId)}`;

export interface ProductSupportKnowledgeSource {
  readonly sourceId: string;
  readonly sourceURL: string;
  readonly checkedAt: string;
  readonly targetVersion: string;
  readonly roles: readonly ProductSupportRole[];
  readonly topic: ProductSupportTopic;
  readonly title: string;
  readonly content: string;
  readonly verifiedFrom: readonly string[];
}

const allRoles: readonly ProductSupportRole[] = ['GUEST', 'STUDENT', 'INSTRUCTOR', 'GROUP_ADMIN', 'ADMIN'];
const learnerRoles: readonly ProductSupportRole[] = ['GUEST', 'STUDENT'];
const staffEntryRoles: readonly ProductSupportRole[] = ['GUEST', 'INSTRUCTOR', 'GROUP_ADMIN', 'ADMIN'];
const sources: ProductSupportKnowledgeSource[] = [
  {
    sourceId: 'guest-naru-records', sourceURL: getProductSupportSourceURL('guest-naru-records'), roles: learnerRoles,
    verifiedFrom: ['components/guest/GuestLearningScreen.tsx:GuestLearningScreen', 'components/guest/GuestLearningImportNotice.tsx:GuestLearningImportNotice'],
    topic: 'guest-records', title: '登録前のNaru単語回答と引継ぎ',
    content: '登録なしでNaruの単語を学べます。単語回答はこの端末のブラウザーに7日間残ります。'
      + '登録・ログインしただけではアカウントへ自動保存しません。生徒用アカウントで保存先を確認し、'
      + '「このアカウントに学習記録を保存」を押して理解度を復習記録へ引き継ぎます。XPは加算しません。'
      + '保存開始後に別アカウントへ引き継ぐことはできません。保存を確認できない回答は同じアカウントで再試行でき、'
      + '確認済み回答は重複しません。ゲストの小テスト・英語練習・自作単語帳の成績はこの回だけの結果です。',
    checkedAt: '2026-10-11', targetVersion: PRODUCT_SUPPORT_TARGET_VERSION,
  },
  {
    sourceId: 'guest-local-wordbooks', sourceURL: getProductSupportSourceURL('guest-local-wordbooks'), roles: learnerRoles,
    verifiedFrom: ['components/guest/GuestLocalBooks.tsx:GuestLocalBooks'],
    topic: 'guest-wordbooks', title: 'ゲストの端末単語帳',
    content: '登録なしの「この端末の単語帳」では単語と意味を1語から入力して学べます。'
      + '単語帳と下書きはこの端末に最大7日間保存し、ブラウザーのデータ削除で消えます。'
      + '登録後のアカウントやクラウドへは引き継がれません。1冊200語、合計10冊までです。'
      + 'CSVはUTF-8・256KB以内・最大200語で、Word,Meaningまたは単語,意味の見出しを使います。'
      + 'Excel・PDF・画像の取り込みには対応していません。端末保存ができない場合、画面内では続けられますが再読み込みで消える場合があります。',
    checkedAt: '2026-10-11', targetVersion: PRODUCT_SUPPORT_TARGET_VERSION,
  },
  {
    sourceId: 'my-wordbook-create', sourceURL: getProductSupportSourceURL('my-wordbook-create'), roles: learnerRoles,
    verifiedFrom: ['components/dashboard/PhrasebookCreateModal.tsx:PhrasebookCreateModal'],
    topic: 'my-wordbooks', title: 'ログイン後のMy単語帳の作成',
    content: 'My単語帳の作成が使えるプランでは、ログイン後に単語と意味を直接入力できます。CSVの用意は必須ではありません。'
      + '「内容を確認」から「この内容で保存」へ進み、保存確認後に「この単語帳で学ぶ」を選びます。'
      + 'CSVはUTF-8・1MB以内・合計500語までで、先頭行はWord,Meaningです。'
      + '同じ内容の重複行は除き、同じ単語でも意味が違う行は残します。下書きはブラウザーにアカウント別で最大7日間保存します。'
      + '保存を確認できない場合は同じ内容で「保存を再確認」を使います。利用できるプランかは現在の画面で確認してください。',
    checkedAt: '2026-10-11', targetVersion: PRODUCT_SUPPORT_TARGET_VERSION,
  },
  {
    sourceId: 'word-pronunciation', sourceURL: getProductSupportSourceURL('word-pronunciation'), roles: allRoles,
    verifiedFrom: ['components/study/WordPronunciationControls.tsx:WordPronunciationControls', 'hooks/useWordPronunciation.ts:useWordPronunciation'],
    topic: 'pronunciation', title: '単語の発音と音声の切替',
    content: '単語の発音にはブラウザーの読み上げ機能を使います。表示中の単語では自動再生を試みますが、ブラウザーが制限する場合があります。'
      + 'その場合は「発音を聞く」を押してください。「音声をオフにする」で停止し、「音声をオンにする」で戻せます。'
      + '対応していないブラウザーでは発音を利用できない表示になります。音声・声の種類や再生可否は端末とブラウザーに依存します。'
      + '収録済み例文にも読み上げボタンがあります。学習用AI生成の停止とは別の機能です。',
    checkedAt: '2026-10-11', targetVersion: PRODUCT_SUPPORT_TARGET_VERSION,
  },
  {
    sourceId: 'learning-ai-status', sourceURL: getProductSupportSourceURL('learning-ai-status'), roles: allRoles,
    verifiedFrom: ['functions/_shared/ai-execution-policy.ts:rejectLegacyLiveAi', 'components/auth/AuthExperienceScreen.tsx:AuthExperienceScreen'],
    topic: 'learning-ai', title: '学習用のAI自動処理の状態',
    content: '学習用のAI自動処理は停止しています。収録済み教材・例文やテンプレートを利用し、個別答案は講師と確認します。'
      + 'この案内は作文Writingの別個の同意や予算、AI Botの実行許可を意味しません。学習効果が他アプリより高いという比較は未検証です。',
    checkedAt: '2026-10-11', targetVersion: PRODUCT_SUPPORT_TARGET_VERSION,
  },
  {
    sourceId: 'study-recall', sourceURL: getProductSupportSourceURL('study-recall'), roles: allRoles,
    verifiedFrom: ['components/auth/AuthExperienceScreen.tsx:AuthExperienceScreen', 'components/guest/GuestLearningScreen.tsx:GuestLearningScreen'],
    topic: 'study', title: '思い出す練習と復習',
    content: '答えを見る前に意味を思い出して、理解度を選びます。忘れた語は同じ回で再出題し、回答に合わせて次の復習日を調整します。'
      + '収録済みの例文で使い方を確認できます。復習日の管理、記録の振り返り、別端末との同期はログイン後に使えます。'
      + '他アプリとの学習効果の比較は未検証です。',
    checkedAt: '2026-10-11', targetVersion: PRODUCT_SUPPORT_TARGET_VERSION,
  },
  {
    sourceId: 'staff-login-entry', sourceURL: getProductSupportSourceURL('staff-login-entry'), roles: staffEntryRoles,
    verifiedFrom: ['shared/publicBusinessRoles.ts:PUBLIC_ROLE_DIRECT_PATHS', 'components/PublicInfoPage.tsx:PublicInfoPage'],
    topic: 'staff-login', title: '講師・学校管理者の入口',
    content: '講師は/teacher、学校管理者は/school-admin、サービス管理者は/service-adminから登録済みアカウントでログインします。'
      + '入口を開くだけでは役割や所属を付与せず、自動ログインもしません。学校・教室向けアカウントは公開画面から発行せず、'
      + '招待または手動発行の案内に沿って手続きを進めます。Botが権限を付けたり生徒データを表示したりする案内はありません。',
    checkedAt: '2026-10-11', targetVersion: PRODUCT_SUPPORT_TARGET_VERSION,
  },
];

export const PRODUCT_SUPPORT_KNOWLEDGE: readonly ProductSupportKnowledgeSource[] = Object.freeze(
  sources.map(source => Object.freeze({ ...source, roles: Object.freeze([...source.roles]), verifiedFrom: Object.freeze([...source.verifiedFrom]) })),
);

/** The role is a trusted caller context, never a role claimed in free text. */
export const getProductSupportKnowledge = (role: ProductSupportRole, targetVersion: string = PRODUCT_SUPPORT_TARGET_VERSION): readonly ProductSupportKnowledgeSource[] =>
  PRODUCT_SUPPORT_KNOWLEDGE.filter(source => source.targetVersion === targetVersion && source.roles.includes(role));

/** Resolve IDs to canonical metadata, rather than accepting URLs/content from a model. */
export const resolveProductSupportSources = (sourceIds: readonly string[], role: ProductSupportRole, targetVersion: string = PRODUCT_SUPPORT_TARGET_VERSION): readonly ProductSupportKnowledgeSource[] | null => {
  if (sourceIds.length > PRODUCT_SUPPORT_KNOWLEDGE.length || new Set(sourceIds).size !== sourceIds.length) return null;
  const available = getProductSupportKnowledge(role, targetVersion);
  const resolved = sourceIds.map(id => available.find(source => source.sourceId === id));
  return resolved.some(source => !source) ? null : resolved as ProductSupportKnowledgeSource[];
};
